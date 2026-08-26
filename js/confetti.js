/* Dayman — Canvas-based confetti burst */
const canvas = document.getElementById('confetti-canvas');
const container = document.getElementById('xp-float-container');
let ctx = null;
let particles = [];
let raf = null;

const COLORS = ['#58CC02', '#1CB0F6', '#CE82FF', '#FFC800', '#FF86D0', '#FF9600', '#FF4B4B'];

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function spawn(count) {
  const cx = window.innerWidth / 2;
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const speed = 4 + Math.random() * 8;
    particles.push({
      x: cx + (Math.random() - 0.5) * 100,
      y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed * (0.5 + Math.random()),
      vy: Math.sin(angle) * speed * -1 - Math.random() * 4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
      gravity: 0.12 + Math.random() * 0.08,
      life: 1,
      decay: 0.005 + Math.random() * 0.008,
    });
  }
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.99;
    p.rot += p.rotV;
    p.life -= p.decay;
    if (p.life <= 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 0) {
    raf = requestAnimationFrame(draw);
  } else {
    canvas.classList.add('hidden');
    cancelAnimationFrame(raf);
  }
}

export function burst(count) {
  if (!canvas || !container) return;
  resize();
  ctx = ctx || canvas.getContext('2d');
  canvas.classList.remove('hidden');
  spawn(count || 80);
  if (!raf) draw();
}

export function xpFloat(amount, x, y) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = `+${amount} XP`;
  el.style.left = (x || window.innerWidth / 2 - 30) + 'px';
  el.style.top = (y || window.innerHeight * 0.4) + 'px';
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function levelUpFlash(text) {
  const flash = document.getElementById('level-up-flash');
  const luText = document.getElementById('lu-text');
  if (!flash || !luText) return;
  luText.textContent = text || 'LEVEL UP!';
  flash.classList.remove('hidden');
  burst(120);
  setTimeout(() => flash.classList.add('hidden'), 1400);
}

export function showScanlines() {
  const el = document.getElementById('scanlines');
  if (el) el.classList.remove('hidden');
}

export function hideScanlines() {
  const el = document.getElementById('scanlines');
  if (el) el.classList.add('hidden');
}
