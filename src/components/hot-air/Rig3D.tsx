import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BG, buildRig, getJSON, placeTags, Rig } from "./common";

const NAMES: Record<string, string> = { L: "Left", C: "Center", R: "Right" };

/** A renderer, camera and orbit controls on a canvas, drawn only while on screen. */
export function makeStage(canvas: HTMLCanvasElement, wrap: HTMLElement, onFrame: (w: number, h: number) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(BG, 1);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  let w = 1, h = 1, on = false, raf = 0;
  const resize = () => {
    w = wrap.clientWidth;
    h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    onFrame(w, h);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !on) {
      on = true;
      loop();
    } else if (!e.isIntersecting && on) {
      on = false;
      cancelAnimationFrame(raf);
    }
  });
  io.observe(wrap);
  return {
    renderer,
    camera,
    controls,
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

export default function Rig3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Record<string, HTMLSpanElement | null>>({});
  const [rig, setRig] = useState<Rig | null>(null);

  useEffect(() => {
    getJSON<Rig>("rig.json").then(setRig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rig || !canvas.current || !wrap.current) return;
    const scene = new THREE.Scene();
    scene.add(buildRig(rig, { box: true, coneOpacity: 0.28 }));
    const pts = Object.entries(rig.cameras).map(([k, c]) => ({ k, at: new THREE.Vector3(...c.pos) }));
    const center = pts.reduce((a, p) => a.add(p.at), new THREE.Vector3()).divideScalar(pts.length + 1);
    const at = [...pts, { k: "flame", at: new THREE.Vector3() }];
    let spin = true;
    const st = makeStage(canvas.current, wrap.current, (w, h) => {
      if (spin) st.controls.target.copy(center);
      st.renderer.render(scene, st.camera);
      placeTags(at.map((p) => ({ el: tags.current[p.k], at: p.at })), st.camera, w, h);
    });
    st.controls.target.copy(center);
    st.camera.position.copy(center).add(new THREE.Vector3(-2.4, 2.6, 5.2));
    st.controls.autoRotate = true;
    st.controls.autoRotateSpeed = 0.6;
    const stop = () => {
      spin = false;
      st.controls.autoRotate = false;
    };
    st.controls.addEventListener("start", stop);
    return () => {
      st.controls.removeEventListener("start", stop);
      st.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    };
  }, [rig]);

  return (
    <div ref={wrap} className="ha-stage ha-stage-grab" style={{ height: "min(460px, 70vw)" }}>
      <canvas ref={canvas} />
      {rig &&
        [...Object.keys(rig.cameras), "flame"].map((k) => (
          <span key={k} ref={(el) => (tags.current[k] = el)} className={`ha-tag${k === "flame" ? " ha-tag-warm" : ""}`}>
            {k === "flame" ? "FLAME" : (NAMES[k] ?? k).toUpperCase()}
          </span>
        ))}
    </div>
  );
}
