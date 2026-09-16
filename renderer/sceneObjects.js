import * as THREE from "three";

// ─── Colour palette (mirrors the CSS custom properties) ───────────────────────
export const COLOURS = {
  trajectory: 0x2f6b72,   // teal
  trajectoryPredict: 0x7a9aa0,   // muted teal
  projectile: 0x0a0a0a,   // near black
  launchPoint: 0x2f6b72,   // teal accent
  velocity: 0x0d6fa8,   // medium blue (resultant v)
  velocityX: 0x1565c0,   // blue  — horizontal component
  velocityY: 0x2e7d32,   // green — vertical component (clearly distinct from vx)
  gravity: 0xc62828,   // strong red
  axisX: 0x2f6b72,   // teal  — horizontal axis
  axisY: 0x2a5f9e,   // blue  — vertical axis
  axisZ: 0x8a939e,   // muted — depth axis
  ground: 0x1b2a38,   // dark charcoal
  groundLine: 0x2c4460,   // subtle lighter lines for grid on dark ground
  ambientLight: 0xffffff,
  dirLight: 0xffffff,
};

// ─── Trajectory line ──────────────────────────────────────────────────────────

/**
 * Creates a trajectory line object.
 * @param {number} colour - Hex colour.
 * @param {boolean} [dashed=false]
 * @returns {{ line: THREE.Line, updatePoints: (pts: THREE.Vector3[]) => void, setVisible: (v: boolean) => void }}
 */
export function createTrajectoryLine(colour, dashed = false) {
  const geometry = new THREE.BufferGeometry();
  const material = dashed
    ? new THREE.LineDashedMaterial({ color: colour, dashSize: 0.8, gapSize: 0.6, opacity: 0.72, transparent: true })
    : new THREE.LineBasicMaterial({ color: colour });

  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;

  function updatePoints(points) {
    if (points.length < 2) {
      geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    } else {
      geometry.setFromPoints(points);
    }
    if (dashed) {
      line.computeLineDistances();
    }
  }

  function setVisible(v) {
    line.visible = v;
  }

  /**
   * Updates the dash/gap size of a dashed line material so dashes stay
   * proportional as the scene rescales with different trajectory extents.
   * No-op on solid lines.
   */
  function setDashScale(dashSize, gapSize) {
    if (!dashed) return;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.needsUpdate = true;
  }

  return { line, updatePoints, setVisible, setDashScale };
}

// ─── Projectile sphere ────────────────────────────────────────────────────────

/**
 * Creates the animated projectile mesh.
 * @returns {{ mesh: THREE.Mesh, setPosition: (x:number, y:number, z:number) => void }}
 */
