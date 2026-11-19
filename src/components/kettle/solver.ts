import { analyze, Analysis, CHECKS, CheckKey, DimKey, Dims, EDITABLE, enabled, Scenario, SPEC, standard, TOL, UNIT } from "./model";

// Keeps the design pouring into the cup. Unlocked dimensions are free; locked ones (and the one
// being dragged) are fixed. Each step is a damped Gauss-Newton (Levenberg-Marquardt) move that
// changes the free dimensions as little as possible, weighted by how reluctant each one is to
// move, while pushing every failing check back over its line. With "keep centred" on, the middle
// of the stream is also pulled to the middle of the cup, so dimensions move together. The
// gooseneck and mug are standard parts: never free, they follow the body through standard().

const W = 60; // weight of a failing check against moving a dimension
const WC = 20; // weight of centring the stream
const SLACK = 0.04; // aim this far inside each check so rounding doesn't flicker

export type Fix = { keys: DimKey[]; to: Partial<Dims> };
export type Diagnosis = { failing: CheckKey[]; fixes: Fix[]; searched: boolean; allLocked: boolean };

function residuals(a: Analysis, d: Dims, t: Dims, free: DimKey[], sc: Scenario, out: number[]) {
  out.length = 0;
  for (const k of free) out.push((SPEC[k].cost * (d[k] - t[k])) / UNIT(k));
  for (const c of CHECKS) {
    if (!enabled(sc, c.key)) continue;
    if (c.key === "stream") {
      out.push(W * Math.max(0, a.over + SLACK), W * Math.max(0, a.under + SLACK), W * Number(a.missesPlane));
    } else out.push(W * Math.max(0, a.checks[c.key] + (c.key === "delivery" || c.key === "neck" ? 0 : SLACK)));
  }
  if (sc.centered) out.push(WC * (a.mid - a.cx));
  return out;
}

const sq = (r: number[]) => r.reduce((s, x) => s + x * x, 0);

function clampDim(k: DimKey, v: number) {
  return Math.min(SPEC[k].max, Math.max(SPEC[k].min, v));
}

/** Solve the n×n system A x = b in place (Gaussian elimination, partial pivoting). */
function solveLinear(A: number[][], b: number[]) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    const piv = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / piv;
      if (!f) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

/** One solver run: returns the state it ended in. Stateless, so the diagnosis can call it too. */
export class LM {
  d: Dims;
  t: Dims;
  free: DimKey[];
  sc: Scenario;
  lambda = 1e-2;
  a: Analysis;
  cost: number;
  stalls = 0;
  iterations = 0;
  done = false;
  private r: number[] = [];

  constructor(d: Dims, free: DimKey[], sc: Scenario) {
    this.d = standard(d);
    this.t = { ...this.d };
    this.free = free;
    this.sc = sc;
    this.a = analyze(this.d, sc);
    this.cost = sq(residuals(this.a, this.d, this.t, free, sc, this.r));
    if (!free.length) this.done = true;
  }

