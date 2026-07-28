import { scene } from "../scene/scene.js";
import "../ui/Styles/style.css";

// Constants
const TIME_STEP = 1 / 120;
const GROUND_MARGIN = 56;
const CANVAS_PADDING = 44;
const PROJECTILE_RADIUS = 6;
const VELOCITY_VECTOR_SCALE = 2;
const GRAVITY_VECTOR_LENGTH = 48;
const MAXIMUM_HEIGHT_VELOCITY_TOLERANCE = 0.2;

const GRAVITY_PRESETS = {
  Earth: 9.81,
  Moon: 1.62,
  Jupiter: 20
};

const CANVAS_COLORS = {
  paper: "#ffffff",
  grid: "#e8ecf0",
  gridMajor: "#d0d6de",
  axis: "#2a3138",
  trajectory: "#2f6b72",
  trajectoryPrediction: "#7a9aa0",
  projectile: "#15181c",
  launchPoint: "#2f6b72",
  velocity: "#2a5f9e",
  velocityX: "#5a8fc4",
  velocityY: "#3d7aa8",
  gravity: "#9a4034",
  annotation: "#5c6570"
};

const CANVAS_FONT = "12px \"IBM Plex Sans\", \"Segoe UI\", sans-serif";
const CANVAS_FONT_LABEL = "13px \"IBM Plex Sans\", \"Segoe UI\", sans-serif";

// DOM references
const canvas = document.getElementById("simulationCanvas");
const context = canvas.getContext("2d");
const launchButton = document.getElementById("launchButton");
const replayButton = document.getElementById("replayButton");
const resetButton = document.getElementById("resetButton");
const velocitySlider = document.getElementById("velocitySlider");
const angleSlider = document.getElementById("angleSlider");
const gravitySlider = document.getElementById("gravitySlider");
const gravityPresetButtons = document.querySelectorAll(".gravity-preset");
const velocityComponentsToggle = document.getElementById("velocityComponentsToggle");
const physicsInsightText = document.getElementById("physicsInsightText");

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

// Simulation state
const simulationState = {
  animationFrameId: null,
  animationStartTime: 0,
  activeTrajectory: [],
  predictedTrajectory: [],
  launchedTrajectory: [],
  currentPoint: null,
  currentTrajectoryIndex: 0,
  flightMetrics: null,
  launchedFlightMetrics: null,
  isAnimating: false,
  isDragging: false,
  hasLaunched: false,
  showVelocityComponents: false,
  explanationState: "beforeLaunch",
  parameters: {
    initialVelocity: scene.projectile.velocity,
    launchAngleDegrees: scene.projectile.angle,
    gravity: scene.projectile.gravity
  },
  scale: {
    pixelsPerMeter: 1,
    originX: CANVAS_PADDING,
    originY: canvas.height - GROUND_MARGIN
  }
};

// Physics calculations
function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateInitialVelocityComponents() {
  const launchAngleRadians = degreesToRadians(simulationState.parameters.launchAngleDegrees);

  return {
    xVelocity: simulationState.parameters.initialVelocity * Math.cos(launchAngleRadians),
    yVelocity: simulationState.parameters.initialVelocity * Math.sin(launchAngleRadians)
  };
}

function calculateProjectilePoint(time, initialComponents) {
  const xPosition = initialComponents.xVelocity * time;
  const yPosition = (initialComponents.yVelocity * time) - (0.5 * simulationState.parameters.gravity * time * time);
  const yVelocity = initialComponents.yVelocity - (simulationState.parameters.gravity * time);
  const resultantVelocity = Math.hypot(initialComponents.xVelocity, yVelocity);

  return {
    time,
    xPosition,
    yPosition: Math.max(0, yPosition),
    xVelocity: initialComponents.xVelocity,
    yVelocity,
    resultantVelocity,
    gravity: simulationState.parameters.gravity
  };
}

