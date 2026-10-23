/* ================================================================
   MECHANICA — Landing Page Scripts
   Supports Theme Switcher: Dark Navy (Default) & Light Blueprint
   ================================================================ */

import { parseCustomSimulationInput } from "../spec/parser.js";
import { SPEC_45_DEGREES, SPEC_LUNAR, SPEC_STEEP, SPEC_SHALLOW_FAST } from "../spec/examples.js";
import { SIMULATION_SPEC_VERSION } from "../spec/simulationSpec.js";
import {
  groupContradictionOptions,
  canResolveContradictions,
  buildResolvedSimulationSpec,
} from "../spec/contradictionResolver.js";

// Helper to check current active theme
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

// ——— Theme Switcher Controller ———
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('mechanica_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mechanica_theme', next);

    // Trigger canvas redraws for instant theme sync
    window.dispatchEvent(new CustomEvent('mechanica:theme-change', { detail: { theme: next } }));
  });
}

// ——— Starfield Background (Dynamic Theme Aware) ———
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
        radius: Math.random() * 1.3 + 0.3,
        opacity: Math.random() * 0.6 + 0.15,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);
    const isDark = getTheme() === 'dark';

    for (const star of stars) {
      const twinkle = prefersReducedMotion
        ? star.opacity
        : star.opacity * (0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset));

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? `rgba(200, 210, 230, ${twinkle})`
        : `rgba(21, 24, 28, ${twinkle})`;
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

  window.addEventListener('mechanica:theme-change', () => {
    draw(0);
  });
}

// ——— Demo Section Simulation (Dual Theme Aware) ———
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
    const isDark = getTheme() === 'dark';

    if (isDark) {
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      bgGrad.addColorStop(0, '#0e1322');
      bgGrad.addColorStop(1, '#06080d');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }

    const p = getPhysics();
    const margin = 60;

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.05)' : '#e8ecf0';
    ctx.lineWidth = 1;
    for (let x = margin; x <= w - margin; x += 35) {
      ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, h - margin); ctx.stroke();
    }
    for (let y = margin; y <= h - margin; y += 35) {
      ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(w - margin, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.18)' : '#2a3138';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(margin, h - margin); ctx.lineTo(w - margin, h - margin); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin, h - margin); ctx.lineTo(margin, margin); ctx.stroke();

    // Full trajectory dashed prediction
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
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.14)' : '#7a9aa0';
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
        if (isDark) {
          const grad = ctx.createLinearGradient(
            trailPoints[0].x, trailPoints[0].y,
            trailPoints[trailPoints.length - 1].x, trailPoints[trailPoints.length - 1].y
          );
          grad.addColorStop(0, '#3b82f6');
          grad.addColorStop(1, '#22d3ee');
          ctx.strokeStyle = grad;
        } else {
          ctx.strokeStyle = '#2f6b72';
        }

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

      if (isDark) {
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
      } else {
        ctx.fillStyle = '#15181c';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Launch position indicator
      const origin = worldToScreen(0, launchH, p);
      ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.4)' : '#2f6b72';
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : '#8a939e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 30, -p.angleRad, 0);
      ctx.stroke();

      const dirLen = 50;
      ctx.strokeStyle = isDark ? 'rgba(59, 130, 246, 0.5)' : '#2a5f9e';
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

  window.addEventListener('mechanica:theme-change', () => {
    draw();
  });
}

