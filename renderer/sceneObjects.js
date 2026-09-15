import * as THREE from "three";

// ─── Colour palette (mirrors the CSS custom properties) ───────────────────────
export const COLOURS = {
  trajectory:          0x2f6b72,
  trajectoryPredict:   0x7a9aa0,
  projectile:          0x15181c,
  launchPoint:         0x2f6b72,
  velocity:            0x2a5f9e,
  velocityX:           0x5a8fc4,
  velocityY:           0x3d7aa8,
  gravity:             0x9a4034,
  axisX:               0x2f6b72,   // teal  — horizontal (physics X)
  axisY:               0x2a5f9e,   // blue  — vertical   (physics Y)
  axisZ:               0x8a939e,   // muted — depth      (Z)
  ground:              0xd5dae0,
  groundLine:          0x2a3138,
  ambientLight:        0xffffff,
  dirLight:            0xffffff,
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
    material.gapSize  = gapSize;
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
  const geometry = new THREE.SphereGeometry(0.45, 24, 16);
  const material = new THREE.MeshStandardMaterial({
    color: COLOURS.projectile,
    roughness: 0.35,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  // Outer glow ring (torus)
  const ringGeo = new THREE.TorusGeometry(0.65, 0.06, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: COLOURS.trajectory, transparent: true, opacity: 0.55 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  mesh.add(ring);

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

// ─── Ground plane ─────────────────────────────────────────────────────────────

/**
 * Creates a semi-transparent ground plane and a thick ground line.
 * @param {number} size - Extent in metres.
 * @returns {{ groundPlane: THREE.Mesh, groundLine: THREE.Line }}
 */
export function createGroundPlane(size = 200) {
  // Infinite-looking plane
  const planeGeo = new THREE.PlaneGeometry(size, size);
  const planeMat = new THREE.MeshStandardMaterial({
    color: COLOURS.ground,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const groundPlane = new THREE.Mesh(planeGeo, planeMat);
  groundPlane.rotation.x = -Math.PI / 2;  // rotate to lie flat (XZ plane at Y=0)
  groundPlane.position.set(0, 0, 0);
  groundPlane.receiveShadow = true;

  return { groundPlane };
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
  arrow.line.material.linewidth = 2;

  function update(origin, direction, length) {
    if (length < 0.001) {
      arrow.visible = false;
      return;
    }
    arrow.position.copy(origin);
    arrow.setDirection(direction.clone().normalize());
    arrow.setLength(length, Math.min(0.6, length * 0.18), Math.min(0.35, length * 0.1));
    arrow.visible = true;
  }

  function setVisible(v) {
    arrow.visible = v;
  }

  return { arrow, update, setVisible };
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
  key.shadow.mapSize.width  = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far  = 500;
  key.shadow.camera.left   = -100;
  key.shadow.camera.right  =  100;
  key.shadow.camera.top    =  100;
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

// ─── Trajectory dot markers (stroboscopic time-sample trail) ──────────────────

/**
 * Creates a THREE.Points object that renders small spherical dots at
 * trajectory sample positions — giving the classic stroboscopic/time-step
 * physics-diagram look.
 *
 * Uses sizeAttenuation so dots scale naturally as the camera zooms.
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
    color:           colour,
    size:            1.5,
    sizeAttenuation: true,    // size in world units — scales with distance
    transparent:     opacity < 1.0,
    opacity:         opacity,
    depthWrite:      false,
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
      flat[i * 3]     = vectors[i].x;
      flat[i * 3 + 1] = vectors[i].y;
      flat[i * 3 + 2] = vectors[i].z;
    }

    if (vectors.length !== currentPointCount) {
      // Point count changed — dispose old buffer and assign a fresh attribute
      // to avoid the 'Buffer size too small' Three.js warning.
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
