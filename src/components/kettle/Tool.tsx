import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Analysis, CHECKS, CheckKey, D2R, DEFAULTS, DEFAULT_SCENARIO, DimKey, DIMS, enabled, IN3_PER_FLOZ, ML_PER_IN3,
  Scenario, SKETCH, SPEC, TOL,
} from "./model";
import { Designer, Diagnosis } from "./solver";
import { DimState, KettleScene, PourStats, View } from "./scene";
import Guide from "./Guide";

type Units = "in" | "cm";

const fmtLen = (v: number, u: Units) => (u === "in" ? `${v.toFixed(2)}″` : `${(v * 2.54).toFixed(1)} cm`);
const fmtDim = (k: DimKey, v: number, u: Units) => (SPEC[k].angle ? `${v.toFixed(1)}°` : fmtLen(v, u));
const fmtVol = (v: number, u: Units) => (u === "in" ? `${(v / IN3_PER_FLOZ).toFixed(1)} fl oz` : `${Math.round(v * ML_PER_IN3)} ml`);
const fmtSpeed = (v: number, u: Units) => (u === "in" ? `${(v / 12).toFixed(2)} ft/s` : `${(v * 0.0254).toFixed(2)} m/s`);
const fmtRate = (v: number, u: Units) => (u === "in" ? `${(v / IN3_PER_FLOZ).toFixed(2)} fl oz/s` : `${(v * ML_PER_IN3).toFixed(0)} ml/s`);
const toDisp = (k: DimKey, v: number, u: Units) => (SPEC[k].angle || u === "in" ? v : v * 2.54);
const fromDisp = (k: DimKey, v: number, u: Units) => (SPEC[k].angle || u === "in" ? v : v / 2.54);
const stepOf = (k: DimKey, u: Units) => (SPEC[k].angle ? 0.5 : k === "bore" ? (u === "in" ? 0.01 : 0.02) : u === "in" ? 0.05 : 0.1);
const snap = (k: DimKey, v: number, u: Units) => {
  const s = stepOf(k, u);
  return fromDisp(k, Math.round(toDisp(k, v, u) / s) * s, u);
};

/** What failed, in words, with the amount. */
function failText(k: CheckKey, a: Analysis, u: Units) {
  switch (k) {
    case "delivery":
      return `Model delivers ${fmtVol(a.poured, u)} at this fill and tilt`;
    case "stream":
      if (a.missesPlane) return "A launch begins below the rim or cannot cross it from above";
      if (a.over > 0 && a.under > 0) return `Stream sweeps wider than the cup (${fmtLen(a.hi - a.lo, u)} across)`;
      return a.over > a.under
        ? `Stream overshoots the far rim by ${fmtLen(Math.max(a.over, 0), u)}`
        : `Stream falls short of the near rim by ${fmtLen(Math.max(a.under, 0), u)}`;
    case "room":
      return `Kettle needs ${fmtVol(a.fillVol - 0.97 * a.g.vol, u)} more room: the spout's crest leaves too much water behind`;
    case "fit":
      if (a.rOut + 0.25 > -a.cx) return "Cup overlaps the base";
      if (a.reachGap < 0) return "Spout tip is behind the kettle's front edge";
      return "Spout is too short for its reach (kettle under 3″ tall)";
    case "clear":
      return a.gap < 0 ? `Spout or kettle hits the cup or table by ${fmtLen(-a.gap, u)}` : `Spout passes only ${fmtLen(a.gap, u)} over the rim`;
    case "drip":
      return a.exitDeg > 0
        ? `Tip points ${a.exitDeg.toFixed(0)}° up when stopped, so the last flow runs back under the spout`
        : `Tip points only ${(-a.exitDeg).toFixed(0)}° down when stopped; the last flow can creep under the lip`;
    case "holds":
      return `Pour overfills the cup by ${fmtVol(Math.max(a.poured, a.fillVol-a.retained) - a.cap, u)}`;
    case "rest":
      return a.restGap < 0 ? `Leaks standing level: water is ${fmtLen(-a.restGap, u)} over the spout's crest` : `Water stands only ${fmtLen(a.restGap, u)} under the spout's crest`;
    case "lid":
      return `Water reaches the lid when tipped`;
  }
}

