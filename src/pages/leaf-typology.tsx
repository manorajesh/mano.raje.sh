import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import leavesJson from "../data/leaf-typology.json";

// Sixteen leaves, each reconstructed from eight turntable photos. Models,
// textures and photos live in public/leaves.
//
// One WebGL canvas covers the page and draws every leaf into the on-screen box
// of its grid cell (scissored viewports), so the DOM owns layout and the 3D
// simply follows it. Opening a leaf grows its box from the cell to the stage.
//
// Each leaf lies on an unseen table (only its shadow shows), seen whole from straight above in soft
// ambient light, with a gentle key from the top left so faint shadows fall to the bottom right.
// Models carry a small texture for the grid; `texture` is the full one for the detail view.
type Leaf = {
  id: number;
  model: string;
  texture: { src: string; width: number; height: number };
  photos: { src: string; name: string }[];
};
const LEAVES = leavesJson as Leaf[];

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Critically damped spring, solved exactly so any frame time stays stable.
function spring(x: number, v: number, target: number, omega: number, dt: number) {
  const c1 = x - target;
  const c2 = v + omega * c1;
  const e = Math.exp(-omega * dt);
  return [target + (c1 + c2 * dt) * e, (c2 - omega * (c1 + c2 * dt)) * e];
}

const FOV = 26;
const TOP_DOWN = Math.PI / 2 - 0.0005; // camera elevation, radians (just shy of straight down)
const MIN_PITCH = 0.42;
const DRAG_SPIN = 0.011; // radians per pixel
const REVEAL_STAGGER = 70;
// Framing, as a multiple of the distance that fits the whole leaf at any turn:
// the grid shows all of it and an opened leaf starts close enough to see its
// surface, though never so close that a screen pixel covers more than SHARPNESS texels.
const GRID_ZOOM = 1;
const DETAIL_ZOOM = 0.36;
const SHARPNESS = 2.2;
// How each leaf has been turned outlives the page, until the reset button.
const VIEWS_KEY = "leaf-typology:views";

type Spin = { yaw: number; vel: number; pitch: number; appear: number; vAppear: number; dragging: boolean; resetting: boolean; loadedAt: number };
// reach: the furthest the leaf extends from its centre across the table, so it fits whichever way it's turned.
// texels: full-texture pixels per unit of leaf surface, which caps how close it can be viewed.
type Model = { group: THREE.Group; floor: number; reach: number; texels: number; materials: THREE.MeshStandardMaterial[] };

const isHome = (s: Spin) => Math.abs(s.pitch - TOP_DOWN) < 1e-3 && Math.abs(s.yaw - Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2) < 1e-3;

function loadViews(): Spin[] {
  let saved: [number, number][] = [];
  try {
    saved = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]");
  } catch {}
  return LEAVES.map((_, i) => {
    const [yaw, pitch] = Array.isArray(saved[i]) ? saved[i] : [0, TOP_DOWN];
    return {
      yaw: Number.isFinite(yaw) ? yaw : 0,
      pitch: Number.isFinite(pitch) ? clamp(pitch, MIN_PITCH, TOP_DOWN) : TOP_DOWN,
      vel: 0,
      appear: 0,
      vAppear: 0,
      dragging: false,
      resetting: false,
      loadedAt: 0,
    };
  });
}

function saveViews(spins: Spin[]) {
  try {
    if (spins.every(isHome)) localStorage.removeItem(VIEWS_KEY);
    else localStorage.setItem(VIEWS_KEY, JSON.stringify(spins.map((s) => [+s.yaw.toFixed(4), +s.pitch.toFixed(4)])));
  } catch {}
}

