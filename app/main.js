import { scene } from "../scene/scene.js";
import { createEngine } from "../core/engine.js";
import { createThreeRenderer, createCanvasRenderer } from "../renderer/index.js";
import "../ui/Styles/style.css";

const GRAVITY_PRESETS = {
  Earth: 9.81,
  Moon: 1.62,
  Jupiter: 20
};

// DOM references
const mountEl   = document.getElementById("simulationMount");
const canvasEl  = document.getElementById("simulationCanvas");
const canvasFrame = document.querySelector(".canvas-frame");
const launchButton = document.getElementById("launchButton");
const replayButton = document.getElementById("replayButton");
const resetButton = document.getElementById("resetButton");
const velocitySlider = document.getElementById("velocitySlider");
const angleSlider = document.getElementById("angleSlider");
const gravitySlider = document.getElementById("gravitySlider");
const gravityPresetButtons = document.querySelectorAll(".gravity-preset");
const velocityComponentsToggle = document.getElementById("velocityComponentsToggle");
const view2DToggle = document.getElementById("view2DToggle");

const readoutElements = {
  time: document.getElementById("timeValue"),
  xPosition: document.getElementById("xPositionValue"),
  yPosition: document.getElementById("yPositionValue"),
  xVelocity: document.getElementById("xVelocityValue"),
  yVelocity: document.getElementById("yVelocityValue"),
  resultantVelocity: document.getElementById("resultantVelocityValue"),
  gravity: document.getElementById("gravityValue"),
  flightTime: document.getElementById("flightTimeValue"),
  maximumHeight: document.getElementById("maximumHeightValue"),
  range: document.getElementById("rangeValue")
};

const controlValueElements = {
  velocity: document.getElementById("velocityControlValue"),
  angle: document.getElementById("angleControlValue"),
  gravity: document.getElementById("gravityControlValue"),
  gravityMode: document.getElementById("gravityModeValue")
};

// Pipeline instantiation
const engine = createEngine(scene);

// Both renderers are created once; the proxy delegates to whichever is active.
const threeRenderer  = createThreeRenderer(mountEl);
const canvas2DRenderer = createCanvasRenderer(canvasEl);

let activeRenderer = threeRenderer;

/**
 * Thin proxy so the engine subscriber and all call-sites stay identical
 * regardless of which renderer is currently active.
 */
const renderer = {
  render:                   (state) => activeRenderer.render(state),
  getPointerCanvasPosition: (event) => activeRenderer.getPointerCanvasPosition(event),
  findNearestTrajectoryIndex: (pos, traj) => activeRenderer.findNearestTrajectoryIndex(pos, traj),
  isPointerNearProjectile:  (pos, pt) => activeRenderer.isPointerNearProjectile(pos, pt),
  // Optional on 2D renderer — guard before calling.
  setIsDragging:  (v) => { if (activeRenderer.setIsDragging) activeRenderer.setIsDragging(v); },
  reframeCamera:  (traj) => { if (activeRenderer.reframeCamera) activeRenderer.reframeCamera(traj); },
};

// UI update helpers
function formatNumber(value) {
  return typeof value === "number" ? value.toFixed(2) : "0.00";
}

function getGravityModeLabel(gravity) {
  const matchingPreset = Object.entries(GRAVITY_PRESETS).find(([, presetValue]) => {
    return Math.abs(presetValue - gravity) < 0.01;
  });

  return matchingPreset ? `${matchingPreset[0]} gravity` : "Custom gravity";
}