// ——— Student Visual (Dual Theme Aware) ———
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
        opacity: 0.18 + Math.random() * 0.5,
        hue: 210 + Math.random() * 60,
      });
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, w, h);
    const isDark = getTheme() === 'dark';

    const cx = w / 2;
    const cy = h / 2;

    if (isDark) {
      const centralGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
      centralGlow.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
      centralGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = centralGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    } else {
      ctx.fillStyle = '#f7f8fa';
      ctx.fillRect(0, 0, w, h);

      const centralGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140);
      centralGlow.addColorStop(0, 'rgba(47, 107, 114, 0.08)');
      centralGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = centralGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(208, 214, 222, 0.7)';
    }

    ctx.lineWidth = 1;
    for (let r = 60; r < Math.min(w, h) * 0.4; r += 50) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of particles) {
      if (!prefersReducedMotion) {
        p.angle += p.speed;
      }
      const x = cx + p.orbitRadius * Math.cos(p.angle);
      const y = cy + p.orbitRadius * Math.sin(p.angle) * 0.6;

      if (isDark) {
        ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${p.opacity})`;
      } else {
        ctx.fillStyle = `rgba(47, 107, 114, ${p.opacity})`;
      }
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.8)' : '#2f6b72';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (!prefersReducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  resize();
  draw(0);
  window.addEventListener('resize', resize);
  window.addEventListener('mechanica:theme-change', () => draw(0));
}

// ——— Teacher Visual (Dual Theme Aware) ———
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
    const isDark = getTheme() === 'dark';

    const screenMargin = 38;
    const screenX = screenMargin;
    const screenY = screenMargin;
    const screenW = w - screenMargin * 2;
    const screenH = h - screenMargin * 2;

    if (isDark) {
      ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d5dae0';
    }

    ctx.lineWidth = 1;
    const radius = 12;
    ctx.beginPath();
    ctx.roundRect(screenX, screenY, screenW, screenH, radius);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.04)' : '#e8ecf0';
    for (let x = screenX + 20; x < screenX + screenW; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, screenY + 10); ctx.lineTo(x, screenY + screenH - 10); ctx.stroke();
    }
    for (let y = screenY + 20; y < screenY + screenH; y += 25) {
      ctx.beginPath(); ctx.moveTo(screenX + 10, y); ctx.lineTo(screenX + screenW - 10, y); ctx.stroke();
    }

    const midY = screenY + screenH / 2;
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.12)' : '#2a3138';
    ctx.beginPath();
    ctx.moveTo(screenX + 20, midY);
    ctx.lineTo(screenX + screenW - 20, midY);
    ctx.stroke();

    const waves = isDark
      ? [
          { amp: screenH * 0.2, freq: 0.03, phase: 0, color: 'rgba(59, 130, 246, 0.7)', width: 2 },
          { amp: screenH * 0.12, freq: 0.05, phase: 2, color: 'rgba(139, 92, 246, 0.5)', width: 1.5 },
          { amp: screenH * 0.08, freq: 0.08, phase: 4, color: 'rgba(34, 211, 238, 0.4)', width: 1 },
        ]
      : [
          { amp: screenH * 0.22, freq: 0.03, phase: 0, color: '#2f6b72', width: 2.2 },
          { amp: screenH * 0.13, freq: 0.05, phase: 2, color: '#2a5f9e', width: 1.6 },
          { amp: screenH * 0.08, freq: 0.08, phase: 4, color: '#9a4034', width: 1.2 },
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

    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.2)' : '#8a939e';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MECHANICA', screenX + 16, screenY + 24);

    if (!prefersReducedMotion) {
      time += 0.03;
      requestAnimationFrame(draw);
    }
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
  window.addEventListener('mechanica:theme-change', () => draw());
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

// ——— Smooth scroll helper with dynamic navbar offset ———
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

// ——— FAQ Accordion ———
function initFAQ() {
  const items = document.querySelectorAll('.faq__item');
  items.forEach((item) => {
    const btn = item.querySelector('.faq__question');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      items.forEach((i) => {
        i.classList.remove('is-open');
        const b = i.querySelector('.faq__question');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
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
    links.style.background = 'var(--bg-glass)';
    links.style.padding = '20px 32px';
    links.style.borderBottom = '1px solid var(--border-medium)';
    links.style.gap = '16px';
    links.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.2)';
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
      links.style.boxShadow = '';
    }
  });
}

// ——— Custom Simulation Pipeline Controller ———
function initCustomSimulationPipeline() {
  const form = document.getElementById('customSimForm');
  const input = document.getElementById('customSimInput');
  const feedback = document.getElementById('customSimFeedback');
  const chips = document.querySelectorAll('.custom-sim__chip');
  const toggleGuideBtn = document.getElementById('toggleSpecGuideBtn');
  const guide = document.getElementById('customSimGuide');

  if (!form || !input) return;

  const presets = {
    '45deg': JSON.stringify(SPEC_45_DEGREES, null, 2),
    'lunar': JSON.stringify(SPEC_LUNAR, null, 2),
    'steep': JSON.stringify(SPEC_STEEP, null, 2),
    'fast': JSON.stringify(SPEC_SHALLOW_FAST, null, 2),
    'template': JSON.stringify({
      version: SIMULATION_SPEC_VERSION,
      module: "projectileMotion",
      parameters: {
        initialVelocity: 45,
        launchAngleDegrees: 60,
        gravity: 9.81
      }
    }, null, 2)
  };

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  }

  input.addEventListener('input', () => {
    autoResize();
    if (feedback && feedback.style.display !== 'none') {
      feedback.style.display = 'none';
    }
  });

  // Handle enter key (unless Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Quick preset chips
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const presetKey = chip.dataset.preset;
      if (presets[presetKey]) {
        input.value = presets[presetKey];
        autoResize();
        input.focus();
        showFeedback('Loaded preset into configuration editor.', 'success');
      }
    });
  });

  // Toggle format guide
  if (toggleGuideBtn && guide) {
    toggleGuideBtn.addEventListener('click', () => {
      const isExpanded = toggleGuideBtn.getAttribute('aria-expanded') === 'true';
      toggleGuideBtn.setAttribute('aria-expanded', !isExpanded);
      guide.style.display = isExpanded ? 'none' : 'block';
      const arrow = toggleGuideBtn.querySelector('svg');
      if (arrow) {
        arrow.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        arrow.style.transition = 'transform 0.2s ease';
      }
    });
  }

  function showFeedback(message, type = 'error', htmlLink = null) {
    if (!feedback) return;
    feedback.className = `custom-sim__feedback custom-sim__feedback--${type}`;
    feedback.textContent = message;
    if (htmlLink) {
      const link = document.createElement('a');
      link.href = htmlLink.url;
      link.textContent = htmlLink.text;
      link.style.marginLeft = '10px';
      link.style.textDecoration = 'underline';
      link.style.fontWeight = '700';
      link.style.color = 'inherit';
      link.style.cursor = 'pointer';
      feedback.appendChild(link);
    }
    feedback.style.display = 'block';
  }

  function launchSimulation(spec, messagePrefix = 'Valid configuration') {
    const { parameters } = spec;

    // Save spec to sessionStorage as well as passing in URL
    try {
      sessionStorage.setItem('mechanica_launch_spec', JSON.stringify(spec));
    } catch (err) {
      console.warn('SessionStorage unavailable:', err);
    }

    const specEncoded = encodeURIComponent(JSON.stringify(spec));
    const targetUrl = `./sim.html?spec=${specEncoded}`;

    showFeedback(
      `✓ ${messagePrefix}: v = ${parameters.initialVelocity} m/s, θ = ${parameters.launchAngleDegrees}°, g = ${parameters.gravity} m/s². Launching simulation...`,
      'success',
      { text: 'Open Simulation ↗', url: targetUrl }
    );

    // Attempt to open in a new tab
    let opened = false;
    try {
      const newTab = window.open(targetUrl, '_blank');
      // If new tab was successfully opened (not blocked by browser popup blocker)
      if (newTab && !newTab.closed && typeof newTab.closed !== 'undefined') {
        newTab.focus();
        opened = true;
      }
    } catch (err) {
      opened = false;
    }

    // If browser popup blocker blocked window.open after async fetch, navigate directly
    if (!opened) {
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 400);
    }
  }

  function showContradictionWithChoices(interp, rawVal) {
    if (!feedback) return;
    feedback.className = `custom-sim__feedback custom-sim__feedback--error`;
    feedback.innerHTML = '';

    const msgEl = document.createElement('div');
    msgEl.className = 'custom-sim__feedback-msg';
    msgEl.textContent = `✕ Contradiction detected: ${interp.contradictionReason || 'Conflicting parameter values or physical statements.'}`;
    feedback.appendChild(msgEl);

    const options = interp.contradictionOptions || [];
    const grouped = groupContradictionOptions(options);
    const conflictingParams = Object.keys(grouped);

    if (conflictingParams.length > 0) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'custom-sim__contradiction-actions';

      // Keep user selections: { [paramKey]: { value: number, label: string } }
      const selections = {};

      // Container for Continue button (hidden until all conflicts are resolved)
      const continueContainer = document.createElement('div');
      continueContainer.className = 'custom-sim__continue-container';
      continueContainer.style.display = 'none';

      const continueBtn = document.createElement('button');
      continueBtn.type = 'button';
      continueBtn.className = 'custom-sim__continue-btn';
      continueBtn.textContent = 'Continue to Simulation →';
      continueContainer.appendChild(continueBtn);

      function updateContinueState() {
        const canContinue = canResolveContradictions(conflictingParams, selections);
        continueContainer.style.display = canContinue ? 'flex' : 'none';
      }

      // Render independent selection row for each conflicting parameter
      conflictingParams.forEach((paramKey) => {
        const paramOptions = grouped[paramKey];

        const rowEl = document.createElement('div');
        rowEl.className = 'custom-sim__contradiction-row';

        const promptLabel = document.createElement('span');
        promptLabel.className = 'custom-sim__contradiction-prompt';
        promptLabel.textContent = `Choose ${paramKey}:`;
        rowEl.appendChild(promptLabel);

        const groupEl = document.createElement('div');
        groupEl.className = 'custom-sim__choice-group';

        const btnList = [];

        paramOptions.forEach((opt) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'custom-sim__choice-btn';
          btn.textContent = `Use ${opt.label}`;
          btn.title = `Simulate with ${opt.parameter} = ${opt.value}`;

          btn.addEventListener('click', (e) => {
            e.preventDefault();

            // Deselect any previous choice for this parameter
            btnList.forEach((b) => b.classList.remove('is-selected'));

            // Highlight selected value green
            btn.classList.add('is-selected');

            // Record selection
            selections[paramKey] = {
              value: opt.value,
              label: opt.label,
            };

            // Update Continue button visibility
            updateContinueState();
          });

          btnList.push(btn);
          groupEl.appendChild(btn);
        });

        rowEl.appendChild(groupEl);
        actionsEl.appendChild(rowEl);
      });

      // Launch simulation ONLY when Continue is clicked
      continueBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const result = buildResolvedSimulationSpec(
          interp.parameters || {},
          conflictingParams,
          selections,
          {
            description: `${rawVal} [Resolved contradiction]`,
            requestedOutputs: interp.requestedOutputs || [],
          }
        );

        if (!result.valid) {
          showFeedback(`✕ ${result.errors.join(' ')}`, 'error');
          return;
        }

        const summary = conflictingParams
          .map((p) => `${p} = ${selections[p].label || selections[p].value}`)
          .join(', ');

        launchSimulation(result.spec, `Resolved contradictions (${summary})`);
      });

      actionsEl.appendChild(continueContainer);
      feedback.appendChild(actionsEl);
    }

    feedback.style.display = 'block';
  }

  // Handle launch
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = input.value.trim();

    if (!rawVal) {
      showFeedback('Please enter formatted data, JSON specification, or a physics question.', 'error');
      input.focus();
      return;
    }

    // 1. Direct JSON or preset candidate
    const isJsonLike = (rawVal.startsWith('{') && rawVal.endsWith('}')) || (rawVal.startsWith('[') && rawVal.endsWith(']'));
    if (isJsonLike) {
      const localResult = parseCustomSimulationInput(rawVal);
      if (localResult.valid) {
        launchSimulation(localResult.spec, 'Valid JSON specification');
        return;
      } else {
        const msg = localResult.errors && localResult.errors.length > 0
          ? localResult.errors.join(' • ')
          : 'Invalid JSON specification.';
        showFeedback(`✕ ${msg}`, 'error');
        input.focus();
        return;
      }
    }

    // 2. Pure key-value shorthand (e.g. v=45, a=60, g=9.81) without conversational words
    const isPureKeyValue = /^([a-zA-Z_]+\s*[:=]\s*-?[\d.]+\s*[,;\n\s]*)+$/.test(rawVal);
    if (isPureKeyValue) {
      const kvResult = parseCustomSimulationInput(rawVal);
      if (kvResult.valid) {
        launchSimulation(kvResult.spec, 'Valid shorthand parameters');
        return;
      } else if (kvResult.errors && kvResult.errors[0]?.toLowerCase().includes('contradiction')) {
        showFeedback(`✕ ${kvResult.errors[0]}`, 'error');
        return;
      }
    }

    // 3. Natural language physics question -> Gemini AI Layer
    const launchBtn = document.getElementById('customSimLaunchBtn');
    if (launchBtn) {
      launchBtn.disabled = true;
      launchBtn.style.opacity = '0.6';
    }

    showFeedback('Interpreting physics question with Gemini AI...', 'loading');

    try {
      const response = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: rawVal }),
      });

      const data = await response.json();

      if (data.canLaunch && data.spec) {
        const conversions = data.interpretation?.unitConversions || [];
        const convText = conversions.length > 0
          ? ` [Normalized: ${conversions.map((c) => `${c.originalText} → ${c.convertedValue} ${c.convertedUnit}`).join(', ')}]`
          : '';
        launchSimulation(data.spec, `Interpreted by Gemini AI${convText}`);
        return;
      }

      // If cannot launch, report specific reasons (missing parameters, unsupported, contradictions, ambiguity)
      if (data.code === 'MISSING_API_KEY') {
        // Fallback to local regex parser if available
        const localFallback = parseCustomSimulationInput(rawVal);
        if (localFallback.valid) {
          launchSimulation(localFallback.spec, 'Parsed via local fallback (GEMINI_API_KEY not configured)');
          return;
        }
        showFeedback(
          '✕ Gemini API key not found. Please set GEMINI_API_KEY in your .env file to enable AI natural-language interpretation. (JSON specifications and quick presets still work!)',
          'error'
        );
        return;
      }

      if (data.interpretation) {
        const interp = data.interpretation;

        // 1. Contradictions take top priority with interactive choice buttons
        if (interp.isContradictory) {
          showContradictionWithChoices(interp, rawVal);
          return;
        }

        // 2. Unsupported physics
        if (!interp.isSupported) {
          showFeedback(
            `✕ Unsupported physics: ${interp.unsupportedReason || 'Requires physics phenomena not currently supported by Mechanica\'s ideal 2D projectile motion engine.'}`,
            'error'
          );
          return;
        }

        // 3. Ambiguity
        if (interp.isAmbiguous) {
          showFeedback(
            `✕ Ambiguous input: ${interp.ambiguityReason || 'Question is underspecified or missing units.'}`,
            'warning'
          );
          return;
        }

        // 4. Genuinely missing required parameters
        if (interp.missingRequiredParameters && interp.missingRequiredParameters.length > 0) {
          const missingNames = interp.missingRequiredParameters.join(', ');
          const unknowns = interp.unknowns && interp.unknowns.length > 0
            ? ` | Unknowns sought: ${interp.unknowns.join(', ')}`
            : '';
          const constraints = interp.constraints && interp.constraints.length > 0
            ? ` | Constraints: ${interp.constraints.join(', ')}`
            : '';
          showFeedback(
            `✕ Missing required parameter(s): ${missingNames}. Mechanica requires initial velocity, launch angle, and gravity to simulate.${unknowns}${constraints}`,
            'warning'
          );
          return;
        }
      }

      if (data.errors && data.errors.length > 0) {
        showFeedback(`✕ ${data.errors.join(' • ')}`, 'error');
        return;
      }

      showFeedback(
        `✕ ${data.error || 'Could not extract valid projectile motion parameters from question.'}`,
        'error'
      );
    } catch (err) {
      // Network or server communication error: attempt local fallback
      const localFallback = parseCustomSimulationInput(rawVal);
      if (localFallback.valid) {
        launchSimulation(localFallback.spec, 'Parsed via local fallback');
        return;
      }
      showFeedback(`✕ Could not communicate with AI interpretation endpoint: ${err.message}`, 'error');
    } finally {
      if (launchBtn) {
        launchBtn.disabled = false;
        launchBtn.style.opacity = '';
      }
      input.focus();
    }
  });
}

// ——— Initialize Everything ———
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initStarfield();
  initDemoSim();
  initStudentVisual();
  initTeacherVisual();
  initScrollAnimations();
  initNavScroll();
  initFAQ();
  initMobileNav();
  initSmoothScroll();
  initWatchDemo();
  initCustomSimulationPipeline();
});