// Average texture density over a model's surface: sqrt(texels covered / surface area).
function texelDensity(root: THREE.Object3D, scale: number) {
  let texels = 0;
  let area = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const image = material?.map?.image as { width: number; height: number } | undefined;
    const position = mesh.isMesh ? mesh.geometry.getAttribute("position") : undefined;
    const uv = mesh.isMesh ? mesh.geometry.getAttribute("uv") : undefined;
    if (!image || !position || !uv) return;
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    const at = (k: number) => (index ? index.getX(k) : k);
    for (let k = 0; k < count; k += 3) {
      const [i, j, l] = [at(k), at(k + 1), at(k + 2)];
      a.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, l).applyMatrix4(mesh.matrixWorld);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
      const du1 = uv.getX(j) - uv.getX(i);
      const dv1 = uv.getY(j) - uv.getY(i);
      const du2 = uv.getX(l) - uv.getX(i);
      const dv2 = uv.getY(l) - uv.getY(i);
      texels += (Math.abs(du1 * dv2 - du2 * dv1) / 2) * image.width * image.height;
    }
  });
  return area > 0 ? Math.sqrt(texels / area) / scale : Infinity;
}

type Drag = { index: number; id: number; x: number; y: number; lastX: number; lastY: number; lastAt: number; moved: boolean };