function updateReadouts(state) {
  if (state.currentPoint) {
    readoutElements.time.textContent = formatNumber(state.currentPoint.time);
    readoutElements.xPosition.textContent = formatNumber(state.currentPoint.xPosition);
    readoutElements.yPosition.textContent = formatNumber(state.currentPoint.yPosition);
    readoutElements.xVelocity.textContent = formatNumber(state.currentPoint.xVelocity);
    readoutElements.yVelocity.textContent = formatNumber(state.currentPoint.yVelocity);
    readoutElements.resultantVelocity.textContent = formatNumber(state.currentPoint.resultantVelocity);
    readoutElements.gravity.textContent = formatNumber(state.currentPoint.gravity);
  }

  if (state.flightMetrics) {
    readoutElements.flightTime.textContent = formatNumber(state.flightMetrics.totalFlightTime);
    readoutElements.maximumHeight.textContent = formatNumber(state.flightMetrics.maximumHeight);
    readoutElements.range.textContent = formatNumber(state.flightMetrics.range);
  }
}

function updateGravityPresetActiveState(gravity) {
  gravityPresetButtons.forEach((button) => {
    const presetGravity = Number(button.dataset.gravity);
    const isActive = Math.abs(presetGravity - gravity) < 0.01;
    button.classList.toggle("is-active", isActive);
  });
}

function updateControlDisplays(state) {
  controlValueElements.velocity.textContent = formatNumber(state.parameters.initialVelocity);
  controlValueElements.angle.textContent = formatNumber(state.parameters.launchAngleDegrees);
  controlValueElements.gravity.textContent = formatNumber(state.parameters.gravity);
  controlValueElements.gravityMode.textContent = getGravityModeLabel(state.parameters.gravity);
  updateGravityPresetActiveState(state.parameters.gravity);
}

function updateButtonStates(state) {
  replayButton.disabled = !state.hasLaunched || state.isAnimating;
}

function syncControlsToState(state) {
  velocitySlider.value = state.parameters.initialVelocity;
  angleSlider.value = state.parameters.launchAngleDegrees;
  gravitySlider.value = state.parameters.gravity;
}

// Engine subscriber: syncs rendering and UI telemetry on every state tick
engine.subscribe((state) => {
  renderer.render(state);
  updateReadouts(state);
  updateControlDisplays(state);
  updateButtonStates(state);
});

// UI Event Handlers
function handleLaunchButtonClick() {
  engine.launch();
}

function handleReplayButtonClick() {
  engine.replay();
}

function handleResetButtonClick() {
  engine.reset();
  syncControlsToState(engine.getState());
  renderer.reframeCamera(engine.getState().predictedTrajectory);
}

function handleVelocityComponentsToggle() {
  engine.setShowVelocityComponents(velocityComponentsToggle.checked);
}

function handle2DViewToggle() {
  const is2D = view2DToggle.checked;

  if (is2D) {
    // Switch to 2D canvas renderer
    mountEl.style.display  = "none";
    canvasEl.style.display = "block";
    activeRenderer = canvas2DRenderer;
  } else {
    // Switch back to 3D Three.js renderer
    canvasEl.style.display = "none";
    mountEl.style.display  = "";
    activeRenderer = threeRenderer;
    // Re-frame the 3D camera in case parameters changed while in 2D mode
    renderer.reframeCamera(engine.getState().predictedTrajectory);
  }

  // Re-render immediately with the current state so there's no blank frame
  renderer.render(engine.getState());
}

function handleParameterInputChange() {
  engine.setParameters({
    initialVelocity: Number(velocitySlider.value),
    launchAngleDegrees: Number(angleSlider.value),
    gravity: Number(gravitySlider.value)
  });
  // Reframe the 3D camera to match the new trajectory extents
  renderer.reframeCamera(engine.getState().predictedTrajectory);
}

function handleGravityPresetClick(event) {
  const selectedGravity = Number(event.currentTarget.dataset.gravity);
  gravitySlider.value = selectedGravity;
  engine.setParameters({ gravity: selectedGravity });
  renderer.reframeCamera(engine.getState().predictedTrajectory);
}

// Canvas Drag Interaction Handlers
function getInspectableTrajectory() {
  const state = engine.getState();
  if (state.activeTrajectory.length > 0) {
    return state.activeTrajectory;
  }
  return state.predictedTrajectory;
}