function calculateFlightMetrics(initialComponents) {
  const gravity = simulationState.parameters.gravity;
  const totalFlightTime = initialComponents.yVelocity > 0 ? (2 * initialComponents.yVelocity) / gravity : 0;
  const maximumHeight = initialComponents.yVelocity > 0 ? (initialComponents.yVelocity * initialComponents.yVelocity) / (2 * gravity) : 0;
  const range = initialComponents.xVelocity * totalFlightTime;

  return {
    totalFlightTime,
    maximumHeight,
    range
  };
}

function calculateTrajectory() {
  const initialComponents = calculateInitialVelocityComponents();
  const flightMetrics = calculateFlightMetrics(initialComponents);
  const trajectory = [];

  for (let time = 0; time < flightMetrics.totalFlightTime; time += TIME_STEP) {
    trajectory.push(calculateProjectilePoint(time, initialComponents));
  }

  trajectory.push(calculateProjectilePoint(flightMetrics.totalFlightTime, initialComponents));

  return {
    trajectory,
    flightMetrics
  };
}

function recalculatePredictedMotion() {
  const motion = calculateTrajectory();

  simulationState.predictedTrajectory = motion.trajectory;
  simulationState.flightMetrics = motion.flightMetrics;
  calculateRenderScale(simulationState.predictedTrajectory);
}

// Rendering
function calculateRenderScale(trajectory) {
  const maximumX = Math.max(...trajectory.map((point) => point.xPosition), 1);
  const maximumY = Math.max(...trajectory.map((point) => point.yPosition), 1);
  const usableWidth = canvas.width - (CANVAS_PADDING * 2);
  const usableHeight = canvas.height - GROUND_MARGIN - CANVAS_PADDING;
  const xScale = usableWidth / maximumX;
  const yScale = usableHeight / maximumY;

  simulationState.scale.pixelsPerMeter = Math.min(xScale, yScale);
}

function convertMetersToCanvasPosition(point) {
  return {
    x: simulationState.scale.originX + (point.xPosition * simulationState.scale.pixelsPerMeter),
    y: simulationState.scale.originY - (point.yPosition * simulationState.scale.pixelsPerMeter)
  };
}

function clearCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCanvasBackground() {
  context.fillStyle = CANVAS_COLORS.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMeasurementGrid() {
  const minorStep = 20;
  const majorStep = 100;

  context.save();
  context.lineWidth = 1;

  for (let x = simulationState.scale.originX; x < canvas.width; x += minorStep) {
    context.beginPath();
    context.moveTo(x, CANVAS_PADDING);
    context.lineTo(x, simulationState.scale.originY);
    context.strokeStyle = (x - simulationState.scale.originX) % majorStep === 0 ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.grid;
    context.stroke();
  }

  for (let y = simulationState.scale.originY; y > CANVAS_PADDING; y -= minorStep) {
    context.beginPath();
    context.moveTo(simulationState.scale.originX, y);
    context.lineTo(canvas.width - CANVAS_PADDING, y);
    context.strokeStyle = (simulationState.scale.originY - y) % majorStep === 0 ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.grid;
    context.stroke();
  }

  context.restore();
}

function drawAxisLabels() {
  context.fillStyle = CANVAS_COLORS.annotation;
  context.font = CANVAS_FONT;
  context.fillText("x position (m)", canvas.width - 126, simulationState.scale.originY + 28);
  context.save();
  context.translate(simulationState.scale.originX - 28, CANVAS_PADDING + 84);
  context.rotate(-Math.PI / 2);
  context.fillText("y position (m)", 0, 0);
  context.restore();
}

function drawGroundLine() {
  context.beginPath();
  context.moveTo(simulationState.scale.originX, simulationState.scale.originY);
  context.lineTo(canvas.width - CANVAS_PADDING, simulationState.scale.originY);
  context.lineWidth = 2;
  context.strokeStyle = CANVAS_COLORS.axis;
  context.stroke();

  context.beginPath();
  context.moveTo(simulationState.scale.originX, simulationState.scale.originY);
  context.lineTo(simulationState.scale.originX, CANVAS_PADDING);
  context.lineWidth = 2;
  context.strokeStyle = CANVAS_COLORS.axis;
  context.stroke();

  drawAxisLabels();
}

function drawLaunchPoint() {
  context.beginPath();
  context.arc(simulationState.scale.originX, simulationState.scale.originY, 5, 0, Math.PI * 2);
  context.fillStyle = CANVAS_COLORS.launchPoint;
  context.fill();
}

function drawTrajectoryPath(visibleTrajectory, strokeColor = CANVAS_COLORS.trajectory) {
  if (visibleTrajectory.length < 2) {
    return;
  }

  context.beginPath();
  visibleTrajectory.forEach((point, index) => {
    const canvasPosition = convertMetersToCanvasPosition(point);

    if (index === 0) {
      context.moveTo(canvasPosition.x, canvasPosition.y);
    } else {
      context.lineTo(canvasPosition.x, canvasPosition.y);
    }
  });
  context.lineWidth = 2;
  context.strokeStyle = strokeColor;
  context.stroke();
}

function drawPredictedTrajectoryPath() {
  context.save();
  context.globalAlpha = 0.72;
  context.setLineDash([5, 6]);
  drawTrajectoryPath(simulationState.predictedTrajectory, CANVAS_COLORS.trajectoryPrediction);
  context.restore();
}

function drawProjectile(point) {
  const canvasPosition = convertMetersToCanvasPosition(point);

  context.beginPath();
  context.arc(canvasPosition.x, canvasPosition.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
  context.fillStyle = CANVAS_COLORS.projectile;
  context.fill();

  context.beginPath();
  context.arc(canvasPosition.x, canvasPosition.y, PROJECTILE_RADIUS + 5, 0, Math.PI * 2);
  context.lineWidth = 1;
  context.strokeStyle = CANVAS_COLORS.annotation;
  context.stroke();
}

// Vector drawing
function drawArrow(startX, startY, endX, endY, color, label, magnitudeText) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowHeadLength = 9;

  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.stroke();

  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(
    endX - (arrowHeadLength * Math.cos(angle - Math.PI / 6)),
    endY - (arrowHeadLength * Math.sin(angle - Math.PI / 6))
  );
  context.lineTo(
    endX - (arrowHeadLength * Math.cos(angle + Math.PI / 6)),
    endY - (arrowHeadLength * Math.sin(angle + Math.PI / 6))
  );
  context.closePath();
  context.fillStyle = color;
  context.fill();

  context.fillStyle = color;
  context.font = CANVAS_FONT_LABEL;
  context.fillText(label, endX + 8, endY - 8);

  if (magnitudeText) {
    context.fillText(magnitudeText, endX + 8, endY + 8);
  }
}

function drawVelocityComponentVectors(point) {
  const canvasPosition = convertMetersToCanvasPosition(point);
  const horizontalEndX = canvasPosition.x + (point.xVelocity * VELOCITY_VECTOR_SCALE);
  const verticalEndY = canvasPosition.y - (point.yVelocity * VELOCITY_VECTOR_SCALE);
  const resultantEndX = horizontalEndX;
  const resultantEndY = verticalEndY;

  context.save();
  context.setLineDash([4, 4]);
  context.lineWidth = 1;
  context.strokeStyle = CANVAS_COLORS.annotation;

  context.beginPath();
  context.moveTo(horizontalEndX, canvasPosition.y);
  context.lineTo(resultantEndX, resultantEndY);
  context.stroke();

  context.beginPath();
  context.moveTo(canvasPosition.x, verticalEndY);
  context.lineTo(resultantEndX, resultantEndY);
  context.stroke();
  context.restore();

  drawArrow(
    canvasPosition.x,
    canvasPosition.y,
    horizontalEndX,
    canvasPosition.y,
    CANVAS_COLORS.velocityX,
    "vx",
    `${formatNumber(Math.abs(point.xVelocity))} m/s`
  );

  drawArrow(
    canvasPosition.x,
    canvasPosition.y,
    canvasPosition.x,
    verticalEndY,
    CANVAS_COLORS.velocityY,
    "vy",
    `${formatNumber(Math.abs(point.yVelocity))} m/s`
  );
}

function drawVelocityVector(point) {
  const canvasPosition = convertMetersToCanvasPosition(point);
  const endX = canvasPosition.x + (point.xVelocity * VELOCITY_VECTOR_SCALE);
  const endY = canvasPosition.y - (point.yVelocity * VELOCITY_VECTOR_SCALE);

  drawArrow(
    canvasPosition.x,
    canvasPosition.y,
    endX,
    endY,
    CANVAS_COLORS.velocity,
    "v",
    `${formatNumber(point.resultantVelocity)} m/s`
  );
}

function drawGravityVector(point) {
  const canvasPosition = convertMetersToCanvasPosition(point);

  drawArrow(
    canvasPosition.x,
    canvasPosition.y,
    canvasPosition.x,
    canvasPosition.y + GRAVITY_VECTOR_LENGTH,
    CANVAS_COLORS.gravity,
    "g",
    `${formatNumber(point.gravity)} m/s2`
  );
}

function drawProjectileVectors(point) {
  if (simulationState.showVelocityComponents) {
    drawVelocityComponentVectors(point);
  }

  drawVelocityVector(point);
  drawGravityVector(point);
}

function renderSimulation(currentPoint, visibleTrajectory, shouldDrawPredictedPath = false, shouldDrawVectors = true) {
  clearCanvas();
  drawCanvasBackground();
  drawMeasurementGrid();
  drawGroundLine();
  drawLaunchPoint();
  if (shouldDrawPredictedPath) {
    drawPredictedTrajectoryPath();
  } else {
    drawTrajectoryPath(visibleTrajectory);
  }
  drawProjectile(currentPoint);
  if (shouldDrawVectors) {
    drawProjectileVectors(currentPoint);
  }
}

// Live information panel
function formatNumber(value) {
  return value.toFixed(2);
}

function updateReadouts(point) {
  readoutElements.time.textContent = formatNumber(point.time);
  readoutElements.xPosition.textContent = formatNumber(point.xPosition);
  readoutElements.yPosition.textContent = formatNumber(point.yPosition);
  readoutElements.xVelocity.textContent = formatNumber(point.xVelocity);
  readoutElements.yVelocity.textContent = formatNumber(point.yVelocity);
  readoutElements.resultantVelocity.textContent = formatNumber(point.resultantVelocity);
  readoutElements.gravity.textContent = formatNumber(point.gravity);
  readoutElements.flightTime.textContent = formatNumber(simulationState.flightMetrics.totalFlightTime);
  readoutElements.maximumHeight.textContent = formatNumber(simulationState.flightMetrics.maximumHeight);
  readoutElements.range.textContent = formatNumber(simulationState.flightMetrics.range);
}

function updateGravityPresetActiveState() {
  gravityPresetButtons.forEach((button) => {
    const presetGravity = Number(button.dataset.gravity);
    const isActive = Math.abs(presetGravity - simulationState.parameters.gravity) < 0.01;
    button.classList.toggle("is-active", isActive);
  });
}

function updateControlDisplays() {
  controlValueElements.velocity.textContent = formatNumber(simulationState.parameters.initialVelocity);
  controlValueElements.angle.textContent = formatNumber(simulationState.parameters.launchAngleDegrees);
  controlValueElements.gravity.textContent = formatNumber(simulationState.parameters.gravity);
  controlValueElements.gravityMode.textContent = getGravityModeLabel();
  updateGravityPresetActiveState();
}

function getGravityModeLabel() {
  const matchingPreset = Object.entries(GRAVITY_PRESETS).find(([, gravity]) => {
    return Math.abs(gravity - simulationState.parameters.gravity) < 0.01;
  });

  return matchingPreset ? `${matchingPreset[0]} gravity` : "Custom gravity";
}

// Explanation engine
function updatePhysicsInsight(point) {
  if (simulationState.isDragging || simulationState.explanationState === "inspection") {
    if (Math.abs(point.yVelocity) <= MAXIMUM_HEIGHT_VELOCITY_TOLERANCE) {
      physicsInsightText.textContent = "Inspection point: vertical velocity is nearly zero here, marking the top of the trajectory while horizontal velocity remains present.";
      return;
    }

    if (point.yVelocity > 0) {
      physicsInsightText.textContent = "Inspection point: the projectile is still rising, but gravity is reducing its upward velocity at every instant.";
      return;
    }

    physicsInsightText.textContent = "Inspection point: the projectile is descending, so gravity is increasing the downward vertical velocity.";
    return;
  }

  if (simulationState.explanationState === "landing") {
    physicsInsightText.textContent = "The projectile has landed. Notice that the landing speed equals the launch speed because the projectile returned to the same height and air resistance is ignored.";
    return;
  }

  if (simulationState.isAnimating && Math.abs(point.yVelocity) <= MAXIMUM_HEIGHT_VELOCITY_TOLERANCE) {
    physicsInsightText.textContent = "The projectile has reached its maximum height. At this instant, the vertical velocity becomes zero, but the horizontal velocity remains unchanged. The projectile continues moving forward due to inertia.";
    return;
  }

  if (simulationState.isAnimating) {
    physicsInsightText.textContent = "Gravity continuously decreases the vertical velocity while the horizontal velocity remains constant because no horizontal force acts on the projectile.";
    return;
  }

  physicsInsightText.textContent = "Adjust the launch angle, speed, and gravity. Observe how each parameter changes the predicted motion before launching.";
}

// Animation loop
function stopAnimation() {
  if (simulationState.animationFrameId !== null) {
    cancelAnimationFrame(simulationState.animationFrameId);
  }

  simulationState.animationFrameId = null;
  simulationState.isAnimating = false;
}

function animationLoop(timestamp) {
  if (simulationState.animationStartTime === 0) {
    simulationState.animationStartTime = timestamp;
  }

  const elapsedSeconds = (timestamp - simulationState.animationStartTime) / 1000;
  const trajectoryIndex = Math.min(
    Math.floor(elapsedSeconds / TIME_STEP),
    simulationState.activeTrajectory.length - 1
  );
  const currentPoint = simulationState.activeTrajectory[trajectoryIndex];
  const visibleTrajectory = simulationState.activeTrajectory.slice(0, trajectoryIndex + 1);

  simulationState.currentPoint = currentPoint;
  simulationState.currentTrajectoryIndex = trajectoryIndex;
  renderSimulation(currentPoint, visibleTrajectory);
  updateReadouts(currentPoint);
  updatePhysicsInsight(currentPoint);

  if (trajectoryIndex < simulationState.activeTrajectory.length - 1) {
    simulationState.animationFrameId = requestAnimationFrame(animationLoop);
    return;
  }

  simulationState.isAnimating = false;
  simulationState.animationFrameId = null;
  simulationState.explanationState = "landing";
  updatePhysicsInsight(currentPoint);
  updateButtonStates();
}

function playStoredTrajectory() {
  if (simulationState.launchedTrajectory.length === 0) {
    return;
  }

  stopAnimation();
  simulationState.activeTrajectory = simulationState.launchedTrajectory;
  simulationState.flightMetrics = simulationState.launchedFlightMetrics;
  calculateRenderScale(simulationState.activeTrajectory);
  simulationState.animationStartTime = 0;
  simulationState.isAnimating = true;
  simulationState.explanationState = "duringFlight";
  simulationState.animationFrameId = requestAnimationFrame(animationLoop);
}

// UI controls
function launchProjectile() {
  recalculatePredictedMotion();
  simulationState.launchedTrajectory = simulationState.predictedTrajectory.slice();
  simulationState.launchedFlightMetrics = { ...simulationState.flightMetrics };
  simulationState.currentPoint = simulationState.launchedTrajectory[0];
  simulationState.currentTrajectoryIndex = 0;
  simulationState.hasLaunched = true;
  playStoredTrajectory();
}

function replayProjectile() {
  playStoredTrajectory();
}

function resetSimulation() {
  stopAnimation();
  simulationState.activeTrajectory = [];
  simulationState.launchedTrajectory = [];
  simulationState.launchedFlightMetrics = null;
  simulationState.parameters.initialVelocity = scene.projectile.velocity;
  simulationState.parameters.launchAngleDegrees = scene.projectile.angle;
  simulationState.parameters.gravity = scene.projectile.gravity;
  syncControlsToState();
  recalculatePredictedMotion();
  simulationState.currentPoint = createInitialPoint();
  simulationState.currentTrajectoryIndex = 0;
  simulationState.hasLaunched = false;
  simulationState.explanationState = "beforeLaunch";
  renderSimulation(simulationState.currentPoint, [], true);
  updateReadouts(simulationState.currentPoint);
  updateControlDisplays();
  updatePhysicsInsight(simulationState.currentPoint);
  updateButtonStates();
}

function updateButtonStates() {
  replayButton.disabled = !simulationState.hasLaunched || simulationState.isAnimating;
}

function handleLaunchButtonClick() {
  launchProjectile();
  updateButtonStates();
}

function handleReplayButtonClick() {
  replayProjectile();
  updateButtonStates();
}

function handleResetButtonClick() {
  resetSimulation();
  updateButtonStates();
}

function refreshSimulationView() {
  const currentTrajectory = simulationState.activeTrajectory.length > 0 ? simulationState.activeTrajectory : [];
  const visibleTrajectory = currentTrajectory.slice(0, simulationState.currentTrajectoryIndex + 1);
  const shouldShowPredictedPath = simulationState.activeTrajectory.length === 0;

  if (simulationState.currentPoint !== null) {
    renderSimulation(simulationState.currentPoint, visibleTrajectory, shouldShowPredictedPath);
  }
}

function handleVelocityComponentsToggle() {
  simulationState.showVelocityComponents = velocityComponentsToggle.checked;
  refreshSimulationView();
}

function handleParameterInputChange() {
  stopAnimation();
  simulationState.activeTrajectory = [];
  simulationState.parameters.initialVelocity = Number(velocitySlider.value);
  simulationState.parameters.launchAngleDegrees = Number(angleSlider.value);
  simulationState.parameters.gravity = Number(gravitySlider.value);
  recalculatePredictedMotion();
  simulationState.currentPoint = createInitialPoint();
  simulationState.currentTrajectoryIndex = 0;
  simulationState.explanationState = "beforeLaunch";
  renderSimulation(simulationState.currentPoint, [], true);
  updateReadouts(simulationState.currentPoint);
  updateControlDisplays();
  updatePhysicsInsight(simulationState.currentPoint);
  updateButtonStates();
}

function handleGravityPresetClick(event) {
  gravitySlider.value = event.currentTarget.dataset.gravity;
  handleParameterInputChange();
}

// Drag interaction
function getPointerCanvasPosition(event) {
  const canvasRectangle = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - canvasRectangle.left) * (canvas.width / canvasRectangle.width),
    y: (event.clientY - canvasRectangle.top) * (canvas.height / canvasRectangle.height)
  };
}

