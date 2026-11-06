import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveProvider, interpretWithAI, ENABLE_AUTOMATIC_FAILOVER } from "../../server/aiService.js";
import { SIMULATION_SPEC_VERSION } from "../simulationSpec.js";
import { loadSimulationSpec } from "../adapter.js";
import { createEngine } from "../../core/engine.js";
import { scene } from "../../scene/scene.js";

describe("Multi-Provider Architecture & AI Service (server/aiService.js)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Provider Selection (resolveProvider)", () => {
    it("defaults to tinfoil as primary provider when no env or option is specified", () => {
      delete process.env.AI_PROVIDER;
      expect(resolveProvider({})).toBe("tinfoil");
    });

    it("respects AI_PROVIDER=gemini from environment", () => {
      process.env.AI_PROVIDER = "gemini";
      expect(resolveProvider({})).toBe("gemini");
    });

    it("respects AI_PROVIDER=tinfoil from environment", () => {
      process.env.AI_PROVIDER = "tinfoil";
      expect(resolveProvider({})).toBe("tinfoil");
    });

    it("allows explicit options.provider override over environment", () => {
      process.env.AI_PROVIDER = "tinfoil";
      expect(resolveProvider({ provider: "gemini" })).toBe("gemini");
    });

    it("routes to gemini if options.client (mock or custom GoogleGenAI) is provided", () => {
      delete process.env.AI_PROVIDER;
      expect(resolveProvider({ client: {} })).toBe("gemini");
    });
  });

  describe("Automatic Failover Architecture Invariant", () => {
    it("has automatic failover deactivated per specification", () => {
      expect(ENABLE_AUTOMATIC_FAILOVER).toBe(false);
    });
  });

  describe("Tinfoil Provider Interpretation & Downstream Contract", () => {
    function createMockTinfoilFetch(payload) {
      return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(payload),
              },
            },
          ],
        }),
      });
    }

    it("successfully processes natural-language projectile problem through Tinfoil", async () => {
      process.env.TINFOIL_API_KEY = "tk_valid_key";
      const mockFetch = createMockTinfoilFetch({
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
        requestedOutputs: ["range", "maximum height"],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: true,
        explanation: "A projectile launched at 50 m/s at 30 degrees.",
      });

      const prompt = "A cannonball is launched at 50 m/s at an angle of 30 degrees.";
      const result = await interpretWithAI(prompt, { provider: "tinfoil", fetch: mockFetch });

      expect(result.success).toBe(true);
      expect(result.canLaunch).toBe(true);
      expect(result.provider).toBe("tinfoil");
      expect(result.spec).not.toBeNull();
      expect(result.spec.version).toBe(SIMULATION_SPEC_VERSION);
      expect(result.spec.module).toBe("projectileMotion");
      expect(result.spec.parameters.initialVelocity).toBe(50);
      expect(result.spec.parameters.launchAngleDegrees).toBe(30);
      expect(result.spec.parameters.gravity).toBe(9.81);
      expect(result.spec.parameters.launchHeight).toBe(0);
      expect(result.interpretation.requestedOutputs).toContain("range");

      // Verify downstream simulation engine integration
      const engine = createEngine({ scene });
      const loadRes = loadSimulationSpec(engine, result.spec, { autoLaunch: false });
      expect(loadRes.valid).toBe(true);
      const state = engine.getState();
      expect(state.parameters.initialVelocity).toBe(50);
      expect(state.parameters.launchAngleDegrees).toBe(30);
    });

    it("does not silently invent missing parameters (missing initial velocity)", async () => {
      process.env.TINFOIL_API_KEY = "tk_valid_key";
      const mockFetch = createMockTinfoilFetch({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isAmbiguous: false,
        isContradictory: false,
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: 45,
          gravity: 9.81,
          launchHeight: 0,
        },
        missingRequiredParameters: ["initialVelocity"],
        requestedOutputs: ["initialVelocity"],
        unknowns: ["initialVelocity"],
        constraints: ["range: 100m"],
        unitConversions: [],
        canLaunch: false,
        explanation: "Initial velocity is unknown and requested to be calculated.",
      });

      const prompt = "Find the initial velocity needed to reach a range of 100m at 45 degrees.";
      const result = await interpretWithAI(prompt, { provider: "tinfoil", fetch: mockFetch });

      expect(result.success).toBe(true);
      expect(result.canLaunch).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.interpretation.missingRequiredParameters).toContain("initialVelocity");
      expect(result.errors.some((e) => e.includes("initialVelocity"))).toBe(true);
    });

    it("handles contradictory parameters and generates interactive options", async () => {
      process.env.TINFOIL_API_KEY = "tk_valid_key";
      const mockFetch = createMockTinfoilFetch({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: true,
        isAmbiguous: false,
        isContradictory: true,
        contradictionReason: "Conflicting initial speeds: 144 km/h (40 m/s) and 90 km/h (25 m/s). Which value is correct?",
        contradictionOptions: [
          { parameter: "initialVelocity", label: "40 m/s (144 km/h)", value: 40, originalText: "144 km/h" },
          { parameter: "initialVelocity", label: "25 m/s (90 km/h)", value: 25, originalText: "90 km/h" },
        ],
        parameters: {
          initialVelocity: null,
          launchAngleDegrees: 45,
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
        explanation: "Contradictory launch velocities detected.",
      });

      const prompt = "A rock thrown at 144 km/h and also 90 km/h at 45 degrees.";
      const result = await interpretWithAI(prompt, { provider: "tinfoil", fetch: mockFetch });

      expect(result.canLaunch).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.interpretation.isContradictory).toBe(true);
      expect(result.interpretation.contradictionOptions).toHaveLength(2);
      expect(result.interpretation.missingRequiredParameters).not.toContain("initialVelocity");
    });

    it("detects and flags unsupported physics (e.g. air drag, crosswinds)", async () => {
      process.env.TINFOIL_API_KEY = "tk_valid_key";
      const mockFetch = createMockTinfoilFetch({
        isPhysicsQuestion: true,
        module: "projectileMotion",
        isSupported: false,
        unsupportedReason: "Air drag and aerodynamic drag coefficient are not supported in ideal 2D projectile motion.",
        parameters: {
          initialVelocity: 100,
          launchAngleDegrees: 45,
          gravity: 9.81,
        },
        missingRequiredParameters: [],
        requestedOutputs: [],
        unknowns: [],
        constraints: [],
        unitConversions: [],
        canLaunch: false,
        explanation: "Problem specifies air resistance which is unsupported.",
      });

      const prompt = "Launch a shell at 100 m/s with air resistance drag coefficient 0.4.";
      const result = await interpretWithAI(prompt, { provider: "tinfoil", fetch: mockFetch });

      expect(result.canLaunch).toBe(false);
      expect(result.interpretation.isSupported).toBe(false);
      expect(result.errors.some((e) => e.includes("Air drag"))).toBe(true);
    });

    it("reports provider-specific error cleanly without silent switching", async () => {
      process.env.TINFOIL_API_KEY = "tk_invalid";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API key." } }),
      });

      const result = await interpretWithAI("Launch at 30 m/s at 45 degrees", {
        provider: "tinfoil",
        fetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.canLaunch).toBe(false);
      expect(result.code).toBe("INVALID_API_KEY");
      expect(result.provider).toBe("tinfoil");
      expect(result.error).toContain("Tinfoil API authentication failed");
    });
  });
});
