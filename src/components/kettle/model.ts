// The pour, as physics. Everything is in inches, seconds and degrees (internally radians).
//
// Side view, x toward the kettle, y up, floor at y = 0. The kettle stands on a base whose
// front top edge is the pivot; the spout leaves the kettle at that corner and the kettle tips
// forward about it, so the spout tip swings on a circle (the arc in the sketch).
//
// For a given tilt and amount of water:
//   - the water surface stays level, so its height comes from the volume of a tilted
//     truncated cone below a plane (integrated in slices, solved for the height);
//   - water reaches the outlet once the surface clears the spout's highest point (the crest
//     of a gooseneck);
//   - exit speed comes from the head above the outlet with losses in the spout
//     (Bernoulli with entry, bend and Darcy friction losses, friction factor from Reynolds);
//   - the jet then falls ballistically (air drag is negligible over a foot) and thins as it
//     speeds up;
//   - the kettle tips at a finite rate and keeps draining while it does, so the stream sweeps
//     from where it first appears to where the kettle stops, then falls back to a drip at the
//     lip as the kettle empties to the crest.
// Every landing point in that sweep, widened by the jet and a splash margin, has to be inside
// the rim.

export type DimKey = "baseH" | "cupH" | "cupDist" | "spoutL" | "reach" | "tilt" | "bend" | "cupD" | "kettleW" | "bore";
export type Dims = Record<DimKey, number>;
export type DimSpec = {
  key: DimKey; label: string; short: string; angle?: boolean; min: number; max: number; cost: number; unit?: number;
  hint: string; // what it measures
  effect: string; // what changing it does
};

// cost: how reluctant the solver is to move a dimension, per `unit` (1″ or 10° unless given).
export const DIMS: DimSpec[] = [
  { key: "baseH", label: "Base height", short: "Base", min: 0, max: 24, cost: 1, hint: "Floor to the top of the base, where the kettle pivots", effect: "Raises the pivot, the kettle and the tip. The stream falls further, so it lands a little further out." },
  { key: "cupH", label: "Cup height", short: "Cup", min: 2, max: 8, cost: 2, hint: "Floor to the cup's rim", effect: "Raises the rim. The stream has to clear it and is caught sooner, a little closer to the kettle." },
  { key: "cupDist", label: "Cup distance", short: "Cup to base", min: 1, max: 36, cost: 1, hint: "Cup's centre to the front of the base", effect: "Moves the cup. The tip has to swing further to be over it, so the kettle tips more." },
  { key: "spoutL", label: "Spout length", short: "Spout", min: 4, max: 30, cost: 1.2, hint: "Pivot to spout tip in a straight line, the radius the tip swings on", effect: "The radius the tip swings on. Longer reaches a further cup at less tilt, and changes the outlet height." },
  { key: "reach", label: "Spout reach", short: "Reach", min: 0.5, max: 24, cost: 1.2, hint: "Spout tip to the kettle's top front edge, measured across", effect: "How far the tip stands ahead of the kettle. With the spout length it sets the outlet height and where the tip starts." },
  { key: "tilt", label: "Tipping angle", short: "Tipping", angle: true, min: 0, max: 50, cost: 0.5, hint: "How far the kettle tips forward from level, about the front edge of the base", effect: "How far the kettle tips before it stops. More tilt lowers the tip, moves it further out, and pours with less water in the kettle." },
  { key: "bend", label: "Tip bend", short: "Bend", angle: true, min: 15, max: 75, cost: 0.7, hint: "Downward angle of the outlet from horizontal with the kettle upright", effect: "How far the end of the spout turns down. More bend aims the stream down instead of out." },
  { key: "cupD", label: "Cup mouth", short: "Mouth", min: 1.5, max: 6, cost: 2, unit: 0.5, hint: "Inside diameter at the rim", effect: "The opening the stream has to land in. Wider is more forgiving and holds more." },
  { key: "kettleW", label: "Kettle width", short: "Width", min: 3, max: 14, cost: 1.5, hint: "Kettle's diameter at the bottom; the base matches it", effect: "Width of the kettle and its base. Wider holds more and keeps the level steadier while it pours." },
  { key: "bore", label: "Spout bore", short: "Bore", min: 0.2, max: 1.25, cost: 1.5, unit: 0.1, hint: "Inside diameter of the spout", effect: "Inside diameter of the spout. Wider pours faster and throws the stream further." },
];
export const SPEC = Object.fromEntries(DIMS.map((s) => [s.key, s])) as Record<DimKey, DimSpec>;
export const UNIT = (k: DimKey) => SPEC[k].unit ?? (SPEC[k].angle ? 10 : 1);

