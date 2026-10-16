import { describe, it, expect } from "vitest";
import { parseCustomSimulationInput } from "../parser.js";
import { SIMULATION_SPEC_VERSION } from "../simulationSpec.js";

describe("Custom Simulation Input Parser", () => {
  it("parses full canonical SimulationSpec JSON", () => {
    const raw = JSON.stringify({
      version: SIMULATION_SPEC_VERSION,
      module: "projectileMotion",
      parameters: {
        initialVelocity: 42,
        launchAngleDegrees: 45,
        gravity: 9.81,
      },
    });

    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(42);
    expect(result.spec.parameters.launchAngleDegrees).toBe(45);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("parses flat JSON with standard parameter names", () => {
    const raw = JSON.stringify({
      initialVelocity: 50,
      launchAngleDegrees: 60,
      gravity: 9.81,
    });

    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(50);
    expect(result.spec.parameters.launchAngleDegrees).toBe(60);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("parses flat JSON with aliases (velocity, angle, g)", () => {
    const raw = JSON.stringify({
      velocity: 35,
      angle: 70,
      g: 1.62,
    });

    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(35);
    expect(result.spec.parameters.launchAngleDegrees).toBe(70);
    expect(result.spec.parameters.gravity).toBe(1.62);
  });

  it("parses key-value shorthand string", () => {
    const raw = "velocity=55, angle=30, gravity=9.81";
    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(55);
    expect(result.spec.parameters.launchAngleDegrees).toBe(30);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("parses shorthand v=45, a=60, g=9.81", () => {
    const raw = "v=45, a=60, g=9.81";
    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(45);
    expect(result.spec.parameters.launchAngleDegrees).toBe(60);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("parses natural language question with units", () => {
    const raw = "A cannonball is fired at 45 degrees with an initial velocity of 50 m/s under Earth gravity";
    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(true);
    expect(result.spec.parameters.initialVelocity).toBe(50);
    expect(result.spec.parameters.launchAngleDegrees).toBe(45);
    expect(result.spec.parameters.gravity).toBe(9.81);
  });

  it("returns invalid on empty input", () => {
    const result = parseCustomSimulationInput("");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns invalid on malformed JSON", () => {
    const result = parseCustomSimulationInput("{ velocity: 50, bad: }");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/JSON/i);
  });

  it("enforces parameter bounds via validator", () => {
    const raw = JSON.stringify({
      initialVelocity: 2500, // max is 1000
      launchAngleDegrees: 45,
      gravity: 9.81,
    });
    const result = parseCustomSimulationInput(raw);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/out of range/i);
  });
});