function LeafTypology() {
  const [params, setParams] = useSearchParams();
  const focusedIndex = LEAVES.findIndex((leaf) => String(leaf.id) === params.get("leaf"));
  const focused = focusedIndex < 0 ? null : focusedIndex;
  // The detail view keeps showing the last leaf while it closes, so the model
  // has a stage to shrink back from.
  const [detail, setDetail] = useState<number | null>(focused);
  if (focused !== null && focused !== detail) setDetail(focused);

  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const focusCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const spins = useRef<Spin[]>(null as unknown as Spin[]);
  if (!spins.current) spins.current = loadViews();
  const [turned, setTurned] = useState(() => !spins.current.every(isHome));
  const zoom = useRef({ level: DETAIL_ZOOM, anim: GRID_ZOOM, v: 0 });
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const live = useRef({ focused, detail });
  live.current = { focused, detail };

  const open = useCallback(
    (index: number | null) => {
      zoom.current.level = DETAIL_ZOOM;
      setParams(index === null ? {} : { leaf: String(LEAVES[index].id) }, { replace: true });
    },
    [setParams]
  );

  useEffect(() => {
    const title = document.title;
    document.title = "leaf typology — mano";
    return () => {
      document.title = title;
    };
  }, []);

  // Renderers, lighting and models. Two canvases draw the same scene: the
  // grid, and above it the open leaf, so the grid can sit blurred behind an
  // open leaf and come back into focus as it closes.
  useEffect(() => {
    const makeRenderer = (canvas: HTMLCanvasElement) => {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      return renderer;
    };
    const gridCanvas = gridCanvasRef.current!;
    const focusCanvas = focusCanvasRef.current!;
    const gridRenderer = makeRenderer(gridCanvas);
    const focusRenderer = makeRenderer(focusCanvas);
    const anisotropy = gridRenderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();

    // Seen from above, screen up is -z, so the top left of the frame is
    // (-x, -z). A high, warm key from there gives the leaf some shape and a
    // short, faint shadow to the bottom right; a broad fill does most of the
    // lighting so nothing goes dark.
    const key = new THREE.SpotLight(0xfff1e2, 16, 0, 0.8, 1, 2);
    key.position.set(-0.9, 2.6, -0.9);
    key.target.position.set(0.25, 0, 0.25);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 8;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 6;
    key.shadow.normalBias = 0.01;
    const fill = new THREE.HemisphereLight(0xf4f1ea, 0x3a342c, 1.5);
    const LIGHTS = { key: key.intensity, fill: fill.intensity };

    const table = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: 0.28 }));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(key, key.target, fill, table);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    const models: (Model | null)[] = LEAVES.map(() => null);
    let disposed = false;

    const loader = new GLTFLoader();
    LEAVES.forEach((leaf, i) => {
      loader.load(leaf.model, (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        const materials: THREE.MeshStandardMaterial[] = [];
        root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => {
            const m = material as THREE.MeshStandardMaterial;
            materials.push(m);
            // Leaves are thin, matte and seen from both sides. Cutout leaves
            // use their texture's alpha as a hard edge.
            m.metalness = 0;
            m.roughness = 0.74;
            m.side = THREE.DoubleSide;
            // Up close and tilted, anisotropic filtering keeps the surface sharp,
            // and the texture doubling as a bump map lets veins and creases catch
            // the raking light.
            if (m.map) {
              m.map.anisotropy = anisotropy;
              m.bumpMap = m.map;
              m.bumpScale = 1.5;
            }
            if (m.transparent || m.alphaTest > 0) {
              m.transparent = false;
              m.alphaTest = 0.5;
            }
          });
        });
        // Centre and scale to a unit bounding sphere; the floor sits under the lowest point.
        const box = new THREE.Box3().setFromObject(root);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        root.position.sub(sphere.center);
        const group = new THREE.Group();
        group.add(root);
        const size = 1 / sphere.radius;
        group.scale.setScalar(size);
        group.visible = false;
        scene.add(group);
        let reach = 0;
        const p = new THREE.Vector3();
        root.updateWorldMatrix(true, true);
        root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          const position = mesh.isMesh ? mesh.geometry.getAttribute("position") : undefined;
          if (!position) return;
          for (let k = 0; k < position.count; k++) {
            p.fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld);
            reach = Math.max(reach, Math.hypot(p.x, p.z));
          }
        });
        // matrixWorld already carries the group's scale.
        reach ||= 1;
        // The table sits a hair below the leaf, so even the flat cutouts cast a thin shadow.
        const grid = materials[0]?.map?.image as { width: number } | undefined;
        const texels = texelDensity(root, size) * (grid ? leaf.texture.width / grid.width : 1);
        models[i] = { group, floor: (box.min.y - sphere.center.y) * size - 0.012, reach, texels, materials };
        spins.current[i].loadedAt = performance.now();
      });
    });

    // The open leaf gets its full-resolution texture once it has arrived on
    // the stage: decoded off the main thread, then uploaded (to the focus
    // renderer only) while the view is still, so neither the page load nor
    // the zoom stutters. Closing puts the leaf back on its grid texture before
    // the grid draws it again.
    const bitmaps = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });
    let full: { index: number; texture: THREE.Texture | null; grid: THREE.Texture | null } | null = null;
    const dropFull = () => {
      if (!full) return;
      const { grid, texture } = full;
      models[full.index]?.materials.forEach((m) => {
        m.map = grid;
        m.bumpMap = grid;
      });
      texture?.dispose();
      full = null;
    };
    const loadFull = (index: number) => {
      const model = models[index];
      if (!model) return;
      dropFull();
      const current = { index, texture: null as THREE.Texture | null, grid: model.materials[0]?.map ?? null };
      full = current;
      bitmaps.load(LEAVES[index].texture.src, (bitmap) => {
        if (disposed || full !== current || !current.grid) return bitmap.close();
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = current.grid.wrapS;
        texture.wrapT = current.grid.wrapT;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        focusRenderer.initTexture(texture);
        current.texture = texture;
        model.materials.forEach((m) => {
          m.map = texture;
          m.bumpMap = texture;
        });
      });
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let focus = live.current.focused === null ? 0 : 1;
    let vFocus = 0;
    let last = performance.now();
    let frame = 0;
    // Once the grid is fully blurred behind an open leaf it stops redrawing.
    let gridHeld = false;

    // Draws leaf i into the on-screen box (x, y, w, h), in CSS pixels.
    const drawLeaf = (renderer: THREE.WebGLRenderer, i: number, x: number, y: number, w: number, h: number, zoomed: number) => {
      const model = models[i]!;
      const s = spins.current[i];
      if (w < 2 || h < 2 || x > width || y > height || x + w < 0 || y + h < 0) return;
      renderer.setViewport(x, height - y - h, w, h);
      renderer.setScissor(x, height - y - h, w, h);

      // Frame the circle the leaf sweeps as it turns, seen from above, so all
      // of it shows however it's turned and the framing stays put, like a
      // camera fixed over the table.
      camera.aspect = w / h;
      const vHalf = THREE.MathUtils.degToRad(FOV / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const fit = (model.reach / Math.tan(Math.min(hHalf, vHalf))) * 1.12;
      // Screen pixels per unit at distance d are h * dpr / (2 d tan(vHalf)); keep that
      // within SHARPNESS times the texture's density.
      const nearest = (h * renderer.getPixelRatio()) / (2 * Math.tan(vHalf) * model.texels * SHARPNESS);
      const dist = Math.max(fit * zoomed, Math.min(nearest, fit * GRID_ZOOM));
      camera.position.set(0, Math.sin(s.pitch) * dist, Math.cos(s.pitch) * dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      key.intensity = LIGHTS.key * s.appear;
      fill.intensity = LIGHTS.fill * s.appear;
      model.group.rotation.y = s.yaw;
      table.position.y = model.floor;
      model.group.visible = true;
      renderer.clearDepth();
      renderer.render(scene, camera);
      model.group.visible = false;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { focused, detail } = live.current;
      if (gridCanvas.clientWidth !== width || gridCanvas.clientHeight !== height) {
        width = gridCanvas.clientWidth;
        height = gridCanvas.clientHeight;
        gridRenderer.setSize(width, height, false);
        focusRenderer.setSize(width, height, false);
        gridHeld = false;
      }
      // Closing is quicker than opening: the leaf snaps back into the grid.
      const omega = reduced ? 40 : focused === null ? 14 : 7;
      [focus, vFocus] = spring(focus, vFocus, focused === null ? 0 : 1, omega, dt);
      const z = zoom.current;
      [z.anim, z.v] = spring(z.anim, z.v, focused === null ? GRID_ZOOM : z.level, omega, dt);
      const active = focus > 0.002 || focused !== null ? detail : null;
      if (focused !== null && focus > 0.98 && full?.index !== focused) loadFull(focused);
      if (focused === null) dropFull();

      LEAVES.forEach((_, i) => {
        const s = spins.current[i];
        // Leaves fade in by their lights coming up, a little after one another.
        const visible = models[i] !== null && now - s.loadedAt > i * REVEAL_STAGGER;
        [s.appear, s.vAppear] = spring(s.appear, s.vAppear, visible ? 1 : 0, reduced ? 40 : 4, dt);
        if (!s.dragging) {
          s.yaw += s.vel * dt;
          s.vel *= Math.exp(-dt * 6);
          // Reset turns it back the short way to the top-down view.
          if (s.resetting) {
            const home = Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2;
            const k = 1 - Math.exp(-dt * (reduced ? 30 : 4));
            s.yaw += (home - s.yaw) * k;
            s.pitch += (TOP_DOWN - s.pitch) * k;
            if (Math.abs(home - s.yaw) < 1e-4 && TOP_DOWN - s.pitch < 1e-4) {
              s.yaw = 0;
              s.pitch = TOP_DOWN;
              s.resetting = false;
            }
          }
        }
      });

      // The grid: every leaf except the open one.
      const hold = focused !== null && focus > 0.995;
      if (!hold || !gridHeld) {
        gridRenderer.setScissorTest(false);
        gridRenderer.clear();
        gridRenderer.setScissorTest(true);
        LEAVES.forEach((_, i) => {
          const cell = cellRefs.current[i];
          if (i === active || !models[i] || !cell || spins.current[i].appear < 0.01) return;
          const r = cell.getBoundingClientRect();
          drawLeaf(gridRenderer, i, r.left, r.top, r.width, r.height, GRID_ZOOM);
        });
        gridHeld = hold;
      }

      // The open leaf, growing from its cell to the stage (or back).
      focusRenderer.setScissorTest(false);
      focusRenderer.clear();
      focusRenderer.setScissorTest(true);
      const cell = active === null ? null : cellRefs.current[active];
      const stage = stageRef.current?.getBoundingClientRect();
      if (active !== null && models[active] && cell && stage) {
        const r = cell.getBoundingClientRect();
        drawLeaf(
          focusRenderer,
          active,
          r.left + (stage.left - r.left) * focus,
          r.top + (stage.top - r.top) * focus,
          r.width + (stage.width - r.width) * focus,
          r.height + (stage.height - r.height) * focus,
          z.anim
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const save = () => saveViews(spins.current);
    window.addEventListener("pagehide", save);

    return () => {
      disposed = true;
      save();
      window.removeEventListener("pagehide", save);
      cancelAnimationFrame(frame);
      full?.texture?.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => {
          Object.values(material).forEach((value) => value instanceof THREE.Texture && value.dispose());
          material.dispose();
        });
      });
      gridRenderer.dispose();
      focusRenderer.dispose();
    };
  }, []);

  // Dragging a leaf spins it (and tilts it a little); a press without much
  // movement is a click.
  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { index, id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, lastAt: e.timeStamp, moved: false };
    suppressClick.current = false;
    spins.current[index].dragging = true;
    spins.current[index].resetting = false;
    spins.current[index].vel = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const s = spins.current[d.index];
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.moved = suppressClick.current = true;
      setTurned(true);
    }
    s.yaw += dx * DRAG_SPIN;
    s.pitch = clamp(s.pitch + dy * DRAG_SPIN * 0.6, MIN_PITCH, TOP_DOWN);
    const dt = Math.max(1, e.timeStamp - d.lastAt) / 1000;
    s.vel = s.vel * 0.5 + ((dx * DRAG_SPIN) / dt) * 0.5;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastAt = e.timeStamp;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const s = spins.current[d.index];
    s.dragging = false;
    // A flick keeps spinning; a drag that stopped before release doesn't.
    if (e.timeStamp - d.lastAt > 80) s.vel = 0;
    s.vel = clamp(s.vel, -12, 12);
    drag.current = null;
    // Saved where the flick will come to rest.
    const yaw = s.yaw;
    s.yaw += s.vel / 6;
    saveViews(spins.current);
    s.yaw = yaw;
  };

  const resetViews = () => {
    spins.current.forEach((s) => {
      s.vel = 0;
      s.resetting = true;
    });
    try {
      localStorage.removeItem(VIEWS_KEY);
    } catch {}
    setTurned(false);
  };

  const step = useCallback(
    (dir: number) => {
      if (focused === null) return;
      open((focused + dir + LEAVES.length) % LEAVES.length);
    },
    [focused, open]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && focused !== null) open(null);
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, open, step]);

  // Scrolling or pinching over the open leaf moves the camera in and out.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (live.current.focused === null) return;
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : 1;
      zoom.current.level = clamp(zoom.current.level * Math.exp(e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.0015)), 0.22, 1.3);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const detailLeaf = detail === null ? null : LEAVES[detail];

  return (
    <div className={`ph-root lt-root${focused !== null ? " lt-focused" : ""}`}>
      <div className="lt-grid" aria-hidden={focused !== null}>
        {LEAVES.map((leaf, i) => (
          <button
            key={leaf.id}
            ref={(el) => (cellRefs.current[i] = el)}
            className="lt-cell"
            style={{ animationDelay: `${120 + i * 40}ms` }}
            aria-label={`Leaf ${pad(leaf.id)}`}
            tabIndex={focused === null ? 0 : -1}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              if (suppressClick.current) return;
              // A mouse click shouldn't leave a focus ring on the cell after Esc closes the leaf.
              if (e.detail > 0) e.currentTarget.blur();
              open(i);
            }}
          />
        ))}
      </div>

      <div className="lt-detail">
        <div
          ref={stageRef}
          className="lt-stage"
          onPointerDown={detail === null ? undefined : onPointerDown(detail)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // With no other controls on the page, a click on the open leaf closes it.
          onClick={() => !suppressClick.current && open(null)}
        />
        {detailLeaf && (
          <div className="lt-photos" key={detailLeaf.id}>
            {detailLeaf.photos.map((photo, k) => (
              <figure key={photo.src} className="lt-photo" style={{ animationDelay: `${180 + k * 55}ms` }}>
                <img src={photo.src} alt={`Leaf ${pad(detailLeaf.id)}, view ${k + 1}`} draggable={false} decoding="async" />
              </figure>
            ))}
          </div>
        )}
      </div>

      <button className={`lt-reset${turned && focused === null ? " lt-reset-shown" : ""}`} onClick={resetViews} tabIndex={turned && focused === null ? 0 : -1}>
        reset view
      </button>

      <canvas ref={gridCanvasRef} className="lt-canvas lt-canvas-grid" />
      <canvas ref={focusCanvasRef} className="lt-canvas lt-canvas-focus" />

    </div>
  );
}

export default LeafTypology;