// The five numbers on the sketch; the other starting values are estimates. All ten are validated together.
export const SKETCH: Partial<Dims> = { baseH: 5, cupH: 4, cupDist: 10.5, spoutL: 18, reach: 8 };
export const DEFAULTS: Dims = {
  baseH: 12, cupH: 4, cupDist: 11, spoutL: 10, reach: 10.8,
  tilt: 48, bend: 32, cupD: 5.9, kettleW: 6.2, bore: 0.5,
};

export type CheckKey = "neck" | "drain" | "delivery" | "fit" | "room" | "stream" | "clear" | "drip" | "holds" | "rest" | "lid";
export const CHECKS: { key: CheckKey; label: string; core?: boolean; hint: string }[] = [
  { key: "stream", label: "Stream lands in the cup", core: true, hint: "The simulated jet and drip landing points, plus the jet's width and a splash margin, is inside the rim" },
  { key: "neck", label: "Upright gooseneck", core: true, hint: "The neck rises above the outlet and turns down at the lip" },
  { key: "drain", label: "Gravity-drains at the stop", core: true, hint: "The flush inlet and entire neck must drain downhill at the selected stop, at or below 50°" },
  { key: "delivery", label: "Delivers the requested volume", core: true, hint: "The selected fill drains to the numerical cutoff of 0.01 mL" },
  { key: "room", label: "Holds 32 US fl oz upright", core: true, hint: "Rated fill fits below the lid with headspace" },
  { key: "fit", label: "Parts fit", core: true, hint: "The cup sits clear of the base and the tip is ahead of the kettle" },
  { key: "clear", label: "Spout clears the cup", hint: "The spout and kettle keep 0.3″ above the rim the whole way down" },
  { key: "drip", label: "Lip points down at the stop", hint: "Screens for at least 10° of downward tilt. Actual drip separation also depends on edge shape and surface finish." },
  { key: "holds", label: "Cup holds the pour", hint: "The pour fits below a fill line 0.3″ under the rim" },
  { key: "rest", label: "No overflow at full upright fill", core: true, hint: "Standing level, the water stays 0.25″ below the spout's crest" },
  { key: "lid", label: "Lid stays dry", hint: "Tipped, the water stays below the lid opening" },
];

// pour is the starting charge in cubic inches, up to the rated working capacity.
export type Scenario = { pour: number; tiltSpeed: number; centered: boolean; checks: Record<CheckKey, boolean> };
export const IN3_PER_FLOZ = 1.8046875;
export const RATED_FILL = 32 * IN3_PER_FLOZ;
export const DEFAULT_SCENARIO: Scenario = {
  pour: RATED_FILL,
  tiltSpeed: 20,
  centered: true,
  checks: { neck: true, drain: true, delivery: true, fit: true, room: true, stream: true, clear: true, drip: true, holds: true, rest: true, lid: true },
};

export const G = 386.09; // in/s²
export const NU = 5.3e-4; // in²/s, water near 85 °C (0.34 mm²/s)
export const TOP = 0.55; // kettle top diameter / bottom diameter
export const CUP_WALL = 0.2;
export const CUP_FLOOR = 0.3;
export const CUP_TAPER = 0.86; // bottom inside radius / rim inside radius
export const FILL_LINE = 0.3; // a full cup stops this far under the rim
export const SPOUT_WALL = 0.07;
const KE = 0.5; // entry loss where the spout leaves the kettle
const CLEAR = 0.3;
export const SPLASH = 0.15;
export const DRIP_R = 0.09; // a falling drip, about 4.5 mm across
const DRIP_DEG = 10;

export const NS = 25; // samples along the spout
export const D2R = Math.PI / 180;
export const ML_PER_IN3 = 16.3871;
const TRACE = 0.01 / ML_PER_IN3; // numerical endpoint, 0.01 mL

