import { validateSimulationSpec } from "./validate.js";

/**
 * Loads a SimulationSpec into a running engine instance.
 *
 * Validates the spec, applies parameters via the engine's existing API,
 * and optionally triggers a launch. Returns the validation result for
 * the caller to inspect.
 *
 * @param {Object} engine  - A Mechanica engine instance (from createEngine).
 * @param {Object} rawSpec - A raw SimulationSpec object.
 * @param {Object} [options]
 * @param {boolean} [options.autoLaunch=true] - Whether to auto-launch after loading.
 * @returns {import('./validate.js').ValidationResult}
 */
export function loadSimulationSpec(engine, rawSpec, options = {}) {
  const { autoLaunch = true } = options;
  const result = validateSimulationSpec(rawSpec);

  if (!result.valid) {
    console.error("[Mechanica] Invalid SimulationSpec:", result.errors);
    return result;
  }

  if (result.warnings.length > 0) {
    console.warn("[Mechanica] SimulationSpec warnings:", result.warnings);
  }

  const { parameters } = result.spec;

  // Use the engine's existing parameter-setting pathway.
  // This preserves all existing state management, trajectory
  // recalculation, and subscriber notification.
  engine.setParameters({
    initialVelocity: parameters.initialVelocity,
    launchAngleDegrees: parameters.launchAngleDegrees,
    gravity: parameters.gravity,
  });

  if (autoLaunch) {
    engine.launch();
  }

  return result;
}
