/**
 * Factory for creating the simulation state representation.
 * Holds physical parameters, computed trajectories, current point telemetry,
 * and animation/interaction state flags.
 *
 * @param {Object} [initialParams] - Initial physical parameters.
 * @returns {Object} Fresh simulation state object.
 */
export function createSimulationState(initialParams = {}) {
  return {
    parameters: {
      initialVelocity: initialParams.initialVelocity ?? initialParams.velocity ?? 42,
      launchAngleDegrees: initialParams.launchAngleDegrees ?? initialParams.angle ?? 42,
      gravity: initialParams.gravity ?? 9.81
    },
    predictedTrajectory: [],
    flightMetrics: null,
    activeTrajectory: [],
    launchedTrajectory: [],
    launchedFlightMetrics: null,
    currentPoint: null,
    currentTrajectoryIndex: 0,
    isAnimating: false,
    isDragging: false,
    hasLaunched: false,
    showVelocityComponents: false
  };
}
