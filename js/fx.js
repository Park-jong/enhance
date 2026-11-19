/* 시각 효과: 검 SVG, 파티클, 결과 텍스트·플래시·토스트·로그·배너 (브라우저 전용) */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  const C = SG.C;

  const $ = sel => document.querySelector(sel);
  const fmt = n => Math.floor(n).toLocaleString('ko-KR');
  const LOG_MAX = 40;
  const TOAST_MS = 2600;
  const TOAST_FADE_MS = 300;
  const FLOAT_MS = 1000;
  const ANIMS = ['charging', 'pop', 'shatter', 'appear'];

  function play(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function setSwordAnim(cls) {
    const el = $('#sword');
    el.classList.remove(...ANIMS);
    void el.offsetWidth;
    if (cls) el.classList.add(cls);
  }

  // ============================================================ 검 그리기 (SVG)
  function guardColor(l) {
    if (l === 0) return '#5a3a1e';
    if (l < 5)  return '#6f747c';
    if (l < 10) return '#c0c7cf';
    if (l < 15) return '#d4af37';
    return C.SWORDS[l].g;
  }
  function swordSVG(l, uid) {
    const s = C.SWORDS[l];
    const cx = 60;
    const w = 12 + Math.floor(l / 3) * 2;
    const len = 150 + l * 2;
    const base = 208;
    const tipY = base - len;
    const shoulder = tipY + w * 1.4;
    const blade = `${cx},${tipY} ${cx + w / 2},${shoulder} ${cx + w / 2},${base} ${cx - w / 2},${base} ${cx - w / 2},${shoulder}`;
    const gw = 36 + l * 1.6;
    const gc = guardColor(l);
    const glow = s.g
      ? `<polygon points="${blade}" fill="${s.g}" opacity="${(0.3 + l * 0.03).toFixed(2)}" filter="url(#${uid}-blur)"/>`
      : '';
    let wraps = '';
    for (let y = 222; y < 262; y += 8) {
      wraps += `<line x1="${cx - 5}" y1="${y}" x2="${cx + 5}" y2="${y + 4}" stroke="#5c3a22" stroke-width="2"/>`;
    }
    const pommelGem = l >= 5 ? `<circle cx="${cx}" cy="270" r="3.5" fill="${s.g}"/>` : '';
    const guardGem = l >= 10 ? `<circle cx="${cx}" cy="213" r="4.5" fill="${s.g}" stroke="#fff" stroke-opacity=".6"/>` : '';
    const wings = l >= 15
      ? `<path d="M${cx - gw / 2} 213 q-10 -14 -4 -26 q4 12 14 20 z M${cx + gw / 2} 213 q10 -14 4 -26 q-4 12 -14 20 z" fill="${gc}" opacity=".9"/>`
      : '';
    return `
<svg viewBox="0 0 120 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${uid}-blade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${s.b}"/>
      <stop offset=".45" stop-color="${s.a}"/>
      <stop offset=".55" stop-color="${s.a}"/>
      <stop offset="1" stop-color="${s.b}"/>
    </linearGradient>
    <filter id="${uid}-blur" x="-150%" y="-30%" width="400%" height="160%">
      <feGaussianBlur stdDeviation="${(3 + l * 0.45).toFixed(1)}"/>
    </filter>
  </defs>
  ${glow}
  <polygon points="${blade}" fill="url(#${uid}-blade)" stroke="${s.b}" stroke-width="1"/>
  <line x1="${cx}" y1="${shoulder + 6}" x2="${cx}" y2="${base - 6}" stroke="${s.b}" stroke-opacity=".45" stroke-width="${(w / 6).toFixed(1)}" stroke-linecap="round"/>
  ${wings}
  <rect x="${cx - gw / 2}" y="${base}" width="${gw}" height="10" rx="4" fill="${gc}" stroke="rgba(0,0,0,.35)"/>
  ${guardGem}
  <rect x="${cx - 5}" y="${base + 10}" width="10" height="50" rx="3" fill="#3b2416"/>
  ${wraps}
  <circle cx="${cx}" cy="270" r="7.5" fill="${gc}" stroke="rgba(0,0,0,.35)"/>
  ${pommelGem}
</svg>`;
  }

  // ============================================================ 파티클
  let cv = null;
  let ctx = null;
  let parts = [];
  let fxOn = false;
  // 캔버스 CSS 크기: 매 프레임 레이아웃을 읽지 않도록 sizeFx(시작·resize)에서만 갱신한다
  const size = { width: 0, height: 0 };
  function sizeFx() {
    cv = cv || $('#fx');
    ctx = ctx || cv.getContext('2d');
    const r = cv.getBoundingClientRect();
    const d = root.devicePixelRatio || 1;
    size.width = r.width;
    size.height = r.height;
    cv.width = r.width * d;
    cv.height = r.height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function burst(colors, n, opt = {}) {
    const ox = size.width / 2;
    const oy = opt.y ?? size.height * 0.45;
    const speed = opt.speed ?? 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * speed + 1;
      parts.push({
        x: ox + (Math.random() - .5) * 30,
        y: oy + (Math.random() - .5) * (opt.spreadY ?? 60),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (opt.lift ?? 2),
        g: opt.gravity ?? 0.12,
        life: 1,
        decay: 0.01 + Math.random() * 0.02,
        size: 1.5 + Math.random() * 3,
        rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
        shard: !!opt.shard,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    // 상한을 넘으면 가장 오래된(곧 사라질) 파티클부터 버려 새 결과의 연출을 살린다
    if (parts.length > C.MAX_PARTICLES) parts.splice(0, parts.length - C.MAX_PARTICLES);
    if (!fxOn) { fxOn = true; requestAnimationFrame(stepFx); }
  }
  function stepFx() {
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98; p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0) return false;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      if (p.shard) {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 2.2, p.size * 2, p.size * 4.4);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life + .5, 0, Math.PI * 2);
        ctx.fill();
      }
      return true;
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (parts.length) requestAnimationFrame(stepFx);
    else { fxOn = false; ctx.clearRect(0, 0, size.width, size.height); }
  }

  // ============================================================ 피드백
  /** quickMs가 있으면 짧은 연출(스킵 모드) 길이로 재생 */
  function showResult(text, color, quickMs) {
    const el = $('#result');
    el.textContent = text;
    el.style.color = color;
    el.style.animationDuration = quickMs ? `${quickMs}ms` : '';
    play(el, 'show');
  }
  function flash(color, quickMs) {
    const el = $('#flash');
    el.style.background = `radial-gradient(circle at 50% 45%, ${color}, transparent 70%)`;
    el.style.animationDuration = quickMs ? `${quickMs}ms` : '';
    play(el, 'on');
  }
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), TOAST_FADE_MS); }, TOAST_MS);
  }
  function floatGold(amount) {
    const box = $('#goldBox');
    const el = document.createElement('span');
    el.className = 'floating';
    el.textContent = (amount > 0 ? '+' : '') + fmt(amount);
    if (amount < 0) el.style.color = 'var(--bad)';
    box.appendChild(el);
    setTimeout(() => el.remove(), FLOAT_MS);
    play(box, 'bump');
  }
  function denyGold() {
    play($('#goldBox'), 'deny');
    setTimeout(() => $('#goldBox').classList.remove('deny'), 400);
  }
  function log(msg, kind = '') {
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = msg;
    const ul = $('#log');
    ul.prepend(li);
    while (ul.children.length > LOG_MAX) ul.lastChild.remove();
  }
  function banner(big, sub, color) {
    $('#bannerBig').textContent = big;
    $('#bannerBig').style.color = color;
    $('#bannerSub').textContent = sub;
    $('#banner').classList.add('show');
  }
  function shake() { play($('#stage'), 'shake'); }

  SG.fx = { fmt, swordSVG, sizeFx, burst, setSwordAnim, showResult, flash, toast, floatGold, denyGold, log, banner, shake };
})(typeof globalThis !== 'undefined' ? globalThis : this);
