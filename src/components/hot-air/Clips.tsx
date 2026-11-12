import React, { useEffect, useRef, useState } from "react";
import { BASE, getJSON, useVisible, useWidth } from "./common";

// Each clip file is the cropped take, side by side: original | shadowgram.
export type ClipMeta = Record<string, { w: number; h: number; frames: number; fps: number; start: number }>;
const ORDER = ["L", "C", "R"];
const NAMES: Record<string, string> = { L: "Left", C: "Center", R: "Right" };

export function useClips() {
  const [meta, setMeta] = useState<ClipMeta | null>(null);
  useEffect(() => {
    getJSON<ClipMeta>("clips.json").then(setMeta).catch(() => {});
  }, []);
  return meta;
}

/** The three phones' shadowgrams, playing. Only the right half of each clip is shown. */
export function Hero({ meta }: { meta: ClipMeta | null }) {
  const box = useRef<HTMLDivElement>(null);
  const visible = useVisible(box);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => {
    vids.current.forEach((v) => {
      if (!v) return;
      if (visible) v.play().catch(() => {});
      else v.pause();
    });
  }, [visible, meta]);
  const cams = meta ? ORDER.filter((k) => meta[k]) : ORDER;
  return (
    <div ref={box} className="ha-hero">
      {cams.map((k, i) => (
        <div key={k} className="ha-stage">
          {meta && (
            <video
              ref={(el) => (vids.current[i] = el)}
              src={`${BASE}clip_${k}.mp4`}
              muted
              loop
              playsInline
              preload="auto"
              style={{ position: "absolute", top: 0, left: "-100%", width: "200%", maxWidth: "none", height: "100%", objectFit: "cover" }}
            />
          )}
          <span className="ha-corner">{NAMES[k]}</span>
        </div>
      ))}
    </div>
  );
}

/** One phone at a time: drag across to wipe between the raw footage and the shadowgram; scrub through time. */
export function Wipe({ meta }: { meta: ClipMeta | null }) {
  const [cam, setCam] = useState("C");
  const [split, setSplit] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const visible = useVisible(wrap);
  const avail = useWidth(wrap);
  const m = meta?.[cam];
  const maxH = 520;
  const H = m ? Math.min(maxH, (Math.min(avail || 400, 560) * m.h) / m.w) : 400;
  const W = m ? (H * m.w) / m.h : 300;
  const splitRef = useRef(split);
  splitRef.current = split;

  useEffect(() => {
    const v = video.current;
    if (!v || !m) return;
    if (!visible) v.pause();
    else if (playing) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [visible, playing, m, cam]);

  // draw while on screen
  useEffect(() => {
    const cv = canvas.current, v = video.current;
    if (!cv || !v || !m || !visible) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (v.readyState < 2) return;
      const s = splitRef.current;
      const cw = cv.width, ch = cv.height;
      const cut = Math.round(cw * s);
      if (cut > 0) ctx.drawImage(v, 0, 0, m.w * s, m.h, 0, 0, cut, ch);
      if (cut < cw) ctx.drawImage(v, m.w + m.w * s, 0, m.w * (1 - s), m.h, cut, 0, cw - cut, ch);
      ctx.fillStyle = "rgba(236,236,236,0.9)";
      ctx.fillRect(cut - dpr / 2, 0, dpr, ch);
      ctx.beginPath();
      ctx.arc(cut, ch / 2, 9 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b0b0b";
      ctx.font = `600 ${9 * dpr}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↔", cut, ch / 2 + 0.5 * dpr);
      setTime(v.currentTime);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [m, visible, W, H, cam]);

  const pick = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    setSplit(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  const dur = m ? m.frames / m.fps : 1;

  return (
    <>
      <div ref={wrap} style={{ display: "flex", justifyContent: "center" }}>
        <div className="ha-stage" style={{ width: W, height: H, cursor: "ew-resize" }}>
          <canvas
            ref={canvas}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              pick(e);
            }}
            onPointerMove={(e) => e.buttons && pick(e)}
          />
          <span className="ha-corner" style={{ opacity: split > 0.12 ? 1 : 0 }}>Original</span>
          <span className="ha-corner" style={{ left: "auto", right: 12, opacity: split < 0.88 ? 1 : 0 }}>Air</span>
        </div>
      </div>
      {m && <video key={cam} ref={video} src={`${BASE}clip_${cam}.mp4`} muted loop playsInline preload="auto" style={{ display: "none" }} />}
      <div className="ha-controls">
        {ORDER.filter((k) => meta?.[k]).map((k) => (
          <button key={k} className={`ha-pill${cam === k ? " ha-pill-active" : ""}`} onClick={() => setCam(k)}>
            {NAMES[k]}
          </button>
        ))}
      </div>
      <div className="ha-controls">
        <button className="ha-pill ha-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          <svg viewBox="0 0 14 14" aria-hidden="true">
            {playing ? <path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" /> : <path d="M3 1.5v11l9.5-5.5z" />}
          </svg>
        </button>
        <input className="ha-range" type="range" min={0} max={dur} step={1 / 30} value={time} aria-label="Time"
          onChange={(e) => {
            setPlaying(false);
            if (video.current) video.current.currentTime = +e.target.value;
          }} />
        <span className="ha-readout"><b>{time.toFixed(2)}</b> s</span>
      </div>
    </>
  );
}
