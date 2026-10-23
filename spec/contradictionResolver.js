import { SIMULATION_SPEC_VERSION } from "./simulationSpec.js";
import { validateSimulationSpec } from "./validate.js";

/**
 * Groups contradiction options by their target parameter key.
 *
 * @param {Array<{parameter: string, label: string, value: number, originalText?: string}>} options
 * @returns {Record<string, Array<{parameter: string, label: string, value: number, originalText?: string}>>}
 */
export function groupContradictionOptions(options = []) {
  const grouped = {};
  if (!Array.isArray(options)) return grouped;

  for (const opt of options) {
    if (!opt || !opt.parameter) continue;
    const param = opt.parameter;
    if (!grouped[param]) grouped[param] = [];
    grouped[param].push(opt);
  }

  return grouped;
}

/**
 * Returns true ONLY when every parameter with conflicting options has a chosen value.
 *
 * @param {string[]} conflictingParams - List of parameter keys that have conflicts.
 * @param {Record<string, {value: number, label?: string}|number>} selections - Current user selections.
 * @returns {boolean}
 */
export function canResolveContradictions(conflictingParams = [], selections = {}) {
  if (!Array.isArray(conflictingParams) || conflictingParams.length === 0) {
    return false;
  }

  return conflictingParams.every((param) => {
    const selected = selections[param];
    if (selected === undefined || selected === null) return false;
    const val = typeof selected === "object" ? selected.value : selected;
    return typeof val === "number" && Number.isFinite(val);
  });
}

/**
 * Constructs and validates a SimulationSpec using resolved contradiction selections.
 * Enforces that all conflicts are resolved before allowing a spec to be created.
 *
 * @param {Object} baseParameters - Existing parameters from interpretation.
 * @param {string[]} conflictingParams - Parameters that required resolution.
 * @param {Record<string, {value: number, label?: string}|number>} selections - User's chosen values.
 * @param {Object} [metadata] - Additional metadata for the spec.
 * @returns {import('./validate.js').ValidationResult}
 */
export function buildResolvedSimulationSpec(
  baseParameters = {},
  conflictingParams = [],
  selections = {},
  metadata = {}
) {
  if (!canResolveContradictions(conflictingParams, selections)) {
    return {
      valid: false,
      spec: null,
      errors: ["Cannot launch simulation: Unresolved contradictions remain."],
      warnings: [],
    };
  }

  const mergedParams = {
    initialVelocity: baseParameters.initialVelocity ?? null,
    launchAngleDegrees: baseParameters.launchAngleDegrees ?? null,
    gravity: baseParameters.gravity ?? 9.81,
    launchHeight: baseParameters.launchHeight ?? 0,
  };

  // Apply user selections
  for (const param of conflictingParams) {
    const selected = selections[param];
    const val = typeof selected === "object" ? selected.value : selected;
    mergedParams[param] = val;
  }

  const candidateSpec = {
    version: SIMULATION_SPEC_VERSION,
    module: "projectileMotion",
    parameters: mergedParams,
    metadata: {
      source: "ai",
      resolvedContradictions: conflictingParams.map((p) => ({
        parameter: p,
        chosenValue: mergedParams[p],
        label: typeof selections[p] === "object" ? selections[p].label : String(mergedParams[p]),
      })),
      ...metadata,
    },
  };

  return validateSimulationSpec(candidateSpec);
}
