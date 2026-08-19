import * as solver from "./solver.js";

/**
 * Calculates the complete projectile motion given parameters.
 * Normalizes input parameters and delegates calculations to solver.js.
 *
 * @param {Object} parameters - Parameters including velocity, angle, gravity.
 * @param {number} [timeStep=1/120] - Delta time step for trajectory integration.
 * @returns {Object} Calculated trajectory, flight metrics, and initial point.
 */
export function computeProjectileMotion(parameters, timeStep = 1 / 120) {
  const normalizedParams = {
    initialVelocity: parameters.initialVelocity ?? parameters.velocity,
    launchAngleDegrees: parameters.launchAngleDegrees ?? parameters.angle,
    gravity: parameters.gravity
  };

  const { trajectory, flightMetrics } = solver.calculateTrajectory(normalizedParams, timeStep);
  const initialPoint = solver.createInitialPoint(normalizedParams);

  return {
    trajectory,
    flightMetrics,
    initialPoint,
    parameters: normalizedParams
  };
}

export { solver };