export type Geo = {
  rb: number; rt: number; xt: number; hz: number; Hk: number; L: number;
  phi0: number; e: number; tipX: number; tipY: number;
  sx: Float64Array; sy: Float64Array; cum: Float64Array; // spout centreline samples, length along it
  bore: number;
  lead: number; // length of the spout inside the kettle wall, before the first sample
  len: number; bendTot: number; vol: number; K0: number;
  ctrl: number[]; // bezier control points (inlet inside the kettle, out to the tip), for drawing
};

export const KETTLE_WALL = 0.06; // sheet thickness of the kettle, sides and floor

/** Outer front wall of the kettle at height y (kettle frame). */
export const wallX = (g: { xt: number; Hk: number }, y: number) => (g.xt * y) / g.Hk;

/** The kettle in its own frame: pivot at the origin, x toward the kettle, y up, standing level. */
export function geometry(d: Dims): Geo {
  const rb = d.kettleW / 2, rt = rb * TOP, xt = rb - rt;
  const hz = Math.max(d.reach - xt, 0.05);
  const tipY = Math.sqrt(Math.max(d.spoutL * d.spoutL - hz * hz, 0.25));
  const L = Math.hypot(hz, tipY);
  const phi0 = Math.atan2(tipY, hz);
  const b = d.bend * D2R;
  const e = -b;
  // Body height gives the rated charge 25% nominal headspace. Solve using
  // the actual inner frustum, including sheet thickness and the raised floor.
  let low = KETTLE_WALL, high = 80;
  for (let i = 0; i < 28; i++) {
    const height = (low + high) / 2;
    const vol = volBelow({ rb, rt, Hk: height } as Geo, 0, 1, height);
    if (vol < RATED_FILL / 0.75) low = height;
    else high = height;
  }
  const Hk = (low + high) / 2;
  // Flush drain through the front wall, with a horizontal inlet tangent.
  // Monotone outward reach keeps the curve single-valued even at large bends.
  const y0 = KETTLE_WALL + d.bore / 2;
  const x0 = wallX({ xt, Hk }, KETTLE_WALL) + KETTLE_WALL;
  const tipX = -hz, run = x0 - tipX;
  const p1x = x0 - run / 3, p1y = y0;
  const handle = Math.min(run / 3, 0.3 * L);
  const p2x = tipX + handle * Math.cos(e), p2y = tipY - handle * Math.sin(e);
  // sample finely, keep the part outside the wall as the spout proper
  const FINE = 200;
  const fx: number[] = [], fy: number[] = [];
  for (let i = 0; i <= FINE; i++) {
    const t = i / FINE, u = 1 - t;
    fx.push(u * u * u * x0 + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * tipX);
    fy.push(u * u * u * y0 + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * tipY);
  }
  let i0 = 0;
  while (i0 < FINE - 1 && fx[i0] > wallX({ xt, Hk }, fy[i0])) i0++;
  let lead = 0;
  for (let i = 1; i <= i0; i++) lead += Math.hypot(fx[i] - fx[i - 1], fy[i] - fy[i - 1]);
  const sx = new Float64Array(NS), sy = new Float64Array(NS), cum = new Float64Array(NS);
  let len = 0;
  for (let k = 0; k < NS; k++) {
    const f = i0 + ((FINE - i0) * k) / (NS - 1);
    const j = Math.min(Math.floor(f), FINE - 1), w = f - j;
    sx[k] = fx[j] * (1 - w) + fx[j + 1] * w;
    sy[k] = fy[j] * (1 - w) + fy[j + 1] * w;
    if (k) len += Math.hypot(sx[k] - sx[k - 1], sy[k] - sy[k - 1]);
    cum[k] = len;
  }
  len += lead;
  let bendTot = 0, previous = 0;
  for (let i = 1; i < fx.length; i++) {
    const tangent = Math.atan2(fy[i] - fy[i - 1], fx[i - 1] - fx[i]);
    bendTot += Math.abs(tangent - previous);
    previous = tangent;
  }
  const g0 = { rb, rt, xt, Hk };
  const K0 = 1 + KE + 0.25 * (bendTot / (Math.PI / 2));
  const geo: Geo = {
    rb, rt, xt, hz, Hk, L, phi0, e, tipX, tipY, sx, sy, cum, lead, len, bendTot, bore: d.bore, vol: 0, K0,
    ctrl: [x0, y0, p1x, p1y, p2x, p2y, tipX, tipY],
  };
  geo.vol = volBelow({ ...g0 } as Geo, 0, 1, 1e6);
  return geo;
}

