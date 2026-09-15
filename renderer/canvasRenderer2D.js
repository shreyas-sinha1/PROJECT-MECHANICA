const GROUND_MARGIN = 56;
const CANVAS_PADDING = 44;
const PROJECTILE_RADIUS = 6;
const VELOCITY_VECTOR_SCALE = 2;
const GRAVITY_VECTOR_LENGTH = 48;

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

function formatNumber(value) {
  return typeof value === "number" ? value.toFixed(2) : "0.00";
}

/**
 * Creates a canvas renderer for the projectile motion visualization.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @returns {Object} Renderer interface.
 */
export function createCanvasRenderer(canvas) {
  const context = canvas.getContext("2d");

  const scale = {
    pixelsPerMeter: 1,
    originX: CANVAS_PADDING,
    originY: canvas.height - GROUND_MARGIN
  };

  function calculateRenderScale(trajectory) {
    if (!trajectory || trajectory.length === 0) {
      scale.pixelsPerMeter = 1;
      return;
    }
    const maximumX = Math.max(...trajectory.map((point) => point.xPosition), 1);
    const maximumY = Math.max(...trajectory.map((point) => point.yPosition), 1);
    const usableWidth = canvas.width - (CANVAS_PADDING * 2);
    const usableHeight = canvas.height - GROUND_MARGIN - CANVAS_PADDING;
    const xScale = usableWidth / maximumX;
    const yScale = usableHeight / maximumY;

    scale.pixelsPerMeter = Math.min(xScale, yScale);
    scale.originX = CANVAS_PADDING;
    scale.originY = canvas.height - GROUND_MARGIN;
  }

  function convertMetersToCanvasPosition(point) {
    return {
      x: scale.originX + (point.xPosition * scale.pixelsPerMeter),
      y: scale.originY - (point.yPosition * scale.pixelsPerMeter)
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

    for (let x = scale.originX; x < canvas.width; x += minorStep) {
      context.beginPath();
      context.moveTo(x, CANVAS_PADDING);
      context.lineTo(x, scale.originY);
      context.strokeStyle = (x - scale.originX) % majorStep === 0 ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.grid;
      context.stroke();
    }

    for (let y = scale.originY; y > CANVAS_PADDING; y -= minorStep) {
      context.beginPath();
      context.moveTo(scale.originX, y);
      context.lineTo(canvas.width - CANVAS_PADDING, y);
      context.strokeStyle = (scale.originY - y) % majorStep === 0 ? CANVAS_COLORS.gridMajor : CANVAS_COLORS.grid;
      context.stroke();
    }

    context.restore();
  }

  function drawAxisLabels() {
    context.fillStyle = CANVAS_COLORS.annotation;
    context.font = CANVAS_FONT;
    context.fillText("x position (m)", canvas.width - 126, scale.originY + 28);
    context.save();
    context.translate(scale.originX - 28, CANVAS_PADDING + 84);
    context.rotate(-Math.PI / 2);
    context.fillText("y position (m)", 0, 0);
    context.restore();
  }

  function drawGroundLine() {
    context.beginPath();
    context.moveTo(scale.originX, scale.originY);
    context.lineTo(canvas.width - CANVAS_PADDING, scale.originY);
    context.lineWidth = 2;
    context.strokeStyle = CANVAS_COLORS.axis;
    context.stroke();

    context.beginPath();
    context.moveTo(scale.originX, scale.originY);
    context.lineTo(scale.originX, CANVAS_PADDING);
    context.lineWidth = 2;
    context.strokeStyle = CANVAS_COLORS.axis;
    context.stroke();

    drawAxisLabels();
  }

  function drawLaunchPoint() {
    context.beginPath();
    context.arc(scale.originX, scale.originY, 5, 0, Math.PI * 2);
    context.fillStyle = CANVAS_COLORS.launchPoint;
    context.fill();
  }

  function drawTrajectoryPath(visibleTrajectory, strokeColor = CANVAS_COLORS.trajectory) {
    if (!visibleTrajectory || visibleTrajectory.length < 2) {
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

  function drawPredictedTrajectoryPath(predictedTrajectory) {
    if (!predictedTrajectory || predictedTrajectory.length < 2) {
      return;
    }
    context.save();
    context.globalAlpha = 0.72;
    context.setLineDash([5, 6]);
    drawTrajectoryPath(predictedTrajectory, CANVAS_COLORS.trajectoryPrediction);
    context.restore();
  }

  function drawProjectile(point) {
    if (!point) return;
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

  function drawProjectileVectors(point, showVelocityComponents) {
    if (!point) return;
    if (showVelocityComponents) {
      drawVelocityComponentVectors(point);
    }
    drawVelocityVector(point);
    drawGravityVector(point);
  }

  function render(state) {
    const trajectoryForScale = state.activeTrajectory.length > 0
      ? state.activeTrajectory
      : state.predictedTrajectory;

    calculateRenderScale(trajectoryForScale);

    clearCanvas();
    drawCanvasBackground();
    drawMeasurementGrid();
    drawGroundLine();
    drawLaunchPoint();

    const isShowingPredicted = state.activeTrajectory.length === 0;

    if (isShowingPredicted) {
      drawPredictedTrajectoryPath(state.predictedTrajectory);
    } else {
      const visibleTrajectory = state.activeTrajectory.slice(0, state.currentTrajectoryIndex + 1);
      drawTrajectoryPath(visibleTrajectory);
    }

    if (state.currentPoint) {
      drawProjectile(state.currentPoint);
      drawProjectileVectors(state.currentPoint, state.showVelocityComponents);
    }
  }

  // Pointer & coordinate interaction helpers
  function getPointerCanvasPosition(event) {
    const canvasRectangle = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - canvasRectangle.left) * (canvas.width / canvasRectangle.width),
      y: (event.clientY - canvasRectangle.top) * (canvas.height / canvasRectangle.height)
    };
  }

  function findNearestTrajectoryIndex(canvasPosition, trajectory) {
    if (!trajectory || trajectory.length === 0) return 0;
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

  function isPointerNearProjectile(canvasPosition, currentPoint) {
    if (!currentPoint) return false;
    const projectilePosition = convertMetersToCanvasPosition(currentPoint);
    const deltaX = canvasPosition.x - projectilePosition.x;
    const deltaY = canvasPosition.y - projectilePosition.y;
    const grabRadius = PROJECTILE_RADIUS + 12;

    return ((deltaX * deltaX) + (deltaY * deltaY)) <= (grabRadius * grabRadius);
  }

  return {
    render,
    getPointerCanvasPosition,
    findNearestTrajectoryIndex,
    isPointerNearProjectile,
    convertMetersToCanvasPosition,
    getScale: () => scale,
    destroy: () => {}
  };
}
