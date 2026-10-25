/** Lightweight full-viewport confetti — no dependencies */

const COLORS = ["#c4a35a", "#e0bc6a", "#1b4d36", "#f4f7f2", "#9b2c2c", "#3a4a40", "#d4e4d0"];

let canvas = null;
let ctx = null;
let raf = 0;
let particles = [];
let startedAt = 0;

const DURATION_MS = 4200;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.id = "confetti-canvas";
  canvas.className = "confetti-canvas no-print";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");

  const resize = () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  canvas.addEventListener("click", stopConfetti);
}

function spawnBurst() {
  const count = 160;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.35;
  particles = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 11;
    particles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      gravity: 0.12 + Math.random() * 0.1,
      drag: 0.985 + Math.random() * 0.01,
    });
  }
}

function frame(now) {
  if (!ctx || !canvas) return;
  const elapsed = now - startedAt;
  const fade = elapsed > DURATION_MS - 900
    ? Math.max(0, 1 - (elapsed - (DURATION_MS - 900)) / 900)
    : 1;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const p of particles) {
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  if (elapsed < DURATION_MS && fade > 0) {
    raf = requestAnimationFrame(frame);
  } else {
    stopConfetti();
  }
}

export function stopConfetti() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  particles = [];
  if (ctx && canvas) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    canvas.style.pointerEvents = "none";
    canvas.style.opacity = "0";
  }
}

/**
 * Full-viewport confetti burst. Skips when prefers-reduced-motion.
 */
export function celebrateConfetti() {
  if (prefersReducedMotion()) return;
  ensureCanvas();
  if (raf) cancelAnimationFrame(raf);
  canvas.style.opacity = "1";
  canvas.style.pointerEvents = "auto";
  spawnBurst();
  startedAt = performance.now();
  raf = requestAnimationFrame(frame);
}
