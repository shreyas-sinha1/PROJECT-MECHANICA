import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEngine } from "../../core/engine.js";
import { loadSimulationSpec } from "../adapter.js";
import { validateSimulationSpec } from "../validate.js";
import {
  SPEC_45_DEGREES,
  SPEC_LUNAR,
  SPEC_STEEP,
  SPEC_SHALLOW_FAST,
  SPEC_HORIZONTAL,
  SPEC_VERTICAL,
} from "../examples.js";

// ─── Test environment setup ──────────────────────────────────────────────────
// The engine uses requestAnimationFrame for playback animation.
// In Node.js/Vitest this doesn't exist, so we stub it.
// We use autoLaunch: false for state-inspection tests to avoid animation.

if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function createTestEngine() {
  const scene = {
    projectile: { velocity: 42, angle: 45, gravity: 9.81 },
  };
  return createEngine(scene);
}

// ─── Adapter integration ─────────────────────────────────────────────────────

describe("loadSimulationSpec — adapter integration", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
  });

  it("returns valid result for a correct spec", () => {
    const result = loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("applies parameters to engine state", () => {
    loadSimulationSpec(engine, SPEC_LUNAR, { autoLaunch: false });
    const state = engine.getState();
    expect(state.parameters.initialVelocity).toBe(42);
    expect(state.parameters.launchAngleDegrees).toBe(45);
    expect(state.parameters.gravity).toBe(1.62);
  });

  it("returns invalid result for a bad spec without corrupting state", () => {
    // Set known good state first
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const stateBefore = { ...engine.getState().parameters };

    // Try to load invalid spec
    const result = loadSimulationSpec(engine, {
      version: "1.0",
      module: "projectileMotion",
      parameters: { initialVelocity: -5 },
    }, { autoLaunch: false });

    expect(result.valid).toBe(false);
    // State should be unchanged
    const stateAfter = engine.getState().parameters;
    expect(stateAfter.initialVelocity).toBe(stateBefore.initialVelocity);
    expect(stateAfter.launchAngleDegrees).toBe(stateBefore.launchAngleDegrees);
    expect(stateAfter.gravity).toBe(stateBefore.gravity);
  });
});

// ─── Physics correctness ─────────────────────────────────────────────────────

describe("Pipeline physics — 45° maximum range", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
  });

  it("computes correct range ≈ v²·sin(2θ)/g", () => {
    const state = engine.getState();
    const v = 42, g = 9.81;
    const expectedRange = (v * v * Math.sin(2 * 45 * Math.PI / 180)) / g;
    expect(state.flightMetrics.range).toBeCloseTo(expectedRange, 0);
  });

  it("computes correct total flight time ≈ 2v·sin(θ)/g", () => {
    const state = engine.getState();
    const v = 42, g = 9.81, theta = 45 * Math.PI / 180;
    const expectedTime = (2 * v * Math.sin(theta)) / g;
    expect(state.flightMetrics.totalFlightTime).toBeCloseTo(expectedTime, 1);
  });

  it("computes correct maximum height ≈ v²·sin²(θ)/(2g)", () => {
    const state = engine.getState();
    const v = 42, g = 9.81, theta = 45 * Math.PI / 180;
    const expectedHeight = (v * v * Math.sin(theta) * Math.sin(theta)) / (2 * g);
    expect(state.flightMetrics.maximumHeight).toBeCloseTo(expectedHeight, 0);
  });
});

describe("Pipeline physics — lunar gravity", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_LUNAR, { autoLaunch: false });
  });

  it("lunar range is much larger than Earth range", () => {
    const lunarState = engine.getState();
    const lunarRange = lunarState.flightMetrics.range;

    // Reload Earth spec for comparison
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const earthRange = engine.getState().flightMetrics.range;

    expect(lunarRange).toBeGreaterThan(earthRange * 5);
  });

  it("computes correct lunar range ≈ v²·sin(2θ)/g_moon", () => {
    const state = engine.getState();
    const v = 42, g = 1.62;
    const expectedRange = (v * v * Math.sin(2 * 45 * Math.PI / 180)) / g;
    expect(state.flightMetrics.range).toBeCloseTo(expectedRange, 0);
  });
});

describe("Pipeline physics — steep launch (80°)", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_STEEP, { autoLaunch: false });
  });

  it("maximum height exceeds range (tall narrow trajectory)", () => {
    const state = engine.getState();
    expect(state.flightMetrics.maximumHeight).toBeGreaterThan(state.flightMetrics.range);
  });
});

