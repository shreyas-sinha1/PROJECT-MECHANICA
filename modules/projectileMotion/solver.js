export function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

export function calculateInitialVelocityComponents(parameters) {
  const launchAngleRadians = degreesToRadians(parameters.launchAngleDegrees);

  return {
    xVelocity: parameters.initialVelocity * Math.cos(launchAngleRadians),
    yVelocity: parameters.initialVelocity * Math.sin(launchAngleRadians)
  };
}

export function calculateProjectilePoint(time, initialComponents, gravity) {
  const xPosition = initialComponents.xVelocity * time;
  const yPosition = (initialComponents.yVelocity * time) - (0.5 * gravity * time * time);
  const yVelocity = initialComponents.yVelocity - (gravity * time);
  const resultantVelocity = Math.hypot(initialComponents.xVelocity, yVelocity);

  return {
    time,
    xPosition,
    yPosition: Math.max(0, yPosition),
    xVelocity: initialComponents.xVelocity,
    yVelocity,
    resultantVelocity,
    gravity
  };
}

export function calculateFlightMetrics(initialComponents, gravity) {
  const totalFlightTime = initialComponents.yVelocity > 0 ? (2 * initialComponents.yVelocity) / gravity : 0;
  const maximumHeight = initialComponents.yVelocity > 0 ? (initialComponents.yVelocity * initialComponents.yVelocity) / (2 * gravity) : 0;
  const range = initialComponents.xVelocity * totalFlightTime;

  return {
    totalFlightTime,
    maximumHeight,
    range
  };
}

export function calculateTrajectory(parameters, timeStep) {
  const initialComponents = calculateInitialVelocityComponents(parameters);
  const flightMetrics = calculateFlightMetrics(initialComponents, parameters.gravity);
  const trajectory = [];

  for (let time = 0; time < flightMetrics.totalFlightTime; time += timeStep) {
    trajectory.push(calculateProjectilePoint(time, initialComponents, parameters.gravity));
  }

  trajectory.push(calculateProjectilePoint(flightMetrics.totalFlightTime, initialComponents, parameters.gravity));

  return {
    trajectory,
    flightMetrics
  };
}

export function createInitialPoint(parameters) {
  const initialComponents = calculateInitialVelocityComponents(parameters);

  return {
    time: 0,
    xPosition: 0,
    yPosition: 0,
    xVelocity: initialComponents.xVelocity,
    yVelocity: initialComponents.yVelocity,
    resultantVelocity: parameters.initialVelocity,
    gravity: parameters.gravity
  };
}