  iterate() {
    if (this.done) return false;
    if (++this.iterations > 80) {
      this.done = true;
      return false;
    }
    const { free, sc } = this;
    const n = free.length;
    const r0 = residuals(this.a, this.d, this.t, free, sc, []);
    const m = r0.length;
    const J: number[][] = [];
    for (let j = 0; j < n; j++) {
      const k = free[j];
      const h = 1e-3 * UNIT(k);
      // step away from a bound, not into it
      const dd = standard({ ...this.d, [k]: this.d[k] + h > SPEC[k].max ? this.d[k] - h : this.d[k] + h });
      const sgn = dd[k] > this.d[k] ? 1 : -1;
      const rr = residuals(analyze(dd, sc), dd, this.t, free, sc, []);
      J.push(rr.map((v, i) => (sgn * (v - r0[i])) / h));
    }
    // normal equations
    const A: number[][] = [], g: number[] = [];
    for (let i = 0; i < n; i++) {
      A.push(new Array(n).fill(0));
      let s = 0;
      for (let q = 0; q < m; q++) s += J[i][q] * r0[q];
      g.push(-s);
      for (let j = 0; j < n; j++) {
        let v = 0;
        for (let q = 0; q < m; q++) v += J[i][q] * J[j][q];
        A[i][j] = v;
      }
    }
    for (let tries = 0; tries < 6; tries++) {
      const M = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + this.lambda) + 1e-9 : v)));
      const step = solveLinear(M, g.slice());
      let nd = { ...this.d };
      let moved = 0;
      for (let j = 0; j < n; j++) {
        const k = free[j];
        nd[k] = clampDim(k, this.d[k] + step[j]);
        moved = Math.max(moved, Math.abs(nd[k] - this.d[k]) / UNIT(k));
      }
      nd = standard(nd);
      const na = analyze(nd, sc);
      const nc = sq(residuals(na, nd, this.t, free, sc, this.r));
      if (nc < this.cost) {
        const gain = this.cost - nc;
        this.d = nd;
        this.a = na;
        this.cost = nc;
        this.lambda = Math.max(this.lambda / 3, 1e-6);
        if (gain < 1e-7 + 1e-6 * nc || moved < 1e-5) this.stalls++;
        else this.stalls = 0;
        const centered = !sc.centered || Math.abs(na.mid - na.cx) < 0.005;
        if (this.stalls >= 2 || (na.ok && centered && moved < 0.005)) this.done = true;
        return true;
      }
      this.lambda *= 4;
      if (this.lambda > 1e8) break;
    }
    this.done = true;
    return false;
  }

  run(maxIter: number) {
    for (let i = 0; i < maxIter && !this.done; i++) this.iterate();
    return this;
  }
}