describe("Pipeline physics — shallow fast launch (10°)", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_SHALLOW_FAST, { autoLaunch: false });
  });

  it("range greatly exceeds maximum height (long flat trajectory)", () => {
    const state = engine.getState();
    expect(state.flightMetrics.range).toBeGreaterThan(state.flightMetrics.maximumHeight * 5);
  });
});

describe("Pipeline physics — horizontal launch (0°)", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_HORIZONTAL, { autoLaunch: false });
  });

  it("flight time is approximately zero", () => {
    const state = engine.getState();
    expect(state.flightMetrics.totalFlightTime).toBeCloseTo(0, 5);
  });

  it("range is approximately zero", () => {
    const state = engine.getState();
    expect(state.flightMetrics.range).toBeCloseTo(0, 5);
  });

  it("maximum height is approximately zero", () => {
    const state = engine.getState();
    expect(state.flightMetrics.maximumHeight).toBeCloseTo(0, 5);
  });
});

describe("Pipeline physics — vertical launch (90°)", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
    loadSimulationSpec(engine, SPEC_VERTICAL, { autoLaunch: false });
  });

  it("range is approximately zero", () => {
    const state = engine.getState();
    expect(state.flightMetrics.range).toBeCloseTo(0, 3);
  });

  it("maximum height ≈ v²/(2g)", () => {
    const state = engine.getState();
    const v = 30, g = 9.81;
    const expectedHeight = (v * v) / (2 * g);
    expect(state.flightMetrics.maximumHeight).toBeCloseTo(expectedHeight, 0);
  });
});

// ─── Trajectory invariants ───────────────────────────────────────────────────

describe("Pipeline — trajectory invariants", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
  });

  it("predicted trajectory is non-empty after loading a valid spec", () => {
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const state = engine.getState();
    expect(state.predictedTrajectory.length).toBeGreaterThan(0);
  });

  it("trajectory starts at the origin", () => {
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const state = engine.getState();
    const first = state.predictedTrajectory[0];
    expect(first.xPosition).toBeCloseTo(0, 5);
    expect(first.yPosition).toBeCloseTo(0, 5);
  });

  it("trajectory ends at or near ground level (angle > 0)", () => {
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const state = engine.getState();
    const last = state.predictedTrajectory[state.predictedTrajectory.length - 1];
    expect(last.yPosition).toBeLessThanOrEqual(0.01);
  });

  it("engine state parameters match spec parameters exactly", () => {
    loadSimulationSpec(engine, SPEC_LUNAR, { autoLaunch: false });
    const state = engine.getState();
    expect(state.parameters.initialVelocity).toBe(SPEC_LUNAR.parameters.initialVelocity);
    expect(state.parameters.launchAngleDegrees).toBe(SPEC_LUNAR.parameters.launchAngleDegrees);
    expect(state.parameters.gravity).toBe(SPEC_LUNAR.parameters.gravity);
  });

  it("different specs produce different trajectories", () => {
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const earthRange = engine.getState().flightMetrics.range;

    loadSimulationSpec(engine, SPEC_LUNAR, { autoLaunch: false });
    const lunarRange = engine.getState().flightMetrics.range;

    expect(earthRange).not.toBeCloseTo(lunarRange, 0);
  });

  it("currentPoint is set after loading spec", () => {
    loadSimulationSpec(engine, SPEC_45_DEGREES, { autoLaunch: false });
    const state = engine.getState();
    expect(state.currentPoint).not.toBeNull();
  });
});

// ─── engine.loadSpec convenience method ──────────────────────────────────────

describe("engine.loadSpec — convenience method", () => {
  let engine;

  beforeEach(() => {
    engine = createTestEngine();
    engine.init();
  });

  it("exists on the engine instance", () => {
    expect(typeof engine.loadSpec).toBe("function");
  });

  it("validates and applies a spec", () => {
    const result = engine.loadSpec(SPEC_STEEP, { autoLaunch: false });
    expect(result.valid).toBe(true);
    expect(engine.getState().parameters.launchAngleDegrees).toBe(80);
  });

  it("returns errors for invalid specs", () => {
    const result = engine.loadSpec({ version: "1.0", module: "projectileMotion", parameters: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
