import React, { useEffect, useRef, useState } from "react";
import { BASE, getJSON, useVisible } from "./common";

// calib.mp4: the calibration board as each phone filmed it, side by side and in sync,
// with the corners the pipeline found drawn on top.

type CalibMeta = { cams: string[]; tiles: number[]; height: number; frames: Record<string, number> };
const NAMES: Record<string, string> = { L: "Left", C: "Center", R: "Right" };

export default function Calib() {
  const [meta, setMeta] = useState<CalibMeta | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const visible = useVisible(box);

  useEffect(() => {
    getJSON<CalibMeta>("calib.json").then(setMeta).catch(() => {});
  }, []);
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (visible) v.play().catch(() => {});
    else v.pause();
  }, [visible, meta]);

  const W = meta ? meta.tiles.reduce((a, b) => a + b, 0) : 1;
  let x = 0;
  return (
    <div ref={box} className="ha-stage" style={{ aspectRatio: meta ? `${W} / ${meta.height}` : "11 / 3" }}>
      {meta && (
        <>
          <video ref={vid} src={`${BASE}calib.mp4`} muted loop playsInline preload="auto"
            style={{ display: "block", width: "100%", maxWidth: "none", height: "100%" }} />
          {meta.cams.map((k, i) => {
            const left = (x / W) * 100;
            x += meta.tiles[i];
            return (
              <span key={k} className="ha-corner" style={{ left: `calc(${left}% + 10px)`, color: "rgba(0,0,0,.55)" }}>
                {NAMES[k] ?? k} · board in {meta.frames[k]} frames
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}
