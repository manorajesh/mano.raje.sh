import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BASE, CityScene, COLORS, Entry, STAIR_HUES, View, fmt } from "../components/city-steps/scene";

// Walks around a hillside neighborhood, scanned with a SICK LMS200 lidar and an
// Insta360 X3, replayed in 3D. The page opens on a plate of every flight of steps;
// each opens on its own, and the whole walks sit behind "Walks". The chrome is the
// portfolio's (ph-*) in a dark palette.

const VIEWS: { id: View; label: string }[] = [
  { id: "orbit", label: "Orbit" },
  { id: "chase", label: "Chase" },
  { id: "eye", label: "First person" },
  { id: "map", label: "Map" },
  { id: "video", label: "360 video" },
];
const SIZES = [
  { label: "S", value: 0.025 },
  { label: "M", value: 0.045 },
  { label: "L", value: 0.07 },
  { label: "XL", value: 0.1 },
];
const SPEEDS = [1, 2, 4, 8];
const LEGENDS: Record<number, string> = {
  1: "linear-gradient(90deg,#30123b,#4686fb,#1ae4b6,#a2fc3c,#fabb39,#e4460a,#7a0403)",
  2: "linear-gradient(90deg,#0f3360,#3d9e9e,#dbcc85,#fff8eb)",
  3: "linear-gradient(90deg,#fcffa4,#f98e09,#bc3754,#57106e,#0e0b26)",
};
const HINTS: Record<View, string> = {
  orbit: "Drag to orbit · right-drag to pan · scroll to zoom",
  chase: "The camera follows the walk",
  eye: "Drag to look around · double-click to recenter",
  map: "Drag to pan · scroll to zoom",
  video: "The 360 video around the camera, with the lidar in place · drag to look around",
};

const STATS_KEY = "city-steps:stats";

const millions = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);

