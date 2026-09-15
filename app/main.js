import { scene } from "../scene/scene.js";
import { createEngine } from "../core/engine.js";
import { createCanvasRenderer3D, createCanvasRenderer2D } from "../renderer/index.js";
import "../ui/Styles/style.css";

const GRAVITY_PRESETS = {
  Earth: 9.81,
  Moon: 1.62,
  Jupiter: 20
};

let canvas = document.getElementById("simulationCanvas");
const launchButton = document.getElementById("launchButton");
const replayButton = document.getElementById("replayButton");
const resetButton = document.getElementById("resetButton");
const velocitySlider = document.getElementById("velocitySlider");
const angleSlider = document.getElementById("angleSlider");
const gravitySlider = document.getElementById("gravitySlider");
const gravityPresetButtons = document.querySelectorAll(".gravity-preset");
const velocityComponentsToggle = document.getElementById("velocityComponentsToggle");
const view2DToggle = document.getElementById("view2DToggle");
const canvasFrame = document.querySelector(".canvas-frame");

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

const engine = createEngine(scene);
let renderer = createCanvasRenderer3D(canvas);
let is2DView = false;

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

engine.subscribe((state) => {
  renderer.render(state);
  updateReadouts(state);
  updateControlDisplays(state);
  updateButtonStates(state);
});

function handleLaunchButtonClick() {
  engine.launch();
}

function handleReplayButtonClick() {
  engine.replay();
}

function handleResetButtonClick() {
  engine.reset();
  syncControlsToState(engine.getState());
}

function handleVelocityComponentsToggle() {
  engine.setShowVelocityComponents(velocityComponentsToggle.checked);
}

function handleView2DToggle() {
  is2DView = view2DToggle.checked;

  if (renderer && renderer.destroy) {
    renderer.destroy();
  }

  const newCanvas = document.createElement("canvas");
  newCanvas.id = "simulationCanvas";
  newCanvas.width = 900;
  newCanvas.height = 520;
  newCanvas.textContent = "Your browser does not support the canvas element.";

  canvasFrame.replaceChild(newCanvas, canvas);
  canvas = newCanvas;

  bindCanvasControls();

  renderer = is2DView ? createCanvasRenderer2D(canvas) : createCanvasRenderer3D(canvas);

  renderer.render(engine.getState());
}

function handleParameterInputChange() {
  engine.setParameters({
    initialVelocity: Number(velocitySlider.value),
    launchAngleDegrees: Number(angleSlider.value),
    gravity: Number(gravitySlider.value)
  });
}

function handleGravityPresetClick(event) {
  const selectedGravity = Number(event.currentTarget.dataset.gravity);
  gravitySlider.value = selectedGravity;
  engine.setParameters({ gravity: selectedGravity });
}

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

  const canvasPosition = renderer.getPointerCanvasPosition(event);
  const trajectoryIndex = renderer.findNearestTrajectoryIndex(canvasPosition, trajectory);
  engine.scrubToTrajectoryIndex(trajectoryIndex);
}

function handleCanvasPointerDown(event) {
  const state = engine.getState();
  const trajectory = getInspectableTrajectory();

  if (!trajectory || trajectory.length === 0 || !state.currentPoint) {
    return;
  }

  const canvasPosition = renderer.getPointerCanvasPosition(event);

  if (!renderer.isPointerNearProjectile(canvasPosition, state.currentPoint)) {
    return;
  }

  engine.setDragging(true);
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
  inspectTrajectoryAtPointer(event);
}

function handleCanvasPointerMove(event) {
  const state = engine.getState();
  if (!state.isDragging) {
    return;
  }
  inspectTrajectoryAtPointer(event);
}

function handleCanvasPointerUp(event) {
  const state = engine.getState();
  if (!state.isDragging) {
    return;
  }

  engine.setDragging(false);
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function bindCanvasControls() {
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  canvas.addEventListener("pointermove", handleCanvasPointerMove);
  canvas.addEventListener("pointerup", handleCanvasPointerUp);
  canvas.addEventListener("pointercancel", handleCanvasPointerUp);
}

function bindControls() {
  launchButton.addEventListener("click", handleLaunchButtonClick);
  replayButton.addEventListener("click", handleReplayButtonClick);
  resetButton.addEventListener("click", handleResetButtonClick);
  velocitySlider.addEventListener("input", handleParameterInputChange);
  angleSlider.addEventListener("input", handleParameterInputChange);
  gravitySlider.addEventListener("input", handleParameterInputChange);
  velocityComponentsToggle.addEventListener("change", handleVelocityComponentsToggle);
  if (view2DToggle) {
    view2DToggle.addEventListener("change", handleView2DToggle);
  }
  gravityPresetButtons.forEach((button) => {
    button.addEventListener("click", handleGravityPresetClick);
  });
  bindCanvasControls();
}

bindControls();
syncControlsToState(engine.getState());
engine.init();
