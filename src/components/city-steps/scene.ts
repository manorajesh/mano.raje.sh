import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Point clouds from a SICK LMS200 laser scanner carried on walks with an
// Insta360 X3 on top. The camera's video gave the path and the colour; its gyro
// gave the orientation between frames. Data lives in public/walks.
//
// One WebGL canvas covers the page. In the viewer it draws the selected walk;
// on the stairs plate it draws every flight into the on-screen box of its cell
// (scissored viewports), so the DOM owns layout and the 3D follows it.

export const BASE = "/walks/";
const BYTES = 14; // int16 xyz (cm), uint16 time (cs), uint16 range (cm), uint8 rgb, uint8 staircase
const LIVE_WINDOW = 3;
const SCAN_HEIGHT = -0.19; // scan plane below the camera lens, m
const SCANS_PER_S = 9.37;
const BG = new THREE.Color(0x0b0b0b);
const INK = 0xececec;

export type PathRow = number[]; // t, x, y, z, forward xyz, three_from_cam quaternion xyzw
export type Stair = {
  id: string; name: string; passes: number[][]; rise_m: number; run_m: number;
  steps_est: number; slope_deg: number; center: number[];
};
export type Entry = {
  id: string; name: string; kind: "walk" | "stairs"; file: string; count: number;
  duration: number; distance_m: number; climb_m: number;
  dense: { files: { file: string; count: number }[]; count: number } | null;
  video: { segments: { file: string; start: number; end: number }[]; offset: number };
  path: PathRow[];
  orient?: { t0: number; rate: number; q: number[] };
  stairs?: Stair[];
  parent?: string; passes?: number[][]; rise_m?: number; run_m?: number;
  steps_est?: number; slope_deg?: number; center?: number[];
};
export type View = "orbit" | "chase" | "eye" | "map" | "video";
export const COLOURS = ["Photo", "Time", "Elevation", "Range", "Sweeps", "Stairs"] as const;
export const STAIR_HUES = ["#ffb359", "#73d9bf", "#9ea8ff", "#ff8fa3"];

export type Readouts = {
  time: HTMLElement | null;
  elevation: HTMLElement | null;
  scans: HTMLElement | null;
  scrub: HTMLInputElement | null;
  profile: HTMLCanvasElement | null;
};
export type SceneEvents = {
  loading: (text: string | null, fraction: number) => void;
  playing: (playing: boolean) => void;
  colour: (mode: number) => void;
  turned: (turned: boolean) => void;
  note: (text: string) => void;
};

const VERT = `
  attribute float aT; attribute float aR; attribute float aS; attribute vec3 color;
  uniform float uTime, uSize, uScale, uMode, uLive, uWin, uDur, uYMin, uYMax, uFog, uStair, uFresh;
  uniform vec3 uBg;
  varying vec3 vCol;
  vec3 turbo(float x) {
    x = clamp(x, 0.0, 1.0);
    vec4 v4 = vec4(1.0, x, x * x, x * x * x); vec2 v2 = v4.zw * v4.z;
    return vec3(
      dot(v4, vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234)) + dot(v2, vec2(-152.94239396, 59.28637943)),
      dot(v4, vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333)) + dot(v2, vec2(4.27729857, 2.82956604)),
      dot(v4, vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771)) + dot(v2, vec2(-89.90310912, 27.34824973)));
  }
  vec3 inferno(float t) {
    t = clamp(t, 0.0, 1.0);
    const vec3 c0 = vec3(0.000219, 0.001651, -0.019481), c1 = vec3(0.106513, 0.563956, 3.932712);
    const vec3 c2 = vec3(11.602493, -3.972854, -15.942394), c3 = vec3(-41.703996, 17.436399, 44.354145);
    const vec3 c4 = vec3(77.162936, -33.402359, -81.807309), c5 = vec3(-71.319428, 32.626064, 73.209520);
    const vec3 c6 = vec3(25.131126, -12.242669, -23.070325);
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
  }
  vec3 terrain(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.06, 0.20, 0.36), b = vec3(0.24, 0.62, 0.62), c = vec3(0.86, 0.80, 0.52), d = vec3(1.0, 0.97, 0.92);
    return t < 0.4 ? mix(a, b, t / 0.4) : t < 0.8 ? mix(b, c, (t - 0.4) / 0.4) : mix(c, d, (t - 0.8) / 0.2);
  }
  void main() {
    float t = aT * 0.01;
    float age = uTime - t;
    if (age < 0.0 || (uLive > 0.5 && age > uWin)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec3 p = position * 0.01;
    vec3 c;
    if (uMode < 0.5) c = color;
    else if (uMode < 1.5) c = turbo(0.05 + 0.9 * t / uDur);
    else if (uMode < 2.5) c = terrain((p.y - uYMin) / max(uYMax - uYMin, 0.1));
    else if (uMode < 3.5) c = inferno(1.0 - clamp(aR * 0.01 / 25.0, 0.0, 1.0) * 0.92);
    else if (uMode < 4.5) { float h = fract(aT * (0.618034 / 10.67)); c = 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
    else c = aS < 0.5 ? vec3(0.20, 0.21, 0.23) : aS < 1.5 ? vec3(1.0, 0.70, 0.35) : aS < 2.5 ? vec3(0.45, 0.85, 0.75)
      : aS < 3.5 ? vec3(0.62, 0.66, 1.0) : vec3(1.0, 0.56, 0.64);
    float fresh = uFresh * exp(-age * 3.5);
    c = mix(c, vec3(1.0, 0.96, 0.9), fresh * 0.8);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = max(-mv.z, 0.05);
    float fade = exp(-d * uFog);
    if (uLive > 0.5) fade *= 1.0 - smoothstep(uWin * 0.4, uWin, age);
    if (uStair > 0.5 && abs(aS - uStair) > 0.5) { c = mix(c, vec3(0.5), 0.7); fade *= 0.16; }
    vCol = mix(uBg, c, fade);
    gl_PointSize = clamp(uSize * uScale / d * (1.0 + fresh * 1.5), 1.0, 28.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying vec3 vCol;
  void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vCol, 1.0); }`;

function makePointMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: 0.045 }, uScale: { value: 500 }, uMode: { value: 0 },
      uLive: { value: 0 }, uWin: { value: LIVE_WINDOW }, uDur: { value: 1 }, uYMin: { value: 0 }, uYMax: { value: 1 },
      uBg: { value: new THREE.Vector3(BG.r, BG.g, BG.b) }, uFog: { value: 0.01 }, uStair: { value: 0 }, uFresh: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

function makePoints(buffer: ArrayBuffer, n: number, material: THREE.ShaderMaterial) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Int16Array(buffer, 0, n * 3), 3));
  const times = new Uint16Array(buffer, n * 6, n);
  geo.setAttribute("aT", new THREE.BufferAttribute(times, 1));
  geo.setAttribute("aR", new THREE.BufferAttribute(new Uint16Array(buffer, n * 8, n), 1));
  geo.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(buffer, n * 10, n * 3), 3, true));
  geo.setAttribute("aS", new THREE.BufferAttribute(new Uint8Array(buffer, n * 13, n), 1));
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.userData.times = times;
  return points;
}

function elevationRange(points: THREE.Points): [number, number] {
  const pos = points.geometry.attributes.position.array as Int16Array;
  const ys: number[] = [];
  for (let i = 1; i < pos.length; i += 3 * 37) ys.push(pos[i] * 0.01);
  ys.sort((a, b) => a - b);
  return [ys[Math.floor(ys.length * 0.02)] ?? 0, ys[Math.floor(ys.length * 0.98)] ?? 1];
}

