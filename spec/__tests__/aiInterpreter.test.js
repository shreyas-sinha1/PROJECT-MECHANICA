import { describe, it, expect, vi } from "vitest";
import { interpretPhysicsQuestion } from "../../server/geminiService.js";
import { SIMULATION_SPEC_VERSION } from "../simulationSpec.js";
import { validateSimulationSpec } from "../validate.js";
import { loadSimulationSpec } from "../adapter.js";
import { createEngine } from "../../core/engine.js";
import { scene } from "../../scene/scene.js";

/**
 * Helper to construct a mock Gemini client returning a specific JSON payload.
 */
function createMockGeminiClient(geminiPayload, shouldThrow = null) {
  return {
    models: {
      generateContent: vi.fn().mockImplementation(async () => {
        if (shouldThrow) {
          throw shouldThrow;
        }
        return {
          text: JSON.stringify(geminiPayload),
        };
      }),
    },
  };
}

describe("Mechanica AI Intelligence Layer (Phase 1) — Gemini Interpreter", () => {
  // =========================================================================
  // 1. COMPLETE QUESTIONS & CONVERSATIONAL WORDING
  // =========================================================================
  describe("Complete questions and varied wording", () => {
    it("interprets textbook projectile problem with explicit parameters", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        unsupportedReason: null,
        isAmbiguous: false,
        ambiguityReason: null,
        isContradictory: false,
        contradictionReason: null,
        parameters: {
          initialVelocity: 50,
          launchAngleDegrees: 30,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["flight time", "maximum height", "horizontal range"],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "A projectile launched at 50 m/s at 30 degrees under Earth gravity.",
      });

      const prompt = "A stone is thrown at an angle of 30 degrees with a velocity of 50 m/s. Calculate its maximum height and range.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.canLaunch).toBe(true);
      expect(result.spec).not.toBeNull();
      expect(result.spec.version).toBe(SIMULATION_SPEC_VERSION);
      expect(result.spec.module).toBe("projectileMotion");
      expect(result.spec.parameters.initialVelocity).toBe(50);
      expect(result.spec.parameters.launchAngleDegrees).toBe(30);
      expect(result.spec.parameters.gravity).toBe(9.81);
      expect(result.spec.parameters.launchHeight).toBe(0);
      expect(result.interpretation.requestedOutputs).toContain("maximum height");
      expect(result.interpretation.requestedOutputs).toContain("horizontal range");
    });

    it("interprets conversational/informal wording", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 25,
          launchAngleDegrees: 60,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["trajectory"],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "Kicking a football at 25 m/s at a 60 degree arc.",
      });

      const prompt = "Hey can you simulate kicking a football at 60 degrees into the air going 25 m/s?";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.initialVelocity).toBe(25);
      expect(result.spec.parameters.launchAngleDegrees).toBe(60);
    });

    it("interprets horizontal launch phrasing with permitted 0° default", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 20,
          launchAngleDegrees: 0,
          gravity: 9.81,
          launchHeight: 15,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range", "landing time"],
        unknowns: [],
        constraints: ["launched from 15m cliff"],
        unitConversions: [],
        canLaunch: true,
        explanation: "Horizontal launch from 15m elevation at 20 m/s.",
      });

      const prompt = "A marble rolls off a 15m high table horizontally at 20 m/s.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.launchAngleDegrees).toBe(0);
      expect(result.spec.parameters.launchHeight).toBe(15);
      expect(result.spec.parameters.initialVelocity).toBe(20);
    });
  });

  // =========================================================================
  // 2. UNIT CONVERSIONS (e.g. 144 km/h → 40 m/s)
  // =========================================================================
  describe("Unit normalization", () => {
    it("normalizes km/h to m/s (144 km/h → 40 m/s)", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 40, // 144 / 3.6 = 40
          launchAngleDegrees: 45,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range"],
        unknowns: [],
        constraints: [],
        unitConversions: [
          {
            originalText: "144 km/h",
            parameter: "initialVelocity",
            convertedValue: 40,
            convertedUnit: "m/s",
          },
        ],
        canLaunch: true,
        explanation: "Cannonball fired at 144 km/h (40 m/s) at 45 degrees.",
      });

      const prompt = "A cannon fires a ball at 144 km/h at an elevation of 45 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.initialVelocity).toBe(40);
      expect(result.interpretation.unitConversions).toHaveLength(1);
      expect(result.interpretation.unitConversions[0].convertedValue).toBe(40);
      expect(result.interpretation.unitConversions[0].convertedUnit).toBe("m/s");
    });

    it("normalizes mph, radians, and imperial heights", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 44.704, // 100 mph
          launchAngleDegrees: 45, // pi/4 rad
          gravity: 9.81,
          launchHeight: 10,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["maximum height"],
        unknowns: [],
        constraints: [],
        unitConversions: [
          { originalText: "100 mph", parameter: "initialVelocity", convertedValue: 44.704, convertedUnit: "m/s" },
          { originalText: "π/4 radians", parameter: "launchAngleDegrees", convertedValue: 45, convertedUnit: "degrees" },
        ],
        canLaunch: true,
        explanation: "100 mph converted to 44.7 m/s, pi/4 rad to 45 deg.",
      });

      const prompt = "A baseball is launched at 100 mph at π/4 radians from 10m height.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.initialVelocity).toBeCloseTo(44.7, 1);
      expect(result.spec.parameters.launchAngleDegrees).toBe(45);
    });
  });

  // =========================================================================
  // 3. EXPLICITLY PERMITTED DEFAULTS & PLANETARY ENVIRONMENTS
  // =========================================================================
  describe("Permitted defaults and celestial bodies", () => {
    it("applies Earth default gravity 9.81 m/s² and launchHeight 0 when omitted", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 30,
          launchAngleDegrees: 40,
          gravity: 9.81, // Earth default
          launchHeight: 0, // Schema default
        },
        missingRequiredParameters: [],
        requestedOutputs: ["time of flight"],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "Earth gravity 9.81 m/s² and ground launch (0m) applied as permitted defaults.",
      });

      const prompt = "A rock is thrown at 30 m/s at 40 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.gravity).toBe(9.81);
      expect(result.spec.parameters.launchHeight).toBe(0);
    });

    it("applies Lunar gravity (1.62 m/s²) when Moon is specified", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 15,
          launchAngleDegrees: 45,
          gravity: 1.62,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range"],
        unknowns: [],
        constraints: ["on the Moon"],
        unitConversions: [],
        canLaunch: true,
        explanation: "Lunar gravity applied: 1.62 m/s².",
      });

      const prompt = "On the surface of the Moon, an astronaut hits a golf ball at 15 m/s at 45 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.gravity).toBe(1.62);
    });

    it("respects explicit gravity override (e.g. take g = 10 m/s²)", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 20,
          launchAngleDegrees: 60,
          gravity: 10,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["maximum height"],
        unknowns: [],
        constraints: ["g = 10 m/s²"],
        unitConversions: [],
        canLaunch: true,
        explanation: "Explicit gravity 10 m/s² respected.",
      });

      const prompt = "A projectile is fired at 20 m/s at 60 degrees. Take g = 10 m/s².";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.spec.parameters.gravity).toBe(10);
    });
  });

  // =========================================================================
  // 4. MISSING PARAMETERS & NO PARAMETER DETERMINATION SOLVING
  // =========================================================================
  describe("Missing parameters and prevention of simulation launch", () => {
    it("reports missing initialVelocity when it is an unknown/sought output and prevents launch", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: null, // Unknown!
          launchAngleDegrees: 30,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: ["initialVelocity"],
        requestedOutputs: ["initial velocity"],
        unknowns: ["initialVelocity"],
        constraints: ["range = 50 m"],
        unitConversions: [],
        canLaunch: false,
        explanation: "Initial velocity is not provided; it is the unknown to be found. Launch prevented.",
      });

      const prompt = "A stone is thrown at 30 degrees and lands 50 meters away. Find the initial launch speed.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.interpretation.missingRequiredParameters).toContain("initialVelocity");
      expect(result.interpretation.unknowns).toContain("initialVelocity");
      expect(result.errors.some((e) => e.includes("initialVelocity"))).toBe(true);
    });

    it("reports missing launchAngleDegrees when angle is omitted", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 40,
          launchAngleDegrees: null,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: ["launchAngleDegrees"],
        requestedOutputs: ["launch angle"],
        unknowns: ["launchAngleDegrees"],
        constraints: ["maximum height = 20m"],
        unitConversions: [],
        canLaunch: false,
        explanation: "Launch angle is missing and must not be guessed.",
      });

      const prompt = "A projectile launched at 40 m/s reaches a height of 20 m. At what angle was it launched?";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.interpretation.missingRequiredParameters).toContain("launchAngleDegrees");
      expect(result.errors.some((e) => e.includes("launchAngleDegrees"))).toBe(true);
    });

    it("independently enforces that null required parameter sets canLaunch to false even if model claimed true", async () => {
      // Safety defense-in-depth: if Gemini hallucinates canLaunch = true despite missing parameter
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: 45,
          gravity: 9.81,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true, // Erroneous claim by AI
        explanation: "Erroneous",
      });

      const prompt = "Fired at 45 degrees under 9.81 m/s² gravity.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.missingRequiredParameters).toContain("initialVelocity");
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 5. CONSTRAINTS & PHYSICAL TARGETS
  // =========================================================================
  describe("Constraints extraction", () => {
    it("extracts obstacles, target ranges, and boundary conditions as constraints", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 35,
          launchAngleDegrees: 50,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["does it clear the wall", "height at wall"],
        unknowns: [],
        constraints: ["wall at distance 40m", "wall height 8m"],
        unitConversions: [],
        canLaunch: true,
        explanation: "Simulation can launch to observe trajectory relative to 8m wall at 40m distance.",
      });

      const prompt = "A ball is launched at 35 m/s at 50 degrees towards an 8m wall located 40m away. Does it clear the wall?";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(true);
      expect(result.interpretation.constraints).toContain("wall at distance 40m");
      expect(result.spec.metadata.constraints).toBeDefined();
    });
  });

  // =========================================================================
  // 6. CONTRADICTIONS & PHYSICAL IMPOSSIBILITIES
  // =========================================================================
  describe("Contradiction detection", () => {
    it("flags conflicting initial velocity values as contradiction and prevents launch", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isContradictory: true,
        contradictionReason: "Conflicting initial velocity values provided: 20 m/s and 50 m/s.",
        parameters: {
          initialVelocity: 20,
          launchAngleDegrees: 45,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Contradiction in initial velocity.",
      });

      const prompt = "A ball is launched with initial speed 20 m/s and launch velocity 50 m/s at 45 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isContradictory).toBe(true);
      expect(result.errors.some((e) => e.includes("Conflicting initial velocity"))).toBe(true);
    });

    it("flags conflicting initial speeds (144 km/h and 90 km/h), normalizes to 40 m/s and 25 m/s, asks which is correct, and does not report initialVelocity as missing", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isContradictory: true,
        contradictionReason: "Conflicting initial speeds detected: 144 km/h (40 m/s) and 90 km/h (25 m/s). Which value is correct?",
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: 35,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range"],
        unknowns: [],
        constraints: [],
        unitConversions: [
          { originalText: "144 km/h", parameter: "initialVelocity", convertedValue: 40, convertedUnit: "m/s" },
          { originalText: "90 km/h", parameter: "initialVelocity", convertedValue: 25, convertedUnit: "m/s" },
        ],
        canLaunch: false,
        explanation: "Contradiction: Two conflicting speeds provided for the launch.",
      });

      const prompt = "A cannon fires a ball with speed 144 km/h and 90 km/h at an angle of 35 degrees on Earth. How far will it go?";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      // 1. Must not launch
      expect(result.canLaunch).toBe(false);

      // 2. Must flag contradiction
      expect(result.interpretation.isContradictory).toBe(true);

      // 3. Must NOT report initialVelocity as missing in missingRequiredParameters
      expect(result.interpretation.missingRequiredParameters).not.toContain("initialVelocity");
      expect(result.errors.some((e) => e.includes("Missing required parameter: initialVelocity"))).toBe(false);

      // 4. Must normalize both values to 40 m/s and 25 m/s in unit conversions
      const convs = result.interpretation.unitConversions;
      const conv40 = convs.find((c) => Math.abs(c.convertedValue - 40) < 0.1);
      const conv25 = convs.find((c) => Math.abs(c.convertedValue - 25) < 0.1);
      expect(conv40).toBeDefined();
      expect(conv25).toBeDefined();

      // 5. Must identify conflicting values and ask user which is correct
      expect(result.interpretation.contradictionReason).toMatch(/144\s*km\/h/i);
      expect(result.interpretation.contradictionReason).toMatch(/90\s*km\/h/i);
      expect(result.interpretation.contradictionReason).toMatch(/which.*correct/i);

      // 6. Must provide contradictionOptions so user can pick which value to continue with
      expect(result.interpretation.contradictionOptions.length).toBeGreaterThanOrEqual(2);
      expect(result.interpretation.contradictionOptions.some((o) => Math.abs(o.value - 40) < 0.1)).toBe(true);
      expect(result.interpretation.contradictionOptions.some((o) => Math.abs(o.value - 25) < 0.1)).toBe(true);
    });

    it("correctly separates contradictory parameters from genuinely missing parameters", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isContradictory: true,
        contradictionReason: "Conflicting initial speeds specified: 144 km/h (40 m/s) and 90 km/h (25 m/s). Which value is correct?",
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: null, // Genuinely omitted!
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: ["launchAngleDegrees"],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Speeds conflict and launch angle is missing.",
      });

      const prompt = "A ball is launched with speeds 144 km/h and 90 km/h under Earth gravity.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isContradictory).toBe(true);
      // initialVelocity is contradictory, NOT in missingRequiredParameters
      expect(result.interpretation.missingRequiredParameters).not.toContain("initialVelocity");
      // launchAngleDegrees was genuinely missing, so it IS in missingRequiredParameters
      expect(result.interpretation.missingRequiredParameters).toContain("launchAngleDegrees");
      expect(result.errors.some((e) => e.includes("launchAngleDegrees"))).toBe(true);
    });

    it("flags contradictory launch directions (horizontal at 45 degrees)", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isContradictory: true,
        contradictionReason: "Contradiction: A launch cannot be both horizontal (0°) and at 45 degrees simultaneously.",
        parameters: {
          initialVelocity: 30,
          launchAngleDegrees: null,
          gravity: 9.81,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Conflicting angle specifications.",
      });

      const prompt = "A projectile is launched horizontally at an angle of 45 degrees with speed 30 m/s.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isContradictory).toBe(true);
      expect(result.interpretation.missingRequiredParameters).not.toContain("launchAngleDegrees");
    });
  });

  // =========================================================================
  // 7. AMBIGUITY & UNDERSPECIFIED QUESTIONS
  // =========================================================================
  describe("Ambiguity detection", () => {
    it("flags missing physical units on critical parameters", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isAmbiguous: true,
        ambiguityReason: "Speed unit is not specified ('thrown with 40'). It could be m/s, km/h, or mph.",
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: 30,
          gravity: 9.81,
        },
        missingRequiredParameters: ["initialVelocity"],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Ambiguous unit for speed.",
      });

      const prompt = "A ball is thrown with 40 at 30 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isAmbiguous).toBe(true);
      expect(result.errors.some((e) => e.includes("Speed unit is not specified"))).toBe(true);
    });

    it("flags non-physics text", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: false,
        module: "projectileMotion",
        isSupported: false,
        unsupportedReason: "Input is not a physics problem or simulation scenario.",
        isAmbiguous: false,
        isContradictory: false,
        parameters: {},
        missingRequiredParameters: ["initialVelocity", "launchAngleDegrees", "gravity"],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Not a physics problem.",
      });

      const prompt = "Write me a poem about the sunset in Paris.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isPhysicsQuestion).toBe(false);
      expect(result.errors.some((e) => e.includes("not appear to be a physics problem"))).toBe(true);
    });
  });

  // =========================================================================
  // 8. UNSUPPORTED PHYSICS
  // =========================================================================
  describe("Unsupported physics flagging", () => {
    it("flags air resistance / aerodynamic drag as unsupported", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: false,
        unsupportedReason: "Air resistance and aerodynamic drag (drag coefficient 0.47) are not supported in Mechanica's ideal 2D projectile motion engine.",
        parameters: {
          initialVelocity: 50,
          launchAngleDegrees: 45,
          gravity: 9.81,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range with drag"],
        unknowns: [],
        constraints: ["Cd = 0.47"],
        unitConversions: [],
        canLaunch: false,
        explanation: "Air drag is not supported.",
      });

      const prompt = "Calculate the trajectory of a sphere launched at 50 m/s at 45 degrees taking air resistance with Cd = 0.47 into account.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isSupported).toBe(false);
      expect(result.errors.some((e) => e.includes("Air resistance"))).toBe(true);
    });

    it("flags Magnus spin / curveball aerodynamics as unsupported", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: false,
        unsupportedReason: "Spin and Magnus effect are not supported in 2D projectile motion.",
        parameters: {
          initialVelocity: 40,
          launchAngleDegrees: 30,
          gravity: 9.81,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Magnus spin is not supported.",
      });

      const prompt = "A baseball is thrown with 1500 RPM backspin at 40 m/s at 30 degrees.";
      const result = await interpretPhysicsQuestion(prompt, { client: mockClient });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isSupported).toBe(false);
    });
  });

  // =========================================================================
  // 9. API FAILURES & ROBUST ERROR HANDLING
  // =========================================================================
  describe("API failure handling", () => {
    it("handles missing API key gracefully", async () => {
      // Empty API key and no environment key
      const prevEnv = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const result = await interpretPhysicsQuestion("A ball is thrown at 20 m/s at 45 degrees.");
        expect(result.success).toBe(false);
        expect(result.canLaunch).toBe(false);
        expect(result.code).toBe("MISSING_API_KEY");
        expect(result.error).toMatch(/GEMINI_API_KEY/i);
      } finally {
        if (prevEnv) process.env.GEMINI_API_KEY = prevEnv;
      }
    });

    it("handles Gemini network/quota errors gracefully", async () => {
      const mockClient = createMockGeminiClient(null, new Error("429 Too Many Requests: Quota exceeded"));
      const result = await interpretPhysicsQuestion("A cannonball is launched at 30 m/s at 40 degrees.", {
        client: mockClient,
      });

      expect(result.success).toBe(false);
      expect(result.canLaunch).toBe(false);
      expect(result.code).toBe("API_ERROR");
      expect(result.error).toContain("429");
    });

    it("handles empty or whitespace prompt input", async () => {
      const result = await interpretPhysicsQuestion("   ");
      expect(result.success).toBe(false);
      expect(result.canLaunch).toBe(false);
      expect(result.code).toBe("EMPTY_INPUT");
    });
  });

  // =========================================================================
  // 10. PASS-THROUGH TO EXISTING VALIDATION AND SOLVER PIPELINE
  // =========================================================================
  describe("Integration with existing Mechanica validation and engine pipeline", () => {
    it("valid spec passes through validateSimulationSpec and can be loaded into engine", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 42,
          launchAngleDegrees: 45,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: ["range"],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "Valid ideal projectile motion spec.",
      });

      const result = await interpretPhysicsQuestion("A projectile is launched at 42 m/s at 45 degrees on Earth.", {
        client: mockClient,
      });

      expect(result.canLaunch).toBe(true);

      // Verify spec strictly passes existing schema validator
      const valResult = validateSimulationSpec(result.spec);
      expect(valResult.valid).toBe(true);

      // Verify spec loads directly into engine and computes correct physical trajectory
      const testEngine = createEngine(scene);
      const loadResult = loadSimulationSpec(testEngine, result.spec, { autoLaunch: false });
      expect(loadResult.valid).toBe(true);

      const state = testEngine.getState();
      expect(state.parameters.initialVelocity).toBe(42);
      expect(state.parameters.launchAngleDegrees).toBe(45);
      expect(state.parameters.gravity).toBe(9.81);

      // Verify theoretical physics calculation: range ≈ v² · sin(2θ) / g
      // 42² · sin(90°) / 9.81 = 1764 / 9.81 ≈ 179.82 m
      expect(state.flightMetrics.range).toBeCloseTo(179.82, 0.5);
      expect(state.predictedTrajectory.length).toBeGreaterThan(10);
    });

    it("rejects parameters that exceed schema ranges via validator", async () => {
      const mockClient = createMockGeminiClient({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        parameters: {
          initialVelocity: 1500, // schema max is 1000
          launchAngleDegrees: 45,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "Hypersonic projectile.",
      });

      const result = await interpretPhysicsQuestion("A rocket projectile is fired at 1500 m/s at 45 degrees.", {
        client: mockClient,
      });

      expect(result.canLaunch).toBe(false);
      expect(result.errors.some((e) => e.includes("out of range"))).toBe(true);
    });
  });
});