function inspectTrajectoryAtPointer(event) {
  const trajectory = getInspectableTrajectory();
  if (!trajectory || trajectory.length === 0) {
    return;
  }

  const ndcPosition = renderer.getPointerCanvasPosition(event);
  const trajectoryIndex = renderer.findNearestTrajectoryIndex(ndcPosition, trajectory);
  engine.scrubToTrajectoryIndex(trajectoryIndex);
}

function handleCanvasPointerDown(event) {
  const state = engine.getState();
  const trajectory = getInspectableTrajectory();

  if (!trajectory || trajectory.length === 0 || !state.currentPoint) {
    return;
  }

  const ndcPosition = renderer.getPointerCanvasPosition(event);

  if (!renderer.isPointerNearProjectile(ndcPosition, state.currentPoint)) {
    return;
  }

  engine.setDragging(true);
  renderer.setIsDragging(true);
  canvasFrame.classList.add("is-dragging");
  canvasFrame.setPointerCapture(event.pointerId);
  inspectTrajectoryAtPointer(event);
}

function handleCanvasPointerMove(event) {
  const state = engine.getState();
  if (state.isDragging) {
    inspectTrajectoryAtPointer(event);
    return;
  }

  // Hover affordance: if pointer is within grab proximity of projectile, show manipulation cursor
  const trajectory = getInspectableTrajectory();
  if (trajectory && trajectory.length > 0 && state.currentPoint) {
    const ndcPosition = renderer.getPointerCanvasPosition(event);
    const isNear = renderer.isPointerNearProjectile(ndcPosition, state.currentPoint);
    canvasFrame.classList.toggle("is-hovering-projectile", isNear);
  } else {
    canvasFrame.classList.remove("is-hovering-projectile");
  }
}

function handleCanvasPointerLeave() {
  canvasFrame.classList.remove("is-hovering-projectile");
}

function handleCanvasPointerUp(event) {
  const state = engine.getState();
  if (!state.isDragging) {
    return;
  }

  engine.setDragging(false);
  renderer.setIsDragging(false);
  canvasFrame.classList.remove("is-dragging");
  if (canvasFrame.hasPointerCapture(event.pointerId)) {
    canvasFrame.releasePointerCapture(event.pointerId);
  }
}

function bindControls() {
  launchButton.addEventListener("click", handleLaunchButtonClick);
  replayButton.addEventListener("click", handleReplayButtonClick);
  resetButton.addEventListener("click", handleResetButtonClick);
  // Pointer events on the frame so they work in both 2D and 3D modes.
  canvasFrame.addEventListener("pointerdown", handleCanvasPointerDown);
  canvasFrame.addEventListener("pointermove", handleCanvasPointerMove);
  canvasFrame.addEventListener("pointerup", handleCanvasPointerUp);
  canvasFrame.addEventListener("pointercancel", handleCanvasPointerUp);
  canvasFrame.addEventListener("pointerleave", handleCanvasPointerLeave);
  velocitySlider.addEventListener("input", handleParameterInputChange);
  angleSlider.addEventListener("input", handleParameterInputChange);
  gravitySlider.addEventListener("input", handleParameterInputChange);
  velocityComponentsToggle.addEventListener("change", handleVelocityComponentsToggle);
  view2DToggle.addEventListener("change", handle2DViewToggle);
  const fullscreenLaunch = document.getElementById("fullscreenLaunch");
  if (fullscreenLaunch) {
    fullscreenLaunch.addEventListener("click", handleLaunchButtonClick);
    fullscreenLaunch.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  const fullscreenToggle = document.getElementById("fullscreenToggle");
  if (fullscreenToggle) {
    fullscreenToggle.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        canvasFrame.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
    fullscreenToggle.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  document.addEventListener("fullscreenchange", () => {
    canvasFrame.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  });
  gravityPresetButtons.forEach((button) => {
    button.addEventListener("click", handleGravityPresetClick);
  });
}

// Initial boot
bindControls();
syncControlsToState(engine.getState());
engine.init();
