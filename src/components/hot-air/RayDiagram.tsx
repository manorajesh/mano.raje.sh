import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWidth } from "./common";

// Light from a point (the phone's flash) crosses a blob of warm air on its way to a sheet.
// Warm air has a slightly lower refractive index, so it acts like a weak diverging lens: rays
// through it spread out (darker on the sheet) and pile up around its edge (brighter).
// Rays are traced by stepping the ray equation d/ds (n dr/ds) = grad n; the index change is
// exaggerated about a thousand times so it shows at this size.

const SHOWN = 46;
const TRACED = 2400;

export default function RayDiagram() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = useWidth(wrap);
  const H = W < 560 ? 250 : 320;
  const [warmth, setWarmth] = useState(0.6);
  const [blob, setBlob] = useState({ x: 0.52, y: 0.5 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const geom = useCallback(() => {
    const src = { x: 34, y: H / 2 };
    const sheet = Math.max(W - 96, 200);
    const R = H * 0.17;
    const c = { x: src.x + (sheet - src.x) * blob.x, y: H * blob.y };
    return { src, sheet, R, c };
  }, [W, H, blob]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !W) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { src, sheet, R, c } = geom();
    const A = warmth * 0.045;
    const s2 = R * R * 0.45;
    const top = 14, bottom = H - 14;

    // trace one ray to the sheet; returns the path (if wanted) and where it lands
    const trace = (yAim: number, keep: boolean) => {
      let x = src.x, y = src.y;
      let dx = sheet - src.x, dy = yAim - src.y;
      const l = Math.hypot(dx, dy);
      dx /= l;
      dy /= l;
      const pts: number[] = keep ? [x, y] : [];
      const ds = 2.5;
      for (let i = 0; i < 2000 && x < sheet; i++) {
        const rx = x - c.x, ry = y - c.y;
        const e = Math.exp(-(rx * rx + ry * ry) / s2);
        if (e > 1e-4) {
          const n = 1 - A * e;
          const gx = ((2 * A * e) / s2) * rx, gy = ((2 * A * e) / s2) * ry;
          const dot = gx * dx + gy * dy;
          dx += ((gx - dot * dx) / n) * ds;
          dy += ((gy - dot * dy) / n) * ds;
          const m = Math.hypot(dx, dy);
          dx /= m;
          dy /= m;
        }
        x += dx * ds;
        y += dy * ds;
        if (keep && i % 3 === 0) pts.push(x, y);
      }
      if (keep) pts.push(x, y);
      return { pts, y };
    };

    // warm air
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.25);
    glow.addColorStop(0, `rgba(255,138,61,${0.1 + 0.32 * warmth})`);
    glow.addColorStop(1, "rgba(255,138,61,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // a few rays, drawn
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(236,236,236,0.2)";
    for (let i = 0; i < SHOWN; i++) {
      const { pts } = trace(top + ((bottom - top) * (i + 0.5)) / SHOWN, true);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
      ctx.stroke();
    }

    // many rays, counted where they land: that's the brightness of the sheet
    const bins = Math.round((bottom - top) / 3);
    const hist = new Float32Array(bins);
    for (let i = 0; i < TRACED; i++) {
      const { y } = trace(top + ((bottom - top) * (i + 0.5)) / TRACED, false);
      const b = Math.floor(((y - top) / (bottom - top)) * bins);
      if (b >= 0 && b < bins) hist[b]++;
    }
    const base = TRACED / bins;
    const sm = hist.map((_, i) => {
      let s = 0, k = 0;
      for (let j = -1; j <= 1; j++) if (hist[i + j] !== undefined) { s += hist[i + j]; k++; }
      return s / k / base;
    });

    // the sheet, lit
    const bh = (bottom - top) / bins;
    for (let i = 0; i < bins; i++) {
      const g = Math.round(Math.min(255, 150 * Math.pow(sm[i], 1.1)));
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(sheet, top + i * bh, 9, bh + 0.5);
    }
    // brightness profile beside it
    ctx.strokeStyle = "rgba(236,236,236,0.75)";
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const px = sheet + 18 + Math.min(sm[i], 3) * 22;
      const py = top + (i + 0.5) * bh;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(236,236,236,0.15)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(sheet + 40, top);
    ctx.lineTo(sheet + 40, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // flash
    ctx.fillStyle = "#ececec";
    ctx.beginPath();
    ctx.arc(src.x, src.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "500 9px Inter, sans-serif";
    ctx.fillStyle = "#6f6f6f";
    ctx.textAlign = "left";
    ctx.fillText("FLASH", src.x - 12, src.y + 20);
    ctx.textAlign = "center";
    ctx.fillText("SHEET", sheet + 4, H - 3);
    ctx.fillText("WARM AIR", c.x, c.y + R * 1.25 + 12);
  }, [W, H, warmth, geom]);

  const local = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    const p = local(e);
    const { c, R } = geom();
    if (Math.hypot(p.x - c.x, p.y - c.y) > R * 1.4) return;
    drag.current = { dx: p.x - c.x, dy: p.y - c.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    const { src, sheet, R, c } = geom();
    const el = canvas.current!;
    if (!drag.current) {
      el.style.cursor = Math.hypot(p.x - c.x, p.y - c.y) < R * 1.4 ? "grab" : "default";
      return;
    }
    el.style.cursor = "grabbing";
    const x = (p.x - drag.current.dx - src.x) / (sheet - src.x);
    const y = (p.y - drag.current.dy) / H;
    setBlob({ x: Math.min(0.86, Math.max(0.16, x)), y: Math.min(0.85, Math.max(0.15, y)) });
  };
  const onUp = () => (drag.current = null);

  return (
    <>
      <div ref={wrap} className="ha-stage" style={{ height: H }}>
        <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
      <div className="ha-controls">
        <span className="ha-range-label">Cool</span>
        <input className="ha-range" type="range" min={0} max={1} step={0.01} value={warmth} aria-label="Warmth"
          onChange={(e) => setWarmth(+e.target.value)} />
        <span className="ha-range-label">Hot</span>
      </div>
    </>
  );
}