export function createProjectileMesh() {
  // Larger segment count for a smooth silhouette at close zoom.
  const geometry = new THREE.SphereGeometry(0.45, 32, 24);
  const material = new THREE.MeshStandardMaterial({
    color: COLOURS.projectile,
    roughness: 0.30,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  function setPosition(x, y, z = 0) {
    mesh.position.set(x, y, z);
  }

  return { mesh, setPosition };
}

// ─── Launch point marker ──────────────────────────────────────────────────────

/**
 * Creates the static launch-point sphere.
 * @returns {THREE.Mesh}
 */
export function createLaunchPointMesh() {
  const geometry = new THREE.SphereGeometry(0.28, 16, 12);
  const material = new THREE.MeshStandardMaterial({
    color: COLOURS.launchPoint,
    roughness: 0.4,
    metalness: 0.1,
    emissive: COLOURS.launchPoint,
    emissiveIntensity: 0.18,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  return mesh;
}

// ─── Ground plane & contained platform ─────────────────────────────────────────

/**
 * Creates a dynamically-sized contained physical experiment platform and reference grid.
 * Sized tightly around the trajectory horizontal range and depth, avoiding an infinite open world.
 *
 * @returns {{
 *   groundPlane: THREE.Group,
 *   updateBounds: (minX: number, maxX: number, spanX: number, spanY: number) => void
 * }}
 */
export function createGroundPlane() {
  const groundGroup = new THREE.Group();

  // 1. Solid physical slab platform (box mesh)
  const slabGeo = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshStandardMaterial({
    color: COLOURS.ground,
    roughness: 0.85,
    metalness: 0.12,
  });
  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.receiveShadow = true;
  groundGroup.add(slabMesh);

  // 2. Clean grid lines on the platform surface
  const gridGeo = new THREE.BufferGeometry();
  const gridMat = new THREE.LineBasicMaterial({
    color: COLOURS.groundLine,
    transparent: true,
    opacity: 0.55,
  });
  const gridLines = new THREE.LineSegments(gridGeo, gridMat);
  groundGroup.add(gridLines);

  /**
   * Dynamically resizes the ground platform and its reference grid to fit
   * the trajectory horizontal range with reasonable, compact padding.
   */
  function updateBounds(minX, maxX, spanX, spanY) {
    const sX = Math.max(spanX, 1);
    const sY = Math.max(spanY, 1);

    // Padding horizontally: ~8% beyond trajectory range, minimum 2.5m
    const padX = Math.max(sX * 0.08, 2.5);
    const trackMinX = minX - padX;
    const trackMaxX = maxX + padX;
    const trackWidth = trackMaxX - trackMinX;
    const trackCenterX = (trackMinX + trackMaxX) * 0.5;

    // Compact depth: physical lane/testbed proportion, not an infinite plane
    const trackDepth = Math.max(sX * 0.22, sY * 0.45, 7.0);

    // Slab thickness: gives a solid 3D platform with visible front edge
    const trackThickness = Math.max(sY * 0.05, 0.5);

    // Position slab: top surface sits at Y = -0.015
    slabMesh.scale.set(trackWidth, trackThickness, trackDepth);
    slabMesh.position.set(trackCenterX, -trackThickness * 0.5 - 0.015, 0);

    // ── Grid lines on the platform surface only ─────────────────────────────
    // Minimum step of 5 prevents dense clutter on short trajectories.
    let step = 5;
    if (sX > 320) step = 50;
    else if (sX > 160) step = 20;
    else if (sX > 60) step = 10;

    const positions = [];
    const halfD = trackDepth * 0.5;
    const xStart = Math.ceil(trackMinX / step) * step;
    const xEnd = Math.floor(trackMaxX / step) * step;

    // Transverse lines across top surface only (no front-face ticks)
    for (let x = xStart; x <= xEnd + 0.0001; x += step) {
      positions.push(x, 0, -halfD, x, 0, halfD);
    }

    // Longitudinal lines on platform:
    // Centerline (Z=0, directly under the trajectory)
    positions.push(trackMinX, 0, 0, trackMaxX, 0, 0);
    // Back edge
    positions.push(trackMinX, 0, -halfD, trackMaxX, 0, -halfD);
    // Front top edge
    positions.push(trackMinX, 0, halfD, trackMaxX, 0, halfD);
    // Front bottom edge
    positions.push(trackMinX, -trackThickness, halfD, trackMaxX, -trackThickness, halfD);
    // Left edge
    positions.push(trackMinX, 0, -halfD, trackMinX, 0, halfD);
    positions.push(trackMinX, 0, halfD, trackMinX, -trackThickness, halfD);
    // Right edge
    positions.push(trackMaxX, 0, -halfD, trackMaxX, 0, halfD);
    positions.push(trackMaxX, 0, halfD, trackMaxX, -trackThickness, halfD);

    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }

  return { groundPlane: groundGroup, updateBounds };
}

// ─── Physics axis arrows ──────────────────────────────────────────────────────

/**
 * Creates X and Y axis arrows anchored at the origin.
 * @param {number} length - Arrow length in metres.
 * @returns {{ xArrow: THREE.ArrowHelper, yArrow: THREE.ArrowHelper }}
 */
export function createPhysicsAxes(length = 8) {
  const origin = new THREE.Vector3(0, 0, 0);

  const xArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    origin, length,
    COLOURS.axisX, length * 0.12, length * 0.07
  );

  const yArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    origin, length,
    COLOURS.axisY, length * 0.12, length * 0.07
  );

  // Thin Z axis for visual 3D cue
  const zArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    origin, length * 0.4,
    COLOURS.axisZ, length * 0.08, length * 0.05
  );
  xArrow.line.material.linewidth = 2;
  yArrow.line.material.linewidth = 2;

  return { xArrow, yArrow, zArrow };
}

// ─── Vector arrow helper ──────────────────────────────────────────────────────

/**
 * Creates a managed ArrowHelper that can be updated each frame.
 * @param {number} colour
 * @returns {{ arrow: THREE.ArrowHelper, update: (origin, direction, length) => void, setVisible: (v: boolean) => void }}
 */
export function createVectorArrow(colour) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    colour,
    0.4, 0.25
  );
  arrow.visible = false;

  // Solid cylinder shaft so the vector has visible thickness (WebGL ignores Line linewidth)
  const shaftGeo = new THREE.CylinderGeometry(0.20, 0.20, 1, 12);
  shaftGeo.translate(0, 0.5, 0);
  const shaftMesh = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: colour }));
  arrow.remove(arrow.line);
  arrow.line = shaftMesh;
  arrow.add(shaftMesh);

  // Internal state: lets getTipPosition() be called without extra book-keeping
  // at the call site. Stored as plain fields rather than Vector3 to keep GC low.
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3(1, 0, 0);
  let _length = 0;

  function update(origin, direction, length) {
    if (length < 0.001) {
      arrow.visible = false;
      _length = 0;
      return;
    }
    _origin.copy(origin);
    _dir.copy(direction).normalize();
    _length = length;
    arrow.position.copy(origin);
    arrow.setDirection(_dir);
    const headLen = Math.min(1.3, Math.max(0.55, length * 0.28));
    const headWidth = Math.min(0.85, Math.max(0.45, length * 0.18));
    arrow.setLength(length, headLen, headWidth);
    arrow.visible = true;
  }

  function setVisible(v) {
    arrow.visible = v;
    if (!v) _length = 0;
  }

  /**
   * Returns the world-space position at the arrow tip, offset a little beyond
   * the arrowhead for label placement. `overshoot` is a fraction of the length.
   */
  function getTipPosition(overshoot = 1.14) {
    return _origin.clone().addScaledVector(_dir, _length * overshoot);
  }

  return { arrow, update, setVisible, getTipPosition };
}

