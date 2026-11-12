import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildRig, getBytes, getJSON, gunzip, Rig } from "./common";
import { makeStage } from "./Rig3D";

// The fitted 4D field: a stack of 3D density frames, ray-marched in the browser.
// Frames arrive as separate gzipped volumes (field/NNN.gz) and are decoded as they play.
// "Density" is the field itself. "Structure" shows where density changes fastest, which is
// where the wisps are. "Shadowgram" renders what a phone at the current view would film: the
// projected density (sum along each line of sight) into an offscreen target, then its Laplacian,
// which is what a shadowgraph shows to first order.

type FieldMeta = {
  nx: number; ny: number; nz: number; frames: number; fps: number; min: number[]; max: number[];
  gamma?: number; vox_mm?: number | null; bytes?: number[];
};
type Mode = "density" | "structure" | "shadowgram";
const MODES: Mode[] = ["density", "structure", "shadowgram"];

const VERT = `
  out vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAG = `
  precision highp float;
  precision highp sampler3D;
  in vec3 vWorld;
  layout(location = 0) out vec4 outColor;
  uniform sampler3D uVol;
  uniform vec3 uMin, uMax, uTexel;
  uniform float uGain, uStep, uInvGamma, uGrad;
  uniform int uMode;
  const int MAX_STEPS = 640;
  vec3 fire(float x) {
    x = clamp(x, 0.0, 1.0);
    return vec3(clamp(1.6 * x, 0.0, 1.0), clamp(1.6 * x - 0.45, 0.0, 1.0), clamp(2.2 * x - 1.3, 0.0, 1.0) * 0.9 + 0.1 * x);
  }
  float lin(vec3 u) { return pow(texture(uVol, u).r, uInvGamma); }
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    vec3 inv = 1.0 / rd;
    vec3 t0 = (uMin - ro) * inv, t1 = (uMax - ro) * inv;
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float a = max(max(max(tn.x, tn.y), tn.z), 0.0);
    float b = min(min(tf.x, tf.y), tf.z);
    if (a >= b) discard;
    int n = clamp(int(ceil((b - a) / uStep)), 1, MAX_STEPS);
    float dt = (b - a) / float(n);
    float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 col = vec3(0.0);
    float T = 1.0, P = 0.0;
    vec3 ex = vec3(uTexel.x, 0.0, 0.0), ey = vec3(0.0, uTexel.y, 0.0), ez = vec3(0.0, 0.0, uTexel.z);
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= n) break;
      vec3 p = ro + rd * (a + (float(i) + j) * dt);
      vec3 u = (p - uMin) / (uMax - uMin);
      float v = texture(uVol, u).r;
      if (uMode == 2) { P += pow(v, uInvGamma) * dt; continue; }
      if (v < 0.01) continue;
      float al, c;
      if (uMode == 0) {
        al = 1.0 - exp(-v * uGain * dt);
        c = v * 1.2 + 0.05;
      } else {
        vec3 g = vec3(lin(u + ex) - lin(u - ex), lin(u + ey) - lin(u - ey), lin(u + ez) - lin(u - ez));
        float s = clamp(length(g) * uGrad, 0.0, 1.0);
        al = 1.0 - exp(-s * s * uGain * 1.6 * dt);
        c = s * 1.1;
      }
      col += T * al * fire(c);
      T *= 1.0 - al;
      if (T < 0.01) break;
    }
    if (uMode == 2) outColor = vec4(P, 0.0, 0.0, 1.0);
    else outColor = vec4(col, 1.0 - T);
  }`;

const SG_FRAG = `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uP;
  uniform vec2 uTexel;
  uniform float uK;
  void main() {
    vec2 o = uTexel;
    float c = texture(uP, vUv).r;
    float l = texture(uP, vUv + vec2(o.x, 0.0)).r + texture(uP, vUv - vec2(o.x, 0.0)).r
            + texture(uP, vUv + vec2(0.0, o.y)).r + texture(uP, vUv - vec2(0.0, o.y)).r - 4.0 * c;
    outColor = vec4(vec3(clamp(0.5 + uK * l, 0.0, 1.0)), 1.0);
  }`;

export default function Field() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [load, setLoad] = useState<{ err?: string } | null>({});
  const [buffered, setBuffered] = useState(0);
  const [meta, setMeta] = useState<FieldMeta | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<Mode>("structure");
  const [phones, setPhones] = useState(true);
  const ui = useRef({ frame: 0, playing: true, mode: 1, phones: true, ready: 0 });
  ui.current.playing = playing;
  ui.current.mode = MODES.indexOf(mode);
  ui.current.phones = phones;

  useEffect(() => {
    let dead = false;
    let dispose = () => {};
    (async () => {
      try {
        const [m, rig] = await Promise.all([getJSON<FieldMeta>("field.json"), getJSON<Rig>("rig.json")]);
        const packed: (Uint8Array | null)[] = new Array(m.frames).fill(null);
        const total = (m.bytes ?? []).reduce((a, b) => a + b, 0);
        let got = 0;
        // Fetch in order, a few at a time; playback runs over the frames that have arrived so far.
        let next = 0;
        let started!: () => void;
        const firstIn = new Promise<void>((res) => {
          started = res;
        });
        const worker = async () => {
          while (!dead && next < m.frames) {
            const i = next++;
            packed[i] = await getBytes(`field/${String(i).padStart(3, "0")}.gz`);
            got += m.bytes?.[i] ?? 0;
            let r = ui.current.ready;
            while (r < m.frames && packed[r]) r++;
            ui.current.ready = r;
            if (i === 0) started();
            if (!dead) setBuffered(total ? got / total : r / m.frames);
          }
        };
        const fetching = Promise.all(Array.from({ length: 6 }, worker));
        await Promise.race([firstIn, fetching]);
        const first = await gunzip(packed[0]!);
        if (dead || !canvas.current || !wrap.current) return;
        setMeta(m);
        setLoad(null);
        dispose = start(m, rig, packed, first);
        await fetching;
      } catch (e) {
        if (!dead) setLoad({ err: (e as Error).message });
      }
    })();

    function start(m: FieldMeta, rig: Rig, packed: (Uint8Array | null)[], first: Uint8Array) {
      // Decoded frames: a small cache, filled just ahead of playback.
      const decoded = new Map<number, Uint8Array>([[0, first]]);
      const pending = new Set<number>();
      const want = (i: number) => {
        if (decoded.has(i) || pending.has(i) || !packed[i]) return;
        pending.add(i);
        gunzip(packed[i]!).then((d) => {
          pending.delete(i);
          decoded.set(i, d);
          while (decoded.size > 8) decoded.delete(decoded.keys().next().value as number);
        });
      };

      const tex = new THREE.Data3DTexture(first, m.nx, m.ny, m.nz);
      tex.format = THREE.RedFormat;
      tex.type = THREE.UnsignedByteType;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      const lo = new THREE.Vector3(...m.min), hi = new THREE.Vector3(...m.max);
      const size = hi.clone().sub(lo), mid = hi.clone().add(lo).multiplyScalar(0.5);
      const vox = size.y / (m.ny - 1);
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uVol: { value: tex }, uMin: { value: lo }, uMax: { value: hi }, uGain: { value: 55 }, uMode: { value: 0 },
          uStep: { value: 0.75 * vox }, uInvGamma: { value: 1 / (m.gamma ?? 1) }, uGrad: { value: 2 },
          uTexel: { value: new THREE.Vector3(1 / m.nx, 1 / m.ny, 1 / m.nz) },
        },
        side: THREE.BackSide,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      box.position.copy(mid);
      box.renderOrder = 1;
      const scene = new THREE.Scene();
      const rigGroup = buildRig(rig, { coneOpacity: 0.12, flame: 0.004 });
      scene.add(rigGroup, box);

      // shadowgram pass
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true });
      const quadMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: SG_FRAG,
        uniforms: { uP: { value: rt.texture }, uTexel: { value: new THREE.Vector2() }, uK: { value: 1 } },
        depthTest: false,
      });
      const quadScene = new THREE.Scene();
      quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
      const quadCam = new THREE.Camera();
      const volScene = new THREE.Scene();
      const volBox = new THREE.Mesh(box.geometry, mat);
      volBox.position.copy(mid);
      volScene.add(volBox);

      let shown = 0;
      let clock = 0, last = performance.now();
      const st = makeStage(canvas.current!, wrap.current!, (w, h) => {
        const now = performance.now();
        const u = ui.current;
        const ready = Math.max(1, u.ready);
        if (u.playing) {
          clock += (now - last) / 1000;
          u.frame = Math.floor(clock * m.fps) % ready;
        } else {
          u.frame = Math.min(u.frame, ready - 1);
          clock = u.frame / m.fps;
        }
        last = now;
        want(u.frame);
        want((u.frame + 1) % ready);
        want((u.frame + 2) % ready);
        const d = decoded.get(u.frame);
        if (u.frame !== shown && d) {
          shown = u.frame;
          tex.image.data = d;
          tex.needsUpdate = true;
          setFrame(shown);
        }
        rigGroup.visible = u.phones && u.mode !== 2;
        mat.uniforms.uMode.value = u.mode;
        const r = st.renderer;
        if (u.mode !== 2) {
          r.setRenderTarget(null);
          r.render(scene, st.camera);
          return;
        }
        // projected density -> its Laplacian, with the stencil about one voxel wide on screen
        const pr = r.getPixelRatio();
        const W = Math.round(w * pr), H = Math.round(h * pr);
        if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
        r.setRenderTarget(rt);
        r.setClearColor(0x000000, 1);
        r.clear();
        r.render(volScene, st.camera);
        r.setRenderTarget(null);
        r.setClearColor(0x0b0b0b, 1);
        const dist = st.camera.position.distanceTo(st.controls.target);
        const pxWorld = (2 * dist * Math.tan((st.camera.fov * Math.PI) / 360)) / H;
        const stepPx = Math.max(1, (1.5 * vox) / pxWorld);
        quadMat.uniforms.uTexel.value.set(stepPx / W, stepPx / H);
        const hstep = stepPx * pxWorld; // stencil width in metres: the sum is ~ Laplacian * hstep^2
        quadMat.uniforms.uK.value = 0.0005 / (hstep * hstep);
        r.render(quadScene, quadCam);
      });
      // start from the center phone's side, closer in
      const c = rig.cameras.C ?? Object.values(rig.cameras)[0];
      const dir = new THREE.Vector3(...c.pos).sub(mid).normalize();
      const aim = mid.clone().setY(lo.y + 0.38 * size.y); // the plume is densest in the lower part of the box
      st.controls.target.copy(aim);
      st.camera.position.copy(aim).addScaledVector(dir, 0.8);
      st.controls.minDistance = 0.15;
      st.controls.maxDistance = 6;
      return () => {
        st.dispose();
        rt.dispose();
        tex.dispose();
        mat.dispose();
        quadMat.dispose();
        box.geometry.dispose();
      };
    }

    return () => {
      dead = true;
      dispose();
    };
  }, []);

  const T = meta ? meta.frames / meta.fps : 1;
  return (
    <>
      <div ref={wrap} className="ha-stage ha-stage-grab" style={{ height: "min(560px, 110vw)" }}>
        <canvas ref={canvas} />
        {load && (
          <div className="ha-loading">
            {load.err ?? "Loading the field"}
            {!load.err && (
              <span>
                <i style={{ width: `${Math.round(buffered * 100)}%` }} />
              </span>
            )}
          </div>
        )}
      </div>
      <div className="ha-controls">
        {MODES.map((k) => (
          <button key={k} className={`ha-pill${mode === k ? " ha-pill-active" : ""}`} onClick={() => setMode(k)}>{k}</button>
        ))}
        <button className={`ha-pill${phones ? " ha-pill-active" : ""}`} disabled={mode === "shadowgram"} onClick={() => setPhones((p) => !p)}>Phones</button>
      </div>
      <div className="ha-controls">
        <button className="ha-pill ha-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            {playing ? <path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" /> : <path d="M3 1.5v11l9.5-5.5z" />}
          </svg>
        </button>
        <input className="ha-range" type="range" min={0} max={(meta?.frames ?? 1) - 1} step={1} value={frame} aria-label="Time"
          onChange={(e) => {
            setPlaying(false);
            ui.current.frame = +e.target.value;
          }} />
        <span className="ha-readout">
          {buffered < 1 ? <>loading {Math.round(buffered * 100)}%</> : <><b>{meta ? (frame / meta.fps).toFixed(2) : "0.00"}</b> / {T.toFixed(1)} s</>}
        </span>
      </div>
    </>
  );
}
