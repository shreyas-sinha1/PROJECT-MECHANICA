import {
  SIMULATION_SPEC_VERSION,
  SUPPORTED_MODULES,
  PARAMETER_RANGES,
} from "./simulationSpec.js";

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {Object|null} spec        - The validated/normalised spec (null if invalid).
 * @property {string[]} errors         - List of human-readable validation errors.
 * @property {string[]} warnings       - Non-fatal notices (e.g. defaults applied).
 */

/**
 * Validates a SimulationSpec object.
 *
 * Returns a normalised copy with defaults applied, or an error report.
 * Never throws — always returns a ValidationResult.
 *
 * @param {*} input - The raw input to validate.
 * @returns {ValidationResult}
 */
export function validateSimulationSpec(input) {
  const errors = [];
  const warnings = [];

  // 1. Structural checks
  if (input == null || typeof input !== "object") {
    return { valid: false, spec: null, errors: ["Input must be a non-null object."], warnings };
  }

  if (input.version !== SIMULATION_SPEC_VERSION) {
    errors.push(`Unsupported spec version "${input.version}". Expected "${SIMULATION_SPEC_VERSION}".`);
  }

  if (!SUPPORTED_MODULES.includes(input.module)) {
    errors.push(`Unsupported module "${input.module}". Supported: ${SUPPORTED_MODULES.join(", ")}.`);
  }

  if (input.parameters == null || typeof input.parameters !== "object") {
    errors.push("Missing or invalid 'parameters' object.");
    return { valid: false, spec: null, errors, warnings };
  }

  // 2. Parameter validation against schema ranges
  const moduleRanges = PARAMETER_RANGES[input.module];
  if (!moduleRanges) {
    errors.push(`No parameter schema found for module "${input.module}".`);
    return { valid: false, spec: null, errors, warnings };
  }

  const normalised = {};
  for (const [key, range] of Object.entries(moduleRanges)) {
    const value = input.parameters[key];

    if (value === undefined || value === null) {
      if (range.required) {
        errors.push(`Missing required parameter "${key}".`);
      } else {
        normalised[key] = range.default;
        warnings.push(`Parameter "${key}" not provided; using default ${range.default}.`);
      }
      continue;
    }

    const num = Number(value);
    if (!Number.isFinite(num)) {
      errors.push(`Parameter "${key}" must be a finite number. Got: ${value}.`);
      continue;
    }

    if (num < range.min || num > range.max) {
      errors.push(`Parameter "${key}" = ${num} is out of range [${range.min}, ${range.max}].`);
      continue;
    }

    normalised[key] = num;
  }

  if (errors.length > 0) {
    return { valid: false, spec: null, errors, warnings };
  }

  // 3. Build normalised spec
  const validSpec = {
    version: SIMULATION_SPEC_VERSION,
    module: input.module,
    parameters: normalised,
    metadata: input.metadata ?? { source: "unknown" },
  };

  return { valid: true, spec: validSpec, errors: [], warnings };
}
