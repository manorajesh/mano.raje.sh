import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import manifestJson from "../generated/photos/manifest.json";

// Media lives in src/photo-resources/<stack>/<divider>/<file>. Top-level folders
// become switchable stacks, the folders inside them become dividers, and a
// leading "01 " style prefix only controls ordering. The page reads the
// web-sized copies (and their manifest) that scripts/photos.js writes to
// src/generated/photos.
declare global {
  interface NodeRequire {
    context(
      directory: string,
      useSubdirectories: boolean,
      regExp: RegExp
    ): { keys(): string[]; (id: string): string | { default: string } };
  }
}

const resources = require.context(
  "../generated/photos",
  true,
  /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v)$/i
);
const manifest = manifestJson as Record<string, { name: string; width: number | null; height: number | null }>;

type Media = { key: string; src: string; kind: "image" | "video"; title: string; name: string; aspect: number | null };
type Group = { name: string; media: Media[] };
type Stack = { id: string; name: string; groups: Group[]; count: number };

type MediaItem = { type: "media"; key: string; t: number; group: number; media: Media; index: number };
type DividerItem = { type: "divider"; key: string; t: number; group: number; name: string; count: number };
type Item = MediaItem | DividerItem;
type Layout = { items: Item[]; media: MediaItem[]; end: number };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// Finder saves a "/" typed into a file name as ":", so show it as "/" again.
const prettify = (name: string) =>
  name
    .replace(/(\.(jpe?g|png|gif|webp|avif|tiff?|mp4|webm|mov|m4v))+$/i, "")
    .replace(/:/g, "/")
    .replace(/^\d+[\s._-]+/, "")
    .replace(/[_-]+/g, " ")
    .trim() || name;

function readStacks(): Stack[] {
  const tree = new Map<string, Map<string, Media[]>>();
  for (const key of resources.keys()) {
    if (!key.startsWith("./")) continue;
    const file = key.slice(2);
    const parts = file.split("/");
    if (parts.length < 2 || parts.some((part) => part.startsWith("."))) continue;
    const entry = manifest[file];
    const mod = resources(key);
    const name = entry?.name ?? parts[parts.length - 1];
    const media: Media = {
      key,
      src: typeof mod === "string" ? mod : mod.default,
      kind: /\.(mp4|webm|mov|m4v)$/i.test(key) ? "video" : "image",
      title: prettify(name),
      name,
      aspect: entry?.width && entry?.height ? entry.width / entry.height : null,
    };
    const group = parts.length > 2 ? parts[1] : "";
    const groups = tree.get(parts[0]) ?? new Map<string, Media[]>();
    groups.set(group, [...(groups.get(group) ?? []), media]);
    tree.set(parts[0], groups);
  }

  return Array.from(tree.keys())
    .sort(collator.compare)
    .map((stack) => {
      const groups = tree.get(stack)!;
      const sorted = Array.from(groups.keys())
        .sort(collator.compare)
        .map((group) => ({
          name: group ? prettify(group) : "",
          media: groups.get(group)!.sort((a, b) => collator.compare(a.name, b.name)),
        }));
      return {
        id: prettify(stack).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: prettify(stack),
        groups: sorted,
        count: sorted.reduce((sum, group) => sum + group.media.length, 0),
      };
    });
}

// Stack spacing, in units of the card box height.
const GAP = 0.18;
const DIVIDER_LEAD = 0.34;
const DIVIDER_TRAIL = 0.24;
// Cards are faded out past FOG_END, so only those within reach are mounted.
const FOG_START = 2.1;
const FOG_END = 3.6;
const HOVER_SPREAD = 0.16;
// Folder dividers: the body stands a little taller than any photo so the tab
// always shows above the stack.
const FOLDER_BODY = 1.05;
const FOLDER_TAB = 0.085;
// Switching stacks pans the camera across, then fades the new cards in.
const PAN_MS = 1800;
const REVEAL_DELAY = 120;
const REVEAL_STAGGER = 55;
const REVEAL_FADE = 520;
// The opening shot looks this far along each stack.
const START_T = 1.1;
// Photos can be zoomed up close: a click toggles ZOOM_CLICK, pinching goes up to ZOOM_MAX.
const ZOOM_CLICK = 2.2;
const ZOOM_MAX = 3;

function layoutStack(stack: Stack): Layout {
  const items: Item[] = [];
  let t = 0;
  let index = 0;
  stack.groups.forEach((group, g) => {
    if (group.name) {
      if (items.length) t += DIVIDER_LEAD;
      items.push({ type: "divider", key: `d:${stack.id}:${g}`, t, group: g, name: group.name, count: group.media.length });
      t += DIVIDER_TRAIL;
    } else if (items.length) {
      t += DIVIDER_LEAD;
    }
    group.media.forEach((media) => {
      items.push({ type: "media", key: media.key, t, group: g, media, index: index++ });
      t += GAP;
    });
    t -= GAP;
  });
  return { items, media: items.filter((item): item is MediaItem => item.type === "media"), end: Math.max(0, t) };
}

const STACKS = readStacks();
const LAYOUTS = STACKS.map(layoutStack);
const NO_ITEMS: Item[] = [];
const NO_MEDIA: MediaItem[] = [];

type View = {
  w: number;
  h: number;
  boxW: number;
  boxH: number;
  persp: number;
  scale: number;
  dist: number;
  yaw: number;
  pitch: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  lateral: number;
  portrait: boolean;
};

