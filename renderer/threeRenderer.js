/**
 * Three.js 3D renderer for Project Mechanica.
 *
 * Public interface (identical contract to the retired canvasRenderer):
 *   render(state)
 *   getPointerCanvasPosition(event)       → { x, y } NDC coords
 *   findNearestTrajectoryIndex(ndc, traj) → number
 *   isPointerNearProjectile(ndc, point)   → boolean
 *   dispose()
 *
 * Three.js is responsible only for: scene graph, camera, lighting,
 * geometry, materials, and pointer interaction with the visual scene.
 * All physics values come in through `state` and are never mutated here.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createTrajectoryLine,
  createTrajectoryDots,
  createProjectileMesh,
  createLaunchPointMesh,
  createGroundPlane,
  createPhysicsAxes,
  createVectorArrow,
  createLights,
  trajectoryToVectors,
  pointToVector3,
  COLOURS,
} from "./sceneObjects.js";

// Arrow scales — recomputed by frameCameraToTrajectory whenever the scene rescales.
let VELOCITY_SCALE = 0.18;   // m/s → scene units for arrow length
let GRAVITY_SCALE  = 0.32;   // m/s² → scene units for gravity arrow

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a Three.js renderer mounted inside the provided DOM element.
 *
 * @param {HTMLElement} mountEl - Container div that receives the Three.js canvas.
 * @returns {Object} Renderer interface.
 */