export function failing(a: Analysis, sc: Scenario): CheckKey[] {
  return CHECKS.filter((c) => enabled(sc, c.key) && a.checks[c.key] > TOL).map((c) => c.key);
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

type DesignState = {
  dims: Dims; locks: Set<DimKey>; pinned: DimKey | null; sc: Scenario;
  good: Dims | null; dirty: boolean; lm: LM | null;
};

/**
 * The live design. Call step() every frame; it solves in small slices of time so dragging
 * stays smooth, and when it settles on a design that still fails, it works out which locks
 * are in the way.
 */
export class Designer {
  dims: Dims;
  locks = new Set<DimKey>();
  sc: Scenario;
  /** The dimension the person set last. It holds still like a lock until they touch another one. */
  pinned: DimKey | null = null;
  /** True while a drag is under way: solve, but hold the diagnosis until it settles. */
  interacting = false;
  a: Analysis;
  diag: Diagnosis | null = null;
  onDiag: (d: Diagnosis | null) => void = () => {};
  version = 0;
  private lm: LM | null = null;
  private dirty = true;
  /** The last design that passed every check. */
  private good: Dims | null = null;
  private diagToken = 0;

  private undoStack: DesignState[] = [];
  private redoStack: DesignState[] = [];
  private gestureRecorded = false;
  private initial: DesignState;

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  private snapshot(): DesignState {
    return { dims: this.dims, locks: new Set(this.locks), pinned: this.pinned, sc: this.sc,
      good: this.good, dirty: this.dirty, lm: this.lm };
  }

  private restore(state: DesignState) {
    this.touch();
    this.dims = state.dims;
    this.locks = new Set(state.locks);
    this.pinned = state.pinned;
    this.sc = state.sc;
    this.good = state.good;
    this.dirty = state.dirty;
    this.lm = state.lm;
    this.interacting = false;
    this.gestureRecorded = false;
    this.a = analyze(this.dims, this.sc);
    this.version++;
    if (!this.dirty && !this.a.ok) this.diagnose();
  }

  private record() {
    if (this.interacting && this.gestureRecorded) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.gestureRecorded = this.interacting;
  }

  undo() {
    const state = this.undoStack.pop();
    if (state) {
      this.redoStack.push(this.snapshot());
      this.restore(state);
    }
  }

  redo() {
    const state = this.redoStack.pop();
    if (state) {
      this.undoStack.push(this.snapshot());
      this.restore(state);
    }
  }

  reset() {
    this.record();
    this.restore(this.initial);
  }

  constructor(d: Dims, sc: Scenario) {
    this.dims = standard(d);
    this.sc = sc;
    this.a = analyze(this.dims, sc);
    this.initial = this.snapshot();
  }

  free(extraLocked?: DimKey | null) {
    return EDITABLE.map((s) => s.key).filter((k) => !this.locks.has(k) && k !== extraLocked);
  }

  touch() {
    this.dirty = true;
    this.lm = null;
    this.diagToken++;
    if (this.diag) {
      this.diag = null;
      this.onDiag(null);
    }
  }

  set(k: DimKey, v: number) {
    if (SPEC[k].fixed || clampDim(k, v) === this.dims[k]) return;
    this.record();
    this.pinned = k;
    this.dims = standard({ ...this.dims, [k]: clampDim(k, v) });
    this.version++;
    this.touch();
  }

  setAll(d: Dims) {
    this.record();
    this.pinned = null;
    const next = { ...d };
    for (const k of Array.from(this.locks)) next[k] = this.dims[k];
    this.dims = standard(next);
    this.version++;
    this.touch();
  }

  setScenario(sc: Scenario) {
    this.record();
    this.sc = sc;
    this.touch();
  }

  setLocked(k: DimKey, on: boolean) {
    this.setLocks([k], on);
  }

  setLocks(keys: DimKey[], on: boolean, releasePin = false) {
    this.record();
    for (const k of keys) {
      if (SPEC[k].fixed) continue;
      if (on) this.locks.add(k);
      else this.locks.delete(k);
      if (releasePin && this.pinned === k) this.pinned = null;
    }
    this.touch();
  }

  get busy() {
    return this.dirty;
  }

  setInteracting(on: boolean) {
    if (!on) this.gestureRecorded = false;
    this.interacting = on;
    if (!on && !this.dirty && failing(this.a, this.sc).length && !this.diag) this.diagnose();
  }

  /** Solve for up to `budget` ms. Returns true if the dimensions changed. */
  step(budget: number) {
    if (!this.dirty) return false;
    const t0 = performance.now();
    if (!this.lm) this.lm = new LM(this.dims, this.free(this.pinned), this.sc);
    let changed = false;
    while (!this.lm.done && performance.now() - t0 < budget) if (this.lm.iterate()) changed = true;
    this.dims = { ...this.lm.d };
    this.a = this.lm.a;
    if (changed) this.version++;
    if (this.lm.done) {
      this.dirty = false;
      this.lm = null;
      if (!failing(this.a, this.sc).length) this.good = { ...this.dims };
      else if (this.good) {
        // It can't be done. Rather than leave the free dimensions wherever the compromise
        // dragged them, put them back as they were when it last worked, keeping what the
        // person set and locked, and show that failing.
        const kept = { ...this.good };
        for (const k of Object.keys(kept) as DimKey[]) if (this.locks.has(k) || k === this.pinned) kept[k] = this.dims[k];
        const back = standard(kept);
        this.dims = back;
        this.a = analyze(back, this.sc);
        this.version++;
      }
      if (!this.interacting && failing(this.a, this.sc).length) this.diagnose();
    }
    return changed;
  }

  /** Which locks, unlocked, would let it pour. Tries each lock alone, then pairs. */
  private async diagnose() {
    const token = ++this.diagToken;
    const fails = failing(this.a, this.sc);
    const locked = EDITABLE.map((s) => s.key).filter((k) => this.locks.has(k) || k === this.pinned);
    const free = this.free(this.pinned);
    const diag: Diagnosis = { failing: fails, fixes: [], searched: false, allLocked: free.length === 0 };
    this.diag = diag;
    this.onDiag({ ...diag });
    const base = { ...this.dims };
    const tryKeys = async (keys: DimKey[]) => {
      await nextFrame();
      if (token !== this.diagToken) throw new Error("stale");
      const lm = new LM(base, [...free, ...keys], this.sc).run(40);
      if (!failing(lm.a, this.sc).length) {
        const to: Partial<Dims> = {};
        for (const k of keys) to[k] = lm.d[k];
        diag.fixes.push({ keys, to });
        return true;
      }
      return false;
    };
    try {
      for (const k of locked) await tryKeys([k]);
      if (!diag.fixes.length) {
        let n = 0;
        outer: for (let i = 0; i < locked.length; i++)
          for (let j = i + 1; j < locked.length; j++) {
            if (++n > 28) break outer;
            await tryKeys([locked[i], locked[j]]);
            if (diag.fixes.length >= 4) break outer;
          }
      }
    } catch {
      return;
    }
    if (token !== this.diagToken) return;
    diag.searched = true;
    this.diag = diag;
    this.onDiag({ ...diag });
  }
}
