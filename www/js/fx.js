// Küçük ödül efektleri: konfeti, titreşim, toast
import { S } from './store.js';

export function buzz(pattern) {
  if (!S().settings.haptics) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch {}
}

export function toast(html, ms = 1800) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function floatXP(el, text) {
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'floatxp';
  f.textContent = text;
  f.style.left = (r.left + r.width / 2) + 'px';
  f.style.top = (r.top + r.height / 2) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

export function confetti(amount = 80) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#ff3d7f', '#ffd23f', '#3dffb5', '#5b8cff', '#c77dff'];
  const ps = Array.from({ length: amount }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)]
  }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (++t < 110) requestAnimationFrame(frame); else c.remove();
  })();
}