function segArea(r: number, u: number) {
  if (u >= r) return Math.PI * r * r;
  if (u <= -r) return 0;
  return r * r * (Math.PI - Math.acos(u / r)) + u * Math.sqrt(r * r - u * u);
}

/**
 * Water volume below height h (above the pivot) with the kettle tipped by sin/cos of the tilt.
 * Inside the walls: slices of a truncated cone from the floor up, each a disc cut by the level.
 */
export function volBelow(g: Geo, sn: number, cs: number, h: number) {
  const slope = (g.rb - g.rt) / g.Hk;
  const radius = (y: number) => g.rb - slope * y - KETTLE_WALL;
  // Split at the two intersections of the free surface with the frustum.
  // This also resolves very thin wetted slices near upright.
  const cuts = [KETTLE_WALL, g.Hk];
  for (const side of [-1, 1]) {
    const y = (h - sn * (g.rb + side * (g.rb - KETTLE_WALL))) / (cs - side * sn * slope);
    if (y > KETTLE_WALL && y < g.Hk) cuts.push(y);
  }
  cuts.sort((a, b) => a - b);
  let volume = 0;
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1], high = cuts[i], mid = (low + high) / 2;
    const offset = h - mid * cs - g.rb * sn;
    if (offset >= radius(mid) * sn) {
      const r = radius(low), R = radius(high);
      volume += Math.PI * (high - low) * (r * r + r * R + R * R) / 3;
    } else if (offset > -radius(mid) * sn) {
      // Six-point Gauss-Legendre quadrature on the partially filled interval.
      for (let j = 0; j < NODES.length; j++) {
        const y = mid + (high - low) * NODES[j] / 2;
        volume += WEIGHTS[j] * (high - low) / 2 * segArea(radius(y), (h - y * cs) / sn - g.rb);
      }
    }
  }
  return volume;
}

const NODES = [-0.932469514, -0.661209386, -0.238619186, 0.238619186, 0.661209386, 0.932469514];
const WEIGHTS = [0.171324492, 0.360761573, 0.467913935, 0.467913935, 0.360761573, 0.171324492];

function tubeProfile(g: Geo, sn: number, cs: number) {
  const heights = g.sy.map((y, i) => y * cs + g.sx[i] * sn);
  let crest = -Infinity, end = 0, crestHalfHeight = 0;
  for (let i = 1; i < NS; i++) {
    const rise = heights[i] - heights[i - 1];
    const length = g.cum[i] - g.cum[i - 1];
    const halfHeight = g.bore / 2 * Math.sqrt(Math.max(0, 1 - (rise / length) ** 2));
    const bottom = Math.max(heights[i], heights[i - 1]) - halfHeight;
    if (bottom > crest) {
      crest = bottom;
      crestHalfHeight = halfHeight;
      end = rise > 0 ? i : i - 1;
    }
  }
  return { heights, crest, end, crestHalfHeight };
}

// Reservoir plus the wetted external tube upstream of its crest. The buried
// inlet already occupies reservoir space. Downstream transit is quasi-steady.
function stored(g: Geo, sn: number, cs: number, h: number, tube: ReturnType<typeof tubeProfile>) {
  let volume = volBelow(g, sn, cs, h);
  const area = Math.PI * (g.bore / 2) ** 2;
  for (let i = 1; i <= tube.end; i++) {
    const a = tube.heights[i - 1], b = tube.heights[i], length = g.cum[i] - g.cum[i - 1];
    const low = Math.min(a, b), span = Math.abs(a - b);
    const half = g.bore / 2 * Math.sqrt(Math.max(0, 1 - (span / length) ** 2));
    if (h >= low + span + half) volume += area * length;
    else if (h > low - half) {
      // Integrate circular segment occupancy along the sloped segment.
      const fraction = (t: number) => half < 1e-8 ? Number(h >= low + t * span)
        : segArea(1, (h - low - t * span) / half) / Math.PI;
      const full = Math.max(0, Math.min(1, (h - low - half) / Math.max(span, 1e-12)));
      const wet = Math.max(full, Math.min(1, (h - low + half) / Math.max(span, 1e-12)));
      volume += area * length * (full + (wet - full) *
        (fraction(full) + 4 * fraction((full + wet) / 2) + fraction(wet)) / 6);
    }
  }
  return volume;
}

