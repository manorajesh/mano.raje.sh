import React, { useEffect, useRef, useState } from "react";
import { BASE, getJSON, useVisible, useWidth } from "./common";

// Training snapshots. Each train_<cam>.webp is a vertical strip: what the phone filmed (the middle
// frame of the window, as a shadowgram), then the field's prediction of it at every snapshot.

type TrainData = { steps: number[]; loss: [number, number][]; tiles: Record<string, { w: number; h: number }> };
const ORDER = ["L", "C", "R"];
const NAMES: Record<string, string> = { L: "Left", C: "Center", R: "Right" };

function Tile({ cam, row, rows, w, h, label }: { cam: string; row: number; rows: number; w: number; h: number; label: string }) {
  return (
    <div
      className="ha-train-tile"
      style={{
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url(${BASE}train_${cam}.webp)`,
        backgroundSize: `100% ${rows * 100}%`,
        backgroundPosition: `0 ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
      }}
    >
      <span className="ha-corner">{label}</span>
    </div>
  );
}

export default function Training() {
  const [data, setData] = useState<TrainData | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lossWrap = useRef<HTMLDivElement>(null);
  const lossCanvas = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(box);
  const LW = useWidth(lossWrap);

  useEffect(() => {
    getJSON<TrainData>("train.json").then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data || !playing || !visible) return;
    const id = window.setInterval(() => {
      setI((v) => {
        if (v >= data.steps.length - 1) {
          setPlaying(false);
          return v;
        }
        return v + 1;
      });
    }, 260);
    return () => window.clearInterval(id);
  }, [data, playing, visible]);

  // loss curve, with the current snapshot marked
  useEffect(() => {
    const cv = lossCanvas.current;
    if (!cv || !data || !LW || !data.loss.length) return;
    const H = 70, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = LW * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, H);
    const last = data.loss[data.loss.length - 1][0] || 1;
    const ys = data.loss.map((l) => l[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const X = (s: number) => 8 + (s / last) * (LW - 16);
    const Y = (v: number) => 10 + (1 - (v - lo) / (hi - lo || 1)) * (H - 26);
    ctx.strokeStyle = "rgba(236,236,236,0.6)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    data.loss.forEach(([s, v], k) => (k ? ctx.lineTo(X(s), Y(v)) : ctx.moveTo(X(s), Y(v))));
    ctx.stroke();
    const step = data.steps[i];
    ctx.strokeStyle = "rgba(255,138,61,0.9)";
    ctx.beginPath();
    ctx.moveTo(X(step), 4);
    ctx.lineTo(X(step), H - 14);
    ctx.stroke();
    ctx.font = "500 9px Inter, sans-serif";
    ctx.fillStyle = "#6f6f6f";
    ctx.textAlign = "left";
    ctx.fillText("ERROR", 8, H - 2);
    ctx.textAlign = "right";
    ctx.fillText("STEPS →", LW - 8, H - 2);
  }, [data, i, LW]);

  const n = data?.steps.length ?? 1;
  const rows = n + 1;
  return (
    <div ref={box}>
      <div className="ha-train">
        {ORDER.filter((k) => data?.tiles[k]).map((k) => {
          const t = data!.tiles[k];
          return (
            <div key={k} className="ha-train-col">
              <Tile cam={k} row={0} rows={rows} w={t.w} h={t.h} label={`${NAMES[k]} · filmed`} />
              <Tile cam={k} row={i + 1} rows={rows} w={t.w} h={t.h} label="3D guess" />
            </div>
          );
        })}
      </div>
      <div ref={lossWrap} className="ha-loss">
        <canvas ref={lossCanvas} style={{ width: "100%", height: 70, display: "block" }} />
      </div>
      <div className="ha-controls">
        <button className="ha-pill ha-play" aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && i >= n - 1) setI(0);
            setPlaying((p) => !p);
          }}>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            {playing ? <path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" /> : <path d="M3 1.5v11l9.5-5.5z" />}
          </svg>
        </button>
        <input className="ha-range" type="range" min={0} max={n - 1} step={1} value={i} aria-label="Training step"
          onChange={(e) => {
            setPlaying(false);
            setI(+e.target.value);
          }} />
        <span className="ha-readout">Step <b>{data ? data.steps[i].toLocaleString() : 0}</b></span>
      </div>
    </div>
  );
}
