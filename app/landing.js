/* ================================================================
   MECHANICA — Landing Page Scripts
   Interactive simulations, starfield, scroll animations, FAQ
   ================================================================ */

// ——— Starfield Background ———
function initStarfield() {
  const canvas = document.getElementById('starfieldCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w, h;
  const stars = [];
  const STAR_COUNT = 200;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 1.2 + 0.2,
        opacity: Math.random() * 0.6 + 0.1,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);

    for (const star of stars) {
      const twinkle = prefersReducedMotion
        ? star.opacity
        : star.opacity * (0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset));

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 230, ${twinkle})`;
      ctx.fill();
    }

    if (!prefersReducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  resize();
  createStars();
  draw(0);

  window.addEventListener('resize', () => {
    resize();
    createStars();
  });
}

// ——— Hero Projectile Simulation ———
function initHeroSim() {
  const canvas = document.getElementById('heroSimCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h;

  // Physics params
  const v0 = 42;
  const angle = 42 * (Math.PI / 180);
  const g = 9.81;
  const vx = v0 * Math.cos(angle);
  const vy = v0 * Math.sin(angle);
  const totalTime = (2 * vy) / g;
  const range = vx * totalTime;
  const maxH = (vy * vy) / (2 * g);

  // Animation state
  let animTime = 0;
  let isPlaying = true;
  let animFrameId;

  // Telemetry elements
  const telTime = document.getElementById('telTime');
  const telRange = document.getElementById('telRange');
  const telMaxH = document.getElementById('telMaxH');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(wx, wy) {
    const margin = 80;
    const scaleX = (w - margin * 2) / (range * 1.15);
    const scaleY = (h - margin * 2) / (maxH * 1.4);
    const scale = Math.min(scaleX, scaleY);
    const originX = margin;
    const originY = h - margin;
    return {
      x: originX + wx * scale,
      y: originY - wy * scale,
    };
  }

  function drawGrid() {
    const margin = 80;
    const originX = margin;
    const originY = h - margin;
    const gridW = w - margin * 2;
    const gridH = h - margin * 2;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;

    const gridSpacing = 40;
    for (let x = originX; x <= originX + gridW; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY - gridH);
      ctx.stroke();
    }
    for (let y = originY; y >= originY - gridH; y -= gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + gridW, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + gridW, originY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX, originY - gridH);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Distance (m)', originX + gridW / 2, originY + 32);
    ctx.save();
    ctx.translate(originX - 38, originY - gridH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Height (m)', 0, 0);
    ctx.restore();

    // Tick labels
    const scaleX = gridW / (range * 1.15);
    const scaleY = gridH / (maxH * 1.4);
    const scale = Math.min(scaleX, scaleY);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const tickStep = Math.pow(10, Math.floor(Math.log10(range / 4)));
    const niceStep = range / 4 > tickStep * 5 ? tickStep * 5 : tickStep * 2;
    for (let val = 0; val <= range * 1.1; val += niceStep) {
      const sx = originX + val * scale;
      if (sx > originX && sx < originX + gridW) {
        ctx.fillText(Math.round(val) + '', sx, originY + 16);
      }
    }

    ctx.textAlign = 'right';
    for (let val = 0; val <= maxH * 1.3; val += niceStep) {
      const sy = originY - val * scale;
      if (sy < originY && sy > originY - gridH) {
        ctx.fillText(Math.round(val) + '', originX - 8, sy + 3);
      }
    }
  }

  function drawTrajectory(t) {
    const points = [];
    const steps = 120;
    const tEnd = Math.min(t, totalTime);

    for (let i = 0; i <= steps; i++) {
      const ti = (i / steps) * tEnd;
      const wx = vx * ti;
      const wy = vy * ti - 0.5 * g * ti * ti;
      if (wy < 0) break;
      points.push(worldToScreen(wx, Math.max(0, wy)));
    }

    if (points.length < 2) return;

    // Glow
    ctx.save();
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.15)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // Solid trail
    const gradient = ctx.createLinearGradient(
      points[0].x, points[0].y,
      points[points.length - 1].x, points[points.length - 1].y
    );
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#22d3ee');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Dashed future trajectory
    if (t < totalTime) {
      const futurePoints = [];
      for (let i = 0; i <= steps; i++) {
        const ti = tEnd + (i / steps) * (totalTime - tEnd);
        const wx = vx * ti;
        const wy = vy * ti - 0.5 * g * ti * ti;
        if (wy < 0) break;
        futurePoints.push(worldToScreen(wx, Math.max(0, wy)));
      }
      if (futurePoints.length > 1) {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(futurePoints[0].x, futurePoints[0].y);
        for (let i = 1; i < futurePoints.length; i++) {
          ctx.lineTo(futurePoints[i].x, futurePoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawProjectile(t) {
    const tClamped = Math.min(t, totalTime);
    const wx = vx * tClamped;
    const wy = Math.max(0, vy * tClamped - 0.5 * g * tClamped * tClamped);
    const pos = worldToScreen(wx, wy);

    // Outer glow
    const glowGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 24);
    glowGrad.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
    glowGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 24, 0, Math.PI * 2);
    ctx.fill();

    // Projectile
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Velocity vector
    if (tClamped < totalTime) {
      const currentVx = vx;
      const currentVy = vy - g * tClamped;
      const speed = Math.sqrt(currentVx * currentVx + currentVy * currentVy);
      const arrowLen = 40;
      const ex = pos.x + (currentVx / speed) * arrowLen;
      const ey = pos.y - (currentVy / speed) * arrowLen;

      ctx.strokeStyle = 'rgba(96, 165, 250, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead
      const headLen = 8;
      const angleA = Math.atan2(pos.y - ey, pos.x - ex);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + headLen * Math.cos(angleA + 0.4), ey + headLen * Math.sin(angleA + 0.4));
      ctx.lineTo(ex + headLen * Math.cos(angleA - 0.4), ey + headLen * Math.sin(angleA - 0.4));
      ctx.closePath();
      ctx.fill();

      // v label
      ctx.fillStyle = 'rgba(96, 165, 250, 0.8)';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('v = ' + speed.toFixed(1) + ' m/s', ex + 8, ey - 4);
    }

    // Gravity vector
    const gArrowLen = 30;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y + gArrowLen);
    ctx.stroke();

    const gHeadLen = 6;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y + gArrowLen);
    ctx.lineTo(pos.x - gHeadLen * 0.5, pos.y + gArrowLen - gHeadLen);
    ctx.lineTo(pos.x + gHeadLen * 0.5, pos.y + gArrowLen - gHeadLen);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.font = '600 9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('g', pos.x + 8, pos.y + gArrowLen - 2);
  }

  function drawGroundPlane() {
    const margin = 80;
    const originY = h - margin;

    // Ground line highlight
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, originY);
    ctx.lineTo(w - margin, originY);
    ctx.stroke();

    // Subtle ground hatching
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    for (let x = margin; x < w - margin; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x - 8, originY + 8);
      ctx.stroke();
    }
  }

  function drawOriginMarker() {
    const origin = worldToScreen(0, 0);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('O', origin.x, origin.y + 24);
  }

  function updateTelemetry(t) {
    const tClamped = Math.min(t, totalTime);
    const currentX = vx * tClamped;
    const currentMaxH = (vy * vy) / (2 * g);
    if (telTime) telTime.textContent = tClamped.toFixed(2);
    if (telRange) telRange.textContent = currentX.toFixed(1);
    if (telMaxH) telMaxH.textContent = (tClamped >= totalTime / 2 ? currentMaxH : (vy * tClamped - 0.5 * g * tClamped * tClamped)).toFixed(1);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    bgGrad.addColorStop(0, 'rgba(14, 19, 34, 1)');
    bgGrad.addColorStop(1, 'rgba(6, 8, 13, 1)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    drawGrid();
    drawGroundPlane();
    drawOriginMarker();
    drawTrajectory(animTime);
    drawProjectile(animTime);
    updateTelemetry(animTime);

    if (isPlaying && animTime < totalTime + 0.5) {
      animTime += 0.025;
      if (!prefersReducedMotion) {
        animFrameId = requestAnimationFrame(draw);
      }
    } else if (isPlaying && animTime >= totalTime + 0.5) {
      isPlaying = false;
    }
  }

  function replay() {
    animTime = 0;
    isPlaying = true;
    cancelAnimationFrame(animFrameId);
    draw();
  }

  function play() {
    if (animTime >= totalTime + 0.3) {
      replay();
    } else {
      isPlaying = true;
      draw();
    }
  }

  resize();

  if (prefersReducedMotion) {
    animTime = totalTime;
    isPlaying = false;
    draw();
  } else {
    // Start auto-playing after a delay
    setTimeout(() => draw(), 800);
  }

  window.addEventListener('resize', () => {
    resize();
    const wasPlaying = isPlaying;
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    draw();
    if (wasPlaying && animTime < totalTime) {
      isPlaying = true;
      draw();
    }
  });

  // Controls
  const playBtn = document.getElementById('heroPlayBtn');
  const replayBtn = document.getElementById('heroReplayBtn');
  if (playBtn) playBtn.addEventListener('click', play);
  if (replayBtn) replayBtn.addEventListener('click', replay);
}

// ——— Demo Section Simulation ———
function initDemoSim() {
  const canvas = document.getElementById('demoSimCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h;

  // State
  let v0 = 42, angleDeg = 42, g = 9.81, launchH = 0;
  let animTime = 0;
  let isPlaying = false;
  let animFrameId;

  // DOM refs
  const v0Slider = document.getElementById('demoV0Slider');
  const angleSlider = document.getElementById('demoAngleSlider');
  const gravSlider = document.getElementById('demoGravSlider');
  const heightSlider = document.getElementById('demoHeightSlider');
  const v0Val = document.getElementById('demoV0Val');
  const angleVal = document.getElementById('demoAngleVal');
  const gravVal = document.getElementById('demoGravVal');
  const heightVal = document.getElementById('demoHeightVal');
  const runBtn = document.getElementById('demoRunBtn');

  function getPhysics() {
    const angleRad = angleDeg * (Math.PI / 180);
    const vx = v0 * Math.cos(angleRad);
    const vy = v0 * Math.sin(angleRad);
    const totalTime = (vy + Math.sqrt(vy * vy + 2 * g * launchH)) / g;
    const range = vx * totalTime;
    const maxH = launchH + (vy * vy) / (2 * g);
    return { vx, vy, totalTime, range, maxH, angleRad };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(wx, wy, physics) {
    const margin = 60;
    const scaleX = (w - margin * 2) / (physics.range * 1.15);
    const scaleY = (h - margin * 2) / (physics.maxH * 1.3);
    const scale = Math.min(scaleX, scaleY);
    return {
      x: margin + wx * scale,
      y: (h - margin) - wy * scale,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    bgGrad.addColorStop(0, 'rgba(14, 19, 34, 1)');
    bgGrad.addColorStop(1, 'rgba(6, 8, 13, 1)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const p = getPhysics();
    const margin = 60;

    // Grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
    ctx.lineWidth = 1;
    for (let x = margin; x <= w - margin; x += 35) {
      ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, h - margin); ctx.stroke();
    }
    for (let y = margin; y <= h - margin; y += 35) {
      ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(w - margin, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(margin, h - margin); ctx.lineTo(w - margin, h - margin); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin, h - margin); ctx.lineTo(margin, margin); ctx.stroke();

    // Ground hatching
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    for (let x = margin; x < w - margin; x += 10) {
      ctx.beginPath(); ctx.moveTo(x, h - margin); ctx.lineTo(x - 6, h - margin + 6); ctx.stroke();
    }

    // Full trajectory (dashed)
    const fullPoints = [];
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
      const ti = (i / steps) * p.totalTime;
      const wx = p.vx * ti;
      const wy = launchH + p.vy * ti - 0.5 * g * ti * ti;
      if (wy < 0) break;
      fullPoints.push(worldToScreen(wx, Math.max(0, wy), p));
    }

    if (fullPoints.length > 1 && !isPlaying) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fullPoints[0].x, fullPoints[0].y);
      for (let i = 1; i < fullPoints.length; i++) {
        ctx.lineTo(fullPoints[i].x, fullPoints[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Animated trajectory
    if (isPlaying || animTime > 0) {
      const tEnd = Math.min(animTime, p.totalTime);
      const trailPoints = [];
      for (let i = 0; i <= steps; i++) {
        const ti = (i / steps) * tEnd;
        const wx = p.vx * ti;
        const wy = launchH + p.vy * ti - 0.5 * g * ti * ti;
        if (wy < 0) break;
        trailPoints.push(worldToScreen(wx, Math.max(0, wy), p));
      }

      if (trailPoints.length > 1) {
        const grad = ctx.createLinearGradient(
          trailPoints[0].x, trailPoints[0].y,
          trailPoints[trailPoints.length - 1].x, trailPoints[trailPoints.length - 1].y
        );
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#22d3ee');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trailPoints[0].x, trailPoints[0].y);
        for (let i = 1; i < trailPoints.length; i++) {
          ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
        }
        ctx.stroke();
      }

      // Projectile dot
      const tClamped = Math.min(animTime, p.totalTime);
      const px = p.vx * tClamped;
      const py = Math.max(0, launchH + p.vy * tClamped - 0.5 * g * tClamped * tClamped);
      const pos = worldToScreen(px, py, p);

      const glowGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 20);
      glowGrad.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
      glowGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Show launch position indicator
      const origin = worldToScreen(0, launchH, p);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Angle indicator
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 30, -p.angleRad, 0);
      ctx.stroke();

      // Direction line
      const dirLen = 50;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + dirLen * Math.cos(p.angleRad), origin.y - dirLen * Math.sin(p.angleRad));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isPlaying && animTime < p.totalTime + 0.3) {
      animTime += 0.03;
      animFrameId = requestAnimationFrame(draw);
    } else if (isPlaying) {
      isPlaying = false;
    }
  }

  function runSim() {
    animTime = 0;
    isPlaying = true;
    cancelAnimationFrame(animFrameId);
    draw();
  }

  // Slider handlers
  function updateSliders() {
    v0 = parseFloat(v0Slider.value);
    angleDeg = parseFloat(angleSlider.value);
    g = parseFloat(gravSlider.value);
    launchH = parseFloat(heightSlider.value);

    v0Val.textContent = v0;
    angleVal.textContent = angleDeg;
    gravVal.textContent = g.toFixed(2);
    heightVal.textContent = launchH;

    animTime = 0;
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    draw();
  }

  if (v0Slider) v0Slider.addEventListener('input', updateSliders);
  if (angleSlider) angleSlider.addEventListener('input', updateSliders);
  if (gravSlider) gravSlider.addEventListener('input', updateSliders);
  if (heightSlider) heightSlider.addEventListener('input', updateSliders);
  if (runBtn) runBtn.addEventListener('click', runSim);

  resize();
  draw();

  window.addEventListener('resize', () => {
    resize();
    draw();
  });
}

// ——— Student Visual (Orbital particles) ———
function initStudentVisual() {
  const canvas = document.getElementById('studentCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h;

  const particles = [];
  const PARTICLE_COUNT = 60;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initParticles();
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const orbitRadius = 40 + Math.random() * (Math.min(w, h) * 0.35);
      particles.push({
        orbitRadius,
        angle: Math.random() * Math.PI * 2,
        speed: (0.002 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1),
        size: 1 + Math.random() * 2.5,
        opacity: 0.15 + Math.random() * 0.5,
        hue: 210 + Math.random() * 60,
      });
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // Central glow
    const centralGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    centralGlow.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
    centralGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = centralGlow;
    ctx.fillRect(0, 0, w, h);

    // Orbital rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.lineWidth = 1;
    for (let r = 60; r < Math.min(w, h) * 0.4; r += 50) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    for (const p of particles) {
      if (!prefersReducedMotion) {
        p.angle += p.speed;
      }
      const x = cx + p.orbitRadius * Math.cos(p.angle);
      const y = cy + p.orbitRadius * Math.sin(p.angle) * 0.6;

      ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${p.opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central dot
    ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    if (!prefersReducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  resize();
  draw(0);
  window.addEventListener('resize', resize);
}

// ——— Teacher Visual (Waveform) ———
function initTeacherVisual() {
  const canvas = document.getElementById('teacherCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h;
  let time = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // "Screen" frame
    const screenMargin = 40;
    const screenX = screenMargin;
    const screenY = screenMargin;
    const screenW = w - screenMargin * 2;
    const screenH = h - screenMargin * 2;

    // Screen background
    ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    const radius = 12;
    ctx.beginPath();
    ctx.roundRect(screenX, screenY, screenW, screenH, radius);
    ctx.fill();
    ctx.stroke();

    // Grid inside screen
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.lineWidth = 1;
    for (let x = screenX + 20; x < screenX + screenW; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, screenY + 10); ctx.lineTo(x, screenY + screenH - 10); ctx.stroke();
    }
    for (let y = screenY + 20; y < screenY + screenH; y += 25) {
      ctx.beginPath(); ctx.moveTo(screenX + 10, y); ctx.lineTo(screenX + screenW - 10, y); ctx.stroke();
    }

    // Center axis
    const midY = screenY + screenH / 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.beginPath();
    ctx.moveTo(screenX + 20, midY);
    ctx.lineTo(screenX + screenW - 20, midY);
    ctx.stroke();

    // Multiple waveforms
    const waves = [
      { amp: screenH * 0.2, freq: 0.03, phase: 0, color: 'rgba(59, 130, 246, 0.6)', width: 2 },
      { amp: screenH * 0.12, freq: 0.05, phase: 2, color: 'rgba(139, 92, 246, 0.4)', width: 1.5 },
      { amp: screenH * 0.08, freq: 0.08, phase: 4, color: 'rgba(34, 211, 238, 0.3)', width: 1 },
    ];

    for (const wave of waves) {
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.width;
      ctx.beginPath();

      for (let x = screenX + 20; x <= screenX + screenW - 20; x++) {
        const xNorm = x - screenX - 20;
        const y = midY + wave.amp * Math.sin(xNorm * wave.freq + (prefersReducedMotion ? 0 : time) + wave.phase);
        if (x === screenX + 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // "Mechanica" label on screen
    ctx.fillStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MECHANICA', screenX + 16, screenY + 24);

    // Projector beam lines (subtle)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.03)';
    ctx.lineWidth = 1;
    const beamOriginX = w / 2;
    const beamOriginY = h + 30;
    for (let i = 0; i < 5; i++) {
      const targetX = screenX + (screenW / 6) * (i + 1);
      ctx.beginPath();
      ctx.moveTo(beamOriginX, beamOriginY);
      ctx.lineTo(targetX, screenY + screenH);
      ctx.stroke();
    }

    if (!prefersReducedMotion) {
      time += 0.03;
      requestAnimationFrame(draw);
    }
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
}

// ——— Scroll Animations ———
function initScrollAnimations() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  );

  document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
}

// ——— Nav scroll effect ———
function initNavScroll() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('is-scrolled', window.scrollY > 20);
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ——— FAQ Accordion ———
function initFAQ() {
  const items = document.querySelectorAll('.faq__item');
  items.forEach((item) => {
    const btn = item.querySelector('.faq__question');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      // Close all
      items.forEach((i) => {
        i.classList.remove('is-open');
        i.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
      });
      // Open clicked if it was closed
      if (!isOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// ——— Mobile Nav Toggle ———
function initMobileNav() {
  const toggle = document.getElementById('mobileToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const isOpen = links.style.display === 'flex';
    links.style.display = isOpen ? 'none' : 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '100%';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = 'rgba(6, 8, 13, 0.98)';
    links.style.padding = '16px 32px';
    links.style.borderBottom = '1px solid rgba(148, 163, 184, 0.08)';
    links.style.gap = '16px';
    toggle.setAttribute('aria-expanded', !isOpen);

    if (isOpen) {
      links.style.display = '';
      links.style.flexDirection = '';
      links.style.position = '';
      links.style.top = '';
      links.style.left = '';
      links.style.right = '';
      links.style.background = '';
      links.style.padding = '';
      links.style.borderBottom = '';
      links.style.gap = '';
    }
  });
}

function scrollToElement(target) {
  if (!target) return;
  const nav = document.getElementById('mainNav');
  const navHeight = nav ? nav.offsetHeight : 64;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const labelEl = target.querySelector('.section-label') || target;
  const targetTop = labelEl.getBoundingClientRect().top + scrollTop - (navHeight + 24);

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth'
  });
}

// ——— Smooth scroll for anchor links ———
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        scrollToElement(target);
      }
    });
  });
}

// ——— Watch Demo button (scrolls to demo) ———
function initWatchDemo() {
  const btn = document.getElementById('watchDemoBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const demo = document.getElementById('demo');
    if (demo) scrollToElement(demo);
  });
}

// ——— Initialize Everything ———
document.addEventListener('DOMContentLoaded', () => {
  initStarfield();
  initHeroSim();
  initDemoSim();
  initStudentVisual();
  initTeacherVisual();
  initScrollAnimations();
  initNavScroll();
  initFAQ();
  initMobileNav();
  initSmoothScroll();
  initWatchDemo();
});
