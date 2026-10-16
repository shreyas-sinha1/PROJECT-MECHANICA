import { describe, it, expect } from "vitest";
import { validateSimulationSpec } from "../validate.js";
import { SIMULATION_SPEC_VERSION } from "../simulationSpec.js";
import {
  SPEC_45_DEGREES,
  SPEC_LUNAR,
  SPEC_STEEP,
  SPEC_SHALLOW_FAST,
  SPEC_HORIZONTAL,
  SPEC_VERTICAL,
} from "../examples.js";

// Helper to build a valid base spec for mutation tests
function makeSpec(overrides = {}) {
  return {
    version: SIMULATION_SPEC_VERSION,
    module: "projectileMotion",
    parameters: {
      initialVelocity: 42,
      launchAngleDegrees: 45,
      gravity: 9.81,
    },
    ...overrides,
  };
}

// ─── Valid specs ──────────────────────────────────────────────────────────────

describe("validateSimulationSpec — valid inputs", () => {
  it("accepts the 45° example spec", () => {
    const result = validateSimulationSpec(SPEC_45_DEGREES);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.spec.parameters.initialVelocity).toBe(42);
    expect(result.spec.parameters.launchAngleDegrees).toBe(45);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("accepts the lunar example spec", () => {
    const result = validateSimulationSpec(SPEC_LUNAR);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.gravity).toBe(1.62);
  });

  it("accepts the steep example spec", () => {
    const result = validateSimulationSpec(SPEC_STEEP);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.launchAngleDegrees).toBe(80);
  });

  it("accepts the shallow fast example spec", () => {
    const result = validateSimulationSpec(SPEC_SHALLOW_FAST);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(55);
  });

  it("accepts the horizontal (0°) edge case", () => {
    const result = validateSimulationSpec(SPEC_HORIZONTAL);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.launchAngleDegrees).toBe(0);
  });

  it("accepts the vertical (90°) edge case", () => {
    const result = validateSimulationSpec(SPEC_VERTICAL);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.launchAngleDegrees).toBe(90);
  });

  it("applies default for optional launchHeight and emits a warning", () => {
    const result = validateSimulationSpec(makeSpec());
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.launchHeight).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes("launchHeight"))).toBe(true);
  });

  it("coerces string parameter values to numbers", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: {
        initialVelocity: "42",
        launchAngleDegrees: "45",
        gravity: "9.81",
      },
    }));
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(42);
    expect(result.spec.parameters.launchAngleDegrees).toBe(45);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("preserves metadata when provided", () => {
    const result = validateSimulationSpec(SPEC_45_DEGREES);
    expect(result.spec.metadata.source).toBe("test");
    expect(result.spec.metadata.description).toContain("45°");
  });

  it("uses default metadata when none is provided", () => {
    const spec = makeSpec();
    delete spec.metadata;
    const result = validateSimulationSpec(spec);
    expect(result.valid).toBe(true);
    expect(result.spec.metadata.source).toBe("unknown");
  });

  it("returns a normalised copy — does not mutate the input", () => {
    const input = makeSpec();
    const originalVelocity = input.parameters.initialVelocity;
    const result = validateSimulationSpec(input);
    expect(result.valid).toBe(true);
    expect(input.parameters.initialVelocity).toBe(originalVelocity);
    // Ensure it's a different object
    result.spec.parameters.initialVelocity = 999;
    expect(input.parameters.initialVelocity).toBe(originalVelocity);
  });
});

// ─── Invalid specs — structural ──────────────────────────────────────────────

describe("validateSimulationSpec — structural errors", () => {
  it("rejects null input", () => {
    const result = validateSimulationSpec(null);
    expect(result.valid).toBe(false);
    expect(result.spec).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects undefined input", () => {
    const result = validateSimulationSpec(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects string input", () => {
    const result = validateSimulationSpec("hello");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("non-null object");
  });

  it("rejects number input", () => {
    const result = validateSimulationSpec(42);
    expect(result.valid).toBe(false);
  });

  it("rejects missing version", () => {
    const spec = makeSpec();
    delete spec.version;
    const result = validateSimulationSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("version"))).toBe(true);
  });

  it("rejects wrong version", () => {
    const result = validateSimulationSpec(makeSpec({ version: "2.0" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("version") && e.includes("2.0"))).toBe(true);
  });

  it("rejects unknown module", () => {
    const result = validateSimulationSpec(makeSpec({ module: "quantumMechanics" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("module") && e.includes("quantumMechanics"))).toBe(true);
  });

  it("rejects missing parameters object", () => {
    const spec = makeSpec();
    delete spec.parameters;
    const result = validateSimulationSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("parameters"))).toBe(true);
  });

  it("rejects null parameters", () => {
    const result = validateSimulationSpec(makeSpec({ parameters: null }));
    expect(result.valid).toBe(false);
  });
});

// ─── Invalid specs — parameter values ────────────────────────────────────────

describe("validateSimulationSpec — parameter validation", () => {
  it("rejects missing required parameter (initialVelocity)", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { launchAngleDegrees: 45, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("initialVelocity"))).toBe(true);
  });

  it("rejects missing required parameter (launchAngleDegrees)", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("launchAngleDegrees"))).toBe(true);
  });

  it("rejects missing required parameter (gravity)", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, launchAngleDegrees: 45 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("gravity"))).toBe(true);
  });

  it("reports all missing required parameters at once", () => {
    const result = validateSimulationSpec(makeSpec({ parameters: {} }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects negative velocity", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: -5, launchAngleDegrees: 45, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("initialVelocity") && e.includes("range"))).toBe(true);
  });

  it("rejects velocity exceeding maximum", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 5000, launchAngleDegrees: 45, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("initialVelocity"))).toBe(true);
  });

  it("rejects angle exceeding 90°", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, launchAngleDegrees: 100, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("launchAngleDegrees"))).toBe(true);
  });

  it("rejects negative angle", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, launchAngleDegrees: -10, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects zero gravity", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, launchAngleDegrees: 45, gravity: 0 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("gravity"))).toBe(true);
  });

  it("rejects gravity exceeding maximum", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 42, launchAngleDegrees: 45, gravity: 200 },
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects NaN parameter", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: NaN, launchAngleDegrees: 45, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("finite number"))).toBe(true);
  });

  it("rejects Infinity parameter", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: Infinity, launchAngleDegrees: 45, gravity: 9.81 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("finite number"))).toBe(true);
  });

  it("accepts boundary values (min velocity, max angle, min gravity)", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 0.01, launchAngleDegrees: 90, gravity: 0.01 },
    }));
    expect(result.valid).toBe(true);
  });

  it("accepts boundary values (max velocity, min angle, max gravity)", () => {
    const result = validateSimulationSpec(makeSpec({
      parameters: { initialVelocity: 1000, launchAngleDegrees: 0, gravity: 100 },
    }));
    expect(result.valid).toBe(true);
  });
});
