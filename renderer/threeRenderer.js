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
import { OrbitControls }    from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
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
  webgl.shadowMap.type = THREE.PCFShadowMap;
  webgl.setClearColor(0xf7f8fa, 1);

  const domCanvas = webgl.domElement;
  domCanvas.style.display = "block";
  domCanvas.style.width   = "100%";
  domCanvas.style.height  = "100%";
  mountEl.appendChild(domCanvas);

  // ── CSS2D label renderer ────────────────────────────────────────────────────
  // Overlays HTML elements (vector labels) on top of the WebGL canvas.
  mountEl.style.position = 'relative';   // required for absolute child positioning
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.cssText = [
    'position:absolute', 'top:0', 'left:0',
    'width:100%',        'height:100%',
    'pointer-events:none', 'overflow:visible',
  ].join(';');
  mountEl.appendChild(labelRenderer.domElement);

  /** Creates a CSS2DObject from an HTML string and a CSS class name. */
  function makeLabel(html, cssClass) {
    const div = document.createElement('div');
    div.className = `vector-label ${cssClass}`;
    div.innerHTML = html;
    const obj = new CSS2DObject(div);
    obj.visible = false;
    scene.add(obj);
    return obj;
  }

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
  // Slightly higher rotate speed so the scene responds with less dragging effort.
  controls.rotateSpeed = 1.5;

  // ── Lights ─────────────────────────────────────────────────────────────────
  const lights = createLights();
  lights.forEach((l) => scene.add(l));

  // ── Ground & Contained Platform ───────────────────────────────────────────
  const { groundPlane, updateBounds: updateGroundBounds } = createGroundPlane();
  scene.add(groundPlane);

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

  // ── Vector labels (CSS2DObjects, positioned at arrow tips each frame) ───────
  // Created after makeLabel is defined (above) and after scene exists.
  const vLabel  = makeLabel('<i>v</i>',                    'vector-label--v');
  const vxLabel = makeLabel('v<sub>x</sub>',               'vector-label--vx');
  const vyLabel = makeLabel('v<sub>y</sub>',               'vector-label--vy');
  const gLabel  = makeLabel('<i>g</i>',                    'vector-label--g');

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
    webgl.setSize(w, h, false); // false → CSS controls style size
    labelRenderer.setSize(w, h);
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
    labelRenderer.render(scene, camera);
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
  /**
   * Re-frames the camera so the complete trajectory is comfortably visible.
   * Dynamically resizes the ground reference platform and rescales visual elements
   * (projectile, axes, arrows, dots) to stay prominent and proportional.
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

    // ── 2. Dynamically resize the physical ground platform ───────────────────
    updateGroundBounds(minX, maxX, spanX, spanY);

    // ── 3. Camera target: center X, elevated to frame ground in lower third ──
    // targetY at ~28% of trajectory height places the ground platform neatly
    // with comfortable bottom margin and the arc apex in the upper half.
    const targetY = spanY * 0.28;
    controls.target.set(centerX, targetY, 0);

    // ── 4. Camera framing based on canvas aspect ratio and FOV ───────────────
    const aspect = (domCanvas.clientWidth && domCanvas.clientHeight)
      ? (domCanvas.clientWidth / domCanvas.clientHeight)
      : 1.6;

    const halfFovY = (camera.fov * Math.PI / 180) * 0.5;
    const tanFovY  = Math.tan(halfFovY);
    const tanFovX  = tanFovY * aspect;

    // Trajectory bounds with compact padding
    const padX        = Math.max(spanX * 0.08, 2.5);
    const totalWidth  = spanX + 2 * padX;
    const thickness   = Math.max(spanY * 0.05, 0.5);
    const totalHeight = spanY + thickness + Math.max(spanY * 0.16, 1.2);

    // Distance required so width and height comfortably fit the viewport
    const distX = (totalWidth * 0.5) / tanFovX * 1.03;
    const distY = (totalHeight * 0.5) / tanFovY * 1.15;
    const camDistance = Math.max(distX, distY);

    // Camera pitch angle: ~12.5 degrees (0.218 rad) above horizontal
    // Gives clean 3D perspective of the contained platform without extreme distortion
    const pitch = 0.218;
    const camY = targetY + camDistance * Math.sin(pitch);
    const camZ = camDistance * Math.cos(pitch);

    camera.position.set(centerX, camY, camZ);
    camera.lookAt(centerX, targetY, 0);

    // OrbitControls bounds
    controls.minDistance = Math.max(camDistance * 0.15, 2);
    controls.maxDistance = camDistance * 5.0;
    controls.update();

    // ── 5. Rescale scene objects ─────────────────────────────────────────────
    const bboxDiagonal       = Math.sqrt(spanX * spanX + spanY * spanY);
    const BASE_SPHERE_RADIUS = 0.45;
    const BASE_LAUNCH_RADIUS = 0.28;
    const projectileRadius   = Math.max(bboxDiagonal * 0.013, BASE_SPHERE_RADIUS);
    const launchRadius       = projectileRadius * 0.55;
    projectileMesh.scale.setScalar(projectileRadius / BASE_SPHERE_RADIUS);
    launchPointMesh.scale.setScalar(launchRadius    / BASE_LAUNCH_RADIUS);

    // Axes: ~8.5 % of the longer spatial axis, minimum 3.5 units.
    const axisLen   = Math.max(Math.max(spanX, spanY) * 0.085, 3.5);
    const headLen   = axisLen * 0.15;
    const headWidth = axisLen * 0.075;
    xArrow.setLength(axisLen,        headLen,        headWidth);
    yArrow.setLength(axisLen,        headLen,        headWidth);
    zArrow.setLength(axisLen * 0.45, headLen * 0.6,  headWidth * 0.6);

    // Vector arrows
    const sceneScale = bboxDiagonal / 100;
    VELOCITY_SCALE = 0.16 * Math.max(sceneScale, 0.25);
    GRAVITY_SCALE  = 0.28 * Math.max(sceneScale, 0.25);

    // Dots
    const dotSize          = Math.max(bboxDiagonal * 0.009, 0.22);
    const predictedDotSize = dotSize * 0.75;
    activeDots.setSize(dotSize);
    predictedDots.setSize(predictedDotSize);

    // Predicted line dash
    const cycleLen = bboxDiagonal / 22;
    predictedLine.setDashScale(cycleLen * 0.55, cycleLen * 0.45);

    // Subtle atmospheric fog so it never obscures the contained experiment
    if (scene.fog) {
      scene.fog.density = 0.05 / Math.max(bboxDiagonal, 20);
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
    const origin    = pointToVector3(point);
    const resultant = point.resultantVelocity;

    if (resultant > 0.001) {
      const dir = new THREE.Vector3(point.xVelocity, point.yVelocity, 0).normalize();
      velocityArrow.update(origin, dir, resultant * VELOCITY_SCALE);
      vLabel.position.copy(velocityArrow.getTipPosition());
      vLabel.visible = true;
    } else {
      velocityArrow.setVisible(false);
      vLabel.visible = false;
    }
  }

  function updateVelocityComponentVectors(point) {
    const origin = pointToVector3(point);

    const absVx = Math.abs(point.xVelocity);
    if (absVx > 0.001) {
      const dirX = new THREE.Vector3(Math.sign(point.xVelocity), 0, 0);
      velocityXArrow.update(origin, dirX, absVx * VELOCITY_SCALE);
      vxLabel.position.copy(velocityXArrow.getTipPosition());
      vxLabel.visible = true;
    } else {
      velocityXArrow.setVisible(false);
      vxLabel.visible = false;
    }

    const absVy = Math.abs(point.yVelocity);
    if (absVy > 0.001) {
      const dirY = new THREE.Vector3(0, Math.sign(point.yVelocity), 0);
      velocityYArrow.update(origin, dirY, absVy * VELOCITY_SCALE);
      vyLabel.position.copy(velocityYArrow.getTipPosition());
      vyLabel.visible = true;
    } else {
      velocityYArrow.setVisible(false);
      vyLabel.visible = false;
    }
  }

  function updateGravityVector(point) {
    const origin = pointToVector3(point);
    const gLen   = (point.gravity || 9.81) * GRAVITY_SCALE;
    gravityArrow.update(origin, new THREE.Vector3(0, -1, 0), gLen);
    gLabel.position.copy(gravityArrow.getTipPosition());
    gLabel.visible = true;
  }

  function hideVectors() {
    velocityArrow.setVisible(false);
    velocityXArrow.setVisible(false);
    velocityYArrow.setVisible(false);
    gravityArrow.setVisible(false);
    vLabel.visible  = false;
    vxLabel.visible = false;
    vyLabel.visible = false;
    gLabel.visible  = false;
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
    // Always show the full predicted trajectory (dashed, muted) as a reference.
    // During flight, overlay the active (solid) portion on top so the user
    // sees both where the projectile has been and where it's going.
    lastTrajectoryVectors = trajectoryToVectors(state.predictedTrajectory);
    predictedLine.updatePoints(lastTrajectoryVectors);
    predictedLine.setVisible(true);

    // Predicted dots: full path reference, always visible
    const sampledPredicted = subsampleForDots(state.predictedTrajectory, 65);
    predictedDots.updateVectors(trajectoryToVectors(sampledPredicted));
    predictedDots.setVisible(true);

    if (!isShowingPredicted) {
      // Active solid line: traveled portion up to current index
      const visibleSlice  = state.activeTrajectory.slice(0, state.currentTrajectoryIndex + 1);
      const activeVectors = trajectoryToVectors(visibleSlice);
      activeLine.updatePoints(activeVectors);
      activeLine.setVisible(true);

      // Active dots: progressively appear on the traveled portion
      const sampledActive = subsampleForDots(visibleSlice, 65);
      activeDots.updateVectors(trajectoryToVectors(sampledActive));
      activeDots.setVisible(true);
    } else {
      activeLine.updatePoints([]);
      activeLine.setVisible(false);
      activeDots.setVisible(false);
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
        vxLabel.visible = false;
        vyLabel.visible = false;
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
    if (domCanvas.parentNode) domCanvas.parentNode.removeChild(domCanvas);
    if (labelRenderer.domElement.parentNode) {
      labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
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
