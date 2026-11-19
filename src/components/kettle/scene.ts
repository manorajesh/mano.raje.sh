import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Analysis, CUP_FLOOR, CUP_TAPER, CUP_WALL, D2R, DimKey, Dims, G, Geo, landing, cupCapacity, TOL, Scenario,
  SPOUT_WALL, surfaceFor, TOP, wallX,
} from "./model";

// The kettle, base and cup in inches (x toward the kettle, y up, z toward the viewer).
//
// Two looks. "side" is the drawing: an orthographic elevation in flat fills and ink outlines,
// cut away so the water shows, with centre lines, a phantom of the other pose and dimension
// lines like the sketch's. "3d" is the same objects shaded, to orbit around.
//
// On top: the predicted stream, and a particle pour that runs the same physics forward in time.

const BG = 0x0b0b0b;
const INK = 0xe8e6e1;
const WATER = 0x6fb7ff;
const WARM = 0xff8a3d;
const FOCUS = 0x9fd0ff;
const MAXP = 1600;

export type View = "3d" | "side";
export type PourStats = { phase: "idle" | "tilt" | "pour" | "settle" | "back" | "done"; t: number; cup: number; spilled: number; Q: number };
export type DimState = "normal" | "locked" | "bad";
type Part = "base" | "kettle" | "spout" | "cup";

// which part of the drawing each dimension changes
export const DIM_PARTS: Record<DimKey, Part[]> = {
  baseH: ["base"], kettleW: ["base", "kettle"], cupDist: ["cup"], cupH: ["cup"], cupD: ["cup"],
  spoutL: ["spout", "kettle"], reach: ["spout", "kettle"], tilt: ["kettle", "spout"], bend: ["spout"], bore: ["spout"],
};

type Seg = number[];

class Lines {
  obj: THREE.LineSegments;
  mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  private pos: Float32Array;
  constructor(max: number, color = INK, opacity = 0.55, order = 10, dashed = false) {
    this.pos = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setDrawRange(0, 0);
    this.mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, depthTest: false, dashSize: 0.35, gapSize: 0.22 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
    this.obj = new THREE.LineSegments(g, this.mat);
    this.obj.renderOrder = order;
    this.obj.frustumCulled = false;
  }
  set(s: Seg) {
    const n = Math.min(s.length, this.pos.length);
    this.pos.set(n === s.length ? s : s.slice(0, n));
    const g = this.obj.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, n / 3);
    if (this.mat instanceof THREE.LineDashedMaterial) this.obj.computeLineDistances();
  }
  style(color: number, opacity: number) {
    this.mat.color.setHex(color);
    this.mat.opacity = opacity;
  }
}

/** A dimension between p and q (xy), pushed out by off, at depth z: extension lines, the line, architect's ticks. */
function dimSegs(p: number[], q: number[], off: number[], z: number, out: Seg) {
  const a = [p[0] + off[0], p[1] + off[1]], b = [q[0] + off[0], q[1] + off[1]];
  const ol = Math.hypot(off[0], off[1]) || 1;
  const ox = off[0] / ol, oy = off[1] / ol;
  out.push(p[0] + ox * 0.25, p[1] + oy * 0.25, z, a[0] + ox * 0.3, a[1] + oy * 0.3, z);
  out.push(q[0] + ox * 0.25, q[1] + oy * 0.25, z, b[0] + ox * 0.3, b[1] + oy * 0.3, z);
  out.push(a[0], a[1], z, b[0], b[1], z);
  let ux = b[0] - a[0], uy = b[1] - a[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const tx = (ux - uy) * 0.2, ty = (uy + ux) * 0.2;
  for (const e of [a, b]) out.push(e[0] - tx, e[1] - ty, z, e[0] + tx, e[1] + ty, z);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** A polyline as segments. */
function poly(pts: number[][], z: number, out: Seg, closed = false) {
  for (let i = 1; i < pts.length; i++) out.push(pts[i - 1][0], pts[i - 1][1], z, pts[i][0], pts[i][1], z);
  if (closed && pts.length > 2) {
    const a = pts[pts.length - 1], b = pts[0];
    out.push(a[0], a[1], z, b[0], b[1], z);
  }
}

/** Both edges of a tube of radius r along a sampled path; skip(x, y) drops pieces hidden inside something. */
function tubeEdges(px: number[], py: number[], r: number, z: number, out: Seg, skip?: (x: number, y: number) => boolean) {
  const n = px.length;
  const side = (s: number) => {
    let prev: number[] | null = null;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = px[i1] - px[i0], ty = py[i1] - py[i0];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const p = [px[i] - ty * r * s, py[i] + tx * r * s];
      if (skip && skip(p[0], p[1])) {
        prev = null;
        continue;
      }
      if (prev) out.push(prev[0], prev[1], z, p[0], p[1], z);
      prev = p;
    }
  };
  side(1);
  side(-1);
}

const flat = (color: number, opacity = 1, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, ...extra });

export class KettleScene {
  tags: Partial<Record<DimKey, HTMLElement | null>> = {};
  onStats: (s: PourStats) => void = () => {};
  /** Called when the pour animation changes the shown tilt, so the slider can follow. */
  onPreview: (f: number) => void = () => {};
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private view: View = "side";
  private preview = 0; // fraction of the tipping angle shown
  private autoFit = true;
  private dragging: DimKey | null = null;
  private focus: DimKey | null = null;
  private w = 1;
  private h = 1;
  private raf = 0;
  private on = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private wrap: HTMLElement;
  private svg: SVGSVGElement;

  private d!: Dims;
  private a!: Analysis;
  private sc!: Scenario;
  private g!: Geo;
  private th = 0; // displayed tilt, rad
  private anchors: Partial<Record<DimKey, THREE.Vector3>> = {};
  private rates: Partial<Record<DimKey, THREE.Vector3>> = {};
  private dimState: Partial<Record<DimKey, DimState>> = {};
  private tagPos: Partial<Record<DimKey, { x: number; y: number }>> = {};

  private base: THREE.Mesh;
  private kettle = new THREE.Group();
  private body: THREE.Mesh;
  private water: THREE.Mesh;
  private cap: THREE.Mesh;
  private capPos = new Float32Array(200 * 3);
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private spout: THREE.Mesh;
  private handle: THREE.Mesh;
  private lid: THREE.Mesh;
  private cup = new THREE.Group();
  private cupBody: THREE.Mesh;
  private cupHandle: THREE.Mesh;
  private cupWater: THREE.Mesh;
  private band: THREE.Mesh;
  private traj: Lines;
  private arc: Lines;
  private ghost: Lines;
  private center: Lines;
  private outline: Record<Part, Lines>;
  private level: Lines;
  private paper: THREE.LineSegments;
  private floorGrid: THREE.LineSegments;
  private dims: Partial<Record<DimKey, Lines>> = {};
  private puddle: THREE.Mesh;
  private mats: Record<string, { shaded: THREE.Material; flat: THREE.Material; order: [number, number] }> = {};
  private meshes: Record<string, THREE.Mesh | THREE.InstancedMesh> = {};

