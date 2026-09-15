import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CANVAS_COLORS = {
  paper: 0xffffff,
  grid: 0xe8ecf0,
  gridMajor: 0xd0d6de,
  axis: 0x2a3138,
  trajectory: 0x2f6b72,
  trajectoryPrediction: 0x7a9aa0,
  projectile: 0x15181c,
  launchPoint: 0x2f6b72,
  velocity: 0x2a5f9e,
  velocityX: 0x5a8fc4,
  velocityY: 0x3d7aa8,
  gravity: 0x9a4034,
};

const PROJECTILE_RADIUS = 2;
const VELOCITY_VECTOR_SCALE = 0.5;
const GRAVITY_VECTOR_SCALE = 2;

export function createCanvasRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(CANVAS_COLORS.paper);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.width, canvas.height, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 10000);
  camera.position.set(200, 100, 300);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 200, 100);
  scene.add(directionalLight);

  const staticGroup = new THREE.Group();
  scene.add(staticGroup);

  const gridHelperXY = new THREE.GridHelper(1000, 50, CANVAS_COLORS.gridMajor, CANVAS_COLORS.grid);
  gridHelperXY.rotation.x = Math.PI / 2;
  gridHelperXY.position.z = -0.1;
  staticGroup.add(gridHelperXY);

  const gridHelperXZ = new THREE.GridHelper(1000, 50, CANVAS_COLORS.gridMajor, CANVAS_COLORS.grid);
  gridHelperXZ.position.y = -0.1;
  staticGroup.add(gridHelperXZ);

  const groundGeo = new THREE.BoxGeometry(1000, 0.5, 200);
  const groundMat = new THREE.MeshLambertMaterial({ color: CANVAS_COLORS.axis });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -0.25, 0);
  staticGroup.add(ground);

  const lpGeo = new THREE.SphereGeometry(1, 16, 16);
  const lpMat = new THREE.MeshBasicMaterial({ color: CANVAS_COLORS.launchPoint });
  const launchPointMesh = new THREE.Mesh(lpGeo, lpMat);
  staticGroup.add(launchPointMesh);

  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  const scale = {
    pixelsPerMeter: 1,
    originX: 0,
    originY: 0
  };

  let arrows = new THREE.Group();
  mainGroup.add(arrows);

  let cameraInitialized = false;
  let isDraggingProjectile = false;

  let animationFrameId;

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (controls) {
      controls.enabled = !isDraggingProjectile;
      controls.update();
    }
    renderer.render(scene, camera);
  }

  animate();

  function destroy() {
    cancelAnimationFrame(animationFrameId);
    resizeObserver.disconnect();
    renderer.dispose();
  }

  function calculateRenderScale(trajectory) {
    if (!trajectory || trajectory.length === 0) return;
    if (cameraInitialized) return;

    const maximumX = Math.max(...trajectory.map(p => p.xPosition), 10);
    const maximumY = Math.max(...trajectory.map(p => p.yPosition), 10);

    const targetZ = Math.max(maximumX, maximumY) * 1.5;
    camera.position.set(maximumX / 2, maximumY / 2, targetZ);
    controls.target.set(maximumX / 2, maximumY / 2, 0);
    controls.update();

    ground.geometry.dispose();
    const platformWidth = Math.max(maximumX * 1.5, 100);
    const platformDepth = Math.max(platformWidth * 0.2, 50);
    ground.geometry = new THREE.BoxGeometry(platformWidth, 0.5, platformDepth);
    ground.position.set(maximumX / 2, -0.25, 0);

    cameraInitialized = true;
  }

  function convertMetersToCanvasPosition(point) {
    return {
      x: point.xPosition,
      y: point.yPosition
    };
  }

  function getPointerCanvasPosition(event) {
    const canvasRectangle = canvas.getBoundingClientRect();
    const x = ((event.clientX - canvasRectangle.left) / canvasRectangle.width) * 2 - 1;
    const y = -((event.clientY - canvasRectangle.top) / canvasRectangle.height) * 2 + 1;
    return { x, y };
  }

  const raycaster = new THREE.Raycaster();

  function getIntersectionPoint(canvasPosition) {
    raycaster.setFromCamera(new THREE.Vector2(canvasPosition.x, canvasPosition.y), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    return target;
  }

  function findNearestTrajectoryIndex(canvasPosition, trajectory) {
    if (!trajectory || trajectory.length === 0) return 0;

    const target = getIntersectionPoint(canvasPosition);
    if (!target) return 0;

    let nearestIndex = 0;
    let nearestDistanceSquared = Infinity;

    trajectory.forEach((point, index) => {
      const deltaX = target.x - point.xPosition;
      const deltaY = target.y - point.yPosition;
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

    const target = getIntersectionPoint(canvasPosition);
    if (!target) return false;

    const deltaX = target.x - currentPoint.xPosition;
    const deltaY = target.y - currentPoint.yPosition;
    const distSq = (deltaX * deltaX) + (deltaY * deltaY);

    const maxDimension = Math.max(camera.position.z, 50);
    const grabRadius = maxDimension * 0.05;
    return distSq <= (grabRadius * grabRadius);
  }

  function formatNumber(value) {
    return typeof value === "number" ? value.toFixed(2) : "0.00";
  }

  function createTextSprite(label, magnitudeText, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.font = 'bold 48px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = typeof colorHex === 'string' ? colorHex : '#' + colorHex.toString(16).padStart(6, '0');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillText(label, 10, 80);
    if (magnitudeText) {
      ctx.font = '40px "IBM Plex Sans", sans-serif';
      ctx.fillText(magnitudeText, 10, 140);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(30, 15, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  function createArrow(start, end, colorHex, label, magnitudeText) {
    const startZ = start.z !== undefined ? start.z : (start.zPosition || 0);
    const endZ = end.z !== undefined ? end.z : 0;
    const dir = new THREE.Vector3(end.x - start.x, end.y - start.y, endZ - startZ);
    const length = dir.length();
    if (length < 0.001) return null;
    dir.normalize();
    const arrowGroup = new THREE.Group();
    const arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(start.x, start.y, startZ), length, colorHex, length * 0.2, length * 0.1);
    arrowGroup.add(arrowHelper);

    if (label) {
      const sprite = createTextSprite(label, magnitudeText, colorHex);
      sprite.position.set(end.x, end.y, endZ);
      arrowGroup.add(sprite);
    }

    return arrowGroup;
  }

  function render(state) {
    isDraggingProjectile = state.isDragging;

    while (mainGroup.children.length > 0) {
      mainGroup.remove(mainGroup.children[0]);
    }
    arrows = new THREE.Group();
    mainGroup.add(arrows);

    const trajectoryForScale = state.activeTrajectory.length > 0
      ? state.activeTrajectory
      : state.predictedTrajectory;

    if (!state.hasLaunched && state.activeTrajectory.length === 0) {
      cameraInitialized = false;
    }

    calculateRenderScale(trajectoryForScale);

    const drawTrajectory = (traj, colorHex, isDashed) => {
      if (!traj || traj.length < 2) return;
      const points = traj.map(p => new THREE.Vector3(p.xPosition, p.yPosition, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      let material;
      if (isDashed) {
        material = new THREE.LineDashedMaterial({ color: colorHex, dashSize: 2, gapSize: 2 });
      } else {
        material = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 });
      }
      const line = new THREE.Line(geometry, material);
      if (isDashed) line.computeLineDistances();
      mainGroup.add(line);
    };

    drawTrajectory(state.predictedTrajectory, CANVAS_COLORS.trajectoryPrediction, true);

    if (state.activeTrajectory.length > 0) {
      const visibleTrajectory = state.activeTrajectory.slice(0, state.currentTrajectoryIndex + 1);
      drawTrajectory(visibleTrajectory, CANVAS_COLORS.trajectory, false);
    }

    if (state.currentPoint) {
      const pGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 32, 32);
      const pMat = new THREE.MeshLambertMaterial({ color: CANVAS_COLORS.projectile });
      const projectileMesh = new THREE.Mesh(pGeo, pMat);
      projectileMesh.position.set(state.currentPoint.xPosition, state.currentPoint.yPosition, 0);
      mainGroup.add(projectileMesh);

      const pPos = state.currentPoint;
      const startX = pPos.xPosition;
      const startY = pPos.yPosition;
      const startZ = pPos.zPosition || 0;

      const vx = pPos.xVelocity || 0;
      const vy = pPos.yVelocity || 0;
      const vz = pPos.zVelocity || 0;

      if (state.showVelocityComponents) {
        const vxArrow = createArrow({ x: startX, y: startY, z: startZ }, { x: startX + vx * VELOCITY_VECTOR_SCALE, y: startY, z: startZ }, CANVAS_COLORS.velocityX, "vx", `${formatNumber(Math.abs(vx))} m/s`);
        if (vxArrow) arrows.add(vxArrow);

        const vyArrow = createArrow({ x: startX, y: startY, z: startZ }, { x: startX, y: startY + vy * VELOCITY_VECTOR_SCALE, z: startZ }, CANVAS_COLORS.velocityY, "vy", `${formatNumber(Math.abs(vy))} m/s`);
        if (vyArrow) arrows.add(vyArrow);

        const vzArrow = createArrow({ x: startX, y: startY, z: startZ }, { x: startX, y: startY, z: startZ + vz * VELOCITY_VECTOR_SCALE }, 0x5a8fc4, "vz", `${formatNumber(Math.abs(vz))} m/s`);
        if (vzArrow) arrows.add(vzArrow);

        const resultantX = startX + vx * VELOCITY_VECTOR_SCALE;
        const resultantY = startY + vy * VELOCITY_VECTOR_SCALE;
        const resultantZ = startZ + vz * VELOCITY_VECTOR_SCALE;

        const dashedPoints = [
          new THREE.Vector3(resultantX, startY, startZ), new THREE.Vector3(resultantX, resultantY, startZ),
          new THREE.Vector3(startX, resultantY, startZ), new THREE.Vector3(resultantX, resultantY, startZ),
          new THREE.Vector3(resultantX, startY, startZ), new THREE.Vector3(resultantX, startY, resultantZ),
          new THREE.Vector3(startX, resultantY, startZ), new THREE.Vector3(startX, resultantY, resultantZ),
          new THREE.Vector3(startX, startY, resultantZ), new THREE.Vector3(resultantX, startY, resultantZ),
          new THREE.Vector3(startX, startY, resultantZ), new THREE.Vector3(startX, resultantY, resultantZ),
          new THREE.Vector3(resultantX, startY, resultantZ), new THREE.Vector3(resultantX, resultantY, resultantZ),
          new THREE.Vector3(startX, resultantY, resultantZ), new THREE.Vector3(resultantX, resultantY, resultantZ),
          new THREE.Vector3(resultantX, resultantY, startZ), new THREE.Vector3(resultantX, resultantY, resultantZ)
        ];

        for (let i = 0; i < dashedPoints.length; i += 2) {
          if (dashedPoints[i].distanceTo(dashedPoints[i + 1]) > 0.001) {
            const geom = new THREE.BufferGeometry().setFromPoints([dashedPoints[i], dashedPoints[i + 1]]);
            const mat = new THREE.LineDashedMaterial({ color: 0x5c6570, dashSize: 0.5, gapSize: 0.5 });
            const line = new THREE.Line(geom, mat);
            line.computeLineDistances();
            arrows.add(line);
          }
        }
      }

      const vArrow = createArrow({ x: startX, y: startY, z: startZ }, { x: startX + vx * VELOCITY_VECTOR_SCALE, y: startY + vy * VELOCITY_VECTOR_SCALE, z: startZ + vz * VELOCITY_VECTOR_SCALE }, CANVAS_COLORS.velocity, "v", `${formatNumber(Math.sqrt(vx * vx + vy * vy + vz * vz))} m/s`);
      if (vArrow) arrows.add(vArrow);

      const gArrow = createArrow({ x: startX, y: startY, z: startZ }, { x: startX, y: startY - pPos.gravity * GRAVITY_VECTOR_SCALE, z: startZ }, CANVAS_COLORS.gravity, "g", `${formatNumber(pPos.gravity)} m/s²`);
      if (gArrow) arrows.add(gArrow);
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvas);

  return {
    render,
    getPointerCanvasPosition,
    findNearestTrajectoryIndex,
    isPointerNearProjectile,
    convertMetersToCanvasPosition,
    getScale: () => scale,
    destroy
  };
}