// ─── Lights ───────────────────────────────────────────────────────────────────

/**
 * Creates scene lighting: ambient + key directional + soft fill.
 * @returns {THREE.Object3D[]}
 */
export function createLights() {
  const ambient = new THREE.AmbientLight(COLOURS.ambientLight, 0.7);

  const key = new THREE.DirectionalLight(COLOURS.dirLight, 1.2);
  key.position.set(40, 80, 50);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 500;
  key.shadow.camera.left = -100;
  key.shadow.camera.right = 100;
  key.shadow.camera.top = 100;
  key.shadow.camera.bottom = -100;

  const fill = new THREE.DirectionalLight(COLOURS.dirLight, 0.35);
  fill.position.set(-30, 20, -40);

  return [ambient, key, fill];
}

// ─── Utility: physics point → THREE.Vector3 ───────────────────────────────────

/**
 * Maps a physics trajectory point {xPosition, yPosition} to a Three.js Vector3.
 * Physics X-right, Y-up maps directly; Z=0 keeps everything in the XY plane.
 * @param {{ xPosition: number, yPosition: number }} point
 * @returns {THREE.Vector3}
 */
export function pointToVector3(point) {
  return new THREE.Vector3(point.xPosition, point.yPosition, 0);
}

/**
 * Converts a trajectory array to an array of Vector3.
 * @param {Array<{xPosition: number, yPosition: number}>} trajectory
 * @returns {THREE.Vector3[]}
 */
export function trajectoryToVectors(trajectory) {
  return trajectory.map(pointToVector3);
}

// ─── Trajectory bead textures & helpers ────────────────────────────────────────

let _circleTexture = null;
function getCircleTexture() {
  if (!_circleTexture && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    _circleTexture = new THREE.CanvasTexture(canvas);
  }
  return _circleTexture;
}

let _ringTexture = null;
function getRingTexture() {
  if (!_ringTexture && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    _ringTexture = new THREE.CanvasTexture(canvas);
  }
  return _ringTexture;
}

// ─── Trajectory bead markers (equispaced along arc length) ─────────────────────

/**
 * Creates a THREE.Points object that renders smooth circular beads at
 * trajectory sample positions.
 *
 * Uses sizeAttenuation so beads scale naturally as the camera zooms.
 *
 * @param {number} colour   - Hex colour.
 * @param {number} opacity  - 0-1 opacity.
 * @returns {{ points: THREE.Points, updateVectors: (vecs: THREE.Vector3[]) => void,
 *            setSize: (s: number) => void, setVisible: (v: boolean) => void }}
 */
export function createTrajectoryDots(colour, opacity = 1.0) {
  const geometry = new THREE.BufferGeometry();
  // Start with a single dummy point so the geometry is valid before first update
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0], 3)
  );

  const material = new THREE.PointsMaterial({
    color: colour,
    size: 1.5,
    sizeAttenuation: true,    // size in world units — scales with distance
    map: getCircleTexture(),
    transparent: true,
    opacity: opacity,
    alphaTest: 0.01,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;

  let currentPointCount = 1; // tracks last allocated buffer size

  function updateVectors(vectors) {
    if (!vectors || vectors.length === 0) {
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0], 3)
      );
      points.visible = false;
      currentPointCount = 1;
      return;
    }

    // Flatten Vector3 array into a Float32Array for the buffer attribute
    const flat = new Float32Array(vectors.length * 3);
    for (let i = 0; i < vectors.length; i++) {
      flat[i * 3] = vectors[i].x;
      flat[i * 3 + 1] = vectors[i].y;
      flat[i * 3 + 2] = vectors[i].z || 0;
    }

    if (vectors.length !== currentPointCount) {
      // Point count changed — dispose old buffer and assign a fresh attribute
      geometry.dispose();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
      currentPointCount = vectors.length;
    } else {
      // Same count: update in-place without reallocation (fast path)
      geometry.getAttribute("position").array.set(flat);
      geometry.getAttribute("position").needsUpdate = true;
    }

    geometry.computeBoundingSphere();
  }

  function setSize(size) {
    material.size = size;
  }

  function setVisible(v) {
    points.visible = v;
  }

  return { points, updateVectors, setSize, setVisible };
}

