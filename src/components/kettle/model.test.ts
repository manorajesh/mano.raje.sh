import { analyze, DEFAULTS, DEFAULT_SCENARIO, DIMS, SKETCH, ML_PER_IN3, RATED_FILL, D2R, G, landing, launch, pourAt } from "./model";
import { Designer } from "./solver";

const scenario = DEFAULT_SCENARIO;

test("the full 32 fl oz charge stays below the upright crest and gravity-drains by 50°", () => {
  const a = analyze(DEFAULTS, scenario);
  expect(a.fillVol).toBe(57.75);
  expect(a.ok).toBe(true);
  expect(DEFAULTS.tilt).toBeLessThanOrEqual(50);
  expect(a.restGap).toBeGreaterThanOrEqual(0.25);
  expect(a.thStart).toBeGreaterThan(0);
  expect(a.retained).toBe(0);
  expect(a.finalVol * ML_PER_IN3).toBeCloseTo(0.01, 6);
  expect(a.g.e).toBeLessThan(0);
});

test("the sketch and a stop with a pocket fail the mandatory drainage check", () => {
  const sketch = analyze({ ...DEFAULTS, ...SKETCH }, scenario);
  expect(sketch.checks.drain).toBeGreaterThan(0);
  expect(sketch.retained).toBeGreaterThan(0);
  const shallow = analyze({ ...DEFAULTS, tilt: 25 }, scenario);
  expect(shallow.checks.drain).toBeGreaterThan(0);
  expect(shallow.ok).toBe(false);
  const small = analyze(DEFAULTS, { ...scenario, pour: RATED_FILL / 4 });
  const leaks = analyze({ ...DEFAULTS, kettleW: 5 }, { ...scenario, pour: RATED_FILL / 4,
    checks: { ...scenario.checks, rest: false } });
  expect(leaks.checks.rest).toBeGreaterThan(0);
  expect(leaks.ok).toBe(false);
  expect(small.restGap).toBe(analyze(DEFAULTS, scenario).restGap);
  expect(small.finalVol * ML_PER_IN3).toBeCloseTo(0.01, 6);
});

test("a released drop inherits the outlet velocity about the pivot", () => {
  const { g, fillVol } = analyze(DEFAULTS, scenario);
  const omega = scenario.tiltSpeed * D2R;
  const angle = 0.2;
  const at = pourAt(g, DEFAULTS, angle, fillVol);
  const later = pourAt(g, DEFAULTS, angle + omega * 1e-6, fillVol);
  const drop = launch(at, DEFAULTS.baseH, omega, 0);
  expect(drop.ex * drop.v).toBeCloseTo((later.ox - at.ox) / 1e-6, 4);
  expect(drop.ey * drop.v).toBeCloseTo((later.oy - at.oy) / 1e-6, 4);
  const hit = landing(drop.ox, drop.oy, drop.ex, drop.ey, drop.v, DEFAULTS.cupH);
  expect(drop.oy + drop.ey * drop.v * hit.t - G * hit.t ** 2 / 2).toBeCloseTo(DEFAULTS.cupH, 8);
});

test.each([5, 20, 90])("conserves water through tipping and draining at %i degrees/s", tiltSpeed => {
  const a = analyze(DEFAULTS, { ...scenario, tiltSpeed });
  let volume = a.fillVol, elapsed = 0, discharged = 0;
  for (const step of a.intervals) {
    expect(step.start).toBe(elapsed);
    expect(step.end).toBeGreaterThan(step.start);
    expect(step.before).toBe(volume);
    expect(step.after).toBeLessThanOrEqual(volume);
    discharged += volume - step.after;
    volume = step.after;
    elapsed = step.end;
    if (step.before === step.after) continue;
    const j = step.jet;
    const hit = landing(j.ox, j.oy, j.ex, j.ey, j.v, DEFAULTS.cupH);
    expect(hit.x).toBeGreaterThan(a.lo);
    expect(hit.x).toBeLessThan(a.hi);
  }
  expect(a.intervals.some(s => s.end <= DEFAULTS.tilt / tiltSpeed && s.after < s.before)).toBe(true);
  const stopTime = DEFAULTS.tilt / tiltSpeed;
  const atStop = a.intervals.filter(s => s.start < stopTime - 1e-9).pop()!;
  if (atStop.after > 0.01 / ML_PER_IN3 + 1e-8)
    expect(a.intervals.some(s => s.start >= stopTime - 1e-9 && s.after < s.before)).toBe(true);
  expect(discharged + volume).toBeCloseTo(a.fillVol, 9);
  expect(discharged).toBeCloseTo(scenario.pour - 0.01 / ML_PER_IN3, 8);
  expect(pourAt(a.g, DEFAULTS, DEFAULTS.tilt * D2R, a.retained).Q).toBe(0);
});

test("all ten dimensions can be pinned while the solver adjusts the others", () => {
  const designer = new Designer(DEFAULTS, scenario);
  function settle() {
    for (let i = 0; i < 100 && designer.busy; i++) designer.step(100);
    expect(designer.busy).toBe(false);
    expect(designer.a.ok).toBe(true);
  }
  settle();
  for (const spec of DIMS) {
    const value = Math.min(spec.max, designer.dims[spec.key] + (spec.max - spec.min) * 0.01);
    designer.set(spec.key, value);
    settle();
    expect(designer.dims[spec.key]).toBe(value);
  }
  designer.setLocked("cupDist", true);
  const distance = designer.dims.cupDist;
  designer.setAll(DEFAULTS);
  settle();
  expect(designer.dims.cupDist).toBe(distance);
});

test("history restores a whole drag and its solver adjustments, and a new edit discards redo", () => {
  const designer = new Designer(DEFAULTS, scenario);
  const settle = () => { while (designer.busy) designer.step(100); };
  settle();
  const initial = { ...designer.dims };
  designer.setInteracting(true);
  designer.set("cupDist", 12);
  designer.step(9);
  designer.set("cupDist", 13);
  designer.setInteracting(false);
  settle();
  const edited = { ...designer.dims };
  designer.undo();
  expect(designer.dims).toEqual(initial);
  expect(designer.canUndo).toBe(false);
  designer.redo();
  expect(designer.dims).toEqual(edited);
  expect(designer.pinned).toBe("cupDist");
  designer.undo();
  designer.set("cupH", 5);
  expect(designer.canRedo).toBe(false);
});

test("reset restores the opening design and can be undone during a solve", () => {
  const designer = new Designer(DEFAULTS, scenario);
  designer.set("cupDist", 15);
  designer.setLocked("cupDist", true);
  designer.setScenario({ ...scenario, tiltSpeed: 25 });
  designer.step(1);
  const edited = { ...designer.dims };
  designer.reset();
  expect(designer.sc).toEqual(scenario);
  expect(designer.dims).toEqual(DEFAULTS);
  expect(designer.locks.size).toBe(0);
  expect(designer.pinned).toBeNull();
  designer.undo();
  expect(designer.dims).toEqual(edited);
  expect(designer.sc.tiltSpeed).toBe(25);
  expect(designer.pinned).toBe("cupDist");
  expect(designer.locks.has("cupDist")).toBe(true);
  designer.redo();
  expect(designer.dims).toEqual(DEFAULTS);
});