function Lock({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 12 14" aria-hidden="true">
      <rect x="1.5" y="6" width="9" height="7" rx="1.2" />
      <path d={on ? "M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6" : "M3.5 6V4.2a2.5 2.5 0 0 1 4.9-.7"} fill="none" strokeWidth="1.4" />
    </svg>
  );
}

function NumberField({ k, value, units, onCommit }: { k: DimKey; value: number; units: Units; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = SPEC[k].angle ? value.toFixed(1) : toDisp(k, value, units).toFixed(units === "in" ? 2 : 1);
  const canceled = useRef(false);
  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text);
    if (!canceled.current && Number.isFinite(n)) onCommit(fromDisp(k, n, units));
    setText(null);
  };
  return (
    <input
      className="kt-num"
      inputMode="decimal"
      value={text ?? shown}
      aria-label={SPEC[k].label}
      onFocus={(e) => {
        canceled.current = false;
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          canceled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const TAG_DIMS: DimKey[] = ["baseH", "cupH", "cupDist", "spoutL", "reach", "tilt", "bend", "cupD", "kettleW"];

export default function KettleTool() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KettleScene | null>(null);
  const designer = useRef<Designer>(null as unknown as Designer);
  if (!designer.current) designer.current = new Designer(DEFAULTS, DEFAULT_SCENARIO);
  const D = designer.current;

  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const sc = D.sc;
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [units, setUnits] = useState<Units>("in");
  const [view, setView] = useState<View>("side");
  const [preview, setPreview] = useState(1);
  const [speed, setSpeed] = useState(4);
  const [stats, setStats] = useState<PourStats | null>(null);
  const [hover, setHover] = useState<DimKey | null>(null);
  const [dragKey, setDragKey] = useState<DimKey | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [guideFocus, setGuideFocus] = useState<DimKey | null>(null);
  const moved = useRef<Partial<Record<DimKey, number>>>({});
  const drag = useRef<{ k: DimKey; x: number; y: number; v0: number; rx: number; ry: number; id: number } | null>(null);

  const navigate = useCallback((action: "undo" | "redo" | "reset") => {
    if (D.interacting) return;
    if ((action === "undo" && !D.canUndo) || (action === "redo" && !D.canRedo)) return;
    D[action]();
    const scene = sceneRef.current;
    scene?.stopPour();
    scene?.resetWater();
    scene?.update(D.dims, D.a, D.sc);
    moved.current = {};
    rerender();
  }, [D, rerender]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (e.defaultPrevented || e.isComposing || e.altKey || guide !== null || D.interacting) return;
      if (target instanceof HTMLElement && (target.isContentEditable ||
          target.closest('textarea, select, input:not([type="range"]):not([type="checkbox"])'))) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let action: "undo" | "redo" | "reset";
      if (mod && key === "z") action = e.shiftKey ? "redo" : "undo";
      else if (e.ctrlKey && !e.metaKey && !e.shiftKey && key === "y") action = "redo";
      else if (!mod && e.shiftKey && key === "r") action = "reset";
      else return;
      e.preventDefault();
      if (!e.repeat) navigate(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [D, guide, navigate]);

  // scene
  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const s = new KettleScene(canvas.current, wrap.current);
    sceneRef.current = s;
    s.onStats = setStats;
    s.onPreview = setPreview;
    s.update(D.dims, D.a, D.sc);
    rerender();
    return () => {
      s.dispose();
      sceneRef.current = null;
    };
  }, [D, rerender]);

  // solver: a slice of each frame while there's work
  useEffect(() => {
    D.onDiag = setDiag;
    let raf = 0;
    let wasBusy = false;
    let settled = false; // the first solve on load isn't news
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!D.busy) {
        if (wasBusy) {
          wasBusy = false;
          settled = true;
          sceneRef.current?.update(D.dims, D.a, D.sc);
          rerender();
        }
        return;
      }
      wasBusy = true;
      const before = { ...D.dims };
      const changed = D.step(9);
      if (changed && settled) {
        const now = performance.now();
        for (const s of DIMS)
          if (Math.abs(before[s.key] - D.dims[s.key]) > 2e-3 * (SPEC[s.key].unit ?? 1) && s.key !== D.pinned) moved.current[s.key] = now;
      }
      sceneRef.current?.update(D.dims, D.a, D.sc);
      rerender();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [D, rerender]);

  // let "moved" highlights fade
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      let any = false;
      for (const k in moved.current) {
        if (now - moved.current[k as DimKey]! > 900) delete moved.current[k as DimKey];
        else any = true;
      }
      if (any) rerender();
    }, 300);
    return () => clearInterval(id);
  }, [rerender]);

  useEffect(() => sceneRef.current?.setView(view), [view]);
  useEffect(() => sceneRef.current?.setSpeed(speed), [speed]);

  // what's in focus: what's being dragged, else what the guide points at, else what's hovered
  const focus = dragKey ?? guideFocus ?? hover;
  useEffect(() => sceneRef.current?.setFocus(focus), [focus]);

  const a = D.a;
  const failing = CHECKS.filter((c) => enabled(sc, c.key) && a.checks[c.key] > TOL).map((c) => c.key);
  const ok = failing.length === 0;
  const passLabel = CHECKS.every(c => enabled(sc,c.key)) ? "Predicted to pour into the cup" : "Enabled model checks pass";

  const bad = new Set<DimKey>();
  if (!ok && diag?.searched) for (const f of diag.fixes) for (const k of f.keys) bad.add(k);
  const dimState: Partial<Record<DimKey, DimState>> = {};
  for (const s of DIMS) dimState[s.key] = bad.has(s.key) ? "bad" : D.locks.has(s.key) ? "locked" : "normal";
  useEffect(() => sceneRef.current?.setDimState(dimState));

  const setValue = (k: DimKey, v: number) => {
    D.set(k, v);
    sceneRef.current?.resetWater();
    rerender();
  };
  const toggleLock = (k: DimKey) => {
    D.setLocked(k, !D.locks.has(k));
    rerender();
  };
  const updateSc = (next: Scenario) => {
    D.setScenario(next);
    rerender();
  };
  const sliderEnd = () => D.setInteracting(false);
  const sliderEvents = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      D.setInteracting(true);
    },
    onPointerUp: sliderEnd, onLostPointerCapture: sliderEnd, onBlur: sliderEnd,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key))
        D.setInteracting(true);
    },
    onKeyUp: sliderEnd,
  };

  // tags: drag along the dimension
  const onTagDown = (k: DimKey) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = sceneRef.current?.rate(k);
    if (!r || Math.hypot(r.x, r.y) < 1e-3) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { k, x: e.clientX, y: e.clientY, v0: D.dims[k], rx: r.x, ry: r.y, id: e.pointerId };
    D.setInteracting(true);
    sceneRef.current?.setDragging(k);
    setDragKey(k);
  };
  const onTagMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const dv = (dx * g.rx + dy * g.ry) / (g.rx * g.rx + g.ry * g.ry);
    setValue(g.k, snap(g.k, g.v0 + dv, units));
  };
  const onTagUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    D.setInteracting(false);
    sceneRef.current?.setDragging(null);
    setDragKey(null);
  };

  const unlockFix = (keys: DimKey[]) => {
    D.setLocks(keys, false, true);
    rerender();
  };

  const setTilt = useCallback((f: number) => {
    setPreview(f);
    sceneRef.current?.setPreview(f);
  }, []);

  const now = performance.now();
  const solving = D.busy;
  const thStart = a.thStart === null ? null : a.thStart / D2R;
  const sketchKeys = Object.keys(SKETCH) as DimKey[];
  const pouring = !!stats && stats.phase !== "idle" && stats.phase !== "done";
  const shownTilt = D.dims.tilt * preview;

  return (
    <div className="kt-tool">
      <div className="kt-left">
        <div ref={wrap} className={`ha-stage kt-stage${view === "3d" ? " ha-stage-grab" : " kt-stage-side"}`}>
          <canvas ref={canvas} />
          {TAG_DIMS.map((k) => (
            <span
              key={k}
              ref={(el) => sceneRef.current && (sceneRef.current.tags[k] = el)}
              className={`kt-tag kt-tag-${dimState[k]}${D.pinned === k ? " kt-tag-pinned" : ""}${focus === k ? " kt-tag-focus" : focus ? " kt-tag-faded" : ""}${moved.current[k] && now - moved.current[k]! < 900 ? " kt-tag-moved" : ""}`}
              onPointerDown={onTagDown(k)}
              onPointerMove={onTagMove}
              onPointerUp={onTagUp}
              onPointerCancel={onTagUp}
              onPointerEnter={() => setHover(k)}
              onPointerLeave={() => setHover((h) => (h === k ? null : h))}
            >
              <em>{SPEC[k].short}</em>
              {fmtDim(k, D.dims[k], units)}
              <button className="kt-tag-lock" onClick={() => toggleLock(k)} aria-label={`${D.locks.has(k) ? "Unlock" : "Lock"} ${SPEC[k].label}`}>
                <Lock on={D.locks.has(k)} />
              </button>
            </span>
          ))}
          <div className={`kt-badge${ok ? "" : " kt-badge-bad"}`}>
            <i />
            {solving ? "Solving" : ok ? passLabel : "Model check failed"}
          </div>
          <button className={`kt-help-btn${guide !== null ? " kt-help-on" : ""}`} onClick={() => setGuide(guide === null ? 0 : null)} aria-label="How to use this">
            ?
          </button>
          {pouring && (
            <div className="kt-pourstats">
              In cup <b>{fmtVol(stats!.cup, units)}</b> · spilled <b className={stats!.spilled > 0.05 ? "kt-warm" : ""}>{fmtVol(stats!.spilled, units)}</b> · <b>{stats!.t.toFixed(1)} s</b>
            </div>
          )}
          {stats?.phase === "done" && !focus && guide === null && (
            <div className="kt-pourstats">
              Poured <b>{fmtVol(stats.cup, units)}</b> into the cup · spilled <b className={stats.spilled > 0.05 ? "kt-warm" : ""}>{fmtVol(stats.spilled, units)}</b>
            </div>
          )}
          {guide !== null && (
            <Guide
              step={guide}
              onStep={setGuide}
              onFocus={setGuideFocus}
              onTilt={setTilt}
              onView={setView}
            />
          )}
        </div>
        {/* what the dimension in focus does; a fixed strip under the drawing, so nothing on it gets covered */}
        <div className={`kt-inspect${focus ? " kt-inspect-on" : ""}`} aria-live="polite">
          {focus ? (
            <div key={focus} className="kt-inspect-body">
              <b>
                {SPEC[focus].label} <span>{fmtDim(focus, D.dims[focus], units)}{D.locks.has(focus) ? " · locked" : ""}</span>
              </b>
              <p>{SPEC[focus].effect}</p>
            </div>
          ) : (
            <div key="idle" className="kt-inspect-body">
              <b>
                {view === "side" ? "Side elevation" : "3D view"}{" "}
                <span>
                  {view === "side" ? `${units === "in" ? "grid 1″" : "grid 2.54 cm"} · dashed: kettle ${preview > 0.5 ? "standing" : "tipped"}` : "drag to look around"}
                </span>
              </b>
              <p>Hover or drag a dimension to see what it changes.</p>
            </div>
          )}
        </div>
        <div className="ha-controls kt-controls">
          <button className={`ha-pill${view === "side" ? " ha-pill-active" : ""}`} onClick={() => setView("side")}>Side</button>
          <button className={`ha-pill${view === "3d" ? " ha-pill-active" : ""}`} onClick={() => setView("3d")}>3D</button>
          <span className="kt-sep" />
          <span className="ha-range-label kt-tilt-label">Tilt</span>
          <input
            className="ha-range kt-tilt"
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={preview}
            aria-label="Tilt shown"
            disabled={pouring}
            onChange={(e) => setTilt(+e.target.value)}
          />
          <span className="ha-readout kt-tilt-read">
            <b>{shownTilt.toFixed(1)}°</b> / {D.dims.tilt.toFixed(1)}°
          </span>
          <button
            className="ha-pill kt-pour"
            onClick={() => {
              if (sceneRef.current?.pouring) sceneRef.current.stopPour();
              else sceneRef.current?.pour();
            }}
          >
            {pouring ? "Stop" : "Pour"}
          </button>
          {[1, 4, 10].map((n) => (
            <button key={n} className={`ha-pill${speed === n ? " ha-pill-active" : ""}`} onClick={() => setSpeed(n)}>
              {n}×
            </button>
          ))}
          <span className="kt-sep" />
          <button className={`ha-pill${units === "in" ? " ha-pill-active" : ""}`} onClick={() => setUnits("in")}>in</button>
          <button className={`ha-pill${units === "cm" ? " ha-pill-active" : ""}`} onClick={() => setUnits("cm")}>cm</button>
          {view === "3d" && <button className="ha-pill" onClick={() => sceneRef.current?.refit()}>Fit</button>}
        </div>
      </div>

      <div className="kt-panel">
        <div className={`kt-status${ok ? "" : " kt-status-bad"}`}>
          {ok ? (
            <>
              <b>{solving ? "Checking dimensions…" : passLabel}</b>
              <span>
                The simulated stream clears the rim by {fmtLen(Math.min(-a.over, -a.under), units)} at its
                closest, on top of a {fmtLen(0.15, units)} splash margin.
              </span>
            </>
          ) : (
            <>
              <b>{diag?.allLocked ? "Everything is locked" : "Design fails the model checks"}</b>
              <ul>
                {failing.map((k) => (
                  <li key={k}>{failText(k, a, units)}</li>
                ))}
              </ul>
              {diag && !diag.searched && !solving && <span className="kt-dim">Checking which locks are in the way…</span>}
              {diag?.searched && diag.fixes.length > 0 && (
                <div className="kt-fixes">
                  <span className="kt-dim">{diag.fixes[0].keys.length > 1 ? "Unlock a pair:" : "Unlock any one of these:"}</span>
                  {diag.fixes.map((f) => (
                    <button
                      key={f.keys.join()}
                      className="kt-fix"
                      onClick={() => unlockFix(f.keys)}
                      onPointerEnter={() => setHover(f.keys[0])}
                      onPointerLeave={() => setHover(null)}
                    >
                      {f.keys.map((k) => `${SPEC[k].label}${D.pinned === k ? " (just set)" : ""} → ${fmtDim(k, f.to[k]!, units)}`).join(" + ")}
                    </button>
                  ))}
                </div>
              )}
              {diag?.searched && diag.fixes.length === 0 && (
                <span className="kt-dim">
                  The solver found no adjustment among the locks it tried. Try a smaller pour, a different value for the
                  dimension you just set, or turn off a check below.
                </span>
              )}
            </>
          )}
        </div>

        <div className="kt-head">
          <span>Dimensions</span>
          <span className="kt-head-actions">
            <button disabled={!D.canUndo} title="Undo (⌘/Ctrl+Z)" onClick={() => navigate("undo")}>Undo</button>
            <button disabled={!D.canRedo} title="Redo (⌘/Ctrl+Shift+Z or Ctrl+Y)" onClick={() => navigate("redo")}>Redo</button>
            <button title="Restore the starting design, locks and pour settings (Shift+R)" onClick={() => navigate("reset")}>Reset</button>
            <button
              onClick={() => {
                D.setAll(DEFAULTS);
                sceneRef.current?.resetWater();
                rerender();
              }}
            >
              Solve from sketch
            </button>
            <button
              onClick={() => {
                const all = DIMS.every((s) => D.locks.has(s.key));
                D.setLocks(DIMS.map(s => s.key), !all);
                rerender();
              }}
            >
              {DIMS.every((s) => D.locks.has(s.key)) ? "Unlock all" : "Lock all"}
            </button>
          </span>
        </div>
        <div className="kt-rows">
          {DIMS.map((s) => {
            const k = s.key;
            const locked = D.locks.has(k);
            const st = dimState[k];
            const lo = toDisp(k, s.min, units), hi = toDisp(k, s.max, units);
            return (
              <div
                key={k}
                className={`kt-row${locked ? " kt-row-locked" : ""}${st === "bad" ? " kt-row-bad" : ""}${focus === k ? " kt-row-focus" : ""}${moved.current[k] && now - moved.current[k]! < 900 ? " kt-row-moved" : ""}`}
                onPointerEnter={() => setHover(k)}
                onPointerLeave={() => setHover((h) => (h === k ? null : h))}
              >
                <button className="kt-lock" onClick={() => toggleLock(k)} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${s.label}`}>
                  <Lock on={locked} />
                </button>
                <span className="kt-label" title={`${s.hint}. ${s.effect}`}>
                  {s.label}
                  {sketchKeys.includes(k) && <i title={`Sketch: ${fmtDim(k, SKETCH[k]!, units)}`}>·</i>}
                </span>
                <input
                  className="ha-range kt-range"
                  type="range"
                  min={lo}
                  max={hi}
                  step={stepOf(k, units)}
                  value={toDisp(k, D.dims[k], units)}
                  aria-label={s.label}
                  {...sliderEvents}
                  onChange={(e) => setValue(k, fromDisp(k, +e.target.value, units))}
                />
                <NumberField k={k} value={D.dims[k]} units={units} onCommit={(v) => setValue(k, v)} />
                <span className="kt-unit">{s.angle ? "°" : units === "in" ? "in" : "cm"}</span>
              </div>
            );
          })}
        </div>
        <p className="kt-help">
          Hover a dimension to see what it changes. Locked dimensions hold still; the rest move to keep the water in the cup. The one
          you set last holds still too, until you set another.
        </p>

        <div className="kt-head">
          <span>Pour</span>
        </div>
        <div className="kt-rows">
          <div className="kt-row kt-row-plain">
            <span className="kt-label" title="How much leaves the kettle each time it tips to the tipping angle">Pour size</span>
            <input
              className="ha-range kt-range"
              type="range"
              min={2}
              max={24}
              step={0.5}
              value={sc.pour / IN3_PER_FLOZ}
              onChange={(e) => updateSc({ ...sc, pour: +e.target.value * IN3_PER_FLOZ })}
              {...sliderEvents}
            />
            <span className="kt-val">{fmtVol(sc.pour, units)}</span>
          </div>
          <div className="kt-row kt-row-plain">
            <span className="kt-label" title="How fast the kettle tips over. The stream sweeps across the cup while it does.">Tipping speed</span>
            <input
              className="ha-range kt-range"
              type="range"
              min={5}
              max={90}
              step={1}
              value={sc.tiltSpeed}
              onChange={(e) => updateSc({ ...sc, tiltSpeed: +e.target.value })}
              {...sliderEvents}
            />
            <span className="kt-val">{sc.tiltSpeed}°/s</span>
          </div>
          <label className="kt-check">
            <input type="checkbox" checked={sc.centered} onChange={(e) => updateSc({ ...sc, centered: e.target.checked })} />
            <span>Keep the stream centred in the cup</span>
          </label>
        </div>

      </div>
      <div className="kt-bottom">
        <div className="kt-card">
            <div className="kt-head">
              <span>Checks</span>
            </div>
            <div className="kt-checks">
              {CHECKS.map((c) => {
                const on = enabled(sc, c.key);
                const pass = a.checks[c.key] <= TOL;
                return (
                  <label key={c.key} className={`kt-checkrow${on ? "" : " kt-off"}`} title={c.hint}>
                    <i className={on ? (pass ? "kt-dot-ok" : "kt-dot-bad") : "kt-dot-off"} />
                    <span>{c.label}</span>
                    {c.core ? (
                      <em>always</em>
                    ) : (
                      <input
                        type="checkbox"
                        checked={sc.checks[c.key]}
                        onChange={(e) => updateSc({ ...sc, checks: { ...sc.checks, [c.key]: e.target.checked } })}
                        aria-label={`Check: ${c.label}`}
                      />
                    )}
                  </label>
                );
              })}
            </div>

        </div>
        <div className="kt-card">
            <div className="kt-head">
              <span>Readouts</span>
            </div>
            <dl className="kt-readouts">
              <dt>Simulated discharge</dt>
              <dd>{fmtVol(a.poured, units)}</dd>
              <dt>Kettle height</dt>
              <dd>{fmtLen(a.g.Hk, units)}</dd>
              <dt>Kettle holds</dt>
              <dd>{fmtVol(a.g.vol, units)}</dd>
              <dt>Fill it with</dt>
              <dd>
                {fmtVol(a.fillVol, units)} <span>({Math.round((a.fillVol / a.g.vol) * 100)}%)</span>
              </dd>
              <dt>Starts pouring at</dt>
              <dd>{thStart === null ? "—" : `${thStart.toFixed(1)}°`}</dd>
              <dt>Exit speed, peak</dt>
              <dd>{fmtSpeed(a.vMax, units)}</dd>
              <dt>Flow, peak</dt>
              <dd>{fmtRate(a.Qmax, units)}</dd>
              <dt>Time to pour 95%</dt>
              <dd>{a.pourTime > 0 ? `~${a.pourTime.toFixed(1)} s` : "—"}</dd>
              <dt>Stream lands across</dt>
              <dd>{fmtLen(Math.max(0, a.hi - a.lo), units)}</dd>
              <dt>Cup holds</dt>
              <dd>{fmtVol(a.cap, units)}</dd>
            </dl>
        </div>
      </div>
    </div>
  );
}
