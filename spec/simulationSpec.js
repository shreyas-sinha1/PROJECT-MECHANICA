/**
 * SimulationSpec v1.0 — Structured Projectile Motion Specification
 *
 * This is the contract between any input source and the Mechanica
 * simulation pipeline. The solver, engine, and renderer are agnostic
 * to how this spec was produced.
 *
 * Future AI integration will produce objects conforming to this schema.
 *
 * @typedef {Object} ProjectileMotionSpec
 * @property {number} initialVelocity     - Launch speed in m/s. Range: (0, 1000].
 * @property {number} launchAngleDegrees  - Launch angle in degrees. Range: [0, 90].
 * @property {number} gravity             - Gravitational acceleration in m/s². Range: (0, 100].
 * @property {number} [launchHeight]      - Initial height in m. Range: [0, 1000]. Default: 0.
 *                                          Reserved for future solver extension.
 *
 * @typedef {Object} SimulationSpec
 * @property {string} version             - Schema version. Must be "1.0".
 * @property {string} module              - Physics module identifier. Must be "projectileMotion".
 * @property {ProjectileMotionSpec} parameters - Physical parameters for the simulation.
 * @property {Object} [metadata]          - Optional provenance metadata.
 * @property {string} [metadata.source]   - Origin identifier (e.g. "manual", "ai", "test").
 * @property {string} [metadata.description] - Human-readable description of the scenario.
 */

export const SIMULATION_SPEC_VERSION = "1.0";

export const SUPPORTED_MODULES = ["projectileMotion"];

export const PARAMETER_RANGES = {
  projectileMotion: {
    initialVelocity:    { min: 0.01, max: 1000, required: true },
    launchAngleDegrees: { min: 0,    max: 90,   required: true },
    gravity:            { min: 0.01, max: 100,   required: true },
    launchHeight:       { min: 0,    max: 1000,  required: false, default: 0 },
  }
};
