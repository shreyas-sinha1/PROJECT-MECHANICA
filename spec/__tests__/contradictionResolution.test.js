import { describe, it, expect } from "vitest";
import {
  groupContradictionOptions,
  canResolveContradictions,
  buildResolvedSimulationSpec,
} from "../contradictionResolver.js";
import { SIMULATION_SPEC_VERSION } from "../simulationSpec.js";

describe("contradictionResolver", () => {
  describe("groupContradictionOptions", () => {
    it("returns empty object for empty or invalid input", () => {
      expect(groupContradictionOptions([])).toEqual({});
      expect(groupContradictionOptions(null)).toEqual({});
      expect(groupContradictionOptions(undefined)).toEqual({});
    });

    it("groups options belonging to the same parameter", () => {
      const options = [
        { parameter: "initialVelocity", value: 40, label: "40 m/s (144 km/h)" },
        { parameter: "initialVelocity", value: 25, label: "25 m/s (90 km/h)" },
      ];

      const grouped = groupContradictionOptions(options);
      expect(Object.keys(grouped)).toEqual(["initialVelocity"]);
      expect(grouped.initialVelocity).toHaveLength(2);
      expect(grouped.initialVelocity[0].value).toBe(40);
      expect(grouped.initialVelocity[1].value).toBe(25);
    });

    it("groups options across multiple independent parameters", () => {
      const options = [
        { parameter: "initialVelocity", value: 40, label: "40 m/s" },
        { parameter: "initialVelocity", value: 25, label: "25 m/s" },
        { parameter: "launchAngleDegrees", value: 30, label: "30°" },
        { parameter: "launchAngleDegrees", value: 45, label: "45°" },
      ];

      const grouped = groupContradictionOptions(options);
      expect(Object.keys(grouped).sort()).toEqual(["initialVelocity", "launchAngleDegrees"].sort());
      expect(grouped.initialVelocity).toHaveLength(2);
      expect(grouped.launchAngleDegrees).toHaveLength(2);
    });
  });

  describe("canResolveContradictions — premature launch prevention", () => {
    const singleConflict = ["initialVelocity"];
    const multiConflict = ["initialVelocity", "launchAngleDegrees"];

    it("returns false when no selections have been made", () => {
      expect(canResolveContradictions(singleConflict, {})).toBe(false);
      expect(canResolveContradictions(multiConflict, {})).toBe(false);
      expect(canResolveContradictions([], {})).toBe(false);
    });

    it("returns false when resolution is only partial (multi-parameter conflict)", () => {
      const partialSelection = {
        initialVelocity: { value: 40, label: "40 m/s" },
      };
      // launchAngleDegrees has not been resolved yet
      expect(canResolveContradictions(multiConflict, partialSelection)).toBe(false);
    });

    it("returns false if selection contains invalid, null, or non-finite values", () => {
      expect(
        canResolveContradictions(singleConflict, {
          initialVelocity: { value: NaN, label: "invalid" },
        })
      ).toBe(false);

      expect(
        canResolveContradictions(singleConflict, {
          initialVelocity: null,
        })
      ).toBe(false);
    });

    it("returns true only when every conflicting parameter has a valid selection", () => {
      const resolvedSelection = {
        initialVelocity: { value: 40, label: "40 m/s" },
        launchAngleDegrees: { value: 45, label: "45°" },
      };
      expect(canResolveContradictions(multiConflict, resolvedSelection)).toBe(true);
    });

    it("supports plain numeric values in selections", () => {
      expect(
        canResolveContradictions(singleConflict, {
          initialVelocity: 25,
        })
      ).toBe(true);
    });
  });

  describe("buildResolvedSimulationSpec — pipeline enforcement", () => {
    const baseParams = {
      initialVelocity: null,
      launchAngleDegrees: 45,
      gravity: 9.81,
      launchHeight: 0,
    };
    const conflictingParams = ["initialVelocity"];

    it("strictly blocks premature launch when conflicts are unresolved", () => {
      const result = buildResolvedSimulationSpec(baseParams, conflictingParams, {});
      expect(result.valid).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.errors).toContain(
        "Cannot launch simulation: Unresolved contradictions remain."
      );
    });

    it("blocks premature launch when only 1 of 2 conflicts is resolved", () => {
      const multiBase = {
        initialVelocity: null,
        launchAngleDegrees: null,
        gravity: 9.81,
      };
      const multiConflicts = ["initialVelocity", "launchAngleDegrees"];
      const partialSelections = {
        initialVelocity: { value: 40, label: "40 m/s" },
      };

      const result = buildResolvedSimulationSpec(
        multiBase,
        multiConflicts,
        partialSelections
      );
      expect(result.valid).toBe(false);
      expect(result.spec).toBeNull();
      expect(result.errors[0]).toMatch(/Unresolved contradictions/i);
    });

    it("successfully creates a valid spec when all conflicts are resolved", () => {
      const selections = {
        initialVelocity: { value: 40, label: "40 m/s (144 km/h)" },
      };

      const result = buildResolvedSimulationSpec(
        baseParams,
        conflictingParams,
        selections,
        { description: "Launch with 144 km/h resolved" }
      );

      expect(result.valid).toBe(true);
      expect(result.spec).not.toBeNull();
      expect(result.spec.version).toBe(SIMULATION_SPEC_VERSION);
      expect(result.spec.module).toBe("projectileMotion");
      expect(result.spec.parameters.initialVelocity).toBe(40);
      expect(result.spec.parameters.launchAngleDegrees).toBe(45);
      expect(result.spec.parameters.gravity).toBe(9.81);
      expect(result.spec.metadata.resolvedContradictions).toEqual([
        {
          parameter: "initialVelocity",
          chosenValue: 40,
          label: "40 m/s (144 km/h)",
        },
      ]);
    });

    it("allows switching choice before continuing and builds spec with the latest selection", () => {
      let selections = {
        initialVelocity: { value: 40, label: "40 m/s" },
      };

      // User changes their mind to 25 m/s
      selections = {
        initialVelocity: { value: 25, label: "25 m/s" },
      };

      const result = buildResolvedSimulationSpec(
        baseParams,
        conflictingParams,
        selections
      );
      expect(result.valid).toBe(true);
      expect(result.spec.parameters.initialVelocity).toBe(25);
    });

    it("runs through existing validation pipeline and flags out-of-bounds parameter values", () => {
      // If a conflicting option has an invalid physics value (e.g. negative velocity or angle > 90)
      const selections = {
        initialVelocity: { value: -50, label: "-50 m/s" },
      };

      const result = buildResolvedSimulationSpec(
        baseParams,
        conflictingParams,
        selections
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((err) => /initialVelocity/i.test(err))).toBe(true);
    });

    it("flags missing non-conflicting required parameters through existing validation pipeline", () => {
      const missingAngleBase = {
        initialVelocity: null,
        launchAngleDegrees: null, // missing required parameter
        gravity: 9.81,
      };
      const selections = {
        initialVelocity: { value: 40, label: "40 m/s" },
      };

      const result = buildResolvedSimulationSpec(
        missingAngleBase,
        ["initialVelocity"],
        selections
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => /launchAngleDegrees/i.test(err))).toBe(true);
    });
  });
});