export function surfaceFor(g: Geo, sn: number, cs: number, V: number, tube = tubeProfile(g, sn, cs)) {
  let lo = Math.min(0, g.xt * sn + g.Hk * cs);
  let hi = Math.max(2 * g.rb * sn, (g.xt + 2 * g.rt) * sn + g.Hk * cs);
  let left = stored(g, sn, cs, lo, tube) - V, right = stored(g, sn, cs, hi, tube) - V;
  if (left >= 0) return lo;
  if (right <= 0) return hi;
  let side = 0;
  for (let i = 0; i < 40; i++) {
    const h = (lo * right - hi * left) / (right - left);
    const error = stored(g, sn, cs, h, tube) - V;
    if (Math.abs(error) < 1e-8) return h;
    if (error > 0) {
      hi = h; right = error;
      if (side === 1) left /= 2;
      side = 1;
    } else {
      lo = h; left = error;
      if (side === -1) right /= 2;
      side = -1;
    }
  }
  return (lo + hi) / 2;
}

/** Exit speed from the head above the outlet, with entry, bend and friction losses. */
export function exitSpeed(g: Geo, bore: number, head: number) {
  if (head <= 0) return 0;
  const fl = g.len / bore;
  let v = Math.sqrt((2 * G * head) / (g.K0 + 0.03 * fl));
  for (let i = 0; i < 4; i++) {
    const Re = Math.max((v * bore) / NU, 1);
    let f: number;
    if (Re < 2300) f = 64 / Re;
    else if (Re > 4000) f = 0.316 / Math.pow(Re, 0.25);
    else {
      const k = (Re - 2300) / 1700;
      f = (1 - k) * (64 / 2300) + k * (0.316 / Math.pow(4000, 0.25));
    }
    v = Math.sqrt((2 * G * head) / (g.K0 + f * fl));
  }
  return v;
}

export type PourState = {
  th: number; ox: number; oy: number; ex: number; ey: number;
  s: number; crest: number; head: number; v: number; Q: number; flowing: boolean;
};

export function newState(): PourState {
  return { th: 0, ox: 0, oy: 0, ex: 0, ey: 0, s: 0, crest: 0, head: 0, v: 0, Q: 0, flowing: false };
}

/** Where the outlet is, which way it points, and how fast water leaves it, at tilt th (rad) holding V. */
export function pourAt(g: Geo, d: Dims, th: number, V: number, st: PourState = newState()) {
  const sn = Math.sin(th), cs = Math.cos(th);
  st.th = th;
  st.ox = g.tipX * cs - g.tipY * sn;
  st.oy = d.baseH + g.tipX * sn + g.tipY * cs;
  const eW = g.e - th;
  st.ex = -Math.cos(eW);
  st.ey = Math.sin(eW);
  const tube = tubeProfile(g, sn, cs);
  st.crest = d.baseH + tube.crest;
  st.s = d.baseH + surfaceFor(g, sn, cs, V, tube);
  st.flowing = V > TRACE + 1e-10 && st.s > st.crest + 1e-8;
  // Use the centroid of the submerged outlet area for the pressure head.
  // At full bore this is the outlet centre. A shallow sheet uses the lower lip.
  const radius = d.bore / 2;
  const outletHalfHeight = radius * Math.abs(st.ex);
  const depth = st.s - st.oy;
  const cut = Math.max(-1, Math.min(1, depth / Math.max(1e-12, outletHalfHeight)));
  const outletArea = segArea(1, cut);
  const centroid = outletArea > 1e-10 ? -2 * (1 - cut * cut) ** 1.5 / (3 * outletArea) : -1;
  st.head = depth - centroid * outletHalfHeight;
  if (st.flowing) {
    st.v = exitSpeed(g, d.bore, st.head);
    const submerged = st.s - st.crest;
    const crestCut = submerged / Math.max(tube.crestHalfHeight, 1e-12) - 1;
    // The flush port can draw only through the submerged portion of its opening.
    const inletLevel = st.s - d.baseH - g.ctrl[0] * sn - g.ctrl[1] * cs;
    const inletArea = segArea(1, inletLevel / (radius * cs));
    const wettedArea = radius * radius * Math.min(segArea(1, crestCut), outletArea, inletArea);
    st.Q = wettedArea * st.v;
  } else {
    st.v = 0;
    st.Q = 0;
  }
  return st;
}

