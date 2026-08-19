import { computeProjectileMotion } from "../modules/projectileMotion/index.js";
import { createSimulationState } from "./simulationState.js";

const TIME_STEP = 1 / 120;

/**
 * Creates and initializes the simulation engine.
 * Orchestrates physical computation, state management, and animation frames.
 *
 * @param {Object} scene - Initial scene description.
 * @returns {Object} Simulation engine instance.
 */
export function createEngine(scene) {
  const initialProjectile = scene?.projectile || {};
  const defaultParameters = {
    initialVelocity: initialProjectile.velocity ?? 42,
    launchAngleDegrees: initialProjectile.angle ?? 42,
    gravity: initialProjectile.gravity ?? 9.81
  };

  const state = createSimulationState(defaultParameters);
  let animationFrameId = null;
  let animationStartTime = 0;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function stopAnimation() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    state.isAnimating = false;
  }

  function recalculatePredictedMotion() {
    const motion = computeProjectileMotion(state.parameters, TIME_STEP);
    state.predictedTrajectory = motion.trajectory;
    state.flightMetrics = motion.flightMetrics;
  }

  function animationLoop(timestamp) {
    if (animationStartTime === 0) {
      animationStartTime = timestamp;
    }

    const elapsedSeconds = (timestamp - animationStartTime) / 1000;
    const trajectoryIndex = Math.min(
      Math.floor(elapsedSeconds / TIME_STEP),
      state.activeTrajectory.length - 1
    );

    state.currentPoint = state.activeTrajectory[trajectoryIndex];
    state.currentTrajectoryIndex = trajectoryIndex;
    notify();

    if (trajectoryIndex < state.activeTrajectory.length - 1) {
      animationFrameId = requestAnimationFrame(animationLoop);
      return;
    }

    state.isAnimating = false;
    animationFrameId = null;
    notify();
  }

  function playStoredTrajectory() {
    if (state.launchedTrajectory.length === 0) {
      return;
    }

    stopAnimation();
    state.activeTrajectory = state.launchedTrajectory;
    state.flightMetrics = state.launchedFlightMetrics;
    animationStartTime = 0;
    state.isAnimating = true;
    animationFrameId = requestAnimationFrame(animationLoop);
    notify();
  }

  function launch() {
    recalculatePredictedMotion();
    state.launchedTrajectory = state.predictedTrajectory.slice();
    state.launchedFlightMetrics = { ...state.flightMetrics };
    state.currentPoint = state.launchedTrajectory[0];
    state.currentTrajectoryIndex = 0;
    state.hasLaunched = true;
    playStoredTrajectory();
  }

  function replay() {
    playStoredTrajectory();
  }

  function reset() {
    stopAnimation();
    state.activeTrajectory = [];
    state.launchedTrajectory = [];
    state.launchedFlightMetrics = null;
    state.parameters.initialVelocity = defaultParameters.initialVelocity;
    state.parameters.launchAngleDegrees = defaultParameters.launchAngleDegrees;
    state.parameters.gravity = defaultParameters.gravity;
    recalculatePredictedMotion();
    const motion = computeProjectileMotion(state.parameters, TIME_STEP);
    state.currentPoint = motion.initialPoint;
    state.currentTrajectoryIndex = 0;
    state.hasLaunched = false;
    notify();
  }

  function setParameters(newParams) {
    stopAnimation();
    state.activeTrajectory = [];
    if (newParams.initialVelocity !== undefined) {
      state.parameters.initialVelocity = Number(newParams.initialVelocity);
    }
    if (newParams.launchAngleDegrees !== undefined) {
      state.parameters.launchAngleDegrees = Number(newParams.launchAngleDegrees);
    }
    if (newParams.gravity !== undefined) {
      state.parameters.gravity = Number(newParams.gravity);
    }
    recalculatePredictedMotion();
    const motion = computeProjectileMotion(state.parameters, TIME_STEP);
    state.currentPoint = motion.initialPoint;
    state.currentTrajectoryIndex = 0;
    notify();
  }

  function setShowVelocityComponents(show) {
    state.showVelocityComponents = Boolean(show);
    notify();
  }

  function scrubToTrajectoryIndex(index) {
    const trajectory = state.activeTrajectory.length > 0
      ? state.activeTrajectory
      : state.predictedTrajectory;

    if (!trajectory || trajectory.length === 0) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(index, trajectory.length - 1));
    state.currentPoint = trajectory[clampedIndex];
    state.currentTrajectoryIndex = clampedIndex;
    notify();
  }

  function setDragging(isDragging) {
    if (isDragging) {
      stopAnimation();
    }
    state.isDragging = Boolean(isDragging);
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getState() {
    return state;
  }

  function init() {
    recalculatePredictedMotion();
    const motion = computeProjectileMotion(state.parameters, TIME_STEP);
    state.currentPoint = motion.initialPoint;
    state.currentTrajectoryIndex = 0;
    notify();
  }

  return {
    init,
    getState,
    launch,
    replay,
    reset,
    setParameters,
    setShowVelocityComponents,
    scrubToTrajectoryIndex,
    setDragging,
    stopAnimation,
    subscribe,
    TIME_STEP
  };
}
