// Makes web-sized copies of everything in src/photo-resources for the /photos
// page. Originals can be huge camera exports; the page only ever needs about
// 2400px, so images are resized to JPEG (or WebP when they have transparency)
// in src/generated/photos. Videos and GIFs are copied as they are.
//
// Copies get URL-safe names, and manifest.json records each one's original
// name and dimensions so the page can lay cards out before anything loads.
//
//   node scripts/photos.js           one pass, skipping files already done
//   node scripts/photos.js --watch   keep regenerating while files change

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src/photo-resources");
const OUT = path.join(ROOT, "src/generated/photos");
const MANIFEST = path.join(OUT, "manifest.json");
const MAX_EDGE = 2400;
const RESIZE = /\.(jpe?g|png|webp|avif|tiff?)$/i;
const COPY = /\.(gif|mp4|webm|mov|m4v)$/i;
const MP4 = /\.(mp4|mov|m4v)$/i;
const CONCURRENCY = 4;
// Cloudflare Pages rejects any single file over 25 MiB.
const DEPLOY_LIMIT = 25 * 1024 * 1024;

let sharp = null;
try {
  sharp = require("sharp");
  sharp.concurrency(2);
} catch (err) {
  console.warn("photos: sharp is unavailable, copying originals without resizing");
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

// "PixCell-Deer#24 • blender.jpg" -> "pixcell-deer-24-blender-3f9a1c". The hash
// of the full path keeps names unique; characters like # would break URLs.
function outputName(rel, ext) {
  const base = path.basename(rel, path.extname(rel));
  const slug = base
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = crypto.createHash("sha1").update(rel).digest("hex").slice(0, 6);
  return path.join(path.dirname(rel), `${slug ? `${slug}-` : ""}${hash}${ext}`);
}

// Reads the display size of an MP4/MOV from its track header, so video cards
// can be sized before the browser loads any of the file.
function videoSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    for (let offset = 0; offset + 8 <= size; ) {
      fs.readSync(fd, head, 0, 16, offset);
      let boxSize = head.readUInt32BE(0);
      let headerSize = 8;
      if (boxSize === 1) {
        boxSize = Number(head.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (boxSize < headerSize) return null;
      if (head.toString("latin1", 4, 8) === "moov") {
        const moov = Buffer.alloc(boxSize - headerSize);
        fs.readSync(fd, moov, 0, moov.length, offset + headerSize);
        for (let i = moov.indexOf("tkhd"); i !== -1; i = moov.indexOf("tkhd", i + 4)) {
          const version = moov[i + 4];
          const matrix = i + 8 + (version === 1 ? 32 : 20) + 16;
          if (matrix + 44 > moov.length) break;
          let width = moov.readUInt32BE(matrix + 36) / 65536;
          let height = moov.readUInt32BE(matrix + 40) / 65536;
          if (!width || !height) continue;
          // A zero first matrix entry means the track is rotated 90 degrees.
          if (moov.readInt32BE(matrix) === 0) [width, height] = [height, width];
          return { width: Math.round(width), height: Math.round(height) };
        }
        return null;
      }
      offset += boxSize;
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

async function convert(rel) {
  const src = path.join(SRC, rel);
  const stat = fs.statSync(src);
  const resize = sharp && RESIZE.test(rel);
  const meta = resize ? await sharp(src).metadata() : null;
  const ext = resize ? (meta.hasAlpha ? ".webp" : ".jpg") : path.extname(rel).toLowerCase();
  const out = outputName(rel, ext);
  const dest = path.join(OUT, out);
  const cached = fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= stat.mtimeMs;

  if (!cached) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (resize) {
      const image = sharp(src)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
      await (meta.hasAlpha ? image.webp({ quality: 84 }) : image.jpeg({ quality: 84, mozjpeg: true })).toFile(dest);
    } else {
      fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE);
    }
    const bytes = fs.statSync(dest).size;
    if (bytes > DEPLOY_LIMIT) {
      const mb = (bytes / 1024 / 1024).toFixed(1);
      console.warn(`photos: ${rel} is ${mb} MB; Cloudflare Pages rejects files over 25 MB, so compress it`);
    }
  }

  let size = null;
  if (MP4.test(rel)) size = videoSize(dest);
  else if (sharp && !/\.(mp4|webm|mov|m4v)$/i.test(rel)) size = await sharp(dest).metadata();
  const entry = { name: path.basename(rel), width: size?.width ?? null, height: size?.height ?? null };
  return { out, entry, cached };
}

async function run() {
  const started = Date.now();
  const files = walk(SRC).filter((rel) => RESIZE.test(rel) || COPY.test(rel));
  const manifest = {};
  let made = 0;
  const queue = [...files];

  const worker = async () => {
    while (queue.length) {
      const rel = queue.shift();
      try {
        const { out, entry, cached } = await convert(rel);
        manifest[out.split(path.sep).join("/")] = entry;
        if (!cached) made++;
      } catch (err) {
        console.warn(`photos: skipped ${rel} (${err.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Drop outputs whose original was removed or renamed.
  fs.mkdirSync(OUT, { recursive: true });
  let removed = 0;
  for (const rel of walk(OUT)) {
    const key = rel.split(path.sep).join("/");
    if (key !== "manifest.json" && !manifest[key]) {
      fs.rmSync(path.join(OUT, rel));
      removed++;
    }
  }
  pruneEmpty(OUT);

  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((key) => [key, manifest[key]]));
  const json = `${JSON.stringify(sorted, null, 2)}\n`;
  if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, "utf8") !== json) fs.writeFileSync(MANIFEST, json);

  if (made || removed) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`photos: ${made} prepared, ${removed} removed, ${files.length - made} up to date (${seconds}s)`);
  }
}

function pruneEmpty(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    pruneEmpty(full);
    if (!fs.readdirSync(full).length) fs.rmdirSync(full);
  }
}

if (process.argv.includes("--watch")) {
  let running = false;
  let again = false;
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return void (again = true);
      running = true;
      do {
        again = false;
        await run();
      } while (again);
      running = false;
    }, 400);
  };
  fs.mkdirSync(SRC, { recursive: true });
  fs.watch(SRC, { recursive: true }, schedule);
  schedule();
} else {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
