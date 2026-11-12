import React, { useEffect, useRef, useState } from "react";
import { getJSON, useWidth } from "./common";

// Onset envelopes (log loudness minus its local average) of each phone's audio, already lined up
// by the pipeline. The widget knocks the side phones out of line; drag them back. The score is the
// correlation of each track with the center phone's over the window.

type SyncData = { rate: number; margin: number; span: number; tracks: Record<string, number[]>; offsets: Record<string, number>; reference: string };
const ROWS = ["L", "C", "R"];
const NAMES: Record<string, string> = { L: "Left", C: "Center", R: "Right" };
const START: Record<string, number> = { L: 1.15, R: -0.8 };
const ROW_H = 58;

function score(a: number[], b: number[], shift: number, rate: number, margin: number, span: number) {
  const s = Math.round(shift * rate);
  const i0 = Math.round(margin * rate), n = Math.round(span * rate);
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, k = 0;
  for (let i = i0; i < i0 + n; i++) {
    const j = i - s;
    if (j < 0 || j >= b.length) continue;
    const x = a[i], y = b[j];
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; k++;
  }
  if (k < 10) return 0;
  const cov = sab / k - (sa / k) * (sb / k);
  return cov / Math.sqrt((saa / k - (sa / k) ** 2) * (sbb / k - (sb / k) ** 2) + 1e-9);
}

export default function Sync() {
  const [data, setData] = useState<SyncData | null>(null);
  const [shift, setShift] = useState<Record<string, number>>(START);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = useWidth(wrap);
  const H = ROWS.length * ROW_H + 24;
  const drag = useRef<{ row: string; x: number; s: number } | null>(null);
  const anim = useRef(0);

  useEffect(() => {
    getJSON<SyncData>("sync.json").then(setData).catch(() => {});
    return () => cancelAnimationFrame(anim.current);
  }, []);

  const pxPerS = data ? (W - 24) / data.span : 1;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !data || !W) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { rate, margin } = data;
    ROWS.forEach((k, r) => {
      const tr = data.tracks[k];
      if (!tr) return;
      const y0 = 12 + r * ROW_H, mid = y0 + ROW_H * 0.62;
      const s = shift[k] ?? 0;
      const sc = k === data.reference ? 1 : score(data.tracks[data.reference], tr, s, rate, margin, data.span);
      const ok = k === data.reference || Math.abs(s) < 0.04;
      ctx.fillStyle = ok ? (k === data.reference ? "rgba(236,236,236,0.8)" : "rgba(255,138,61,0.9)") : "rgba(236,236,236,0.45)";
      for (let i = 0; i < tr.length; i++) {
        const x = 12 + (i / rate - margin + s) * pxPerS;
        if (x < 12 || x > W - 12) continue;
        const v = Math.max(0, tr[i]);
        const h = Math.min(v * 9, ROW_H * 0.58);
        ctx.fillRect(x, mid - h, Math.max(pxPerS / rate, 1), h);
      }
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(12, mid, W - 24, 1);
      ctx.font = "500 9px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#6f6f6f";
      ctx.fillText(NAMES[k].toUpperCase(), 12, y0 + 9);
      if (k !== data.reference) {
        ctx.textAlign = "right";
        ctx.fillStyle = ok ? "#ff8a3d" : "#6f6f6f";
        ctx.fillText(`${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(2)} S   MATCH ${Math.max(0, sc * 100).toFixed(0)}%`, W - 12, y0 + 9);
      }
    });
  }, [data, shift, W, H, pxPerS]);

  const onDown = (e: React.PointerEvent) => {
    if (!data) return;
    const r = canvas.current!.getBoundingClientRect();
    const row = ROWS[Math.floor((e.clientY - r.top - 12) / ROW_H)];
    if (!row || row === data.reference) return;
    cancelAnimationFrame(anim.current);
    drag.current = { row, x: e.clientX, s: shift[row] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !data) return;
    let s = d.s + (e.clientX - d.x) / pxPerS;
    s = Math.max(-data.margin, Math.min(data.margin, s));
    if (Math.abs(s) < 0.06) s = 0; // a little snap at the answer
    setShift((o) => ({ ...o, [d.row]: s }));
  };
  const onUp = () => (drag.current = null);

  const tween = (to: Record<string, number>) => {
    cancelAnimationFrame(anim.current);
    const from = { ...shift };
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 900);
      const e = 1 - Math.pow(1 - t, 3);
      setShift(Object.fromEntries(Object.keys(from).map((k) => [k, from[k] + ((to[k] ?? 0) - from[k]) * e])));
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    step();
  };
  const lined = Object.values(shift).every((s) => Math.abs(s) < 0.04);

  return (
    <>
      <div ref={wrap} className="ha-stage ha-stage-grab" style={{ height: H }}>
        <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
      <div className="ha-controls">
        <button className="ha-pill" onClick={() => tween(lined ? START : { L: 0, R: 0 })}>
          {lined ? "Mix up" : "Line up"}
        </button>
        {data && lined && (
          <span className="ha-readout">
            Left started <b>{data.offsets.L.toFixed(2)} s</b> earlier · Right <b>{(-data.offsets.R).toFixed(2)} s</b> later
          </span>
        )}
      </div>
    </>
  );
}