export function createThreeRenderer(mountEl) {

  // ── WebGL renderer ─────────────────────────────────────────────────────────
  const webgl = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFSoftShadowMap;
  webgl.setClearColor(0xf7f8fa, 1);

  const domCanvas = webgl.domElement;
  domCanvas.style.display = "block";
  domCanvas.style.width   = "100%";
  domCanvas.style.height  = "100%";
  mountEl.appendChild(domCanvas);

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f8fa);

  // Subtle atmospheric fog to give depth cues
  scene.fog = new THREE.FogExp2(0xf7f8fa, 0.004);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(50, 30, 80);
  camera.lookAt(50, 15, 0);

  // ── Orbit controls ─────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, domCanvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance   = 5;
  controls.maxDistance   = 600;
  controls.maxPolarAngle = Math.PI * 0.9;
  controls.mouseButtons  = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE:  THREE.TOUCH.ROTATE,
    TWO:  THREE.TOUCH.DOLLY_PAN,
  };

  // ── Lights ─────────────────────────────────────────────────────────────────
  const lights = createLights();
  lights.forEach((l) => scene.add(l));

  // ── Ground ─────────────────────────────────────────────────────────────────
  const { groundPlane } = createGroundPlane(400);
  scene.add(groundPlane);

  const gridHelper = new THREE.GridHelper(400, 80, COLOURS.groundLine, COLOURS.ground);
  gridHelper.material.opacity = 0.45;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // ── Physics axes ───────────────────────────────────────────────────────────
  const { xArrow, yArrow, zArrow } = createPhysicsAxes(10);
  scene.add(xArrow, yArrow, zArrow);

  // ── Trajectory lines ──────────────────────────────────────────────────────
  const activeLine    = createTrajectoryLine(COLOURS.trajectory, false);
  const predictedLine = createTrajectoryLine(COLOURS.trajectoryPredict, true);
  scene.add(activeLine.line, predictedLine.line);

  // ── Trajectory dots (stroboscopic time-step markers) ─────────────────────
  // activeDots   — teal solid dots, shown during & after animation
  // predictedDots — muted dots, shown over the predicted (pre-launch) path
  const activeDots    = createTrajectoryDots(COLOURS.trajectory,        1.0);
  const predictedDots = createTrajectoryDots(COLOURS.trajectoryPredict, 0.65);
  scene.add(activeDots.points, predictedDots.points);

  // ── Projectile & launch point ──────────────────────────────────────────────
  const { mesh: projectileMesh, setPosition: setProjectilePos } = createProjectileMesh();
  const launchPointMesh = createLaunchPointMesh();
  scene.add(projectileMesh, launchPointMesh);

  // ── Vector arrows ──────────────────────────────────────────────────────────
  const velocityArrow  = createVectorArrow(COLOURS.velocity);
  const velocityXArrow = createVectorArrow(COLOURS.velocityX);
  const velocityYArrow = createVectorArrow(COLOURS.velocityY);
  const gravityArrow   = createVectorArrow(COLOURS.gravity);
  scene.add(
    velocityArrow.arrow,
    velocityXArrow.arrow,
    velocityYArrow.arrow,
    gravityArrow.arrow,
  );

  // ── Raycaster (for pointer interaction) ────────────────────────────────────
  const raycaster  = new THREE.Raycaster();
  const scrubPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // XY plane at Z=0

  // Internal state
  let lastTrajectoryVectors = [];
  let isDraggingScrub = false;   // when true, OrbitControls are paused

  // ── Resize handling ────────────────────────────────────────────────────────
  function syncSize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    webgl.setSize(w, h, false); // false → don't set style (CSS controls it)
  }

  const resizeObserver = new ResizeObserver(syncSize);
  resizeObserver.observe(mountEl);
  syncSize();

  // ── Animation loop ─────────────────────────────────────────────────────────
  let rafId = null;

  function tick() {
    rafId = requestAnimationFrame(tick);
    controls.update();
    webgl.render(scene, camera);
  }

  tick();

  // ── Camera framing ─────────────────────────────────────────────────────────

  /**
   * Re-frames the camera so the complete trajectory is comfortably visible.
   * Also rescales scene objects (projectile, axes, arrows) to remain
   * visually proportional regardless of the physical trajectory extent.
   *
   * Algorithm:
   *  1. Compute tight AABB of the trajectory in the XY plane.
   *  2. Derive a bounding-sphere radius from the diagonal.
   *  3. Use the camera's vertical FOV to compute the minimum distance
   *     at which that sphere fits inside the frustum, with padding.
   *  4. Position the camera at a pleasant oblique angle from that centre.
   *  5. Rescale all visual objects to stay readable at the new scale.
   */
  function frameCameraToTrajectory(trajectory) {
    if (!trajectory || trajectory.length === 0) return;

    // ── 1. Bounding box ──────────────────────────────────────────────────────
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of trajectory) {
      if (p.xPosition < minX) minX = p.xPosition;
      if (p.xPosition > maxX) maxX = p.xPosition;
      if (p.yPosition < minY) minY = p.yPosition;
      if (p.yPosition > maxY) maxY = p.yPosition;
    }
    // Include origin (launch point is always 0,0)
    minX = Math.min(minX, 0);
    minY = Math.min(minY, 0);
    maxX = Math.max(maxX, 1);
    maxY = Math.max(maxY, 1);

    const spanX   = maxX - minX;
    const spanY   = maxY - minY;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;

    // ── 2. Bounding sphere radius (half-diagonal of the XY bounding rect) ────
    const bboxDiagonal    = Math.sqrt(spanX * spanX + spanY * spanY);
    const boundingRadius  = bboxDiagonal * 0.5;

    // ── 3. Camera distance from FOV ──────────────────────────────────────────
    // Vertical FOV in radians; camera.fov is already the vertical field of view.
    const halfFovRad  = (camera.fov * Math.PI) / 180 * 0.5;
    // Distance so the bounding sphere sits inside the frustum, plus padding.
    const PADDING     = 1.45;
    const camDistance = (boundingRadius / Math.sin(halfFovRad)) * PADDING;

    // ── 4. Camera position: above and in front, looking at scene centre ───────
    // Elevation = 30 % of distance above centre, Z-offset = 85 % of distance.
    controls.target.set(centerX, centerY, 0);
    camera.position.set(
      centerX,
      centerY + camDistance * 0.28,
      camDistance * 0.85
    );
    camera.lookAt(centerX, centerY, 0);
    controls.update();

    // ── 5. Rescale scene objects ──────────────────────────────────────────────
    // Projectile: visible as ~2 % of the bounding diagonal, clamped to a
    // sensible visual minimum so it never disappears on large trajectories.
    const BASE_SPHERE_RADIUS = 0.45;   // matches SphereGeometry arg in sceneObjects.js
    const BASE_LAUNCH_RADIUS = 0.28;   // matches launch-point SphereGeometry arg
    const projectileRadius   = Math.max(bboxDiagonal * 0.022, BASE_SPHERE_RADIUS);
    const launchRadius       = projectileRadius * 0.6;
    projectileMesh.scale.setScalar(projectileRadius / BASE_SPHERE_RADIUS);
    launchPointMesh.scale.setScalar(launchRadius    / BASE_LAUNCH_RADIUS);

    // Axes: ~9 % of the longer spatial axis, minimum 4 units.
    const axisLen   = Math.max(Math.max(spanX, spanY) * 0.09, 4);
    const headLen   = axisLen * 0.14;
    const headWidth = axisLen * 0.075;
    xArrow.setLength(axisLen,        headLen,        headWidth);
    yArrow.setLength(axisLen,        headLen,        headWidth);
    zArrow.setLength(axisLen * 0.4,  headLen * 0.55, headWidth * 0.55);

    // Vector arrows: scale so a typical max-velocity arrow spans ~18 % of diagonal.
    // Reference: 42 m/s at VELOCITY_SCALE 0.18 → 7.56 units ≈ 4 % of 179 m diagonal.
    // We use bboxDiagonal / referenceScene where reference scene diagonal ≈ 100 m.
    const sceneScale  = bboxDiagonal / 100;
    VELOCITY_SCALE = 0.18 * Math.max(sceneScale, 0.25);
    GRAVITY_SCALE  = 0.32 * Math.max(sceneScale, 0.25);

    // Dot size: ~1.4 % of diagonal (same proportion as projectile but smaller).
    // The minimum of 0.3 keeps dots visible on very short trajectories.
    const dotSize          = Math.max(bboxDiagonal * 0.014, 0.3);
    const predictedDotSize = dotSize * 0.78;
    activeDots.setSize(dotSize);
    predictedDots.setSize(predictedDotSize);

    // Predicted line: dash + gap proportional to scene so they're always visible.
    // Target: ~20 dash-gap cycles across the trajectory for clear rhythm.
    const cycleLen = bboxDiagonal / 22;
    predictedLine.setDashScale(cycleLen * 0.55, cycleLen * 0.45);

    // Update fog density so it doesn't clip large scenes or look wrong on small ones.
    if (scene.fog) {
      scene.fog.density = 0.4 / Math.max(bboxDiagonal, 10);
    }
  }

  // Track whether we've done an initial frame
  let hasFramed = false;

  // ── Dot subsampling helper ─────────────────────────────────────────────────

  /**
   * Returns at most `targetCount` evenly-spaced samples from a trajectory
   * array — giving the stroboscopic, equal-time-interval look of classic
   * physics diagrams.  Always includes the first and last points.
   *
   * @param {Array} trajectory
   * @param {number} targetCount
   * @returns {Array}
   */
  function subsampleForDots(trajectory, targetCount = 65) {
    if (!trajectory || trajectory.length === 0) return [];
    if (trajectory.length <= targetCount) return trajectory;
    const step   = (trajectory.length - 1) / (targetCount - 1);
    const result = [];
    for (let i = 0; i < targetCount; i++) {
      result.push(trajectory[Math.round(i * step)]);
    }
    return result;
  }

  // ── Vector update helpers ──────────────────────────────────────────────────

  function updateVelocityVector(point) {
    const origin = pointToVector3(point);
    const vx = point.xVelocity;
    const vy = point.yVelocity;
    const resultant = point.resultantVelocity;

    if (resultant > 0.001) {
      const dir = new THREE.Vector3(vx, vy, 0).normalize();
      velocityArrow.update(origin, dir, resultant * VELOCITY_SCALE);
    } else {
      velocityArrow.setVisible(false);
    }
  }

  function updateVelocityComponentVectors(point) {
    const origin = pointToVector3(point);

    const absVx = Math.abs(point.xVelocity);
    if (absVx > 0.001) {
      const dirX = new THREE.Vector3(Math.sign(point.xVelocity), 0, 0);
      velocityXArrow.update(origin, dirX, absVx * VELOCITY_SCALE);
    } else {
      velocityXArrow.setVisible(false);
    }

    const absVy = Math.abs(point.yVelocity);
    if (absVy > 0.001) {
      const dirY = new THREE.Vector3(0, Math.sign(point.yVelocity), 0);
      velocityYArrow.update(origin, dirY, absVy * VELOCITY_SCALE);
    } else {
      velocityYArrow.setVisible(false);
    }
  }

  function updateGravityVector(point) {
    const origin = pointToVector3(point);
    const gLen = (point.gravity || 9.81) * GRAVITY_SCALE;
    gravityArrow.update(origin, new THREE.Vector3(0, -1, 0), gLen);
  }

  function hideVectors() {
    velocityArrow.setVisible(false);
    velocityXArrow.setVisible(false);
    velocityYArrow.setVisible(false);
    gravityArrow.setVisible(false);
  }

  // ── Main render function ───────────────────────────────────────────────────

  function render(state) {
    const trajectoryForFrame = state.activeTrajectory.length > 0
      ? state.activeTrajectory
      : state.predictedTrajectory;

    // Camera framing on first render or whenever parameters produce a new scale
    if (!hasFramed && trajectoryForFrame.length > 0) {
      frameCameraToTrajectory(trajectoryForFrame);
      hasFramed = true;
    }

    // Reframe when active trajectory changes (new launch or parameter tweak)
    // We track this by comparing first/last points of the trajectory
    const isShowingPredicted = state.activeTrajectory.length === 0;

    // ── Trajectory lines + dots ────────────────────────────────────────────
    if (isShowingPredicted) {
      lastTrajectoryVectors = trajectoryToVectors(state.predictedTrajectory);
      predictedLine.updatePoints(lastTrajectoryVectors);
      predictedLine.setVisible(true);
      activeLine.updatePoints([]);
      activeLine.setVisible(false);

      // Dots: sampled predicted path (lighter, wider spacing)
      const sampledPredicted = subsampleForDots(state.predictedTrajectory, 65);
      predictedDots.updateVectors(trajectoryToVectors(sampledPredicted));
      predictedDots.setVisible(true);
      activeDots.setVisible(false);
    } else {
      // Show the active trajectory up to the current index
      const visibleSlice  = state.activeTrajectory.slice(0, state.currentTrajectoryIndex + 1);
      const activeVectors = trajectoryToVectors(visibleSlice);
      activeLine.updatePoints(activeVectors);
      activeLine.setVisible(true);

      lastTrajectoryVectors = trajectoryToVectors(state.activeTrajectory);
      predictedLine.updatePoints([]);
      predictedLine.setVisible(false);

      // Dots: sampled from the VISIBLE slice so they appear progressively
      const sampledActive = subsampleForDots(visibleSlice, 65);
      activeDots.updateVectors(trajectoryToVectors(sampledActive));
      activeDots.setVisible(true);
      predictedDots.setVisible(false);
    }

    // ── Projectile ────────────────────────────────────────────────────────────
    if (state.currentPoint) {
      const pt = state.currentPoint;
      setProjectilePos(pt.xPosition, pt.yPosition, 0);
      projectileMesh.visible = true;

      // ── Vectors ──────────────────────────────────────────────────────────
      updateVelocityVector(pt);
      if (state.showVelocityComponents) {
        updateVelocityComponentVectors(pt);
      } else {
        velocityXArrow.setVisible(false);
        velocityYArrow.setVisible(false);
      }
      updateGravityVector(pt);
    } else {
      projectileMesh.visible = false;
      hideVectors();
    }

    // Pause/resume orbit controls based on scrub-drag state
    controls.enabled = !isDraggingScrub;
  }

  // ── NDC conversion ─────────────────────────────────────────────────────────

  /**
   * Converts a pointer event to normalised device coordinates (NDC).
   * NDC range: X [-1, 1], Y [-1, 1] (Y is inverted relative to CSS).
   */
  function getPointerCanvasPosition(event) {
    const rect = domCanvas.getBoundingClientRect();
    const x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    const y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
    return { x, y };
  }

  // ── Nearest trajectory index (screen-space projection) ────────────────────

  /**
   * Given an NDC pointer position, finds the trajectory point whose projected
   * screen position is closest to the pointer.
   *
   * @param {{ x: number, y: number }} ndc
   * @param {Array<{xPosition:number,yPosition:number}>} trajectory
   * @returns {number} index
   */
  function findNearestTrajectoryIndex(ndc, trajectory) {
    if (!trajectory || trajectory.length === 0) return 0;

    // Re-use raycaster to cast a ray and intersect the scrub plane
    raycaster.setFromCamera(ndc, camera);
    const planeIntersect = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(scrubPlane, planeIntersect);

    if (!hit) {
      // Fallback: project all points to screen and pick closest by screen dist
      return findNearestByScreenProjection(ndc, trajectory);
    }

    // Find the trajectory point closest to the plane intersection (world space)
    let nearest = 0;
    let nearestDist = Infinity;

    trajectory.forEach((pt, index) => {
      const v = pointToVector3(pt);
      const d = v.distanceToSquared(planeIntersect);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = index;
      }
    });

    return nearest;
  }

  function findNearestByScreenProjection(ndc, trajectory) {
    const pointer = new THREE.Vector2(ndc.x, ndc.y);
    let nearest = 0;
    let nearestDist = Infinity;

    trajectory.forEach((pt, index) => {
      const world = pointToVector3(pt);
      const clip  = world.clone().project(camera);
      const dx = clip.x - pointer.x;
      const dy = clip.y - pointer.y;
      const d  = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = index;
      }
    });

    return nearest;
  }

  // ── Projectile proximity check ─────────────────────────────────────────────

  /**
   * Returns true if the pointer (NDC) is within ~30px of the projectile's
   * projected screen position.
   *
   * @param {{ x: number, y: number }} ndc
   * @param {{ xPosition: number, yPosition: number }} currentPoint
   * @returns {boolean}
   */
  function isPointerNearProjectile(ndc, currentPoint) {
    if (!currentPoint) return false;

    const world = pointToVector3(currentPoint);
    const clip  = world.clone().project(camera);

    // Convert NDC→pixel for both pointer and projectile, compare pixel dist
    const w = domCanvas.clientWidth;
    const h = domCanvas.clientHeight;

    const pointerPx  = { x: (ndc.x  + 1) * 0.5 * w, y: (-ndc.y  + 1) * 0.5 * h };
    const projectPx  = { x: (clip.x + 1) * 0.5 * w, y: (-clip.y + 1) * 0.5 * h };

    const dx = pointerPx.x - projectPx.x;
    const dy = pointerPx.y - projectPx.y;
    const grabRadiusPx = 30;

    return (dx * dx + dy * dy) <= (grabRadiusPx * grabRadiusPx);
  }

  // ── Expose scrub-drag flag so main.js can still call setDragging ──────────

  /**
   * Called by main.js when scrub drag starts/ends; pauses OrbitControls.
   */
  function setIsDragging(value) {
    isDraggingScrub = value;
    controls.enabled = !value;
  }

  // ── Camera reframe (called by main when parameters change) ────────────────

  /**
   * Re-frames the camera to the current predicted trajectory.
   * main.js can call this when trajectory scale changes significantly.
   */
  function reframeCamera(trajectory) {
    if (trajectory && trajectory.length > 0) {
      frameCameraToTrajectory(trajectory);
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  function dispose() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    resizeObserver.disconnect();
    controls.dispose();
    webgl.dispose();
    if (domCanvas.parentNode) {
      domCanvas.parentNode.removeChild(domCanvas);
    }
  }

  return {
    render,
    getPointerCanvasPosition,
    findNearestTrajectoryIndex,
    isPointerNearProjectile,
    setIsDragging,
    reframeCamera,
    dispose,
    // Expose camera/controls for advanced use
    camera,
    controls,
    scene,
  };
}