function CitySteps() {
  const [params, setParams] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const press = useRef<{ x: number; y: number; t: number } | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [cur, setCur] = useState<Entry | null>(null);
  const [loading, setLoading] = useState<{ text: string; fraction: number; error?: boolean } | null>({ text: "Loading walks", fraction: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [color, setColor] = useState(0);
  const [view, setView] = useState<View>("orbit");
  const [live, setLive] = useState(false);
  const [dense, setDense] = useState(false);
  const [size, setSize] = useState(1);
  const [stair, setStair] = useState(0);
  const [videoMix, setVideoMix] = useState(0.85);
  const [note, setNote] = useState("");
  const [turned, setTurned] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hintShown, setHintShown] = useState(true);
  // Stats for nerds: rise, run, point counts, color modes. Off by default; the choice is remembered.
  const [stats, setStats] = useState(() => {
    try {
      return localStorage.getItem(STATS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleStats = useCallback(() => {
    setStats((on) => {
      try {
        if (on) localStorage.removeItem(STATS_KEY);
        else localStorage.setItem(STATS_KEY, "1");
      } catch {}
      return !on;
    });
  }, []);

  // No ?walk shows the plate of flights; ?walk=<id> opens a walk or a single flight.
  const walkId = params.get("walk");
  const plate = !walkId;
  const walks = useMemo(() => entries.filter((e) => e.kind === "walk"), [entries]);
  const flights = useMemo(() => entries.filter((e) => e.kind === "stairs"), [entries]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  useEffect(() => {
    const title = document.title;
    document.title = "pgh city steps — mano";
    return () => {
      document.title = title;
    };
  }, []);

  // The scene lives as long as the page.
  useEffect(() => {
    const label = { current: "" };
    const scene = new CityScene(canvasRef.current!, {
      loading: (text, fraction) => {
        if (text) label.current = text;
        setLoading(fraction >= 1 ? null : { text: label.current, fraction });
      },
      playing: setPlaying,
      color: setColor,
      turned: setTurned,
      note: setNote,
    });
    sceneRef.current = scene;
    scene
      .loadIndex()
      .then(setEntries)
      .catch((err: Error) => setLoading({ text: `${err.message}. Reload to try again.`, fraction: 0, error: true }));
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !entries.length || !walkId) return;
    const entry = byId.get(walkId) ?? walks[0];
    if (scene.cur === entry) return;
    setStair(0);
    scene
      .select(entry)
      .then(() => setCur(entry))
      .catch((err: Error) => setLoading({ text: `${err.message}. Reload to try again.`, fraction: 0, error: true }));
  }, [walkId, entries, byId, walks]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !flights.length) return;
    if (plate) {
      scene.showStairs(flights.map((entry, i) => ({ entry, el: cellRefs.current[i]! }))).catch((err: Error) =>
        setLoading({ text: `${err.message}. Reload to try again.`, fraction: 0, error: true })
      );
    } else scene.showViewer();
  }, [plate, flights]);

  useEffect(() => {
    setHintShown(true);
    const id = window.setTimeout(() => setHintShown(false), 7000);
    return () => window.clearTimeout(id);
  }, [view, plate]);

  const openWalk = useCallback((id: string) => setParams({ walk: id }), [setParams]);
  const openPlate = useCallback(() => setParams({}), [setParams]);
  // Walks reopens the last whole walk seen, or the first.
  const lastWalk = useRef("");
  if (cur?.kind === "walk") lastWalk.current = cur.id;
  const openWalks = useCallback(() => openWalk(lastWalk.current || walks[0]?.id), [openWalk, walks]);

  const s = sceneRef.current;
  const changeView = useCallback((v: View) => { sceneRef.current?.setView(v); setView(v); }, []);
  const changeColor = useCallback((c: number) => sceneRef.current?.setColor(c), []);
  const changeDense = useCallback((on: boolean) => {
    setDense(on);
    sceneRef.current?.setDense(on).catch((err: Error) => setLoading({ text: `${err.message}. Reload to try again.`, fraction: 0, error: true }));
  }, []);
  const togglePlay = useCallback(() => {
    const scene = sceneRef.current;
    if (scene) scene.setPlaying(!scene.playing);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const scene = sceneRef.current;
      if (!scene) return;
      if (plate) return;
      if (e.key === "Escape") return openPlate();
      if (e.target instanceof HTMLInputElement && e.key !== " ") return;
      if (e.key === " ") togglePlay();
      else if (e.key === "ArrowRight") scene.setTime(scene.t + 5);
      else if (e.key === "ArrowLeft") scene.setTime(scene.t - 5);
      else if (e.key === "c" || e.key === "C") changeColor((scene.color + 1) % (scene.cur?.kind === "walk" ? 6 : 5));
      else if (e.key === "v" || e.key === "V") changeView(VIEWS[(VIEWS.findIndex((v) => v.id === scene.view) + 1) % VIEWS.length].id);
      else if (e.key === "d" || e.key === "D") changeDense(!scene.dense);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plate, openPlate, togglePlay, changeColor, changeView, changeDense]);

  // Readouts the scene updates every frame.
  const readout = (key: "time" | "elevation" | "scans") => (el: HTMLElement | null) => {
    if (sceneRef.current) sceneRef.current.readouts[key] = el;
  };
  const scrubRef = useCallback((el: HTMLInputElement | null) => {
    if (sceneRef.current) sceneRef.current.readouts.scrub = el;
  }, []);
  const profileRef = useCallback((el: HTMLCanvasElement | null) => {
    if (sceneRef.current) {
      sceneRef.current.readouts.profile = el;
      sceneRef.current.drawProfile();
    }
  }, []);

  const parent = cur?.parent ? byId.get(cur.parent) : null;
  const isolated = cur?.kind === "walk" && stair ? cur.stairs?.[stair - 1] : null;
  const flightFacts = (e: { rise_m?: number; run_m?: number; steps_est?: number; slope_deg?: number }) =>
    `${e.rise_m} m rise over ${e.run_m} m · ~${e.steps_est} steps · ${e.slope_deg}°`;
  const elev = s?.elevationLegend() ?? [0, 1];
  const legendEnds: Record<number, [string, string]> = {
    1: ["0:00", cur ? fmt(cur.duration, false) : ""],
    2: [`${elev[0].toFixed(1)} m`, `${elev[1].toFixed(1)} m`],
    3: ["0 m", "25 m+"],
  };
  // Five flights sit three over two, the short row centered.
  const lastRow = flights.length % 3;

  return (
    <div
      className={`ph-root cs-root${plate ? " cs-plate" : ""}${loading ? " cs-busy" : ""}${stats ? "" : " cs-stats-off"}`}
      style={{ "--cs-map": `url(${BASE}pittsburgh.webp)` } as React.CSSProperties}
    >
      <canvas ref={canvasRef} className="cs-canvas" aria-label="3D point cloud" />
      <a className="cs-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        Map data © OpenStreetMap contributors
      </a>

      <nav className="ph-top">
        <button className="ph-box ph-brand" onClick={openPlate}>
          <span className="cs-pgh">pgh</span>city steps
        </button>
        {flights.length > 0 && (
          <button className={`ph-box${plate || cur?.kind === "stairs" ? " ph-box-active" : ""}`} onClick={openPlate}>
            Steps
            <sup>{flights.length}</sup>
          </button>
        )}
        {!plate && cur?.kind === "stairs" && (
          <span className="ph-box ph-box-active cs-box-static">
            {cur.name}
            <sup>{parent?.name}</sup>
          </span>
        )}
        {walks.length > 0 && (
          <button className={`ph-box${!plate && cur?.kind === "walk" ? " ph-box-active" : ""}`} onClick={openWalks}>
            Walks
            <sup>{walks.length}</sup>
          </button>
        )}
        {!plate &&
          cur?.kind === "walk" &&
          walks.map((w) => (
            <button key={w.id} className={`ph-box${cur.id === w.id ? " ph-box-active" : ""}`} onClick={() => openWalk(w.id)}>
              {w.name}
              <sup>{fmt(w.duration, false)}</sup>
            </button>
          ))}
      </nav>

      <div className="cs-readouts" aria-label="Readouts">
        <div className="cs-collapse" aria-hidden={!stats}>
          <div className="cs-clip">
          <div className="cs-stat-row">
          {!plate && cur && (cur.kind === "walk" ? (
            <>
              <span className="ph-box ph-box-small cs-box-static">
                Points <b>{cur.count.toLocaleString()}</b>
              </span>
              <span className="ph-box ph-box-small cs-box-static">
                Walked <b>{Math.round(cur.distance_m)} m</b>
              </span>
              <span className="ph-box ph-box-small cs-box-static">
                Elevation <b ref={readout("elevation")}>–</b>
              </span>
              <span className="ph-box ph-box-small cs-box-static">
                Scans <b ref={readout("scans")}>–</b>
              </span>
            </>
          ) : (
            <>
              <span className="ph-box ph-box-small cs-box-static">Rise <b>{cur.rise_m} m</b></span>
              <span className="ph-box ph-box-small cs-box-static">Run <b>{cur.run_m} m</b></span>
              <span className="ph-box ph-box-small cs-box-static">Steps <b>~{cur.steps_est}</b></span>
              <span className="ph-box ph-box-small cs-box-static">Slope <b>{cur.slope_deg}°</b></span>
            </>
          ))}
          </div>
          </div>
        </div>
        <button
          className={`ph-box ph-box-small cs-eye${stats ? " ph-box-active" : ""}`}
          aria-pressed={stats}
          aria-label="Stats for nerds"
          title={stats ? "Hide stats for nerds" : "Stats for nerds"}
          onClick={toggleStats}
        >
          <svg viewBox="0 0 20 14" aria-hidden="true">
            <path d="M1 7s3.2-5.5 9-5.5S19 7 19 7s-3.2 5.5-9 5.5S1 7 1 7z" />
            <circle cx="10" cy="7" r="2.4" />
            {!stats && <path d="M3 13 17 1" />}
          </svg>
        </button>
      </div>

      {plate ? (
        <>
          <div className="cs-grid">
            {flights.map((f, i) => (
              <button
                key={f.id}
                ref={(el) => (cellRefs.current[i] = el)}
                className="cs-cell"
                style={{
                  animationDelay: `${120 + i * 60}ms`,
                  gridColumn: lastRow && i === flights.length - lastRow ? `${4 - lastRow} / span 2` : undefined,
                }}
                aria-label={`${f.name}, open`}
                onPointerDown={(e) => (press.current = { x: e.clientX, y: e.clientY, t: performance.now() })}
                onPointerUp={(e) => {
                  const p = press.current;
                  press.current = null;
                  if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5 && performance.now() - p.t < 400) openWalk(f.id);
                }}
                onKeyDown={(e) => e.key === "Enter" && openWalk(f.id)}
              >
                <span className="cs-cell-name">
                  {f.name}
                  <sup>{byId.get(f.parent!)?.name}</sup>
                </span>
                <span className="cs-cell-meta" aria-hidden={!stats}>
                  {flightFacts(f)}
                </span>
              </button>
            ))}
          </div>
          <button className={`lt-reset${turned ? " lt-reset-shown" : ""}`} onClick={() => s?.resetStairs()} tabIndex={turned ? 0 : -1}>
            reset view
          </button>
          <div className="ph-hint">Drag to turn · click to open</div>
        </>
      ) : (
        cur && (
          <>
            <div className={`ph-hint cs-hint${hintShown ? "" : " cs-hint-hidden"}`}>{note || HINTS[view]}</div>

            {isolated && (
              <div className="ph-title cs-title" key={isolated.id}>
                <span>{cur.name}</span>
                {isolated.name}
                <em>
                  <span className="cs-collapse cs-collapse-inline" aria-hidden={!stats}>
                    <span className="cs-clip">{flightFacts(isolated)} · </span>
                  </span>
                  <button className="cs-link" onClick={() => openWalk(isolated.id)}>
                    open on its own
                  </button>
                </em>
              </div>
            )}

            {cur.kind === "walk" && (cur.stairs?.length ?? 0) > 0 && (
              <div className="cs-stairs">
                <span className="cs-label">Steps on this walk</span>
                {[{ id: "", name: "Whole walk" }, ...(cur.stairs ?? [])].map((st, k) => (
                  <button
                    key={st.id || "all"}
                    className={`ph-pill${stair === k ? " ph-pill-active" : ""}`}
                    onClick={() => {
                      setStair(k);
                      s?.selectStair(k);
                      if (k) setView("orbit");
                    }}
                  >
                    {k > 0 && <i className="cs-swatch" style={{ background: STAIR_HUES[(k - 1) % STAIR_HUES.length] }} />}
                    {st.name}
                  </button>
                ))}
              </div>
            )}

            <button className="ph-box ph-box-small cs-display" aria-expanded={controlsOpen} onClick={() => setControlsOpen((o) => !o)}>
              Display
            </button>
            <div className={`cs-controls${controlsOpen ? " cs-controls-open" : ""}`}>
              <div className="cs-collapse" aria-hidden={!stats}>
                <div className="cs-clip">
              <div className="cs-group cs-group-stats">
                <span className="cs-label">Points</span>
                <button className={`ph-pill${live ? " ph-pill-active" : ""}`} onClick={() => { s?.setLive(!live); setLive(!live); }}>
                  Live · 3 s
                </button>
                {cur.dense && (
                  <button className={`ph-pill${dense ? " ph-pill-active" : ""}`} onClick={() => changeDense(!dense)}>
                    Interpolated<sup>+{millions(cur.dense.count)}</sup>
                  </button>
                )}
                <button
                  className="ph-pill"
                  onClick={() => {
                    const next = (size + 1) % SIZES.length;
                    s?.setSize(SIZES[next].value);
                    setSize(next);
                  }}
                >
                  Size · {SIZES[size].label}
                </button>
              </div>
                </div>
              </div>
              <div className="cs-collapse" aria-hidden={!stats}>
                <div className="cs-clip">
              <div className="cs-group cs-group-stats">
                <span className="cs-label">Color</span>
                {COLORS.map((label, c) =>
                  c === 5 && cur.kind !== "walk" ? null : (
                    <button key={label} className={`ph-pill${color === c ? " ph-pill-active" : ""}`} onClick={() => changeColor(c)}>
                      {label}
                    </button>
                  )
                )}
                {LEGENDS[color] && (
                  <div className="cs-legend">
                    <i style={{ background: LEGENDS[color] }} />
                    <span>{legendEnds[color][0]}</span>
                    <span>{legendEnds[color][1]}</span>
                  </div>
                )}
              </div>
                </div>
              </div>
              <div className="cs-group">
                <span className="cs-label">Camera</span>
                {VIEWS.map((v) => (
                  <button key={v.id} className={`ph-pill${view === v.id ? " ph-pill-active" : ""}`} onClick={() => changeView(v.id)}>
                    {v.label}
                  </button>
                ))}
                {view === "video" && (
                  <label className="ph-pill cs-range">
                    Video
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={videoMix}
                      aria-label="Video brightness"
                      onChange={(e) => {
                        s?.setVideoMix(+e.target.value);
                        setVideoMix(+e.target.value);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="ph-bottom cs-transport">
              <button className="ph-box ph-box-small cs-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                <svg viewBox="0 0 14 14" aria-hidden="true">
                  {playing ? <path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" /> : <path d="M3 1.5v11l9.5-5.5z" />}
                </svg>
              </button>
              <span className="ph-box ph-box-small cs-box-static cs-clock">
                <b ref={readout("time")}>0:00.0</b> <span className="ph-of">/ {fmt(cur.duration, false)}</span>
              </span>
              <button
                className="ph-box ph-box-small"
                aria-label="Playback speed"
                onClick={() => {
                  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                  s?.setSpeed(next);
                  setSpeed(next);
                }}
              >
                {speed}×
              </button>
            </div>
            <div className="cs-timeline">
              <canvas ref={profileRef} />
              <input
                ref={scrubRef}
                type="range"
                min={0}
                max={cur.duration}
                step={0.01}
                defaultValue={cur.duration}
                aria-label="Timeline"
                onChange={(e) => s?.setTime(+e.target.value)}
              />
            </div>
          </>
        )
      )}

      {loading && (
        <div className={`cs-loading${loading.error ? " cs-loading-error" : ""}`}>
          <p>{loading.text}</p>
          {!loading.error && (
            <span>
              <i style={{ width: `${Math.round(loading.fraction * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default CitySteps;