function countUpTo(times: Uint16Array, cs: number) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (times[m] <= cs) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function radialTexture(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export const fmt = (s: number, tenths = true) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${(tenths ? r.toFixed(1) : Math.floor(r).toString()).padStart(tenths ? 4 : 2, "0")}`;
};

/** Where to stand to see a flight side-on. */
function stairView(center: number[], path: PathRow[], run: number) {
  const c = new THREE.Vector3(center[0], center[1], center[2]);
  const a = path[0];
  const b = path[Math.min(path.length - 1, Math.floor(path.length / 2))];
  const dir = new THREE.Vector3(b[1] - a[1], 0, b[3] - a[3]).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const reach = run * 1.25 + 4;
  const pos = c.clone().addScaledVector(side, reach).add(new THREE.Vector3(0, reach * 0.35, 0)).addScaledVector(dir, -reach * 0.15);
  return { pos, target: c };
}

type Cell = { entry: Entry; el: HTMLElement; cam: THREE.PerspectiveCamera; ctl: OrbitControls; scene: THREE.Scene; mat: THREE.ShaderMaterial; home: { pos: THREE.Vector3; target: THREE.Vector3 } };

export class CityScene {
  entries: Entry[] = [];
  byId = new Map<string, Entry>();
  cur: Entry | null = null;
  t = 0;
  playing = false;
  speed = 1;
  view: View = "orbit";
  colour = 0;
  live = false;
  dense = false;
  screen: "viewer" | "stairs" = "viewer";
  readouts: Readouts = { time: null, elevation: null, scans: null, scrub: null, profile: null };

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.05, 2000);
  private controls: OrbitControls;
  private mat = makePointMaterial();
  private points: THREE.Points | null = null;
  private densePts: THREE.Points[] = [];
  private denseFor = "";
  private pathAll: THREE.Line | null = null;
  private pathDone: THREE.Line | null = null;
  private rig = new THREE.Group();
  private dot: THREE.Mesh;
  private halo: THREE.Sprite;
  private fan: THREE.Mesh;
  private sphere: THREE.Mesh;
  private sphereMat: THREE.ShaderMaterial;
  private video: HTMLVideoElement;
  private segIndex = -1;
  private lastSeek = 0;
  private frameMediaTime: number | null = null;
  private cache = new Map<string, ArrayBuffer>();
  private tween: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number } | null = null;
  private look = { yaw: 0, pitch: 0 };
  private dragging: { x: number; y: number } | null = null;
  private cells: Cell[] = [];
  private frame = 0;
  private last = performance.now();
  private tick = 0;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private disposers: (() => void)[] = [];
  // scratch
  private rigPos = new THREE.Vector3();
  private rigFwd = new THREE.Vector3();
  private rigQuat = new THREE.Quaternion();
  private frameQuat = new THREE.Quaternion();
  private flat = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();
  private q0 = new THREE.Quaternion();
  private q1 = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();

  constructor(private canvas: HTMLCanvasElement, private events: SceneEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    // The 360 video, as a panorama in the camera frame (centre = forward, top = up)
    // drawn on a sphere around the camera and turned by the camera's orientation.
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
    const videoTex = new THREE.VideoTexture(this.video);
    this.sphereMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: videoTex }, uCamFromWorld: { value: new THREE.Matrix3() }, uMix: { value: 0.85 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D map; uniform mat3 uCamFromWorld; uniform float uMix; varying vec3 vDir;
        void main() {
          vec3 d = normalize(uCamFromWorld * normalize(vDir)); // camera frame: x right, y down, z forward
          float lon = atan(d.x, d.z), lat = asin(clamp(-d.y, -1.0, 1.0));
          gl_FragColor = vec4(texture2D(map, vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5)).rgb * uMix, 1.0);
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(400, 96, 48), this.sphereMat);
    this.sphere.renderOrder = -1;
    this.sphere.visible = false;
    this.sphere.frustumCulled = false;
    this.scene.add(this.sphere);
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      // Each frame is turned by the orientation at its own capture time, so the
      // panorama holds still in the world while the clock runs smoothly.
      const v = this.video as HTMLVideoElement & { requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => number };
      const onFrame = (_: number, meta: { mediaTime: number }) => {
        this.frameMediaTime = meta.mediaTime;
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    }

    // The rig: a dot, a soft halo and the 180° scan fan, pointing forward (-z).
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.halo.scale.set(1.2, 1.2, 1.2);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const fanGeo = new THREE.CircleGeometry(2.2, 48, 0, Math.PI);
    fanGeo.rotateX(-Math.PI / 2);
    this.fan = new THREE.Mesh(fanGeo, new THREE.MeshBasicMaterial({
      map: radialTexture([[0, "rgba(255,255,255,0.22)"], [1, "rgba(255,255,255,0)"]]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.fan.position.y = SCAN_HEIGHT;
    this.rig.add(this.halo, this.dot, this.fan);
    this.scene.add(this.rig);

    // Look around in first person and in the video, by dragging the world.
    const down = (e: PointerEvent) => {
      if (this.screen === "viewer" && (this.view === "eye" || this.view === "video")) {
        this.dragging = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const k = (this.camera.fov / 78) * 0.004;
      this.look.yaw += (e.clientX - this.dragging.x) * k;
      this.look.pitch = Math.max(-1.3, Math.min(1.3, this.look.pitch + (e.clientY - this.dragging.y) * k));
      this.dragging = { x: e.clientX, y: e.clientY };
    };
    const up = () => (this.dragging = null);
    const dbl = () => (this.look = { yaw: 0, pitch: 0 });
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("dblclick", dbl);
    const resize = () => this.resize();
    window.addEventListener("resize", resize);
    this.disposers.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("dblclick", dbl);
      window.removeEventListener("resize", resize);
    });
    this.resize();
    this.frame = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.disposers.forEach((d) => d());
    this.cells.forEach((c) => c.ctl.dispose());
    this.controls.dispose();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.renderer.dispose();
  }

  // ---------- data ----------

  async loadIndex() {
    const res = await fetch(`${BASE}walks.json`);
    if (!res.ok) throw new Error(`Couldn't load the walks (${res.status})`);
    this.entries = (await res.json()).walks as Entry[];
    this.entries.forEach((e) => this.byId.set(e.id, e));
    return this.entries;
  }

  private async fetchCloud(file: string, count: number, label: string) {
    const hit = this.cache.get(file);
    if (hit) return hit;
    const total = count * BYTES;
    this.events.loading(`${label} · ${(total / 1e6).toFixed(1)} MB`, 0);
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status})`);
    const buf = new Uint8Array(total);
    let got = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        buf.set(value.subarray(0, Math.max(0, Math.min(value.length, total - got))), got);
        got += value.length;
        this.events.loading(null, Math.min(1, got / total));
      }
    } else {
      buf.set(new Uint8Array(await res.arrayBuffer()).subarray(0, total));
    }
    this.cache.set(file, buf.buffer);
    return buf.buffer;
  }

  async select(entry: Entry) {
    this.setPlaying(false);
    const buffer = await this.fetchCloud(entry.file, entry.count, `Loading ${entry.name}`);
    this.cur = entry;
    this.segIndex = -1;
    this.build(entry, buffer);
    this.setTime(entry.duration);
    const keep: View = this.view === "map" || this.view === "video" ? this.view : "orbit";
    this.setView(keep, false, true);
    if (keep !== "orbit") this.frameAll(false);
    this.events.loading(null, 1);
    if (this.dense) await this.setDense(true);
  }

  private build(entry: Entry, buffer: ArrayBuffer) {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
    }
    this.clearDense();
    this.points = makePoints(buffer, entry.count, this.mat);
    this.scene.add(this.points);
    const [lo, hi] = elevationRange(this.points);
    this.mat.uniforms.uYMin.value = lo;
    this.mat.uniforms.uYMax.value = hi;
    this.mat.uniforms.uDur.value = entry.duration;
    this.mat.uniforms.uStair.value = 0;

    const P = entry.path;
    const arr = new Float32Array(P.length * 3);
    P.forEach((r, i) => arr.set([r[1], r[2], r[3]], i * 3));
    for (const l of [this.pathAll, this.pathDone]) if (l) { this.scene.remove(l); l.geometry.dispose(); }
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.pathAll = new THREE.Line(g1, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.14 }));
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.pathDone = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.8 }));
    this.scene.add(this.pathAll, this.pathDone);
    if (entry.kind !== "walk" && this.colour === 5) this.setColour(0);
    if (this.readouts.scrub) this.readouts.scrub.max = String(entry.duration);
    this.drawProfile();
  }

  elevationLegend(): [number, number] {
    return [this.mat.uniforms.uYMin.value, this.mat.uniforms.uYMax.value];
  }

  // ---------- interpolated points (separate files; the measured points never change) ----------

  private clearDense() {
    this.densePts.forEach((p) => { this.scene.remove(p); p.geometry.dispose(); });
    this.densePts = [];
    this.denseFor = "";
  }

  async setDense(on: boolean) {
    this.dense = on;
    const e = this.cur;
    if (!on || !e || !e.dense) {
      this.densePts.forEach((p) => (p.visible = false));
      return;
    }
    if (this.denseFor !== e.id) {
      this.clearDense();
      const files = e.dense.files;
      for (let k = 0; k < files.length; k++) {
        const buf = await this.fetchCloud(files[k].file, files[k].count, `Interpolated points ${k + 1}/${files.length}`);
        if (this.cur !== e) return;
        const p = makePoints(buf, files[k].count, this.mat);
        this.scene.add(p);
        this.densePts.push(p);
      }
      this.denseFor = e.id;
      this.events.loading(null, 1);
    }
    this.densePts.forEach((p) => (p.visible = this.dense));
  }

  // ---------- settings ----------

  setColour(mode: number) {
    this.colour = mode;
    this.mat.uniforms.uMode.value = mode;
    this.events.colour(mode);
  }
  setLive(on: boolean) {
    this.live = on;
    this.mat.uniforms.uLive.value = on ? 1 : 0;
  }
  setSize(size: number) {
    this.mat.uniforms.uSize.value = size;
  }
  setSpeed(speed: number) {
    this.speed = speed;
    if (this.view === "video") this.video.playbackRate = speed;
  }
  setVideoMix(mix: number) {
    this.sphereMat.uniforms.uMix.value = mix;
  }

  // ---------- path sampling ----------

  private pathIndex(t: number) {
    const P = this.cur!.path;
    let lo = 0;
    let hi = P.length - 1;
    if (t <= P[0][0]) return 0;
    if (t >= P[hi][0]) return hi;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P[m][0] <= t) lo = m;
      else hi = m;
    }
    return lo;
  }

  private poseAt(t: number) {
    const P = this.cur!.path;
    const i = this.pathIndex(t);
    const j = Math.min(i + 1, P.length - 1);
    const u = j === i ? 0 : Math.min(1, Math.max(0, (t - P[i][0]) / (P[j][0] - P[i][0])));
    this.rigPos.set(P[i][1], P[i][2], P[i][3]).lerp(this.va.set(P[j][1], P[j][2], P[j][3]), u);
    this.rigFwd.set(P[i][4], P[i][5], P[i][6]).lerp(this.vb.set(P[j][4], P[j][5], P[j][6]), u).normalize();
    this.q0.set(P[i][7], P[i][8], P[i][9], P[i][10]);
    this.q1.set(P[j][7], P[j][8], P[j][9], P[j][10]);
    this.rigQuat.slerpQuaternions(this.q0, this.q1, u);
    return i;
  }

  // 30 Hz gyro-aided orientation of the parent walk, for the video.
  private orientAt(walk: Entry, tw: number, out: THREE.Quaternion) {
    const o = walk.orient!;
    const n = o.q.length / 4;
    const x = Math.max(0, Math.min(n - 1.001, (tw - o.t0) * o.rate));
    const i = Math.floor(x);
    const q = o.q;
    this.q0.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
    this.q1.set(q[i * 4 + 4], q[i * 4 + 5], q[i * 4 + 6], q[i * 4 + 7]);
    return out.slerpQuaternions(this.q0, this.q1, x - i);
  }

  // ---------- views ----------

  private pathBox() {
    const box = new THREE.Box3();
    this.cur!.path.forEach((r) => box.expandByPoint(this.tmp.set(r[1], r[2], r[3])));
    return box;
  }

  private frameAll(animate: boolean) {
    const e = this.cur!;
    if (e.kind === "stairs") {
      const v = stairView(e.center!, e.path, Math.max(e.run_m ?? 6, 6));
      this.moveTo(v.pos, v.target, animate);
      return;
    }
    const box = this.pathBox();
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const d = Math.max(s.x, s.z, 8) * 1.1 + 22;
    this.moveTo(c.clone().add(new THREE.Vector3(d * 0.55, d * 0.62, d * 0.75)), c, animate);
  }

  private frameMap(animate: boolean) {
    const box = this.pathBox();
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const h = Math.max(s.x, s.z, 10) * 1.3 + 30;
    this.moveTo(c.clone().add(new THREE.Vector3(0, h, 0.01)), c, animate);
  }

  private moveTo(pos: THREE.Vector3, target: THREE.Vector3, animate: boolean) {
    if (!animate || this.reduceMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target, k: 0 };
  }

  setView(v: View, animate = true, force = false) {
    const was = this.view;
    this.view = v;
    this.controls.enabled = v === "orbit" || v === "map";
    this.controls.enableRotate = v === "orbit";
    this.camera.fov = v === "eye" ? 78 : v === "video" ? 90 : 55;
    this.camera.updateProjectionMatrix();
    this.look = { yaw: 0, pitch: 0 };
    if (v === "orbit" && (was !== "orbit" || force)) this.frameAll(animate);
    if (v === "map") this.frameMap(animate);
    this.sphere.visible = v === "video";
    this.mat.uniforms.uFog.value = v === "video" ? 0.004 : 0.01;
    if (v === "video") {
      if (this.colour === 0) this.setColour(3); // photo colours vanish against the photo
      this.syncVideo(true);
    } else {
      this.video.pause();
      this.events.note("");
    }
  }

  /** Isolate one flight of the current walk (0 = whole walk) and frame it side-on. */
  selectStair(k: number, frame = true) {
    this.mat.uniforms.uStair.value = k;
    const st = k && this.cur?.stairs ? this.cur.stairs[k - 1] : null;
    if (!st || !frame) return;
    const end = Math.max(...st.passes.map((p) => p[1])) + 1.5;
    if (this.t < end) this.setTime(Math.min(this.cur!.duration, end));
    this.setPlaying(false);
    if (this.view !== "orbit") this.setView("orbit", false);
    const P = this.cur!.path;
    const v = stairView(st.center, P.slice(this.pathIndex(st.passes[0][0]), this.pathIndex(st.passes[0][1]) + 1), Math.max(st.run_m, 6));
    this.moveTo(v.pos, v.target, true);
  }

  // ---------- 360 video ----------

  private segmentFor(walkT: number) {
    const segs = this.cur!.video.segments;
    for (let i = 0; i < segs.length; i++) if (walkT < segs[i].end || i === segs.length - 1) return i;
    return segs.length - 1;
  }

  private syncVideo(force: boolean) {
    if (this.view !== "video" || !this.cur) return;
    const walkT = this.t + this.cur.video.offset;
    const i = this.segmentFor(walkT);
    const seg = this.cur.video.segments[i];
    if (i !== this.segIndex || !this.video.src.endsWith(seg.file)) {
      this.segIndex = i;
      this.frameMediaTime = null;
      this.video.src = BASE + seg.file;
      this.events.note("Loading video");
      this.video.addEventListener("loadeddata", () => { this.events.note(""); this.syncVideo(true); }, { once: true });
      this.video.addEventListener("error", () => this.events.note("The video couldn't load"), { once: true });
      return;
    }
    const want = walkT - seg.start;
    if (force || Math.abs(this.video.currentTime - want) > 0.25) {
      const now = performance.now();
      if (force || now - this.lastSeek > 120) {
        this.video.currentTime = Math.max(0, want);
        this.lastSeek = now;
      }
    }
    this.video.playbackRate = this.speed;
    if (this.playing && this.video.paused) this.video.play().catch(() => undefined);
    if (!this.playing && !this.video.paused) this.video.pause();
  }

  // ---------- timeline ----------

  setTime(t: number, fromClock = false) {
    if (!this.cur) return;
    this.t = Math.max(0, Math.min(this.cur.duration, t));
    if (this.readouts.scrub) this.readouts.scrub.value = String(this.t);
    if (!fromClock && this.view === "video" && !this.playing) this.syncVideo(false);
  }

  setPlaying(p: boolean) {
    if (!this.cur) return;
    if (p && this.t >= this.cur.duration - 0.05) this.setTime(0);
    this.playing = p;
    this.events.playing(p);
    if (this.view === "video") this.syncVideo(true);
  }

  drawProfile() {
    const cv = this.readouts.profile;
    const e = this.cur;
    if (!cv || !e) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext("2d")!;
    const P = e.path;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of P) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); }
    const span = Math.max(hi - lo, 1);
    const X = (t: number) => (t / e.duration) * w;
    const Y = (y: number) => h - 5 * dpr - ((y - lo) / span) * (h - 12 * dpr);
    const trace = () => {
      g.beginPath();
      g.moveTo(0, h);
      P.forEach((p) => g.lineTo(X(p[0]), Y(p[2])));
      g.lineTo(w, h);
      g.closePath();
    };
    const prog = (this.t / e.duration) * w;
    g.clearRect(0, 0, w, h);
    const bands: [number[][], number][] = e.kind === "walk" ? (e.stairs ?? []).map((s, i) => [s.passes, i]) : [[e.passes ?? [], 0]];
    bands.forEach(([passes, i]) => passes.forEach(([a, b]) => {
      g.fillStyle = STAIR_HUES[i % STAIR_HUES.length] + "22";
      g.fillRect(X(a), 0, Math.max(1, X(b) - X(a)), h);
    }));
    g.save(); trace(); g.fillStyle = "rgba(236,236,236,0.05)"; g.fill(); g.restore();
    g.save(); g.beginPath(); g.rect(0, 0, prog, h); g.clip(); trace(); g.fillStyle = "rgba(236,236,236,0.16)"; g.fill(); g.restore();
    g.beginPath();
    P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[2])) : g.moveTo(X(p[0]), Y(p[2]))));
    g.strokeStyle = "rgba(236,236,236,0.4)";
    g.lineWidth = dpr;
    g.stroke();
    g.fillStyle = "#ececec";
    g.fillRect(prog - dpr / 2, 0, dpr, h);
  }

  // ---------- stairs plate ----------

  async showStairs(cells: { entry: Entry; el: HTMLElement }[]) {
    this.screen = "stairs";
    this.setPlaying(false);
    this.video.pause();
    this.canvas.style.pointerEvents = "none";
    if (this.cells.length) {
      // The page rebuilds its cells each time the plate comes back: follow the new
      // boxes, keeping each flight turned the way it was.
      cells.forEach(({ el }, i) => {
        const c = this.cells[i];
        if (!c || c.el === el) return;
        const target = c.ctl.target.clone();
        const autoRotate = c.ctl.autoRotate;
        c.ctl.dispose();
        c.el = el;
        c.ctl = this.cellControls(c.cam, el);
        c.ctl.target.copy(target);
        c.ctl.autoRotate = autoRotate;
        c.ctl.update();
      });
    } else {
      for (const { entry, el } of cells) {
        const cam = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
        const ctl = this.cellControls(cam, el);
        const mat = makePointMaterial();
        mat.uniforms.uTime.value = 1e4;
        mat.uniforms.uFresh.value = 0;
        mat.uniforms.uSize.value = 0.035;
        mat.uniforms.uDur.value = entry.duration;
        const home = stairView(entry.center!, entry.path, Math.max(entry.run_m ?? 6, 6));
        cam.position.copy(home.pos);
        ctl.target.copy(home.target);
        ctl.update();
        this.cells.push({ entry, el, cam, ctl, scene: new THREE.Scene(), mat, home });
      }
      for (const c of this.cells) {
        const buf = await this.fetchCloud(c.entry.file, c.entry.count, `Loading ${c.entry.name}`);
        const p = makePoints(buf, c.entry.count, c.mat);
        const [lo, hi] = elevationRange(p);
        c.mat.uniforms.uYMin.value = lo;
        c.mat.uniforms.uYMax.value = hi;
        c.scene.add(p);
      }
    }
    this.events.loading(null, 1);
  }

  private cellControls(cam: THREE.PerspectiveCamera, el: HTMLElement) {
    const ctl = new OrbitControls(cam, el);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.autoRotate = !this.reduceMotion;
    ctl.autoRotateSpeed = 0.6;
    ctl.addEventListener("start", () => {
      ctl.autoRotate = false;
      this.events.turned(true);
    });
    return ctl;
  }

  resetStairs() {
    for (const c of this.cells) {
      c.cam.position.copy(c.home.pos);
      c.ctl.target.copy(c.home.target);
      c.ctl.autoRotate = !this.reduceMotion;
      c.ctl.update();
    }
    this.events.turned(false);
  }

  showViewer() {
    this.screen = "viewer";
    this.canvas.style.pointerEvents = "";
    this.resize();
  }

  // ---------- frame loop ----------

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.screen === "viewer") this.drawProfile();
  }

  private loop = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.screen === "stairs") this.renderStairs();
    else if (this.cur && this.points) this.renderViewer(dt);
    this.frame = requestAnimationFrame(this.loop);
  };

  private renderViewer(dt: number) {
    const e = this.cur!;
    const u = this.mat.uniforms;
    if (this.playing) {
      let t = this.t + dt * this.speed;
      if (this.view === "video" && !this.video.paused && this.video.readyState >= 2 && this.segIndex >= 0) {
        const seg = e.video.segments[this.segIndex];
        if (this.video.ended || this.video.currentTime >= seg.end - seg.start - 0.05) this.syncVideo(true);
        else {
          // run smoothly, easing toward the video rather than stepping with its frames
          const drift = seg.start + this.video.currentTime - e.video.offset - t;
          t = Math.abs(drift) > 0.4 ? t + drift : t + drift * Math.min(1, dt * 2);
        }
      }
      this.setTime(t, true);
      if (this.view === "video") this.syncVideo(false);
      if (this.t >= e.duration) this.setPlaying(false);
    }
    const cs = this.t * 100;
    const draw = (p: THREE.Points) => {
      const times = p.userData.times as Uint16Array;
      const end = countUpTo(times, cs);
      const start = this.live ? countUpTo(times, cs - LIVE_WINDOW * 100) : 0;
      p.geometry.setDrawRange(start, end - start);
    };
    draw(this.points!);
    this.densePts.forEach(draw);
    u.uTime.value = this.t;
    u.uScale.value = (window.innerHeight * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));

    const pi = this.poseAt(this.t);
    this.pathDone!.geometry.setDrawRange(0, pi + 1);
    this.rig.position.copy(this.rigPos);
    this.flat.set(this.rigFwd.x, 0, this.rigFwd.z).normalize();
    this.rig.rotation.set(0, Math.atan2(-this.flat.x, -this.flat.z), 0);
    const inside = this.view === "eye" || this.view === "video";
    this.dot.visible = this.halo.visible = !inside;
    this.fan.visible = this.view !== "video";

    const cam = this.camera;
    if (this.view === "chase") {
      const want = this.tmp.copy(this.rigPos).addScaledVector(this.flat, -7.5).add(this.va.set(0, 3.4, 0));
      cam.position.lerp(want, 1 - Math.pow(0.02, dt));
      this.lookAt.lerp(this.vb.copy(this.rigPos).addScaledVector(this.flat, 4), 1 - Math.pow(0.01, dt));
      cam.lookAt(this.lookAt);
    } else if (inside) {
      cam.position.copy(this.rigPos);
      const yaw = Math.atan2(this.rigFwd.x, this.rigFwd.z) + this.look.yaw;
      const pitch = Math.asin(Math.max(-0.95, Math.min(0.95, this.rigFwd.y))) + this.look.pitch;
      this.lookAt.set(this.rigPos.x + Math.sin(yaw) * Math.cos(pitch), this.rigPos.y + Math.sin(pitch), this.rigPos.z + Math.cos(yaw) * Math.cos(pitch));
      cam.lookAt(this.lookAt);
    }
    if (this.tween) {
      const tw = this.tween;
      tw.k = Math.min(1, tw.k + dt / 0.9);
      const k = 1 - Math.pow(1 - tw.k, 3);
      cam.position.lerpVectors(tw.p0, tw.p1, k);
      this.controls.target.lerpVectors(tw.t0, tw.t1, k);
      if (tw.k >= 1) this.tween = null;
    }
    if (this.controls.enabled) this.controls.update();
    if (this.sphere.visible) {
      this.sphere.position.copy(cam.position);
      const walk = e.kind === "walk" ? e : this.byId.get(e.parent!)!;
      let q = this.rigQuat;
      if (this.segIndex >= 0 && walk.orient) {
        const seg = e.video.segments[this.segIndex];
        const media = this.frameMediaTime ?? Math.round(this.video.currentTime * 15) / 15;
        q = this.orientAt(walk, seg.start + media, this.frameQuat);
      }
      (this.sphereMat.uniforms.uCamFromWorld.value as THREE.Matrix3).setFromMatrix4(this.m4.makeRotationFromQuaternion(q)).transpose();
    }

    const r = this.readouts;
    if (r.time) r.time.textContent = fmt(this.t);
    if (r.elevation) r.elevation.textContent = `${this.rigPos.y >= 0 ? "+" : "−"}${Math.abs(this.rigPos.y).toFixed(1)} m`;
    if (r.scans) r.scans.textContent = Math.round(this.t * SCANS_PER_S).toLocaleString();
    if ((this.tick = (this.tick + 1) % 3) === 0) this.drawProfile();

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
  }

  private renderStairs() {
    const R = this.renderer;
    R.setScissorTest(false);
    R.setViewport(0, 0, window.innerWidth, window.innerHeight);
    R.clear();
    R.setScissorTest(true);
    const H = window.innerHeight;
    const pr = R.getPixelRatio();
    for (const c of this.cells) {
      const r = c.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width < 2) continue;
      c.cam.aspect = r.width / r.height;
      c.cam.updateProjectionMatrix();
      c.mat.uniforms.uScale.value = (r.height * pr) / (2 * Math.tan((c.cam.fov * Math.PI) / 360));
      c.ctl.update();
      const y = H - r.bottom;
      R.setViewport(r.left, y, r.width, r.height);
      R.setScissor(r.left, y, r.width, r.height);
      R.render(c.scene, c.cam);
    }
    R.setScissorTest(false);
  }
}