  private speed = 4;
  private anim: null | {
    phase: PourStats["phase"]; t: number; th: number; V: number; cup: number; spilled: number; wait: number; Q: number;
    interval: number; sx: number; sz: number; sn: number;
  } = null;
  private P = {
    pos: new Float32Array(MAXP * 3), vel: new Float32Array(MAXP * 3), r0: new Float32Array(MAXP), v0: new Float32Array(MAXP),
    vol: new Float64Array(MAXP), gap: new Float32Array(MAXP), state: new Uint8Array(MAXP), next: 0,
  };
  private parts: THREE.InstancedMesh;

  private last = 0;
  private statT = 0;
  private lastDone: { cup: number; spilled: number } | null = null;

  constructor(canvas: HTMLCanvasElement, wrap: HTMLElement) {
    this.wrap = wrap;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(BG, 1);
    r.localClippingEnabled = true;
    this.renderer = r;
    this.persp = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    this.persp.position.set(-14, 16, 62);
    this.ortho = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.5, 600);
    this.ortho.position.set(0, 0, 200);
    this.controls = new OrbitControls(this.persp, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 220;
    this.controls.enabled = false;
    this.controls.addEventListener("start", () => (this.autoFit = false));

    // leader lines from displaced labels back to their dimension
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "kt-leaders");
    wrap.appendChild(this.svg);

    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-12, 30, 22);
    s.add(sun);

    // floor grid (3D) and drafting paper (side): an inch grid, every sixth line stronger
    const fg: number[] = [];
    for (let i = -40; i <= 30; i += 1) fg.push(i, 0, -14, i, 0, 14);
    for (let k = -14; k <= 14; k += 1) fg.push(-40, 0, k, 30, 0, k);
    const fgg = new THREE.BufferGeometry();
    fgg.setAttribute("position", new THREE.Float32BufferAttribute(fg, 3));
    this.floorGrid = new THREE.LineSegments(fgg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.045 }));
    s.add(this.floorGrid);
    const pg: number[] = [], pgMajor: number[] = [];
    for (let i = -60; i <= 40; i++) (i % 6 ? pg : pgMajor).push(i, -6, -30, i, 60, -30);
    for (let j = -6; j <= 60; j++) (j % 6 ? pg : pgMajor).push(-60, j, -30, 40, j, -30);
    const pgg = new THREE.BufferGeometry();
    pgg.setAttribute("position", new THREE.Float32BufferAttribute(pg, 3));
    this.paper = new THREE.LineSegments(pgg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.03, depthTest: false }));
    const pgm = new THREE.BufferGeometry();
    pgm.setAttribute("position", new THREE.Float32BufferAttribute(pgMajor, 3));
    const major = new THREE.LineSegments(pgm, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.06, depthTest: false }));
    major.renderOrder = -1;
    this.paper.add(major);
    this.paper.renderOrder = -1;
    s.add(this.paper);
    const gl = new THREE.BufferGeometry();
    gl.setAttribute("position", new THREE.Float32BufferAttribute([-60, 0, 0, 40, 0, 0], 3));
    const ground = new THREE.Line(gl, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55, depthTest: false }));
    ground.renderOrder = 7;
    s.add(ground);

    // materials: shaded for 3D, flat for the drawing; [3D order, drawing order]
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9aa0a8, metalness: 0.35, roughness: 0.3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
    });
    const steelSpout = steel.clone();
    steelSpout.opacity = 0.42;
    const waterShaded = new THREE.MeshStandardMaterial({
      color: WATER, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    });
    const waterClipped = waterShaded.clone();
    waterClipped.clippingPlanes = [this.clip];
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.5, metalness: 0.4 });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.55, side: THREE.DoubleSide });
    const FILL = 0x17191c;
    const SECTION = 0x2f6da8;
    this.mats = {
      base: { shaded: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.85 }), flat: flat(0x131313), order: [0, 1] },
      body: { shaded: steel, flat: flat(FILL), order: [3, 3] },
      water: { shaded: waterClipped, flat: flat(SECTION, 0.92, { clippingPlanes: [this.clip] }), order: [2, 4] },
      cap: { shaded: waterShaded, flat: flat(SECTION, 0), order: [2, 4] },
      spout: { shaded: steelSpout, flat: flat(FILL), order: [4, 2] },
      handle: { shaded: dark, flat: flat(FILL), order: [0, 2] },
      lid: { shaded: dark, flat: flat(FILL), order: [0, 2] },
      cupBody: { shaded: ceramic, flat: flat(0x1a1a1a), order: [0, 3] },
      cupHandle: { shaded: ceramic.clone(), flat: flat(0x1a1a1a), order: [0, 3] },
      cupWater: { shaded: new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.15 }), flat: flat(SECTION, 0.92), order: [0, 4] },
      parts: { shaded: new THREE.MeshStandardMaterial({ color: 0x8cc6ff, roughness: 0.1, emissive: 0x10304f }), flat: flat(0x8cc6ff), order: [5, 6] },
      puddle: {
        shaded: new THREE.MeshStandardMaterial({ color: WATER, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false }),
        flat: flat(WATER, 0.5), order: [1, 5],
      },
    };

    this.base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    s.add(this.base);

    this.body = new THREE.Mesh(new THREE.CylinderGeometry(TOP, 1, 1, 48, 1, false));
    this.water = new THREE.Mesh(new THREE.CylinderGeometry(TOP, 1, 1, 48, 1, false));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(this.capPos, 3));
    this.cap = new THREE.Mesh(cg);
    this.cap.frustumCulled = false;
    this.spout = new THREE.Mesh(new THREE.BufferGeometry());
    this.handle = new THREE.Mesh(new THREE.BufferGeometry());
    this.lid = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    this.kettle.add(this.body, this.water, this.cap, this.spout, this.handle, this.lid);
    s.add(this.kettle);

    this.cupBody = new THREE.Mesh(new THREE.BufferGeometry());
    this.cupHandle = new THREE.Mesh(new THREE.BufferGeometry());
    this.cupWater = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40));
    this.cupWater.visible = false;
    this.cup.add(this.cupBody, this.cupHandle, this.cupWater);
    s.add(this.cup);

    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40));
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.visible = false;
    s.add(this.puddle);
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), undefined, MAXP);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    s.add(this.parts);
    this.meshes = {
      base: this.base, body: this.body, water: this.water, cap: this.cap, spout: this.spout, handle: this.handle, lid: this.lid,
      cupBody: this.cupBody, cupHandle: this.cupHandle, cupWater: this.cupWater, parts: this.parts, puddle: this.puddle,
    };

    // drawing lines
    this.outline = {
      base: new Lines(40, INK, 0.75, 7),
      kettle: new Lines(400, INK, 0.75, 7),
      spout: new Lines(700, INK, 0.75, 7),
      cup: new Lines(300, INK, 0.75, 7),
    };
    this.kettle.add(this.outline.kettle.obj, this.outline.spout.obj);
    s.add(this.outline.base.obj, this.outline.cup.obj);
    this.level = new Lines(4, 0xa8d4ff, 0.95, 7);
    this.kettle.add(this.level.obj);
    this.center = new Lines(80, INK, 0.28, 6, true);
    this.ghost = new Lines(200, INK, 0.22, 1, true);
    this.arc = new Lines(80, INK, 0.38, 8, true);
    s.add(this.center.obj, this.ghost.obj, this.arc.obj);

    this.band = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.9), new THREE.MeshBasicMaterial({ color: WATER, transparent: true, opacity: 0.9, depthTest: false }));
    this.band.renderOrder = 9;
    s.add(this.band);
    this.traj = new Lines(260, WATER, 0.9, 8);
    s.add(this.traj.obj);
    for (const k of ["baseH", "cupH", "cupDist", "spoutL", "reach", "tilt", "bend", "cupD", "kettleW"] as DimKey[]) {
      this.dims[k] = new Lines(60, INK, 0.5, 8);
      s.add(this.dims[k]!.obj);
    }
    this.applyMode();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.resize();
    this.io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !this.on) {
        this.on = true;
        this.last = performance.now();
        this.loop();
      } else if (!e.isIntersecting && this.on) {
        this.on = false;
        cancelAnimationFrame(this.raf);
      }
    });
    this.io.observe(wrap);
  }

  private applyMode() {
    const side = this.view === "side";
    for (const k in this.meshes) {
      const m = this.meshes[k], spec = this.mats[k];
      m.material = side ? spec.flat : spec.shaded;
      m.renderOrder = side ? spec.order[1] : spec.order[0];
    }
    this.paper.visible = side;
    this.floorGrid.visible = !side;
    this.level.obj.visible = side;
    this.center.obj.visible = side;
    this.styleLines();
  }

  private resize() {
    this.w = Math.max(1, this.wrap.clientWidth);
    this.h = Math.max(1, this.wrap.clientHeight);
    this.renderer.setSize(this.w, this.h, false);
    this.svg.setAttribute("viewBox", `0 0 ${this.w} ${this.h}`);
    this.persp.aspect = this.w / this.h;
    this.persp.updateProjectionMatrix();
    if (this.d) this.fit(1);
  }

  private get camera(): THREE.Camera {
    return this.view === "3d" ? this.persp : this.ortho;
  }

  // ---------- design ----------

  update(d: Dims, a: Analysis, sc: Scenario) {
    const first = !this.d;
    const geomChanged = first || (Object.keys(d) as DimKey[]).some((k) => d[k] !== this.d[k]);
    if (this.anim && (geomChanged || sc !== this.sc)) this.stopPour();
    if (sc !== this.sc) this.resetWater();
    this.d = d;
    this.a = a;
    this.sc = sc;
    this.g = a.g;
    if (geomChanged) this.rebuild();
    this.drawPrediction();
    if (first) {
      this.th = d.tilt * D2R * this.preview;
      this.fit(1);
    }
  }

  setDimState(s: Partial<Record<DimKey, DimState>>) {
    this.dimState = s;
    this.styleLines();
  }

  /** Highlight a dimension and the part it changes; fade the rest. */
  setFocus(k: DimKey | null) {
    if (k === this.focus) return;
    this.focus = k;
    this.styleLines();
  }

  private styleLines() {
    const f = this.focus;
    const side = this.view === "side";
    for (const key in this.dims) {
      const k = key as DimKey;
      const st = this.dimState[k] ?? "normal";
      const ln = this.dims[k]!;
      if (f === k) ln.style(FOCUS, 1);
      else if (st === "bad") ln.style(WARM, f ? 0.5 : 0.95);
      else ln.style(INK, f ? 0.14 : st === "locked" ? 0.75 : 0.45);
    }
    const lit = new Set<Part>(f ? DIM_PARTS[f] : []);
    for (const p of Object.keys(this.outline) as Part[]) {
      const ln = this.outline[p];
      ln.obj.visible = side || lit.has(p);
      if (lit.has(p)) ln.style(FOCUS, 1);
      else ln.style(INK, f ? 0.35 : 0.75);
    }
    this.ghost.style(INK, f ? 0.1 : 0.22);
    this.arc.style(f === "tilt" || f === "spoutL" ? FOCUS : INK, f === "tilt" || f === "spoutL" ? 0.8 : f ? 0.15 : 0.38);
  }

  private rebuild() {
    const { d, g, a } = this;
    // base
    this.base.scale.set(d.kettleW, Math.max(d.baseH, 0.001), d.kettleW);
    this.base.position.set(d.kettleW / 2, d.baseH / 2, 0);
    this.base.visible = d.baseH > 0.01;
    const bo: Seg = [];
    if (d.baseH > 0.01) {
      const zb = d.kettleW / 2 + 0.05;
      poly([[0, 0], [0, d.baseH], [d.kettleW, d.baseH], [d.kettleW, 0]], zb, bo, true);
      bo.push(0, 0, zb, d.kettleW, d.baseH, zb, 0, d.baseH, zb, d.kettleW, 0, zb);
    }
    this.outline.base.set(bo);

    // kettle body
    this.kettle.position.set(0, d.baseH, 0);
    this.body.scale.set(g.rb, g.Hk, g.rb);
    this.body.position.set(g.rb, g.Hk / 2, 0);
    this.water.scale.set(g.rb * 0.985, g.Hk * 0.995, g.rb * 0.985);
    this.water.position.copy(this.body.position);
    const lidR = g.rt * 0.62, lidH = Math.min(0.9, g.rt * 0.4);
    this.lid.scale.set(lidR, lidH, lidR);
    this.lid.position.set(g.rb, g.Hk, 0);

    // spout: the model's gooseneck as a tube, starting inside the kettle wall
    const c = g.ctrl;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i + 7 < c.length; i += 6)
      curve.add(new THREE.CubicBezierCurve3(
        new THREE.Vector3(c[i], c[i + 1], 0), new THREE.Vector3(c[i + 2], c[i + 3], 0),
        new THREE.Vector3(c[i + 4], c[i + 5], 0), new THREE.Vector3(c[i + 6], c[i + 7], 0)));
    const ro = d.bore / 2 + SPOUT_WALL;
    this.spout.geometry.dispose();
    this.spout.geometry = new THREE.TubeGeometry(curve, 96, ro, 14, false);

    // handle on the back, like the sketch: out from near the top, down, back in
    const back = (y: number) => g.rb + (g.rb - (g.rb - g.rt) * (y / g.Hk));
    const y1 = g.Hk * 0.82, y2 = g.Hk * 0.3;
    const hreach = Math.max(1.4, g.rb * 0.45);
    const hc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(back(y1) - 0.1, y1, 0),
      new THREE.Vector3(back(y1) + hreach * 0.8, y1 + 0.5, 0),
      new THREE.Vector3(back(y2) + hreach, (y1 + y2) / 2, 0),
      new THREE.Vector3(back(y2) + hreach * 0.6, y2 - 0.2, 0),
      new THREE.Vector3(back(y2) - 0.1, y2, 0),
    ]);
    this.handle.geometry.dispose();
    this.handle.geometry = new THREE.TubeGeometry(hc, 48, 0.28, 10, false);

    // the kettle drawn: body, lid, handle, spout (only where it's outside the body)
    const inBody = (x: number, y: number) => y > 0.001 && y < g.Hk && x > wallX(g, y) && x < 2 * g.rb - wallX(g, y);
    const ko: Seg = [];
    const z = g.rb + 0.5;
    poly([[0, 0], [g.xt, g.Hk], [g.xt + 2 * g.rt, g.Hk], [2 * g.rb, 0]], z, ko, true);
    const lidPts: number[][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI;
      lidPts.push([g.rb + Math.cos(t) * lidR, g.Hk + Math.sin(t) * lidH]);
    }
    poly(lidPts, z, ko);
    const hp = hc.getPoints(48);
    tubeEdges(hp.map((p) => p.x), hp.map((p) => p.y), 0.28, z, ko, inBody);
    this.outline.kettle.set(ko);
    const sp = curve.getPoints(200);
    const so: Seg = [];
    tubeEdges(sp.map((p) => p.x), sp.map((p) => p.y), ro, z, so, inBody);
    const t1 = curve.getTangent(1), tip = sp[sp.length - 1];
    so.push(tip.x - t1.y * ro, tip.y + t1.x * ro, z, tip.x + t1.y * ro, tip.y - t1.x * ro, z); // the open end
    this.outline.spout.set(so);

    // cup
    const rIn = d.cupD / 2, rInB = rIn * CUP_TAPER, rOut = rIn + CUP_WALL, rOutB = rInB + CUP_WALL;
    const prof = [
      [0.001, 0], [rOutB * 0.85, 0], [rOutB, 0.25], [rOut, d.cupH - 0.05], [rOut - 0.05, d.cupH], [rIn + 0.05, d.cupH],
      [rIn, d.cupH - 0.05], [rInB, CUP_FLOOR + 0.2], [rInB * 0.85, CUP_FLOOR], [0.001, CUP_FLOOR],
    ];
    this.cupBody.geometry.dispose();
    this.cupBody.geometry = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 56);
    this.cupHandle.geometry.dispose();
    const hr = Math.max(0.6, d.cupH * 0.24);
    this.cupHandle.geometry = new THREE.TorusGeometry(hr, 0.16, 10, 28, Math.PI);
    this.cupHandle.rotation.set(0, 0, -Math.PI / 2);
    this.cupHandle.position.set(rOut - 0.1, d.cupH * 0.55, 0);
    this.cup.position.set(a.cx, 0, 0);
    this.cup.rotation.y = this.view === "side" ? 0 : 0.5;
    const co: Seg = [];
    const zc = rOut + 0.3;
    for (const sgn of [1, -1]) poly(prof.slice(1, 9).map(([x, y]) => [a.cx + sgn * x, y]), zc, co);
    co.push(a.cx - rOutB * 0.85, 0, zc, a.cx + rOutB * 0.85, 0, zc, a.cx - rInB * 0.85, CUP_FLOOR, zc, a.cx + rInB * 0.85, CUP_FLOOR, zc);
    const hx = a.cx + rOut - 0.1, hy = d.cupH * 0.55;
    for (const rr of [hr + 0.16, hr - 0.16]) {
      const pts: number[][] = [];
      for (let i = 0; i <= 20; i++) {
        const t = -Math.PI / 2 + (i / 20) * Math.PI;
        pts.push([hx + Math.cos(t) * rr, hy + Math.sin(t) * rr]);
      }
      poly(pts, zc, co);
    }
    this.outline.cup.set(co);
    this.setCupLevel(0);
    this.puddle.visible = false;
    this.lastDone = null;

    // the tip's swing, rest to tipped (the sketch's arrow)
    const ar: Seg = [];
    const base0 = Math.PI - g.phi0, th1 = d.tilt * D2R;
    const N = 48;
    for (let i = 0; i < N; i++) {
      const t0 = base0 + (th1 * i) / N, tb = base0 + (th1 * (i + 1)) / N;
      ar.push(g.L * Math.cos(t0), d.baseH + g.L * Math.sin(t0), 0, g.L * Math.cos(tb), d.baseH + g.L * Math.sin(tb), 0);
    }
    if (th1 > 0.02) {
      const te = base0 + th1, ex = g.L * Math.cos(te), ey = d.baseH + g.L * Math.sin(te);
      const tx = -Math.sin(te), ty = Math.cos(te);
      const ah = 0.5;
      ar.push(ex, ey, 0, ex - ah * (tx * 0.9 - ty * 0.45), ey - ah * (ty * 0.9 + tx * 0.45), 0);
      ar.push(ex, ey, 0, ex - ah * (tx * 0.9 + ty * 0.45), ey - ah * (ty * 0.9 - tx * 0.45), 0);
    }
    this.arc.set(ar);
  }

  /** The predicted stream: the band it lands across, and its paths. */
  private drawPrediction() {
    const { d, a } = this;
    if (!d) return;
    const ok = a.checks.stream <= TOL;
    this.band.scale.set(Math.max(a.hi - a.lo, 0.05), 1, 1);
    this.band.position.set((a.lo + a.hi) / 2, d.cupH + 0.08, 0);
    (this.band.material as THREE.MeshBasicMaterial).color.setHex(ok ? WATER : WARM);
    const tr: Seg = [];
    const path = (t: { ox: number; oy: number; ex: number; ey: number; v: number }) => {
      const L = landing(t.ox, t.oy, t.ex, t.ey, t.v, d.cupH);
      const T = Number.isFinite(L.t) ? L.t : 0;
      let px = t.ox, py = t.oy;
      for (let i = 1; i <= 40; i++) {
        const s = (T * i) / 40;
        const x = t.ox + t.v * t.ex * s, y = t.oy + t.v * t.ey * s - 0.5 * G * s * s;
        tr.push(px, py, 0, x, y, 0);
        px = x;
        py = y;
      }
    };
    if (this.preview > 0.995) {
      if (a.far) path(a.far);
      if (a.start) path(a.start);
      path(a.stopLip);
    } else {
      // part way over: the stream at this angle, if it's pouring yet
      const sample = this.previewInterval(this.preview);
      if (sample && sample.after < sample.before) path(sample.jet);
    }
    this.traj.set(tr);
    this.traj.style(ok ? WATER : WARM, 0.9);
  }

  private previewInterval(f: number) {
    const t = this.d.tilt*f/this.sc.tiltSpeed;
    return this.a.intervals.find(sample => sample.end >= t);
  }

  private setCupLevel(vol: number) {
    const { d } = this;
    const rIn = d.cupD / 2, rInB = rIn * CUP_TAPER, H = d.cupH - CUP_FLOOR;
    // Invert the frustum volume for its fill height.
    const slope = (rIn-rInB)/H;
    const lvl = Math.min(H,(Math.cbrt(rInB**3+3*slope*vol/Math.PI)-rInB)/slope);
    this.cupWater.visible = lvl > 0.01;
    const rt = rInB + (rIn - rInB) * (lvl / H);
    this.cupWater.scale.set((rt + rInB) / 2 - 0.01, Math.max(lvl, 0.001), (rt + rInB) / 2 - 0.01);
    this.cupWater.position.set(0, CUP_FLOOR + lvl / 2, 0);
    return lvl;
  }

  // ---------- per frame pose ----------

  private placeKettle(th: number, V: number) {
    const { d, g } = this;
    this.kettle.rotation.z = th;
    const sn = Math.sin(th), cs = Math.cos(th);
    const s = surfaceFor(g, sn, cs, V);
    this.clip.set(new THREE.Vector3(0, -1, 0), d.baseH + s);
    this.water.visible = V > 1e-3;
    const h = (x: number, y: number) => x * sn + y * cs - s;

    // the water line on the drawing: where the level crosses the body's outline
    const prof = [[0, 0], [g.xt, g.Hk], [g.xt + 2 * g.rt, g.Hk], [2 * g.rb, 0]];
    const lv: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const p = prof[i], q = prof[(i + 1) % 4];
      const fp = h(p[0], p[1]), fq = h(q[0], q[1]);
      if ((fp < 0) !== (fq < 0)) {
        const t = fp / (fp - fq);
        lv.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    const z = g.rb + 0.5;
    this.level.set(lv.length >= 2 ? [lv[0][0], lv[0][1], z, lv[1][0], lv[1][1], z] : []);
    if (this.view === "side") {
      this.cap.visible = false;
      return;
    }

    // 3D: the flat top of the water, where the level plane cuts a 48-sided frustum, as a fan
    const pts: number[][] = [];
    const n = 48, r0 = g.rb * 0.985, r1 = g.rt * 0.985, H = g.Hk * 0.995, y0 = (g.Hk - H) / 2;
    const P = (i: number, top: boolean) => {
      const ang = (i / n) * Math.PI * 2, r = top ? r1 : r0;
      return [g.rb + Math.cos(ang) * r, top ? y0 + H : y0, Math.sin(ang) * r];
    };
    const cross = (p: number[], q: number[]) => {
      const fp = h(p[0], p[1]), fq = h(q[0], q[1]);
      if ((fp < 0) === (fq < 0)) return;
      const t = fp / (fp - fq);
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    };
    for (let i = 0; i < n; i++) {
      const b0 = P(i, false), b1 = P(i + 1, false), t0 = P(i, true), t1 = P(i + 1, true);
      cross(b0, b1);
      cross(t0, t1);
      cross(b0, t0);
    }
    let k = 0;
    if (pts.length >= 3) {
      const c = pts.reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
      const e1 = [cs, -sn];
      const ang = (p: number[]) => Math.atan2(p[2] - c[2], (p[0] - c[0]) * e1[0] + (p[1] - c[1]) * e1[1]);
      pts.sort((p, q) => ang(p) - ang(q));
      for (let i = 0; i < pts.length && k + 9 <= this.capPos.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        this.capPos.set([c[0], c[1], c[2], p[0], p[1], p[2], q[0], q[1], q[2]], k);
        k += 9;
      }
    }
    const cg = this.cap.geometry;
    (cg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    cg.setDrawRange(0, k / 3);
    cg.computeVertexNormals();
    this.cap.visible = k > 0;
  }

  /** World xy of a kettle-frame point at tilt th. */
  private kw(x: number, y: number, th: number) {
    const sn = Math.sin(th), cs = Math.cos(th);
    return [x * cs - y * sn, this.d.baseH + x * sn + y * cs];
  }

  private drawDims(th: number) {
    const { d, g, a } = this;
    const z = Math.max(d.kettleW / 2, a.rOut) + 1.2;
    const set = (k: DimKey, segs: Seg, at: number[], rate: number[]) => {
      this.dims[k]!.set(segs);
      (this.anchors[k] ??= new THREE.Vector3()).set(at[0], at[1], z);
      (this.rates[k] ??= new THREE.Vector3()).set(rate[0], rate[1], 0);
    };
    let s: Seg = [];
    set("baseH", s, dimSegs([d.kettleW, 0], [d.kettleW, d.baseH], [1.4, 0], z, s), [0, 1]);
    s = [];
    set("kettleW", s, dimSegs([0, 0], [d.kettleW, 0], [0, -1.6], z, s), [1, 0]);
    s = [];
    set("cupDist", s, dimSegs([a.cx, 0], [0, 0], [0, -1.6], z, s), [-1, 0]);
    s = [];
    set("cupH", s, dimSegs([a.cx - a.rOut, 0], [a.cx - a.rOut, d.cupH], [-1.2, 0], z, s), [0, 1]);
    s = [];
    {
      // mouth: across the rim, lifted clear of it, read from the far side
      const m = dimSegs([a.cx - a.rIn, d.cupH], [a.cx + a.rIn, d.cupH], [0, 0.55], z, s);
      set("cupD", s, [m[0] - a.rIn - 1.4, m[1]], [-0.5, 0]);
    }
    // spout length: pivot to tip, offset outward, in the kettle's frame
    {
      const ux = -g.hz / g.L, uy = g.tipY / g.L;
      const nx = -uy, ny = ux;
      const o = 1.3;
      const p0 = this.kw(0, 0, th), p1 = this.kw(g.tipX, g.tipY, th);
      const on = this.kw(nx * o, ny * o, th);
      const off = [on[0] - p0[0], on[1] - p0[1]];
      s = [];
      const m = dimSegs(p0, p1, off, z, s);
      const dir = this.kw(ux, uy, th);
      set("spoutL", s, m, [dir[0] - p0[0], dir[1] - p0[1]]);
    }
    // reach: tip to the top front edge, above
    {
      const p0 = this.kw(g.tipX, g.tipY, th), p1 = this.kw(g.xt, g.tipY, th), up = this.kw(0, 1.4, th), o = this.kw(0, 0, th);
      s = [];
      const m = dimSegs(p0, p1, [up[0] - o[0], up[1] - o[1]], z, s);
      const left = this.kw(-1, 0, th);
      set("reach", s, m, [left[0] - o[0], left[1] - o[1]]);
    }
    // tipping angle: at the pivot, from the top of the base to the kettle's bottom when tipped
    {
      const th1 = d.tilt * D2R, R = 2 * g.rb + 1.4, py = d.baseH;
      s = [];
      s.push(2 * g.rb + 0.25, py, z, R + 0.5, py, z); // the base's top, carried on
      const bx = Math.cos(th1), by = Math.sin(th1);
      s.push(bx * (2 * g.rb + 0.25), py + by * (2 * g.rb + 0.25), z, bx * (R + 0.5), py + by * (R + 0.5), z); // the kettle's bottom, tipped
      const N = 32;
      for (let i = 0; i < N; i++) {
        const t0 = (th1 * i) / N, tb = (th1 * (i + 1)) / N;
        s.push(R * Math.cos(t0), py + R * Math.sin(t0), z, R * Math.cos(tb), py + R * Math.sin(tb), z);
      }
      if (th1 > 0.05) {
        for (const [t, dirn] of [[0, -1], [th1, 1]] as [number, number][]) {
          const ex = R * Math.cos(t), ey = py + R * Math.sin(t);
          const tx = -Math.sin(t) * dirn, ty = Math.cos(t) * dirn;
          const ah = 0.35;
          s.push(ex, ey, z, ex - ah * (tx - ty * 0.4), ey - ah * (ty + tx * 0.4), z);
          s.push(ex, ey, z, ex - ah * (tx + ty * 0.4), ey - ah * (ty - tx * 0.4), z);
        }
      }
      const tm = th1 / 2, k = (R * Math.PI) / 180;
      set("tilt", s, [(R + 1.4) * Math.cos(tm), py + (R + 1.4) * Math.sin(tm)], [-Math.sin(tm) * k, Math.cos(tm) * k]);
    }
    // tip bend: from the straight line through the tip round to the nozzle
    {
      const R = 1.8;
      const a0 = Math.PI, a1 = Math.PI - g.e;
      s = [];
      const tip = this.kw(g.tipX, g.tipY, th);
      const pt = (ang: number, r: number) => this.kw(g.tipX + Math.cos(ang) * r, g.tipY + Math.sin(ang) * r, th);
      const N = 20;
      for (let i = 0; i < N; i++) {
        const p = pt(a0 + ((a1 - a0) * i) / N, R), q = pt(a0 + ((a1 - a0) * (i + 1)) / N, R);
        s.push(p[0], p[1], z, q[0], q[1], z);
      }
      const e0 = pt(a0, R + 0.3);
      s.push(tip[0], tip[1], z, e0[0], e0[1], z);
      const am = (a0 + a1) / 2, lab = pt(am, R + 1);
      const k = (R * Math.PI) / 180;
      set("bend", s, lab, [Math.sin(am + th) * k, -Math.cos(am + th) * k]);
    }
  }

  private drawGhostAndCenters(th: number) {
    const { g, d, a } = this;
    const other = th > (d.tilt * D2R) / 2 ? 0 : d.tilt * D2R;
    const s: Seg = [];
    const body = [[0, 0], [g.xt, g.Hk], [g.xt + 2 * g.rt, g.Hk], [2 * g.rb, 0]];
    for (let i = 0; i < 4; i++) {
      const p = this.kw(body[i][0], body[i][1], other), q = this.kw(body[(i + 1) % 4][0], body[(i + 1) % 4][1], other);
      s.push(p[0], p[1], 0, q[0], q[1], 0);
    }
    for (let i = 1; i < g.sx.length; i++) {
      const p = this.kw(g.sx[i - 1], g.sy[i - 1], other), q = this.kw(g.sx[i], g.sy[i], other);
      s.push(p[0], p[1], 0, q[0], q[1], 0);
    }
    this.ghost.set(s);
    const c: Seg = [];
    const p0 = this.kw(g.rb, -0.8, th), p1 = this.kw(g.rb, g.Hk + 1.6, th);
    c.push(p0[0], p0[1], 1, p1[0], p1[1], 1);
    c.push(a.cx, -0.8, 1, a.cx, d.cupH + 1.6, 1);
    this.center.set(c);
  }

  // ---------- camera ----------

  private bounds() {
    const { d, g, a } = this;
    const pts = [[a.cx - a.rOut - 3.4, -2.8], [d.kettleW + 3.2, -2.8]];
    for (const th of [0, d.tilt * D2R]) {
      for (const [x, y] of [[g.tipX, g.tipY], [g.xt, g.Hk + 2], [2 * g.rb + 2, g.Hk + 1], [g.xt + g.rt, g.Hk + 1.5]]) {
        const p = this.kw(x, y, th);
        pts.push([p[0] - 1.8, p[1] + 1]);
      }
      const R = g.L + 1.6, t = Math.PI - g.phi0 + th;
      pts.push([R * Math.cos(t), d.baseH + R * Math.sin(t)]);
    }
    const R = 2 * g.rb + 3.2, t = d.tilt * D2R;
    pts.push([R * Math.cos(t / 2) + 1.5, d.baseH + R * Math.sin(t / 2)]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  }

  private fit(k: number) {
    if (!this.d) return;
    const b = this.bounds();
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2;
    const asp = this.w / this.h;
    const half = Math.max(hh, hw / asp) * 1.06;
    const o = this.ortho;
    const lerp = (a0: number, b0: number) => a0 + (b0 - a0) * k;
    o.top = lerp(o.top, cy + half);
    o.bottom = lerp(o.bottom, cy - half);
    o.left = lerp(o.left, cx - half * asp);
    o.right = lerp(o.right, cx + half * asp);
    o.updateProjectionMatrix();
    if (this.view === "3d" && this.autoFit) {
      const t = new THREE.Vector3(cx, cy, 0);
      const fov = (this.persp.fov * D2R) / 2;
      const dist = Math.max(hh, hw / asp) / Math.tan(fov) + Math.max(this.d.kettleW, 6) * 0.6;
      const dir = this.persp.position.clone().sub(this.controls.target).normalize();
      if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(-0.22, 0.24, 0.95).normalize();
      const pos = t.clone().addScaledVector(dir, dist * 1.04);
      this.controls.target.lerp(t, k);
      this.persp.position.lerp(pos, k);
    }
  }

  setView(v: View) {
    this.view = v;
    this.controls.enabled = v === "3d";
    if (v === "3d") {
      this.autoFit = true;
      this.persp.position.copy(this.controls.target).add(new THREE.Vector3(-0.22, 0.24, 0.95));
    }
    this.applyMode();
    this.cup.rotation.y = v === "side" ? 0 : 0.5;
    this.tagPos = {};
    this.fit(1);
  }

  refit() {
    this.autoFit = true;
    if (this.view === "3d") this.persp.position.copy(this.controls.target).add(new THREE.Vector3(-0.22, 0.24, 0.95));
    this.fit(1);
  }

  /** Show the kettle part way over: 0 is level, 1 is the tipping angle. */
  setPreview(f: number) {
    this.preview = Math.min(1, Math.max(0, f));
    this.resetWater();
    this.drawPrediction();
  }

  setSpeed(n: number) {
    this.speed = n;
  }

  setDragging(k: DimKey | null) {
    this.dragging = k;
  }

  /** Screen pixels per unit of a dimension, along the way it grows. */
  rate(k: DimKey) {
    const at = this.anchors[k], r = this.rates[k];
    if (!at || !r) return null;
    const cam = this.camera;
    const p = at.clone().project(cam), q = at.clone().add(r).project(cam);
    return { x: ((q.x - p.x) / 2) * this.w, y: (-(q.y - p.y) / 2) * this.h };
  }

  // ---------- pour ----------

  pour() {
    if (!this.d) return;
    this.clearParticles();
    this.anim = { phase: "tilt", t: 0, th: 0, V: this.a.fillVol, cup: 0, spilled: 0, wait: 0, Q: 0, interval: 0, sx: 0, sz: 0, sn: 0 };
    this.th = 0;
    this.setCupLevel(0);
    this.puddle.visible = false;
  }

  stopPour() {
    this.anim = null;
    this.clearParticles();
    this.onStats({ phase: "idle", t: 0, cup: 0, spilled: 0, Q: 0 });
  }

  get pouring() {
    return !!this.anim && this.anim.phase !== "done";
  }

  private clearParticles() {
    this.P.state.fill(0);
    this.parts.count = 0;
  }

  // gap: seconds between this particle and the next one emitted, so it can be drawn
  // stretched along its path into a continuous stream
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, vol: number, gap = 0) {
    const P = this.P;
    let i = P.next;
    for (let n = 0; n < MAXP && P.state[i]; n++) i = (i + 1) % MAXP;
    P.next = (i + 1) % MAXP;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.r0[i] = r;
    P.v0[i] = Math.max(Math.hypot(vx, vy, vz), 1);
    P.vol[i] = vol;
    P.gap[i] = gap;
    P.state[i] = 1;
  }

  private stepPour(dt: number) {
    const A = this.anim!;
    const { d, a } = this;
    const stopTime = d.tilt / this.sc.tiltSpeed;
    const omega = this.sc.tiltSpeed * D2R;
    A.t += dt;
    if (A.phase === "back") {
      A.th = Math.max(0, A.th - omega * 1.5 * dt);
      if (A.th === 0) A.phase = "done";
      return;
    }
    if (A.phase === "settle") {
      A.wait += dt;
      if (A.wait >= 1) A.phase = "back";
      return;
    }
    A.th = Math.min(d.tilt * D2R, A.t * omega);
    A.phase = A.t < stopTime ? "tilt" : "pour";
    A.Q = 0;
    while (A.interval < a.intervals.length) {
      const sample = a.intervals[A.interval];
      const end = Math.min(A.t, sample.end);
      const fraction = (end - sample.start) / (sample.end - sample.start);
      const remaining = end === sample.end ? sample.after : sample.before + (sample.after - sample.before) * fraction;
      const amount = A.V - remaining;
      if (amount > 0) {
        const j = sample.jet;
        A.Q = (sample.before - sample.after) / (sample.end - sample.start);
        const duration = end - Math.max(A.t - dt, sample.start);
        const radius = Math.min(d.bore / 2, Math.sqrt(A.Q / (Math.PI * Math.max(j.v, 1e-6))));
        this.emit(j.ox, j.oy, 0, j.ex * j.v, j.ey * j.v, 0, Math.max(radius, 0.015), amount, duration);
      }
      A.V = remaining;
      if (A.t < sample.end) break;
      A.interval++;
      if (A.t === end) break;
    }
    if (A.interval === a.intervals.length) { A.phase = "settle"; A.Q = 0; }
  }

  private stepParticles(dt: number) {
    const P = this.P, A = this.anim;
    const { d, a } = this;
    const rimY = d.cupH;
    const cupLevel = CUP_FLOOR + this.setCupLevel(A?.cup ?? 0);
    const m = new THREE.Matrix4();
    let live = 0;
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (let i = 0; i < MAXP; i++) {
      if (!P.state[i]) continue;
      const k = i * 3;
      const py = P.pos[k + 1];
      const px = P.pos[k], vy = P.vel[k + 1];
      P.pos[k] += P.vel[k] * dt;
      P.pos[k + 1] += vy * dt - 0.5 * G * dt * dt;
      P.vel[k + 1] -= G * dt;
      P.pos[k + 2] += P.vel[k + 2] * dt;
      const x = P.pos[k], y = P.pos[k + 1], z = P.pos[k + 2];
      const rho = Math.hypot(x - a.cx, z);
      if (P.state[i] === 1 && py >= rimY && y < rimY) {
        const hitTime = (vy + Math.sqrt(vy * vy + 2 * G * (py - rimY))) / G;
        const atRim = Math.hypot(px + P.vel[k] * hitTime - a.cx, z);
        if (atRim < a.rIn) P.state[i] = 2;
        else if (atRim < a.rOut + 0.02) {
          // on the rim: splashes off
          P.vel[k + 1] = Math.abs(P.vel[k + 1]) * 0.18;
          P.vel[k] = (x - a.cx) * 18 + (Math.random() - 0.5) * 20;
          P.vel[k + 2] = (Math.random() - 0.5) * 30;
          P.state[i] = 3;
        }
      }
      if (P.state[i] === 2 && y < cupLevel) {
        if (A) A.cup += P.vol[i];
        P.state[i] = 0;
        continue;
      }
      const onBase = x > 0 && x < d.kettleW && Math.abs(z) < d.kettleW / 2 && y < d.baseH;
      if (y < 0 || onBase || (P.state[i] !== 2 && rho < a.rOut && y < rimY && y > 0)) {
        if (A) {
          A.spilled += P.vol[i];
          if (!onBase) {
            A.sx += x * P.vol[i];
            A.sz += z * P.vol[i];
            A.sn += P.vol[i];
          }
        }
        P.state[i] = 0;
        continue;
      }
      const sp = Math.hypot(P.vel[k], P.vel[k + 1], P.vel[k + 2]);
      const r = P.r0[i] * Math.sqrt(Math.min(1, P.v0[i] / Math.max(sp, 1e-3))) * 1.1;
      pv.set(x, y, z);
      // stretch along the velocity to reach the next particle; a jet thins but doesn't break up this soon
      const half = P.state[i] === 3 ? r : Math.max(r, sp * P.gap[i] * 0.62);
      dir.set(P.vel[k], P.vel[k + 1], P.vel[k + 2]).divideScalar(Math.max(sp, 1e-6));
      q.setFromUnitVectors(up, dir);
      sc.set(r, half, r);
      m.compose(pv, q, sc);
      this.parts.setMatrixAt(live++, m);
    }
    this.parts.count = live;
    this.parts.instanceMatrix.needsUpdate = true;
    if (A) {
      const capacity = cupCapacity(d, 0);
      if (A.cup > capacity) {
        A.spilled += A.cup - capacity;
        A.cup = capacity;
      }
      this.setCupLevel(A.cup);
      if (A.sn > 0) {
        const rr = Math.min(8, Math.sqrt(A.spilled / (Math.PI * 0.06)));
        this.puddle.visible = rr > 0.15;
        this.puddle.scale.set(rr, rr, 1);
        this.puddle.position.set(A.sx / A.sn, 0.012, A.sz / A.sn);
      }
    }
  }

  // ---------- loop ----------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    if (!this.d) return;
    if (this.view === "3d") this.controls.update();
    if (!this.dragging) this.fit(0.12);

    let V = this.a.fillVol;
    if (this.anim) {
      const sub = Math.max(1,Math.ceil(dt*this.speed*90)), h = (dt * this.speed) / sub;
      for (let i = 0; i < sub; i++) {
        if (this.anim.phase !== "done") this.stepPour(h);
        this.stepParticles(h);
      }
      this.th = this.anim.th;
      V = this.anim.V;
      if (now - this.statT > 100) {
        this.statT = now;
        const A = this.anim;
        this.onStats({ phase: A.phase, t: A.t, cup: A.cup, spilled: A.spilled, Q: A.Q });
        this.onPreview(this.d.tilt > 0 ? A.th / (this.d.tilt * D2R) : 0);
      }
      if (this.anim.phase === "done" && this.parts.count === 0) {
        const A = this.anim;
        this.onStats({ phase: "done", t: A.t, cup: A.cup, spilled: A.spilled, Q: 0 });
        this.anim = null;
        this.th = 0;
        this.preview = 0;
        this.drawPrediction();
        this.lastDone = { cup: A.cup, spilled: A.spilled };
        this.onPreview(0);
      }
    } else {
      const target = this.d.tilt * D2R * this.preview;
      this.th += (target - this.th) * Math.min(1, dt * 10);
      if (this.lastDone) V = this.a.finalVol;
      else V = this.previewInterval(this.d.tilt ? this.th/(this.d.tilt*D2R) : 0)?.before ?? V;
    }
    this.placeKettle(this.th, V);
    this.drawDims(this.th);
    this.drawGhostAndCenters(this.th);
    this.traj.obj.visible = !this.anim;
    this.band.visible = !this.anim;

    this.renderer.render(this.scene, this.camera);
    this.placeTags();
  };

  /** Forget the last pour's water, e.g. when the design or pose changes. */
  resetWater() {
    if (!this.lastDone) return;
    this.lastDone = null;
    this.onStats({ phase: "idle", t: 0, cup: 0, spilled: 0, Q: 0 });
    if (this.d) this.setCupLevel(0);
    this.puddle.visible = false;
  }

  /**
   * Labels go at their dimension, then get pushed apart where they'd overlap (the one being
   * dragged stays put), with a leader back to the dimension when they've moved off it.
   */
  private placeTags() {
    const cam = this.camera;
    const v = new THREE.Vector3();
    type T = { k: DimKey; el: HTMLElement; ax: number; ay: number; x: number; y: number; w: number; h: number; fixed: boolean };
    const ts: T[] = [];
    for (const key in this.tags) {
      const k = key as DimKey;
      const el = this.tags[k];
      const at = this.anchors[k];
      if (!el || !at) continue;
      v.copy(at).project(cam);
      const off = v.z > 1 || v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.3;
      el.style.visibility = off ? "hidden" : "visible";
      if (off) continue;
      const ax = ((v.x + 1) / 2) * this.w, ay = ((1 - v.y) / 2) * this.h;
      ts.push({ k, el, ax, ay, x: ax, y: ay, w: el.offsetWidth + 8, h: el.offsetHeight + 6, fixed: k === this.dragging });
    }
    for (let it = 0; it < 16; it++) {
      let moved = false;
      for (let i = 0; i < ts.length; i++)
        for (let j = i + 1; j < ts.length; j++) {
          const A = ts[i], B = ts[j];
          const ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          const wa = A.fixed ? 0 : B.fixed ? 1 : 0.5, wb = 1 - wa;
          if (oy < ox) {
            const sg = A.y < B.y || (A.y === B.y && A.ay <= B.ay) ? -1 : 1;
            A.y += sg * oy * wa;
            B.y -= sg * oy * wb;
          } else {
            const sg = A.x < B.x || (A.x === B.x && A.ax <= B.ax) ? -1 : 1;
            A.x += sg * ox * wa;
            B.x -= sg * ox * wb;
          }
        }
      for (const t of ts) {
        t.x = Math.min(this.w - t.w / 2, Math.max(t.w / 2, t.x));
        t.y = Math.min(this.h - t.h / 2, Math.max(t.h / 2, t.y));
      }
      if (!moved) break;
    }
    let svg = "";
    for (const t of ts) {
      const p = this.tagPos[t.k];
      const nx = p && !t.fixed ? p.x + (t.x - p.x) * 0.3 : t.x, ny = p && !t.fixed ? p.y + (t.y - p.y) * 0.3 : t.y;
      this.tagPos[t.k] = { x: nx, y: ny };
      t.el.style.transform = `translate(${nx}px, ${ny}px) translate(-50%, -50%)`;
      const dx = t.ax - nx, dy = t.ay - ny;
      if (Math.abs(dx) > (t.w - 8) / 2 || Math.abs(dy) > (t.h - 6) / 2) {
        const sx = (t.w - 8) / 2 / Math.max(Math.abs(dx), 1e-3), sy = (t.h - 6) / 2 / Math.max(Math.abs(dy), 1e-3);
        const s = Math.min(sx, sy);
        const cls = this.focus === t.k ? "kt-leader kt-leader-focus" : this.dimState[t.k] === "bad" ? "kt-leader kt-leader-bad" : "kt-leader";
        svg += `<line class="${cls}" x1="${nx + dx * s}" y1="${ny + dy * s}" x2="${t.ax}" y2="${t.ay}"/><circle class="${cls}" cx="${t.ax}" cy="${t.ay}" r="2"/>`;
      }
    }
    this.svg.innerHTML = svg;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    this.controls.dispose();
    this.svg.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const k in this.mats) {
      this.mats[k].shaded.dispose();
      this.mats[k].flat.dispose();
    }
    this.renderer.dispose();
  }
}
