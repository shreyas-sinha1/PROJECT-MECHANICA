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

export function calculateProjectilePoint(time, initialComponents, gravity, launchHeight = 0) {
  const h0 = Number(launchHeight) || 0;
  const xPosition = initialComponents.xVelocity * time;
  const yPosition = h0 + (initialComponents.yVelocity * time) - (0.5 * gravity * time * time);
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

export function calculateFlightMetrics(initialComponents, gravity, launchHeight = 0) {
  const h0 = Number(launchHeight) || 0;
  const vy = initialComponents.yVelocity;

  let totalFlightTime = 0;
  if (gravity > 0) {
    if (h0 > 0) {
      // Kinematic quadratic solution for y(t) = h0 + vy*t - 0.5*g*t^2 = 0
      const discriminant = (vy * vy) + (2 * gravity * h0);
      totalFlightTime = discriminant > 0 ? (vy + Math.sqrt(discriminant)) / gravity : 0;
    } else {
      totalFlightTime = vy > 0 ? (2 * vy) / gravity : 0;
    }
  }

  const peakAdditionalHeight = vy > 0 && gravity > 0 ? (vy * vy) / (2 * gravity) : 0;
  const maximumHeight = h0 + peakAdditionalHeight;
  const range = initialComponents.xVelocity * totalFlightTime;

  return {
    totalFlightTime,
    maximumHeight,
    range
  };
}

export function calculateTrajectory(parameters, timeStep) {
  const initialComponents = calculateInitialVelocityComponents(parameters);
  const launchHeight = Number(parameters.launchHeight ?? 0);
  const flightMetrics = calculateFlightMetrics(initialComponents, parameters.gravity, launchHeight);
  const trajectory = [];

  for (let time = 0; time < flightMetrics.totalFlightTime; time += timeStep) {
    trajectory.push(calculateProjectilePoint(time, initialComponents, parameters.gravity, launchHeight));
  }

  trajectory.push(calculateProjectilePoint(flightMetrics.totalFlightTime, initialComponents, parameters.gravity, launchHeight));

  return {
    trajectory,
    flightMetrics
  };
}

export function createInitialPoint(parameters) {
  const initialComponents = calculateInitialVelocityComponents(parameters);
  const launchHeight = Number(parameters.launchHeight ?? 0);

  return {
    time: 0,
    xPosition: 0,
    yPosition: launchHeight,
    xVelocity: initialComponents.xVelocity,
    yVelocity: initialComponents.yVelocity,
    resultantVelocity: parameters.initialVelocity,
    gravity: parameters.gravity
  };
}