function viewFor(w: number, h: number): View {
  const portrait = h > w * 1.05;
  // Every card fits inside this box, which is also its size when viewed head on.
  const boxH = portrait ? Math.min(h * 0.6, w * 1.15) : h * 0.72;
  const boxW = portrait ? w * 0.84 : Math.min(w * 0.64, boxH * 1.6);
  const dist = portrait ? 4.3 : 3.9;
  const scale = 2 / dist;
  return {
    w,
    h,
    boxW,
    boxH,
    persp: boxH * 2,
    scale,
    dist,
    yaw: portrait ? -26 : -34,
    pitch: portrait ? -9 : -11,
    dx: portrait ? 0.24 : 0.36,
    dy: portrait ? 0.62 : 0.42,
    ox: portrait ? -w * 0.06 : -w * 0.1,
    oy: portrait ? h * 0.08 : h * 0.07,
    // Neighbouring stacks sit far enough apart that, after a pan, even the far
    // end of the old stack (which reaches back towards the new one) is off screen.
    lateral: (w / scale / boxH) * 1.3 + 3.2,
    portrait,
  };
}

// Positions are in units of the box height. Stacks run into the distance along
// pos(t) and sit side by side along the camera's right-hand direction.
const pos = (t: number, view: View) => [t * view.dx, -t * view.dy, -t] as const;
// spread < 1 pulls the stacks closer together for the opening shot.
const stackOrigin = (k: number, view: View, spread = 1) => {
  const yaw = (view.yaw * Math.PI) / 180;
  const along = k * view.lateral * spread;
  return [Math.cos(yaw) * along, 0, Math.sin(yaw) * along] as const;
};

// The opening wide shot: the camera pulls back and the stacks draw in close
// enough together to share the frame, then spread back out on the way in.
function startShot(view: View) {
  const dist = view.dist * (view.portrait ? 2.2 : 2.4);
  const visible = (view.w * dist) / view.persp;
  const gaps = Math.max(1, STACKS.length - 1);
  const spread = Math.min(1, (visible * (view.portrait ? 0.62 : 0.52)) / gaps / view.lateral);
  return { lat: ((STACKS.length - 1) * view.lateral * spread) / 2, dist, spread };
}

function sizeOf(item: Item, aspect: number | null, view: View) {
  // Folders are as wide as a horizontal photo.
  if (item.type === "divider") return { w: view.boxW, h: view.boxH * (FOLDER_BODY + FOLDER_TAB) };
  const a = aspect ?? (item.media.kind === "video" ? 16 / 9 : 0.8);
  const w = Math.min(view.boxW, view.boxH * a);
  return { w, h: w / a };
}
// Folders centre their body on the stack, with the tab rising above it.
const liftOf = (item: Item) => (item.type === "divider" ? -FOLDER_TAB / 2 : 0);

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const pad = (n: number) => String(n).padStart(2, "0");

// Critically damped spring, solved exactly so any frame time stays stable.
function spring(x: number, v: number, target: number, omega: number, dt: number) {
  const c1 = x - target;
  const c2 = v + omega * c1;
  const e = Math.exp(-omega * dt);
  return [target + (c1 + c2 * dt) * e, (c2 - omega * (c1 + c2 * dt)) * e];
}

function folderPath(w: number, h: number, tabX: number, tabW: number, tabH: number) {
  const r = Math.min(tabH * 0.4, w * 0.014);
  const s = tabH * 0.55;
  return [
    `M0 ${h}`,
    `V${tabH + r}`,
    `Q0 ${tabH} ${r} ${tabH}`,
    `H${tabX}`,
    `C${tabX + s * 0.55} ${tabH} ${tabX + s * 0.45} 0 ${tabX + s} 0`,
    `H${tabX + tabW - s}`,
    `C${tabX + tabW - s * 0.45} 0 ${tabX + tabW - s * 0.55} ${tabH} ${tabX + tabW} ${tabH}`,
    `H${w - r}`,
    `Q${w} ${tabH} ${w} ${tabH + r}`,
    `V${h}`,
    "Z",
  ].join(" ");
}

type CardProps = {
  item: Item;
  width: number;
  height: number;
  transform: string;
  playing: boolean;
  hovered: boolean;
  focused: boolean;
  inert: boolean;
  captionSize: number;
  stroke: number;
  registerCard: (key: string, el: HTMLDivElement | null) => void;
  onAspect: (key: string, aspect: number) => void;
  onHover: (item: Item | null) => void;
  onSelect: (item: Item) => void;
};

