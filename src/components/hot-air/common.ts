import { useEffect, useState, RefObject } from "react";
import * as THREE from "three";

// Data comes from the capture pipeline (github.com/manorajesh/hotair, tools/export_web.py) and lives in public/hotair.
export const BASE = "/hotair/";

// In every current browser, but missing from TypeScript 4.9's DOM types.
const DecompressionStream = (globalThis as any).DecompressionStream as new (format: "gzip") => TransformStream<Uint8Array, Uint8Array>;
export const INK = 0xececec;
export const WARM = 0xff8a3d;
export const BG = 0x0b0b0b;

export async function getJSON<T>(file: string): Promise<T> {
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error(`Couldn't load ${file}`);
  return r.json();
}

/** Fetch a gzipped binary, reporting progress (0-1) on the compressed bytes. */
export async function getGzip(file: string, progress: (f: number) => void): Promise<Uint8Array> {
  const r = await fetch(BASE + file);
  if (!r.ok || !r.body) throw new Error(`Couldn't load ${file}`);
  const total = +(r.headers.get("content-length") ?? 0);
  let seen = 0;
  const counted = r.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        seen += chunk.byteLength;
        if (total) progress(Math.min(seen / total, 1));
        ctl.enqueue(chunk);
      },
    })
  );
  return gunzip(new Uint8Array(await new Response(counted).arrayBuffer()));
}

// Some servers already undo the gzip (Content-Encoding); only decompress if the bytes are still gzip.
export async function gunzip(raw: Uint8Array): Promise<Uint8Array> {
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return raw;
  const out = new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip")));
  return new Uint8Array(await out.arrayBuffer());
}

export async function getBytes(file: string): Promise<Uint8Array> {
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error(`Couldn't load ${file}`);
  return new Uint8Array(await r.arrayBuffer());
}

export function useWidth(ref: RefObject<HTMLElement>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** True while the element is (nearly) on screen, so widgets can stop drawing when scrolled away. */
export function useVisible(ref: RefObject<HTMLElement>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

export type Cam = { pos: number[]; right: number[]; up: number[]; forward: number[]; f: number; w: number; h: number };
export type Rig = { cameras: Record<string, Cam>; box: { min: number[]; max: number[] } };

/** Phones (a small slab each) with their view cones out to the flame, the flame, and the 3D box. Metres, y up, flame at 0. */
export function buildRig(rig: Rig, opts: { box?: boolean; coneOpacity?: number; flame?: number } = {}) {
  const g = new THREE.Group();
  const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const lines: number[] = [];
  const phoneGeo = new THREE.BoxGeometry(0.15, 0.075, 0.012);
  const phoneMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 });
  for (const c of Object.values(rig.cameras)) {
    const p = v(c.pos), r = v(c.right), u = v(c.up), f = v(c.forward);
    const phone = new THREE.Mesh(phoneGeo, phoneMat);
    phone.position.copy(p);
    phone.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f.clone().negate()));
    phone.add(new THREE.LineSegments(new THREE.EdgesGeometry(phoneGeo), edgeMat));
    g.add(phone);
    const d = p.length() * 1.05; // cone reaches just past the flame
    const hw = (d * c.w) / 2 / c.f, hh = (d * c.h) / 2 / c.f;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
      p.clone().addScaledVector(f, d).addScaledVector(r, a * hw).addScaledVector(u, b * hh)
    );
    corners.forEach((q, i) => {
      lines.push(p.x, p.y, p.z, q.x, q.y, q.z);
      const n = corners[(i + 1) % 4];
      lines.push(q.x, q.y, q.z, n.x, n.y, n.z);
    });
  }
  const cone = new THREE.BufferGeometry();
  cone.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(cone, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: opts.coneOpacity ?? 0.22 })));
  if (opts.box) {
    const s = v(rig.box.max).sub(v(rig.box.min));
    const bg = new THREE.BoxGeometry(s.x, s.y, s.z);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(bg), new THREE.LineBasicMaterial({ color: WARM, transparent: true, opacity: 0.45 }));
    box.position.copy(v(rig.box.max).add(v(rig.box.min)).multiplyScalar(0.5));
    g.add(box);
  }
  const flame = new THREE.Mesh(new THREE.SphereGeometry(opts.flame ?? 0.018, 16, 12), new THREE.MeshBasicMaterial({ color: WARM }));
  g.add(flame);
  return g;
}

/** Keep absolutely positioned labels over 3D points. */
export function placeTags(tags: { el: HTMLElement | null; at: THREE.Vector3 }[], camera: THREE.Camera, w: number, h: number) {
  const q = new THREE.Vector3();
  for (const t of tags) {
    if (!t.el) continue;
    q.copy(t.at).project(camera);
    const hidden = q.z > 1;
    t.el.style.opacity = hidden ? "0" : "1";
    t.el.style.transform = `translate(${((q.x + 1) / 2) * w + 8}px, ${((1 - q.y) / 2) * h - 22}px)`;
  }
}
