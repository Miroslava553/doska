// Повтор урока: лист заново заполняется в том порядке, в котором на нём писали.
// Линии рисуются постепенно, как рукой; формулы, картинки и фигуры появляются плавно.
import { ICONS } from './icons.js';
import { decodePts, drawItem, drawBackground, worldBox } from './render.js';

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const ic = (name) => el('span', { class: 'ic', html: ICONS[name] || '' });
const mmss = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export function startReplay({ items, bg, title }) {
  const list = items.filter((it) => it.type !== 'stroke' || decodePts(it).length);
  if (!list.length) return null;
  // расписание: у линии время зависит от длины, остальное — короткое появление
  const GAP = 70; let t = 350; const plan = [];
  for (const it of list) {
    const n = it.type === 'stroke' ? decodePts(it).length : 0;
    const d = it.type === 'stroke' ? Math.max(140, Math.min(1500, n * 7)) : 420;
    plan.push({ it, t0: t, t1: t + d }); t += d + GAP;
  }
  const TOTAL = t + 300;
  let speed = TOTAL > 150000 ? 4 : TOTAL > 60000 ? 2 : 1;
  let pos = 0, playing = true, last = performance.now(), raf = 0, doneIdx = 0;

  const root = el('div', { class: 'rp' });
  const cv = el('canvas', { class: 'rp-cv' });
  const done = document.createElement('canvas');
  const playBtn = el('button', { class: 'rp-b play', title: 'Пауза — пробел', onclick: () => toggle() });
  const range = el('input', { class: 'rp-range', type: 'range', min: 0, max: 1000, value: 0 });
  const time = el('span', { class: 'rp-time' });
  const speedBtn = el('button', { class: 'rp-speed', title: 'Скорость', onclick: () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; paintCtl(); } });
  const closeBtn = el('button', { class: 'rp-b', title: 'Закрыть — Esc', onclick: () => close() }, el('span', { class: 'ic rot45', html: ICONS.plus }));
  root.append(cv,
    el('div', { class: 'rp-title' }, ic('replay'), el('span', {}, 'Повтор урока'), title ? el('span', { class: 'rp-sub' }, title) : null),
    el('div', { class: 'rp-bar' }, playBtn, range, time, speedBtn, el('div', { class: 'rp-sep' }), closeBtn));
  document.body.append(root);

  let W = 0, H = 0, DPR = 1, view = { x: 0, y: 0, z: 1 };
  const box = (() => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const it of list) { const w = worldBox(it); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])]; } return b; })();
  function layout() {
    DPR = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
    for (const c of [cv, done]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const padT = 70, padB = 100, padX = 40;
    const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
    const z = Math.min(2.5, (W - padX * 2) / bw, (H - padT - padB) / bh);
    view = { z, x: (W - bw * z) / 2 - box[0] * z, y: padT + (H - padT - padB - bh * z) / 2 - box[1] * z };
    redrawDone(); draw();
  }
  const dctx = done.getContext('2d'), ctx = cv.getContext('2d');
  function redrawDone() {
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(dctx, bg, view, W, H);
    doneIdx = 0; advanceDone();
  }
  function advanceDone() {
    dctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
    while (doneIdx < plan.length && plan[doneIdx].t1 <= pos) { try { drawItem(dctx, plan[doneIdx].it, null, view.z); } catch {} doneIdx++; }
  }
  function draw() {
    if (plan[doneIdx - 1] && plan[doneIdx - 1].t1 > pos) redrawDone(); else advanceDone();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(done, 0, 0);
    const p = plan[doneIdx];
    if (p && pos > p.t0) {
      const k = Math.min(1, (pos - p.t0) / (p.t1 - p.t0));
      ctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
      try {
        if (p.it.type === 'stroke') {
          const pts = decodePts(p.it), n = Math.max(1, Math.round(pts.length * k));
          drawItem(ctx, { ...p.it, _pts: pts.slice(0, n), _path: null }, null, view.z);
        } else { ctx.globalAlpha = k * k * (3 - 2 * k); drawItem(ctx, p.it, null, view.z); ctx.globalAlpha = 1; }
      } catch {}
    }
    paintCtl();
  }
  function paintCtl() {
    playBtn.innerHTML = ''; playBtn.append(ic(playing ? 'pause' : pos >= TOTAL ? 'replay' : 'play'));
    playBtn.title = playing ? 'Пауза — пробел' : 'Смотреть — пробел';
    if (document.activeElement !== range) range.value = String(Math.round((pos / TOTAL) * 1000));
    range.style.setProperty('--p', (pos / TOTAL) * 100 + '%');
    time.textContent = mmss(pos / speed) + ' / ' + mmss(TOTAL / speed);
    speedBtn.textContent = speed + '×';
  }
  function tick(now) {
    raf = 0;
    const dt = Math.min(100, now - last); last = now;
    if (playing) { pos = Math.min(TOTAL, pos + dt * speed); if (pos >= TOTAL) playing = false; }
    draw();
    if (playing) raf = requestAnimationFrame(tick);
  }
  function toggle() {
    if (!playing && pos >= TOTAL) { pos = 0; redrawDone(); }
    playing = !playing; last = performance.now();
    if (playing && !raf) raf = requestAnimationFrame(tick); else draw();
  }
  range.addEventListener('input', () => { pos = (+range.value / 1000) * TOTAL; draw(); });
  range.addEventListener('pointerdown', () => { if (playing) { playing = false; root.dataset.resume = '1'; } });
  range.addEventListener('change', () => { if (root.dataset.resume) { delete root.dataset.resume; toggle(); } range.blur(); });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); pos = Math.max(0, Math.min(TOTAL, pos + (e.key === 'ArrowRight' ? 5000 : -5000) * speed)); draw(); }
    else e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', layout);
  root.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout);
    root.classList.add('out'); setTimeout(() => root.remove(), 200);
  }
  layout();
  raf = requestAnimationFrame((n) => { last = n; tick(n); });
  return { close };
}