const Card = memo(function Card({
  item,
  width,
  height,
  transform,
  playing,
  hovered,
  focused,
  inert,
  captionSize,
  stroke,
  registerCard,
  onAspect,
  onHover,
  onSelect,
}: CardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const ref = useCallback((el: HTMLDivElement | null) => registerCard(item.key, el), [registerCard, item.key]);

  // Videos loop silently while browsing and start over with controls when
  // opened up close, still muted until the viewer turns the sound on.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (focused) {
      video.currentTime = 0;
      video.muted = true;
      video.play().catch(() => undefined);
    } else {
      video.muted = true;
      if (playing) video.play().catch(() => undefined);
      else video.pause();
    }
  }, [playing, focused]);

  const events = {
    "data-key": item.key,
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && onHover(item),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && onHover(null),
    onClick: () => onSelect(item),
  };
  const className = `ph-card${inert ? " ph-card-inert" : ""}`;

  // Opacity is driven from the render loop on this element, which is its own
  // compositor layer, so fading never repaints what's inside it.
  if (item.type === "divider") {
    const unit = height / (FOLDER_BODY + FOLDER_TAB);
    const tabH = unit * FOLDER_TAB;
    const labelSize = captionSize * 1.1;
    const tabW = Math.min(width * 0.62, Math.max(unit * 0.26, labelSize * (item.name.length * 0.68 + 4.5) + tabH * 1.1));
    const tabX = Math.min(width * [0.04, 0.36, 0.68][item.group % 3], width * 0.96 - tabW);
    const gradient = `ph-folder-${item.key.replace(/[^a-z0-9]/gi, "-")}`;
    return (
      <div className={className} ref={ref} style={{ width, height, transform }}>
        <div className="ph-folder" {...events}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".5" />
                <stop offset="1" stopColor="#fff" stopOpacity=".08" />
              </linearGradient>
            </defs>
            <path
              d={folderPath(width, height, tabX, tabW, tabH)}
              fill={`url(#${gradient})`}
              stroke="rgba(0, 0, 0, .13)"
              strokeWidth={stroke}
            />
          </svg>
          <span
            className="ph-folder-label"
            style={{ left: tabX + tabH * 0.55 + labelSize * 0.9, height: tabH, fontSize: labelSize, maxWidth: tabW - tabH }}
          >
            {item.name}
            <sup>{pad(item.count)}</sup>
          </span>
        </div>
      </div>
    );
  }

  const video = item.media.kind === "video";
  return (
    <div className={className} ref={ref} style={{ width, height, transform }}>
      <div
        className={`ph-plane${ready ? " ph-plane-ready" : ""}${focused ? " ph-plane-focus" : ""}${video ? " ph-plane-video" : ""}`}
        {...events}
      >
        {video ? (
          <video
            ref={videoRef}
            src={`${item.media.src}#t=0.001`}
            muted
            loop={!focused}
            controls={focused}
            playsInline
            preload="metadata"
            onLoadedData={(e) => {
              const el = e.currentTarget;
              if (!item.media.aspect) onAspect(item.key, el.videoWidth / el.videoHeight);
              setReady(true);
              if (playing && !focused) el.play().catch(() => undefined);
            }}
          />
        ) : (
          <img
            src={item.media.src}
            alt={item.media.title}
            draggable={false}
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (!item.media.aspect) onAspect(item.key, img.naturalWidth / img.naturalHeight);
              setReady(true);
            }}
          />
        )}
      </div>
      <span className={`ph-caption${hovered ? " ph-caption-shown" : ""}`} style={{ fontSize: captionSize }}>
        {item.media.title}
        <span>{pad(item.index + 1)}</span>
      </span>
    </div>
  );
});

// frame blends in the overview's off-centre framing (0 in the opening shot).
type Camera = { lat: number; t: number; dist: number; yaw: number; pitch: number; focus: number; frame: number; spread: number };
const CAMERA_KEYS: (keyof Camera)[] = ["lat", "t", "dist", "yaw", "pitch", "focus", "frame", "spread"];