// ─── Active bead highlight / outline reticle ──────────────────────────────────

/**
 * Creates a subtle concentric outline ring that highlights the bead
 * corresponding to the projectile's current instant.
 *
 * @param {number} colour - Hex colour.
 * @returns {{ points: THREE.Points, setPosition: (vec: THREE.Vector3) => void,
 *            setSize: (s: number) => void, setVisible: (v: boolean) => void }}
 */
export function createBeadOutline(colour) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0], 3)
  );

  const material = new THREE.PointsMaterial({
    color: colour,
    size: 3.0,
    sizeAttenuation: true,
    map: getRingTexture(),
    transparent: true,
    opacity: 0.92,
    alphaTest: 0.01,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;

  function setPosition(vec) {
    if (!vec) return;
    const pos = geometry.getAttribute("position");
    pos.array[0] = vec.x;
    pos.array[1] = vec.y;
    pos.array[2] = vec.z || 0;
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
    points.visible = true;
  }

  function setSize(size) {
    material.size = size;
  }

  function setVisible(v) {
    points.visible = v;
  }

  return { points, setPosition, setSize, setVisible };
}

// ─── Arc-length equispaced bead calculation ───────────────────────────────────

/**
 * Computes beads evenly spaced by cumulative ARC LENGTH along the trajectory curve,
 * completely independent of the projectile's changing speed.
 *
 * Each bead object contains:
 * - position: THREE.Vector3 (interpolated 3D coordinate)
 * - index: nearest/corresponding trajectory array index
 * - time: corresponding physics time
 *
 * @param {Array<{xPosition: number, yPosition: number, time?: number}>} trajectory
 * @param {number} [targetCount=50] - Number of beads across the full arc
 * @returns {Array<{position: THREE.Vector3, index: number, time: number}>}
 */
export function computeEquispacedBeads(trajectory, targetCount = 50) {
  if (!trajectory || trajectory.length === 0) return [];
  if (trajectory.length === 1) {
    return [{
      position: pointToVector3(trajectory[0]),
      index: 0,
      time: trajectory[0].time || 0
    }];
  }

  // 1. Compute cumulative arc length along trajectory points
  const n = trajectory.length;
  const cumDist = new Float64Array(n);
  cumDist[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = trajectory[i].xPosition - trajectory[i - 1].xPosition;
    const dy = trajectory[i].yPosition - trajectory[i - 1].yPosition;
    cumDist[i] = cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }

  const totalArcLength = cumDist[n - 1];
  if (totalArcLength < 0.0001) {
    return [{
      position: pointToVector3(trajectory[0]),
      index: 0,
      time: trajectory[0].time || 0
    }];
  }

  const count = Math.max(2, Math.min(targetCount, n));
  const segmentLength = totalArcLength / (count - 1);
  const beads = [];

  let trajIdx = 0;
  for (let b = 0; b < count; b++) {
    const targetDist = b * segmentLength;

    while (trajIdx < n - 2 && cumDist[trajIdx + 1] < targetDist) {
      trajIdx++;
    }

    const d0 = cumDist[trajIdx];
    const d1 = cumDist[trajIdx + 1];
    const segSpan = d1 - d0;
    const alpha = segSpan > 0.000001 ? (targetDist - d0) / segSpan : 0;

    const p0 = trajectory[trajIdx];
    const p1 = trajectory[trajIdx + 1];

    const x = p0.xPosition + alpha * (p1.xPosition - p0.xPosition);
    const y = p0.yPosition + alpha * (p1.yPosition - p0.yPosition);
    const t0 = p0.time !== undefined ? p0.time : trajIdx;
    const t1 = p1.time !== undefined ? p1.time : trajIdx + 1;
    const time = t0 + alpha * (t1 - t0);

    const correspIndex = alpha >= 0.5 ? Math.min(trajIdx + 1, n - 1) : trajIdx;

    beads.push({
      position: new THREE.Vector3(x, y, 0),
      index: correspIndex,
      time: time,
    });
  }

  return beads;
}