/** Where a jet leaving (ox, oy) at speed v along (ex, ey) crosses height yT; NaN if it never gets there. */
export function landing(ox: number, oy: number, ex: number, ey: number, v: number, yT: number) {
  const vy = v * ey;
  const disc = vy * vy + 2 * G * (oy - yT);
  if (oy < yT || disc <= 0) return { x: NaN, t: NaN, vl: 0 };
  const t = (vy + Math.sqrt(disc)) / G;
  return { x: ox + v * ex * t, t, vl: Math.sqrt(v * v + 2 * G * (oy - yT)) };
}

export function cupCapacity(d: Dims, headroom = FILL_LINE) {
  const H = d.cupH - CUP_FLOOR, h = Math.max(0, H - headroom);
  const r = d.cupD / 2 * CUP_TAPER, R = r + (d.cupD / 2 - r) * h / H;
  return Math.PI * h * (r * r + r * R + R * R) / 3;
}

export type Traj = { ox: number; oy: number; ex: number; ey: number; v: number; th: number };
export type PourInterval = { start: number; end: number; before: number; after: number; jet: Traj };

export function launch(s: PourState, baseH: number, omega: number, relativeSpeed = s.v): Traj {
  const vx = relativeSpeed * s.ex - omega * (s.oy - baseH);
  const vy = relativeSpeed * s.ey + omega * s.ox;
  const v = Math.hypot(vx, vy);
  return { ox: s.ox, oy: s.oy, th: s.th, ex: v ? vx / v : 0, ey: v ? vy / v : -1, v };
}

export type Analysis = {
  intervals: PourInterval[]; finalVol: number; missesPlane: boolean;
  g: Geo;
  cx: number; rIn: number; rOut: number;
  fillVol: number; retained: number;
  thStart: number | null; // rad, where water first reaches the outlet while tipping
  lo: number; hi: number; mid: number; // landing band at rim height, jet width included
  checks: Record<CheckKey, number>; // > 0 fails, by that much (inches, or tens of degrees for drip)
  over: number; under: number; gap: number; exitDeg: number; poured: number; cap: number;
  restGap: number; lidGap: number; reachGap: number;
  vMax: number; Qmax: number; pourTime: number; // s from first trickle until 95% has poured
  far: Traj | null; // the jet that lands furthest out
  start: Traj | null; // where the pour begins
  stopLip: Traj; // the outlet when the kettle stops
  ok: boolean;
};

const st = newState();