function Photos() {
  const [params, setParams] = useSearchParams();
  const stackIndex = Math.max(0, STACKS.findIndex((stack) => stack.id === params.get("stack")));
  const stack = STACKS[stackIndex];
  const items = LAYOUTS[stackIndex]?.items ?? NO_ITEMS;
  const mediaItems = LAYOUTS[stackIndex]?.media ?? NO_MEDIA;
  const end = LAYOUTS[stackIndex]?.end ?? 0;

  const [view, setView] = useState(() => viewFor(window.innerWidth, window.innerHeight));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [center, setCenter] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [zoomed, setZoomed] = useState(false);
  // Without a stack in the URL the page opens on a wide shot of every stack,
  // then flies into whichever one is chosen.
  const [intro, setIntro] = useState<"select" | "enter" | null>(() =>
    STACKS.length && !params.get("stack") ? "select" : null
  );
  const [introHover, setIntroHover] = useState<number | null>(null);
  const introRef = useRef(intro);
  introRef.current = intro;

  const indexByKey = useMemo(() => new Map(items.map((item, i) => [item.key, i])), [items]);
  const focused = focusedKey === null ? null : indexByKey.get(focusedKey) ?? null;
  const hovered = hoveredKey === null ? null : indexByKey.get(hoveredKey) ?? null;

  const sceneRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const scroll = useRef(0);
  const scrolls = useRef<Record<number, number>>({});
  const reveal = useRef(new Map<number, { start: number; from: number }>());
  const panUntil = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  // Zoom on the open photo, as a target level and offset in screen pixels.
  // With a mouse the view follows the cursor; with touch it's dragged around.
  const zoom = useRef({ level: 1, x: 0, y: 0, follow: true });
  const zoomRef = useRef<HTMLImageElement>(null);
  const zoomReady = useRef<string | null>(null);
  const camera = useRef<Camera>(
    intro
      ? { ...startShot(view), t: START_T - 0.6, dist: startShot(view).dist * 1.3, yaw: view.yaw - 10, pitch: view.pitch - 10, focus: 0, frame: 0 }
      : { lat: stackIndex * view.lateral, t: -0.8, dist: view.dist * 1.4, yaw: view.yaw - 14, pitch: view.pitch - 6, focus: 0, frame: 1, spread: 1 }
  );
  const velocity = useRef<Camera>({ lat: 0, t: 0, dist: 0, yaw: 0, pitch: 0, focus: 0, frame: 0, spread: 0 });
  const stackEls = useRef<(HTMLDivElement | null)[]>([]);

  // The stack being panned away from is marked during render, so its cards
  // stay mounted through the switch instead of blinking out and back in.
  const [transition, setTransition] = useState<{ current: number; leaving: { index: number; t: number } | null }>({
    current: stackIndex,
    leaving: null,
  });
  let leaving = transition.leaving;
  if (transition.current !== stackIndex) {
    leaving = intro ? null : { index: transition.current, t: camera.current.t };
    setTransition({ current: stackIndex, leaving });
  }

  const aspectOf = useCallback(
    (item: Item) => (item.type === "media" ? item.media.aspect ?? aspects[item.key] ?? null : null),
    [aspects]
  );
  const live = useRef({ view, stackIndex, items, focused, hovered, leaving, aspectOf, intro, introHover });
  live.current = { view, stackIndex, items, focused, hovered, leaving, aspectOf, intro, introHover };

  useEffect(() => {
    const onResize = () => setView(viewFor(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const title = document.title;
    document.title = stack ? `${stack.name.toLowerCase()} — mano` : "portfolio";
    return () => {
      document.title = title;
    };
  }, [stack]);

  const resetZoom = useCallback(() => {
    zoom.current = { level: 1, x: 0, y: 0, follow: true };
    setZoomed(false);
  }, []);
  useEffect(() => resetZoom(), [focusedKey, resetZoom]);

  // Switching stacks keeps the old one in place and pans the camera across to
  // the new one, whose cards fade in front to back.
  const previousStack = useRef<number | null>(null);
  useEffect(() => {
    const previous = previousStack.current;
    previousStack.current = stackIndex;
    const now = performance.now();
    if (previous === null) {
      if (introRef.current) STACKS.forEach((_, k) => reveal.current.set(k, { start: now + REVEAL_DELAY + k * 260, from: START_T - 1.4 }));
      else reveal.current.set(stackIndex, { start: now + REVEAL_DELAY, from: scroll.current - 0.4 });
      return;
    }
    // Leaving the opening shot is handled by choose(); every stack is already on screen.
    if (previous === stackIndex || introRef.current) return;
    scrolls.current[previous] = scroll.current;
    scroll.current = scrolls.current[stackIndex] ?? 0;
    reveal.current.set(stackIndex, { start: now + REVEAL_DELAY, from: scroll.current - 0.4 });
    panUntil.current = now + PAN_MS;
    setFocusedKey(null);
    setHoveredKey(null);
    const timer = window.setTimeout(
      () => setTransition((tr) => (tr.current === stackIndex ? { ...tr, leaving: null } : tr)),
      PAN_MS + 200
    );
    return () => window.clearTimeout(timer);
  }, [stackIndex]);

  // Render loop: spring the camera towards its target, then fade cards by
  // depth, distance and reveal order.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastTransform = "";
    let lastCenter = -1;
    let lastStack = -1;
    let crispCard: HTMLDivElement | null = null;
    let zoomKey: string | null = null;
    let lastZoomEl: HTMLImageElement | null = null;
    let lastZoomShown = false;
    const zoomAnim = { z: 1, x: 0, y: 0, vz: 0, vx: 0, vy: 0 };
    const written = new WeakMap<HTMLElement, number>();
    const placed = new WeakMap<HTMLElement, string>();
    const dims = new Map<string, number>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { view, stackIndex, items, focused, hovered, leaving, aspectOf, intro, introHover } = live.current;
      const cam = camera.current;
      const vel = velocity.current;
      const u = view.boxH;

      let target: Camera;
      const focusItem = focused === null ? null : items[focused];
      if (intro === "select") {
        // Hovering a stack's button drifts the camera a little towards it.
        const shot = startShot(view);
        const lean = introHover === null ? 0 : (introHover * view.lateral * shot.spread - shot.lat) * 0.12;
        target = { lat: shot.lat + lean, t: START_T, dist: shot.dist, yaw: view.yaw, pitch: view.pitch - 5, focus: 0, frame: 0, spread: shot.spread };
      } else if (!focusItem) {
        target = { lat: stackIndex * view.lateral, t: scroll.current, dist: view.dist, yaw: view.yaw, pitch: view.pitch, focus: 0, frame: 1, spread: 1 };
      } else {
        target = { lat: stackIndex * view.lateral, t: focusItem.t, dist: view.persp / u, yaw: 0, pitch: 0, focus: 1, frame: 1, spread: 1 };
      }
      const panning = now < panUntil.current;
      const settled = !focusItem && cam.focus < 0.02;
      CAMERA_KEYS.forEach((key) => {
        let omega = panning ? 4.2 : key === "lat" ? 4.2 : key === "t" ? (settled ? 11 : 6) : 6;
        if (reduced) omega = 30;
        [cam[key], vel[key]] = spring(cam[key], vel[key], target[key], omega, dt);
      });

      // Zooming happens on a flat copy of the open photo laid exactly over its
      // card (which sits 1:1 in the middle of the screen once the camera has
      // arrived), so the zoomed image is drawn at full resolution everywhere.
      const z = zoom.current;
      const zoomEl = zoomRef.current;
      let zoomShown = false;
      if (focusItem?.type === "media" && focusItem.media.kind === "image" && zoomEl) {
        if (zoomKey !== focusItem.key) {
          zoomKey = focusItem.key;
          Object.assign(zoomAnim, { z: 1, x: 0, y: 0, vz: 0, vx: 0, vy: 0 });
        }
        const size = sizeOf(focusItem, aspectOf(focusItem), view);
        // How far the zoomed photo overhangs the screen on each side.
        const overX = Math.max(0, (size.w * z.level - view.w) / 2);
        const overY = Math.max(0, (size.h * z.level - view.h) / 2);
        const p = pointer.current;
        if (z.follow && p) {
          z.x = -clamp((p.x - view.w / 2) / (view.w * 0.4), -1, 1) * overX;
          z.y = -clamp((p.y - view.h / 2) / (view.h * 0.4), -1, 1) * overY;
        } else {
          z.x = clamp(z.x, -overX, overX);
          z.y = clamp(z.y, -overY, overY);
        }
        [zoomAnim.z, zoomAnim.vz] = spring(zoomAnim.z, zoomAnim.vz, z.level, reduced ? 30 : 8, dt);
        [zoomAnim.x, zoomAnim.vx] = spring(zoomAnim.x, zoomAnim.vx, z.x, reduced ? 30 : 10, dt);
        [zoomAnim.y, zoomAnim.vy] = spring(zoomAnim.y, zoomAnim.vy, z.y, reduced ? 30 : 10, dt);
        const arrived = cam.focus > 0.999 && Math.abs(cam.t - focusItem.t) < 0.001 && Math.abs(cam.dist - target.dist) < 0.002;
        const zooming = z.level > 1.001 || zoomAnim.z > 1.002 || Math.abs(zoomAnim.x) + Math.abs(zoomAnim.y) > 0.5;
        zoomShown = arrived && zooming && zoomReady.current === focusItem.key;
        if (zoomShown) {
          const w = size.w * zoomAnim.z;
          const h = size.h * zoomAnim.z;
          zoomEl.style.width = `${w.toFixed(1)}px`;
          zoomEl.style.height = `${h.toFixed(1)}px`;
          zoomEl.style.transform = `translate3d(${((view.w - w) / 2 + zoomAnim.x).toFixed(1)}px,${((view.h - h) / 2 + zoomAnim.y).toFixed(1)}px,0)`;
        }
      }
      if (zoomEl && (zoomEl !== lastZoomEl || zoomShown !== lastZoomShown)) {
        zoomEl.classList.toggle("ph-zoom-on", zoomShown);
        lastZoomEl = zoomEl;
        lastZoomShown = zoomShown;
      }

      const o = stackOrigin(1, view);
      const p = pos(cam.t, view);
      const cx = (o[0] * cam.lat) / view.lateral + p[0];
      const cy = p[1];
      const cz = (o[2] * cam.lat) / view.lateral + p[2];
      const shift = (1 - cam.focus) * cam.frame;
      const transform = `translate3d(${(view.ox * shift).toFixed(2)}px,${(view.oy * shift).toFixed(2)}px,${(view.persp - cam.dist * u).toFixed(2)}px) rotateX(${cam.pitch.toFixed(3)}deg) rotateY(${cam.yaw.toFixed(3)}deg) translate3d(${(-cx * u).toFixed(2)}px,${(-cy * u).toFixed(2)}px,${(-cz * u).toFixed(2)}px)`;
      if (transform !== lastTransform && worldRef.current) {
        worldRef.current.style.transform = transform;
        lastTransform = transform;
      }

      const yaw = (cam.yaw * Math.PI) / 180;
      const pitch = (cam.pitch * Math.PI) / 180;
      const kDim = 1 - Math.exp(-dt * 9);
      const hoveredKey = hovered === null || focusItem ? null : items[hovered]?.key ?? null;
      const shown = intro ? LAYOUTS.map((_, k) => k) : leaving ? [leaving.index, stackIndex] : [stackIndex];

      shown.forEach((k) => {
        const current = k === stackIndex && intro !== "select";
        const origin = stackOrigin(k, view, cam.spread);
        const stackEl = stackEls.current[k];
        const stackTransform = `translate3d(${(origin[0] * u).toFixed(1)}px,0,${(origin[2] * u).toFixed(1)}px)`;
        if (stackEl && placed.get(stackEl) !== stackTransform) {
          placed.set(stackEl, stackTransform);
          stackEl.style.transform = stackTransform;
        }
        const tc = current ? cam.t : intro ? START_T : leaving?.t ?? 0;
        const rev = reveal.current.get(k);
        LAYOUTS[k]?.items.forEach((item) => {
          const el = cards.current.get(item.key);
          if (!el) return;
          const ip = pos(item.t, view);
          // Depth of the card in camera space, so nothing renders behind the
          // lens; the open photo is exempt so it can be zoomed right up close.
          const x = origin[0] + ip[0] - cx;
          const y = origin[1] + ip[1] - cy;
          const z = origin[2] + ip[2] - cz;
          const zYaw = -x * Math.sin(yaw) + z * Math.cos(yaw);
          const depth = cam.dist - (y * Math.sin(pitch) + zYaw * Math.cos(pitch));
          const near = current && item === focusItem ? 1 : smooth((depth - 0.5) / 0.5);
          const ahead = item.t - tc;
          // The opening shot keeps each stack short so they fit side by side.
          const fogStart = FOG_START - 1.1 * (1 - cam.frame);
          const fogEnd = FOG_END - 1.4 * (1 - cam.frame);
          const overview = near * (1 - smooth((ahead - fogStart) / (fogEnd - fogStart)));
          let opacity = overview;
          if (current && focusItem) {
            const fromFocus = item.t - focusItem.t;
            const inFocus = fromFocus < -0.001 ? 0 : fromFocus < 0.001 ? 1 : 0.28 * (1 - smooth(fromFocus / 0.7));
            opacity = overview + (inFocus * near - overview) * cam.focus;
          }
          const dimTarget =
            (current && hoveredKey !== null && item.key !== hoveredKey) || (intro === "select" && introHover !== null && k !== introHover)
              ? 0.36
              : 1;
          const dim = (dims.get(item.key) ?? 1) + (dimTarget - (dims.get(item.key) ?? 1)) * kDim;
          dims.set(item.key, dim);
          const glass = item.type === "media" ? 0.9 + 0.1 * (current ? cam.focus : 0) : 1;
          const appear = rev ? smooth((now - rev.start - (Math.max(0, item.t - rev.from) / GAP) * REVEAL_STAGGER) / REVEAL_FADE) : 1;
          const underZoom = zoomShown && item === focusItem ? 0 : 1;
          opacity = Math.round(opacity * glass * dim * appear * underZoom * 100) / 100;
          if (written.get(el) !== opacity) {
            written.set(el, opacity);
            el.style.opacity = String(opacity);
            el.style.visibility = opacity < 0.01 ? "hidden" : "visible";
          }
        });
      });

      // Cards are rasterized once at the size they first appeared (cheap to
      // move around, but soft up close). Once the camera settles on an open
      // photo, let that one card re-rasterize at its on-screen size.
      const crisp =
        focusItem && cam.focus > 0.98 && Math.abs(target.dist - cam.dist) < 0.004 && Math.abs(vel.dist) < 0.02
          ? cards.current.get(focusItem.key) ?? null
          : null;
      if (crisp !== crispCard) {
        crispCard?.classList.remove("ph-card-crisp");
        crisp?.classList.add("ph-card-crisp");
        crispCard = crisp;
      }

      let nearest = 0;
      items.forEach((item, i) => {
        if (Math.abs(item.t - cam.t) < Math.abs(items[nearest].t - cam.t)) nearest = i;
      });
      if (nearest !== lastCenter || stackIndex !== lastStack) {
        lastCenter = nearest;
        lastStack = stackIndex;
        setCenter(nearest);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const nearestMedia = useCallback(
    (from: number) => {
      const t = items[from]?.t ?? 0;
      let best = 0;
      mediaItems.forEach((item, i) => {
        if (Math.abs(item.t - t) < Math.abs(mediaItems[best].t - t)) best = i;
      });
      return mediaItems[best];
    },
    [items, mediaItems]
  );

  const focusMedia = useCallback((item: Item | undefined) => {
    if (!item) return;
    setHoveredKey(null);
    setFocusedKey(item.key);
  }, []);

  const step = useCallback(
    (dir: number) => {
      if (focused === null) {
        const t = scroll.current;
        const next = dir > 0 ? items.find((item) => item.t > t + 0.01) : [...items].reverse().find((item) => item.t < t - 0.01);
        if (next) scroll.current = next.t;
        return;
      }
      const index = mediaItems.indexOf(items[focused] as MediaItem);
      focusMedia(mediaItems[clamp(index + dir, 0, mediaItems.length - 1)]);
    },
    [focused, items, mediaItems, focusMedia]
  );

  const overview = useCallback(() => {
    if (focused !== null) scroll.current = items[focused].t;
    setFocusedKey(null);
  }, [focused, items]);

  const setZoom = useCallback((level: number, follow: boolean) => {
    zoom.current.level = clamp(level, 1, ZOOM_MAX);
    zoom.current.follow = follow;
    setZoomed(zoom.current.level > 1.05);
  }, []);

  const select = useCallback(
    (item: Item) => {
      if (focused !== null) {
        if (item !== items[focused]) return overview();
        // Clicking the open photo zooms; videos keep clicks for their controls.
        if (item.type === "media" && item.media.kind === "image") {
          if (zoom.current.level > 1.05) resetZoom();
          else setZoom(ZOOM_CLICK, zoom.current.follow);
        }
        return;
      }
      if (item.type === "media") focusMedia(item);
      else focusMedia(mediaItems.find((media) => media.group === item.group));
    },
    [focused, items, overview, focusMedia, mediaItems, resetZoom, setZoom]
  );

  // Cards sliding under a resting cursor would otherwise retrigger the hover
  // spread on every frame, so hover pauses while scrolling and is re-checked
  // under the pointer once the stack settles.
  const hoverTimer = useRef<number>();
  const scrollIdle = useRef<number>();
  const scrolling = useRef(false);
  const hover = useCallback((item: Item | null) => {
    if (scrolling.current) return;
    window.clearTimeout(hoverTimer.current);
    if (item) setHoveredKey(item.key);
    else hoverTimer.current = window.setTimeout(() => setHoveredKey(null), 90);
  }, []);
  const markScrolling = useCallback(() => {
    if (!scrolling.current) {
      scrolling.current = true;
      window.clearTimeout(hoverTimer.current);
      setHoveredKey(null);
    }
    window.clearTimeout(scrollIdle.current);
    scrollIdle.current = window.setTimeout(() => {
      scrolling.current = false;
      const p = pointer.current;
      if (!p || live.current.focused !== null) return;
      const key = document.elementFromPoint(p.x, p.y)?.closest("[data-key]")?.getAttribute("data-key") ?? null;
      setHoveredKey(key && live.current.items.some((item) => item.key === key) ? key : null);
    }, 280);
  }, []);

  const registerCard = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) cards.current.set(key, el);
    else cards.current.delete(key);
  }, []);

  const setAspect = useCallback((key: string, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    setAspects((prev) => (Math.abs((prev[key] ?? 0) - aspect) < 0.001 ? prev : { ...prev, [key]: aspect }));
  }, []);

  const switchStack = (index: number) => {
    if (index !== stackIndex) setParams({ stack: STACKS[index].id }, { replace: true });
  };

  // Fly from the opening shot into the chosen stack; the others drift out of
  // view on the way and are dropped once the camera has arrived.
  const choose = (index: number) => {
    if (introRef.current !== "select") return;
    scroll.current = 0;
    panUntil.current = performance.now() + PAN_MS;
    setIntro("enter");
    setIntroHover(null);
    setParams({ stack: STACKS[index].id }, { replace: true });
    window.setTimeout(() => setIntro(null), PAN_MS + 300);
  };

  const focusedItem = focused === null ? null : items[focused];
  const focusedImage = focusedItem?.type === "media" && focusedItem.media.kind === "image";

  // Wheel, keyboard and touch input. A fullscreen video keeps its own input.
  const wheelAccum = useRef({ value: 0, last: 0, stepped: -Infinity });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const onWheel = (e: WheelEvent) => {
      if (document.fullscreenElement) return;
      e.preventDefault();
      if (introRef.current === "select") return;
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * scale;
      if (live.current.focused === null) {
        scroll.current = clamp(scroll.current + delta * 0.0018, 0, end);
        markScrolling();
        return;
      }
      // Pinching on a trackpad arrives as ctrl + wheel.
      if (e.ctrlKey) {
        if (focusedImage) setZoom(zoom.current.level * Math.exp(-e.deltaY * 0.01), true);
        return;
      }
      // One step per gesture, so trackpad inertia doesn't skip through photos.
      const acc = wheelAccum.current;
      const now = performance.now();
      const newGesture = now - acc.last > 180;
      acc.last = now;
      if (newGesture) acc.value = 0;
      else if (now - acc.stepped < 800) return;
      acc.value += delta;
      if (Math.abs(acc.value) > 40) {
        step(Math.sign(acc.value));
        acc.value = 0;
        acc.stepped = now;
      }
    };
    scene.addEventListener("wheel", onWheel, { passive: false });
    return () => scene.removeEventListener("wheel", onWheel);
  }, [step, markScrolling, end, focusedImage, setZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.fullscreenElement || introRef.current === "select") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
      else if (e.key === "Escape" && zoom.current.level > 1.05) resetZoom();
      else if (e.key === "Escape") overview();
      else if ((e.key === "Enter" || e.key === " ") && focused === null) focusMedia(nearestMedia(center));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, overview, focused, focusMedia, nearestMedia, center, resetZoom]);

  // Touch: drag to scroll the stack, swipe between open photos, pinch or tap
  // to zoom, and drag to look around a zoomed photo.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const touch = useRef<{ id: number; x: number; y: number; lastX: number; lastY: number; lastAt: number; v: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; level: number } | null>(null);
  const suppressClick = useRef(false);
  const spread = () => {
    const [a, b] = Array.from(touches.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || introRef.current === "select") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2 && focusedImage) {
      pinch.current = { dist: spread(), level: zoom.current.level };
      touch.current = null;
      suppressClick.current = true;
      return;
    }
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, lastAt: e.timeStamp, v: 0, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      pointer.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size === 2) {
      setZoom((pinch.current.level * spread()) / pinch.current.dist, false);
      return;
    }
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) t.moved = suppressClick.current = true;
    if (focused === null) {
      const dy = e.clientY - t.lastY;
      const dt = Math.max(1, e.timeStamp - t.lastAt);
      scroll.current = clamp(scroll.current - (dy / view.h) * 1.6, 0, end);
      t.v = t.v * 0.6 + (dy / dt) * 0.4;
    } else if (zoom.current.level > 1.05) {
      zoom.current.follow = false;
      zoom.current.x += e.clientX - t.lastX;
      zoom.current.y += e.clientY - t.lastY;
    }
    t.lastX = e.clientX;
    t.lastY = e.clientY;
    t.lastAt = e.timeStamp;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      if (zoom.current.level < 1.05) resetZoom();
      return;
    }
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    touch.current = null;
    if (!t.moved) {
      // Taps zoom by touch rather than following a cursor.
      if (focusedImage) zoom.current.follow = false;
      return;
    }
    if (focused === null) {
      scroll.current = clamp(scroll.current - ((t.v * 260) / view.h) * 1.6, 0, end);
      return;
    }
    if (zoom.current.level > 1.05) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    const main = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(main) > 40) step(main < 0 ? 1 : -1);
  };

  const currentItem = focusedItem ?? items[center];
  const currentGroup = currentItem?.group ?? 0;
  const currentMedia =
    focusedItem?.type === "media" ? focusedItem : currentItem ? nearestMedia(items.indexOf(currentItem)) : undefined;
  const hoverActive = focused === null ? hovered : null;
  const captionSize = Math.round(10.5 / view.scale);
  const stroke = 1.1 / view.scale;

  // Mount only cards within reach of the camera; the anchor moves in coarse
  // steps so cards at the edges aren't mounted and unmounted back and forth.
  // Each stack is a group the render loop slides into place as a whole.
  const renderStack = (k: number, t: number, current: boolean) => {
    const anchor = Math.floor(t / 0.6) * 0.6;
    const u = view.boxH;
    const cards = LAYOUTS[k].items.map((item, i) => {
      if (item.t < anchor - view.dist - 0.3 || item.t > anchor + FOG_END + 0.9) return null;
      const spread =
        !current || hoverActive === null || i === hoverActive
          ? 0
          : Math.sign(i - hoverActive) * HOVER_SPREAD * clamp(1 - (Math.abs(i - hoverActive) - 1) / 4);
      const size = sizeOf(item, aspectOf(item), view);
      const [x, y, z] = pos(item.t + spread, view);
      const transform = `translate3d(${(x * u).toFixed(1)}px,${((y + liftOf(item)) * u).toFixed(1)}px,${(z * u).toFixed(1)}px) translate(-50%,-50%)`;
      return (
        <Card
          key={item.key}
          item={item}
          width={size.w}
          height={size.h}
          transform={transform}
          playing={current && (focused === null || focused === i)}
          hovered={current && hoverActive === i}
          focused={current && focused === i}
          inert={!current}
          captionSize={captionSize}
          stroke={stroke}
          registerCard={registerCard}
          onAspect={setAspect}
          onHover={hover}
          onSelect={select}
        />
      );
    });
    return (
      <div className="ph-stack" ref={(el) => (stackEls.current[k] = el)}>
        {cards}
      </div>
    );
  };

  const focusHint = view.portrait
    ? focusedImage
      ? "Tap to zoom · swipe to move"
      : "Swipe to move"
    : focusedImage
      ? "Click to zoom · ← → to move · esc to close"
      : "← → to move · esc to close";

  return (
    <div
      className={`ph-root${focused !== null ? " ph-focused" : ""}${zoomed ? " ph-zoomed" : ""}${intro === "select" ? " ph-selecting" : ""}`}
      onPointerMove={(e) => e.pointerType === "mouse" && (pointer.current = { x: e.clientX, y: e.clientY })}
    >
      <div
        ref={sceneRef}
        className="ph-scene"
        style={{ perspective: view.persp }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          touches.current.delete(e.pointerId);
          pinch.current = null;
          touch.current = null;
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onClick={(e) => e.target === e.currentTarget && focused !== null && overview()}
      >
        {focusedImage && focusedItem.type === "media" && (
          <img
            key={focusedItem.key}
            ref={zoomRef}
            className="ph-zoom"
            src={focusedItem.media.src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const key = focusedItem.key;
              e.currentTarget
                .decode()
                .catch(() => undefined)
                .then(() => (zoomReady.current = key));
            }}
            onClick={() => select(focusedItem)}
          />
        )}
        <div ref={worldRef} className="ph-world">
          {/* One slot per stack, so a stack's cards survive it becoming the leaving one. */}
          {LAYOUTS.map((_, k) => (
            <React.Fragment key={k}>
              {k === stackIndex && intro !== "select"
                ? renderStack(k, items[center]?.t ?? 0, true)
                : intro
                  ? renderStack(k, START_T, false)
                  : k === leaving?.index && renderStack(k, leaving.t, false)}
            </React.Fragment>
          ))}
        </div>
      </div>

      {!stack && (
        <div className="ph-empty">
          <p>No media yet</p>
          <span>Add folders to src/photo-resources/&lt;stack&gt;/&lt;divider&gt;/</span>
        </div>
      )}

      {intro && <div className={`ph-veil${intro === "select" ? "" : " ph-veil-leaving"}`} />}
      {intro && (
        <div className={`ph-intro${intro === "select" ? "" : " ph-intro-leaving"}`}>
          <div className="ph-intro-choices">
            {STACKS.map((s, i) => (
              <button
                key={s.id}
                className="ph-intro-choice"
                style={{ animationDelay: `${300 + i * 90}ms` }}
                onPointerEnter={(e) => e.pointerType === "mouse" && setIntroHover(i)}
                onPointerLeave={() => setIntroHover(null)}
                onFocus={() => setIntroHover(i)}
                onBlur={() => setIntroHover(null)}
                onClick={() => choose(i)}
              >
                <span className="ph-intro-index">{pad(i + 1)}</span>
                {s.name}
                <sup>{s.count}</sup>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="ph-top">
        <a className="ph-box ph-brand" href="/">
          lg
        </a>
        {STACKS.map((s, i) => (
          <button key={s.id} className={`ph-box${i === stackIndex ? " ph-box-active" : ""}`} onClick={() => switchStack(i)}>
            {s.name}
            <sup>{s.count}</sup>
          </button>
        ))}
      </nav>

      {stack && (
        <>
          <div className="ph-bottom">
            <button className={`ph-box ph-box-small${focused === null ? " ph-box-active" : ""}`} onClick={overview}>
              Overview
            </button>
            <button
              className={`ph-box ph-box-small${focused !== null ? " ph-box-active" : ""}`}
              onClick={() => focused === null && focusMedia(currentMedia)}
            >
              {pad((currentMedia?.index ?? 0) + 1)} <span className="ph-of">/ {pad(stack.count)}</span>
            </button>
          </div>

          {focusedItem?.type === "media" && (
            <div className="ph-title" key={focusedItem.key}>
              <span>{stack.groups[focusedItem.group].name || stack.name}</span>
              {focusedItem.media.title}
              <em>{focusHint}</em>
            </div>
          )}

          <div className="ph-groups">
            {stack.groups.map((group, g) =>
              group.name ? (
                <button
                  key={group.name}
                  className={`ph-pill${g === currentGroup ? " ph-pill-active" : ""}`}
                  onClick={() => {
                    const divider = items.find((item) => item.group === g);
                    if (focused !== null) focusMedia(mediaItems.find((item) => item.group === g));
                    else if (divider) scroll.current = divider.t;
                  }}
                >
                  {group.name}
                  <sup>{group.media.length}</sup>
                </button>
              ) : null
            )}
          </div>

          {focused === null && (
            <div className="ph-hint">{view.portrait ? "Swipe to browse · tap to view" : "Scroll to browse · click to view"}</div>
          )}
        </>
      )}
    </div>
  );
}

export default Photos;