function getInspectableTrajectory() {
  if (simulationState.activeTrajectory.length > 0) {
    return simulationState.activeTrajectory;
  }

  return simulationState.predictedTrajectory;
}

function findNearestTrajectoryIndex(canvasPosition, trajectory) {
  let nearestIndex = 0;
  let nearestDistanceSquared = Infinity;

  trajectory.forEach((point, index) => {
    const pointPosition = convertMetersToCanvasPosition(point);
    const deltaX = canvasPosition.x - pointPosition.x;
    const deltaY = canvasPosition.y - pointPosition.y;
    const distanceSquared = (deltaX * deltaX) + (deltaY * deltaY);

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function isPointerNearProjectile(canvasPosition) {
  const projectilePosition = convertMetersToCanvasPosition(simulationState.currentPoint);
  const deltaX = canvasPosition.x - projectilePosition.x;
  const deltaY = canvasPosition.y - projectilePosition.y;
  const grabRadius = PROJECTILE_RADIUS + 12;

  return ((deltaX * deltaX) + (deltaY * deltaY)) <= (grabRadius * grabRadius);
}

function renderDraggedTrajectoryPoint(trajectory, trajectoryIndex) {
  const selectedPoint = trajectory[trajectoryIndex];
  const visibleTrajectory = trajectory.slice(0, trajectoryIndex + 1);
  const shouldShowPredictedPath = simulationState.activeTrajectory.length === 0;

  simulationState.currentPoint = selectedPoint;
  simulationState.currentTrajectoryIndex = trajectoryIndex;
  renderSimulation(selectedPoint, visibleTrajectory, shouldShowPredictedPath);
  updateReadouts(selectedPoint);
  updatePhysicsInsight(selectedPoint);
}

function inspectTrajectoryAtPointer(event) {
  const trajectory = getInspectableTrajectory();

  if (trajectory.length === 0) {
    return;
  }

  const canvasPosition = getPointerCanvasPosition(event);
  const trajectoryIndex = findNearestTrajectoryIndex(canvasPosition, trajectory);

  renderDraggedTrajectoryPoint(trajectory, trajectoryIndex);
}

function handleCanvasPointerDown(event) {
  const trajectory = getInspectableTrajectory();

  if (trajectory.length === 0 || simulationState.currentPoint === null) {
    return;
  }

  const canvasPosition = getPointerCanvasPosition(event);

  if (!isPointerNearProjectile(canvasPosition)) {
    return;
  }

  stopAnimation();
  simulationState.isDragging = true;
  simulationState.explanationState = "inspection";
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
  inspectTrajectoryAtPointer(event);
  updateButtonStates();
}

function handleCanvasPointerMove(event) {
  if (!simulationState.isDragging) {
    return;
  }

  inspectTrajectoryAtPointer(event);
}

function handleCanvasPointerUp(event) {
  if (!simulationState.isDragging) {
    return;
  }

  simulationState.isDragging = false;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updateButtonStates();
}

function bindControls() {
  launchButton.addEventListener("click", handleLaunchButtonClick);
  replayButton.addEventListener("click", handleReplayButtonClick);
  resetButton.addEventListener("click", handleResetButtonClick);
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  canvas.addEventListener("pointermove", handleCanvasPointerMove);
  canvas.addEventListener("pointerup", handleCanvasPointerUp);
  canvas.addEventListener("pointercancel", handleCanvasPointerUp);
  velocitySlider.addEventListener("input", handleParameterInputChange);
  angleSlider.addEventListener("input", handleParameterInputChange);
  gravitySlider.addEventListener("input", handleParameterInputChange);
  velocityComponentsToggle.addEventListener("change", handleVelocityComponentsToggle);
  gravityPresetButtons.forEach((button) => {
    button.addEventListener("click", handleGravityPresetClick);
  });
}

// Initialization
function createInitialPoint() {
  const initialComponents = calculateInitialVelocityComponents();

  return {
    time: 0,
    xPosition: 0,
    yPosition: 0,
    xVelocity: initialComponents.xVelocity,
    yVelocity: initialComponents.yVelocity,
    resultantVelocity: simulationState.parameters.initialVelocity,
    gravity: simulationState.parameters.gravity
  };
}

function syncControlsToState() {
  velocitySlider.value = simulationState.parameters.initialVelocity;
  angleSlider.value = simulationState.parameters.launchAngleDegrees;
  gravitySlider.value = simulationState.parameters.gravity;
}

function initializeSimulation() {
  bindControls();
  resetSimulation();
}

initializeSimulation();