export function analyze(d: Dims, sc: Scenario): Analysis {
  const g = geometry(d);
  const cx = -d.cupDist, rIn = d.cupD / 2, rOut = rIn + CUP_WALL;
  const thStop = d.tilt * D2R;
  const rimY = d.cupH;
  const snS = Math.sin(thStop), csS = Math.cos(thStop);
  const tube = tubeProfile(g, snS, csS);
  const fillVol = Math.min(RATED_FILL, sc.pour);
  const retained = Math.min(fillVol, stored(g, snS, csS, tube.crest, tube));
  const full = pourAt(g, d, 0, RATED_FILL);
  const restGap = full.crest - full.s;
  const omega = sc.tiltSpeed * D2R;
  const intervals: PourInterval[] = [];
  let V = fillVol, time = 0, pourTime = 0, firstTime: number | null = null;
  let thStart: number | null = null, start: Traj | null = null, far: Traj | null = null;
  let lo = Infinity, hi = -Infinity, farX = Infinity, missesPlane = false;
  let lidGap = Infinity, vMax = 0, Qmax = 0;
  function observe(s: PourState, w: number) {
    const lid = d.baseH + (g.xt + 0.3 * g.rt) * Math.sin(s.th) + g.Hk * Math.cos(s.th);
    lidGap = Math.min(lidGap, lid - s.s);
    if (s.Q <= 0) return;
    if (thStart === null) {
      thStart = s.th;
      start = launch(s, d.baseH, w, 0);
    }
    vMax = Math.max(vMax, s.v);
    Qmax = Math.max(Qmax, s.Q);
    for (const speed of [0, s.v]) {
      const jet = launch(s, d.baseH, w, speed);
      const L = landing(jet.ox, jet.oy, jet.ex, jet.ey, jet.v, rimY);
      if (!Number.isFinite(L.t)) missesPlane = true;
      const x = Number.isFinite(L.x) ? L.x : jet.ox;
      const vertical = Math.abs(jet.ey * jet.v - G * L.t);
      const radius = speed && vertical > 0 ? Math.sqrt(s.Q / (Math.PI * L.vl)) * L.vl / vertical : DRIP_R;
      const width = Math.max(DRIP_R, radius) + SPLASH;
      lo = Math.min(lo, x - width);
      hi = Math.max(hi, x + width);
      if (x < farX) { farX = x; far = jet; }
    }
  }
  function add(s: PourState, w: number, dt: number, amount: number) {
    const after = V - amount;
    if (amount > 0 && firstTime === null) firstTime = time;
    const target = 0.05 * fillVol;
    if (V > target && after <= target)
      pourTime = time + dt * (V - target) / amount - (firstTime ?? time);
    intervals.push({ start: time, end: time + dt, before: V, after, jet: launch(s, d.baseH, w) });
    V = after;
    time += dt;
  }
  // Midpoint integration through the commanded constant-speed tilt. Sample
  // both sides of the instantaneous stop because the launch velocity changes.
  const count = Math.max(24, Math.ceil(d.tilt / 0.5));
  const dt = thStop / (omega * count);
  for (let i = 0; dt > 0 && i < count; i++) {
    const th = thStop * i / count;
    let edge = pourAt(g, d, th, V, st);
    observe(edge, omega);
    let active = dt;
    if (edge.Q === 0 && pourAt(g, d, th + omega * dt, V).Q > 0) {
      let low = 0, high = dt;
      for (let j = 0; j < 16; j++) {
        const half = (low + high) / 2;
        if (pourAt(g, d, th + omega * half, V, st).Q > 0) high = half;
        else low = half;
      }
      edge = pourAt(g, d, th + omega * high, V, st);
      add(edge, omega, high, 0);
      observe(edge, omega);
      active -= high;
    }
    if (active <= 0) continue;
    const midV = V - Math.min(V, edge.Q * active / 2);
    const mid = pourAt(g, d, th + omega * (dt - active / 2), midV, st);
    observe(mid, omega);
    const endAngle = th + omega * dt;
    const sn = Math.sin(endAngle), cs = Math.cos(endAngle);
    const endTube = tubeProfile(g, sn, cs);
    const available = Math.max(0, V - stored(g, sn, cs, endTube.crest, endTube) - TRACE);
    add(mid, omega, active, Math.min(available, mid.Q * active));
  }
  if (dt > 0) observe(pourAt(g, d, thStop, V, st), omega);
  // Integrate to the trapped volume plus the numerical trace cutoff.
  const tail = TRACE;
  for (let i = 0; i < 120 && V - retained > tail + 1e-9; i++) {
    observe(pourAt(g, d, thStop, V, st), 0);
    const amount = Math.min(V - retained - tail, (V - retained) * 0.15);
    const mid = pourAt(g, d, thStop, V - amount / 2, st);
    if (!(mid.Q > 0)) break;
    observe(mid, 0);
    add(mid, 0, amount / mid.Q, amount);
  }
  observe(pourAt(g, d, thStop, V, st), 0);
  const stopLip = launch(st, d.baseH, 0, 0);
  lo = Math.min(lo, stopLip.ox - DRIP_R - SPLASH);
  hi = Math.max(hi, stopLip.ox + DRIP_R + SPLASH);
  const over = cx - rIn - lo; // > 0: past the far rim
  const under = hi - (cx + rIn); // > 0: short of the near rim

  // Spout, kettle corner and lid knob against the cup and the floor, all the way down.
  let gap = Infinity;
  const ro = d.bore / 2 + SPOUT_WALL;
  const RAMP = 0.4;
  const test = (px: number, py: number, r: number) => {
    const dx = Math.abs(px - cx) - (rOut + r);
    const req = dx <= 0 ? rimY : dx < RAMP ? rimY * (1 - dx / RAMP) : 0;
    gap = Math.min(gap, py - r - req);
  };
  for (let k = 0; k <= count; k++) {
    const th = (thStop * k) / count, sn = Math.sin(th), cs = Math.cos(th);
    for (let i = 0; i < NS; i++) test(g.sx[i] * cs - g.sy[i] * sn, d.baseH + g.sx[i] * sn + g.sy[i] * cs, ro);
    test(g.tipX * cs - g.tipY * sn, d.baseH + g.tipX * sn + g.tipY * cs, ro);
    test(g.xt * cs - g.Hk * sn, d.baseH + g.xt * sn + g.Hk * cs, 0);
    const kx = g.xt + g.rt, ky = g.Hk + 0.6;
    test(kx * cs - ky * sn, d.baseH + kx * sn + ky * cs, 0.25);
  }

  const exitDeg = (g.e - thStop) / D2R;
  const cap = cupCapacity(d);
  const poured = fillVol - V;
  const reachGap = d.reach - g.xt - 0.5;

  // The world-height derivative of the cubic is quadratic. Check its
  // endpoints and interior maximum, so a pocket between samples fails too.
  const heights = [0, 2, 4, 6].map(i => g.ctrl[i] * snS + g.ctrl[i + 1] * csS);
  const slopes = heights.slice(1).map((h, i) => h - heights[i]);
  let uphill = Math.max(slopes[0], slopes[2]);
  const curvature = slopes[0] - 2 * slopes[1] + slopes[2];
  const t = (slopes[0] - slopes[1]) / curvature;
  if (t > 0 && t < 1) uphill = Math.max(uphill,
    (1 - t) ** 2 * slopes[0] + 2 * t * (1 - t)*slopes[1] + t * t * slopes[2]);
  const checks: Record<CheckKey, number> = {
    neck: Math.max((g.e / D2R + 10) / 10, g.tipY + d.bore / 2 - Math.max(...Array.from(g.sy))),
    drain: Math.max(uphill, (d.tilt - 50) / 10, retained > 1e-9 ? Math.cbrt(retained) : -1),
    fit: Math.max(rOut + 0.25 - d.cupDist, -reachGap, 1 - Math.sqrt(Math.max(d.spoutL ** 2 - g.hz ** 2, 0))),
    room: (RATED_FILL - 0.97 * g.vol) / (Math.PI * g.rt * g.rt),
    delivery: (Math.abs(poured - fillVol) - 1.01 * TRACE) / (Math.PI * rIn * rIn),
    stream: Math.max(over, under, missesPlane ? 1 : -Infinity),
    clear: CLEAR - gap,
    drip: (exitDeg + DRIP_DEG) / 10,
    holds: (fillVol - cap) / (Math.PI * rIn * rIn),
    rest: 0.25 - restGap,
    lid: 0.1 - lidGap,
  };
  let ok = true;
  for (const c of CHECKS) if ((c.core || sc.checks[c.key]) && checks[c.key] > TOL) ok = false;

  return {
    intervals, finalVol: V, missesPlane, g, cx, rIn, rOut, fillVol, retained, thStart, lo, hi, mid: (lo + hi) / 2, checks,
    over, under, gap, exitDeg, poured, cap, restGap, lidGap, reachGap,
    vMax, Qmax, pourTime, far, start, stopLip, ok,
  };
}

export const TOL = 1e-7;

export function enabled(sc: Scenario, k: CheckKey) {
  return !!CHECKS.find((c) => c.key === k)?.core || sc.checks[k];
}
