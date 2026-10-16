import { SIMULATION_SPEC_VERSION } from "./simulationSpec.js";

/**
 * Canonical 45° — maximum range case.
 * Known analytical solution: range = v²/g = 42²/9.81 ≈ 179.82 m
 */
export const SPEC_45_DEGREES = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 42,
    launchAngleDegrees: 45,
    gravity: 9.81,
  },
  metadata: {
    source: "test",
    description: "45° launch — maximum range for flat ground",
  },
};

/**
 * Lunar gravity scenario.
 * Same velocity/angle, much lower gravity → longer flight, higher arc.
 */
export const SPEC_LUNAR = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 42,
    launchAngleDegrees: 45,
    gravity: 1.62,
  },
  metadata: {
    source: "test",
    description: "45° launch under lunar gravity (1.62 m/s²)",
  },
};

/**
 * Steep launch — 80° angle, moderate velocity.
 * Tall, narrow trajectory. Tests renderer scaling with extreme aspect ratios.
 */
export const SPEC_STEEP = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 25,
    launchAngleDegrees: 80,
    gravity: 9.81,
  },
  metadata: {
    source: "test",
    description: "80° steep launch — tall narrow arc",
  },
};

/**
 * Shallow, fast launch — 10° angle, high velocity.
 * Long, flat trajectory. Tests renderer at wide horizontal scale.
 */
export const SPEC_SHALLOW_FAST = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 55,
    launchAngleDegrees: 10,
    gravity: 9.81,
  },
  metadata: {
    source: "test",
    description: "10° shallow fast launch — long flat arc",
  },
};

/**
 * Edge case: zero-degree angle (horizontal launch from ground).
 * Trajectory should be a single point (no flight).
 */
export const SPEC_HORIZONTAL = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 30,
    launchAngleDegrees: 0,
    gravity: 9.81,
  },
  metadata: {
    source: "test",
    description: "Horizontal launch — zero flight time from ground level",
  },
};

/**
 * Edge case: 90° straight-up launch.
 * Zero range, maximum height = v²/(2g).
 */
export const SPEC_VERTICAL = {
  version: SIMULATION_SPEC_VERSION,
  module: "projectileMotion",
  parameters: {
    initialVelocity: 30,
    launchAngleDegrees: 90,
    gravity: 9.81,
  },
  metadata: {
    source: "test",
    description: "Vertical launch — zero range, pure vertical flight",
  },
};
