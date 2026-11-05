// Повтор урока: лист заново заполняется в том порядке, в котором на нём писали.
// Линии рисуются постепенно, как рукой; формулы, картинки и фигуры появляются плавно.
// Картинку можно приближать и двигать (колесо, щипок, перетаскивание, двойной щелчок), а камера может следить за рукой.
// Кнопки срабатывают в момент нажатия и не перерисовываются каждый кадр, поэтому отвечают сразу.
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
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SPEEDS = [0.5, 1, 1.5, 2, 4, 8, 16, 32];
const spName = (v) => String(v).replace('.', ',') + '×';

// Кнопка срабатывает, как только палец, перо или мышь отпустили над ней (перо при нажатии чуть сдвигается,
// и обычный «щелчок» браузер тогда не засчитывает). С клавиатуры — как обычно.
function tap(btn, fn) {
  let down = null;
  btn.addEventListener('pointerdown', (e) => { if (e.button > 0) return; down = e.pointerId; e.preventDefault(); });
  btn.addEventListener('pointerup', (e) => { if (down !== e.pointerId) return; down = null; const r = btn.getBoundingClientRect(); if (e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) fn(e); });
  btn.addEventListener('pointercancel', () => { down = null; });
  btn.addEventListener('click', (e) => { if (e.detail === 0) fn(e); }); // Enter и пробел на кнопке
  return btn;
}

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
  let speed = TOTAL > 300000 ? 8 : TOTAL > 150000 ? 4 : TOTAL > 60000 ? 2 : 1;
  let pos = 0, playing = true, last = performance.now(), raf = 0, doneIdx = 0;
  let follow = false, fitMode = true; // fitMode: показываем весь лист (меняется окно — пересчитываем)

  // ---------- разметка ----------
  const root = el('div', { class: 'rp' });
  const cv = el('canvas', { class: 'rp-cv' });
  const done = document.createElement('canvas');
  const playBtn = tap(el('button', { class: 'rp-b play', title: 'Пауза (пробел)', 'aria-label': 'Пауза' }), () => toggle());
  const backBtn = tap(el('button', { class: 'rp-b', title: 'Назад на 10 секунд (←)', 'aria-label': 'Назад на 10 секунд' }, ic('back10')), () => skip(-10000));
  const fwdBtn = tap(el('button', { class: 'rp-b', title: 'Вперёд на 10 секунд (→)', 'aria-label': 'Вперёд на 10 секунд' }, ic('fwd10')), () => skip(10000));
  const range = el('input', { class: 'rp-range', type: 'range', min: 0, max: 10000, step: 1, value: 0, 'aria-label': 'Перемотка' });
  const tipEl = el('div', { class: 'rp-tip', hidden: true });
  const track = el('div', { class: 'rp-track' }, range, tipEl);
  const time = el('span', { class: 'rp-time' });
  const speedBtn = tap(el('button', { class: 'rp-speed', title: 'Скорость (< и >)', 'aria-haspopup': 'true' }), () => speedMenu());
  const zOut = tap(el('button', { class: 'rp-b sm', title: 'Отдалить (−)', 'aria-label': 'Отдалить' }, ic('minus')), () => zoomBy(1 / 1.4));
  const zLbl = tap(el('button', { class: 'rp-zl', title: 'Показать весь лист (0)' }), () => fitAll());
  const zIn = tap(el('button', { class: 'rp-b sm', title: 'Приблизить (+)', 'aria-label': 'Приблизить' }, ic('plus')), () => zoomBy(1.4));
  const followBtn = tap(el('button', { class: 'rp-b sm follow', title: 'Следить за рукой (F): камера сама едет туда, где сейчас пишут', 'aria-label': 'Следить за рукой', 'aria-pressed': 'false' }, ic('follow')), () => setFollow(!follow));
  const closeBtn = tap(el('button', { class: 'rp-b', title: 'Закрыть (Esc)', 'aria-label': 'Закрыть' }, el('span', { class: 'ic rot45', html: ICONS.plus })), () => close());
  const hint = el('div', { class: 'rp-hint' }, 'Колесо или щипок — приблизить, тянуть — двигать, двойной щелчок — приблизить в этом месте');
  root.append(cv,
    el('div', { class: 'rp-title' }, ic('replay'), el('span', {}, 'Повтор урока'), title ? el('span', { class: 'rp-sub' }, title) : null),
    hint,
    el('div', { class: 'rp-bar' },
      el('div', { class: 'rp-row' }, playBtn, backBtn, fwdBtn, track, time),
      el('div', { class: 'rp-row rp-row2' }, speedBtn, el('div', { class: 'rp-sep' }), zOut, zLbl, zIn, followBtn, el('div', { class: 'rp-sep' }), closeBtn)));
  document.body.append(root);
  setTimeout(() => hint.classList.add('gone'), 4500);

  // ---------- вид ----------
  let W = 0, H = 0, DPR = 1, view = { x: 0, y: 0, z: 1 }, fitV = view, doneKey = '';
  const box = (() => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const it of list) { const w = worldBox(it); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])]; } return b; })();
  const barH = () => (root.querySelector('.rp-bar')?.getBoundingClientRect().height || 100) + 34;
  function computeFit() {
    const padT = 70, padB = barH(), padX = 40;
    const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
    const z = Math.min(2.5, (W - padX * 2) / bw, Math.max(60, H - padT - padB) / bh);
    return { z, x: (W - bw * z) / 2 - box[0] * z, y: padT + (Math.max(60, H - padT - padB) - bh * z) / 2 - box[1] * z };
  }
  const zMin = () => fitV.z * 0.5, zMax = () => Math.max(fitV.z * 16, 8);
  function layout() {
    DPR = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
    for (const c of [cv, done]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    fitV = computeFit(); if (fitMode) view = { ...fitV };
    doneKey = ''; request();
  }
  function setView(v, keepFit = false) { view = v; fitMode = keepFit; doneKey = ''; paintZoom(); request(); }
  function zoomAt(sx, sy, k) {
    const z = clamp(view.z * k, zMin(), zMax()); if (z === view.z) return;
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
    setView({ z, x: sx - wx * z, y: sy - wy * z });
  }
  const zoomBy = (k) => zoomAt(W / 2, (H - barH()) / 2 + 30, k);
  function fitAll() { fitV = computeFit(); animateTo({ ...fitV }, true); }
  // плавный переход (кнопки, двойной щелчок, слежение)
  let anim = null;
  function animateTo(v, keepFit = false, ms = 260) { anim = { from: { ...view }, to: v, t0: performance.now(), ms, keepFit }; request(); }
  function stepAnim(now) {
    if (!anim) return false;
    const k = Math.min(1, (now - anim.t0) / anim.ms), e = 1 - Math.pow(1 - k, 3);
    const lz = Math.log(anim.from.z) + (Math.log(anim.to.z) - Math.log(anim.from.z)) * e, z = Math.exp(lz);
    // центр экрана едет прямо, масштаб меняется равномерно
    const c0 = [(W / 2 - anim.from.x) / anim.from.z, (H / 2 - anim.from.y) / anim.from.z], c1 = [(W / 2 - anim.to.x) / anim.to.z, (H / 2 - anim.to.y) / anim.to.z];
    const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
    view = { z, x: W / 2 - cx * z, y: H / 2 - cy * z }; doneKey = '';
    if (k >= 1) { view = { ...anim.to }; fitMode = anim.keepFit; anim = null; }
    paintZoom();
    return true;
  }
  function setFollow(on) {
    follow = on; followBtn.classList.toggle('on', on); followBtn.setAttribute('aria-pressed', String(on));
    if (on && view.z <= fitV.z * 1.05) { const p = curPoint(); if (p) animateTo(centerOn(p, Math.max(fitV.z * 2.5, Math.min(2, zMax())))); }
    request();
  }
  const centerOn = ([wx, wy], z = view.z) => ({ z, x: W / 2 - wx * z, y: (H - barH()) / 2 + 30 - wy * z });

  // ---------- рисование ----------
  const dctx = done.getContext('2d'), ctx = cv.getContext('2d');
  function redrawDone() {
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, done.width, done.height);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(dctx, bg, view, W, H);
    doneIdx = 0; advanceDone();
    doneKey = view.x + ',' + view.y + ',' + view.z + ',' + W + ',' + H;
  }
  function advanceDone() {
    dctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
    while (doneIdx < plan.length && plan[doneIdx].t1 <= pos) { try { drawItem(dctx, plan[doneIdx].it, null, view.z); } catch {} doneIdx++; }
  }
  // где сейчас «рука»: кончик линии, которая рисуется, или середина появляющегося объекта
  function curPoint() {
    let i = doneIdx; while (i < plan.length && plan[i].t1 <= pos) i++;
    const p = plan[Math.min(i, plan.length - 1)]; if (!p) return null;
    if (p.it.type === 'stroke' && pos > p.t0) {
      const pts = decodePts(p.it), k = Math.min(1, (pos - p.t0) / (p.t1 - p.t0)), q = pts[Math.max(0, Math.round(pts.length * k) - 1)];
      const s = p.it.s || 1; return [(p.it.x || 0) + q[0] * s, (p.it.y || 0) + q[1] * s];
    }
    const b = worldBox(p.it); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  function draw() {
    if (doneKey !== view.x + ',' + view.y + ',' + view.z + ',' + W + ',' + H || (plan[doneIdx - 1] && plan[doneIdx - 1].t1 > pos)) redrawDone(); else advanceDone();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(done, 0, 0);
    const p = plan[doneIdx];
    let tip = null;
    if (p && pos > p.t0) {
      const k = Math.min(1, (pos - p.t0) / (p.t1 - p.t0));
      ctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
      try {
        if (p.it.type === 'stroke') {
          const pts = decodePts(p.it), n = Math.max(1, Math.round(pts.length * k));
          drawItem(ctx, { ...p.it, _pts: pts.slice(0, n), _path: null }, null, view.z);
          if (k < 1) { const q = pts[n - 1], s = p.it.s || 1; tip = [(p.it.x || 0) + q[0] * s, (p.it.y || 0) + q[1] * s]; }
        } else { ctx.globalAlpha = k * k * (3 - 2 * k); drawItem(ctx, p.it, null, view.z); ctx.globalAlpha = 1; }
      } catch {}
    }
    // кончик пера, которым сейчас пишут: видно, куда смотреть
    if (tip) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const sx = view.x + tip[0] * view.z, sy = view.y + tip[1] * view.z;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fillStyle = 'rgba(76, 110, 245, .18)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(76, 110, 245, .85)'; ctx.stroke();
    }
    paintCtl();
  }
  // кнопки обновляем только когда что-то поменялось: иначе нажатие попадает в момент замены и теряется
  let shownPlay = null, shownSpeed = null, shownTime = '';
  function paintCtl() {
    const st = playing ? 'pause' : pos >= TOTAL ? 'replay' : 'play';
    if (st !== shownPlay) {
      shownPlay = st; playBtn.innerHTML = ''; playBtn.append(ic(st));
      playBtn.title = playing ? 'Пауза (пробел)' : st === 'replay' ? 'Смотреть сначала (пробел)' : 'Смотреть (пробел)';
      playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Смотреть');
    }
    if (!scrubbing) range.value = String(Math.round((pos / TOTAL) * 10000));
    range.style.setProperty('--p', (pos / TOTAL) * 100 + '%');
    const tx = mmss(pos / speed) + ' / ' + mmss(TOTAL / speed);
    if (tx !== shownTime) { shownTime = tx; time.textContent = tx; }
    if (speed !== shownSpeed) { shownSpeed = speed; speedBtn.textContent = spName(speed); }
  }
  function paintZoom() { zLbl.textContent = Math.round((view.z / fitV.z) * 100) + '%'; zLbl.classList.toggle('fit', Math.abs(view.z / fitV.z - 1) < 0.02); }

  // один кадр на всё: и воспроизведение, и перемотка, и масштаб (лишние события просто ждут кадра)
  function request() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(100, now - last); last = now;
    if (playing) { pos = Math.min(TOTAL, pos + dt * speed); if (pos >= TOTAL) playing = false; }
    const moving = stepAnim(now);
    // слежение: рука ушла из середины экрана — плавно подтягиваем камеру
    if (follow && !dragging && !anim) {
      const p = curPoint();
      if (p) {
        const sx = view.x + p[0] * view.z, sy = view.y + p[1] * view.z, top = 70, bottom = H - barH();
        const mx = W * 0.22, my = (bottom - top) * 0.22;
        let dx = 0, dy = 0;
        if (sx < mx) dx = mx - sx; else if (sx > W - mx) dx = W - mx - sx;
        if (sy < top + my) dy = top + my - sy; else if (sy > bottom - my) dy = bottom - my - sy;
        if (dx || dy) { const k = Math.min(1, dt / 220); view = { ...view, x: view.x + dx * k, y: view.y + dy * k }; fitMode = false; doneKey = ''; }
      }
    }
    draw();
    if (playing || moving || anim || (follow && playing)) request();
  }
  function toggle() {
    if (!playing && pos >= TOTAL) { pos = 0; doneKey = ''; }
    playing = !playing; last = performance.now(); request();
  }
  function skip(ms) { pos = clamp(pos + ms * speed, 0, TOTAL); last = performance.now(); request(); } // секунды — те, что на часах снизу (с учётом скорости)
  function setSpeed(v) { speed = v; last = performance.now(); paintCtl(); request(); }

  // меню скорости над кнопкой
  let menu = null;
  function speedMenu() {
    if (menu) { menu.remove(); menu = null; return; }
    menu = el('div', { class: 'rp-menu', role: 'menu' }, SPEEDS.map((v) => tap(el('button', { class: 'rp-mi' + (v === speed ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(v === speed) }, spName(v)), () => { setSpeed(v); menu.remove(); menu = null; })));
    root.append(menu);
    const r = speedBtn.getBoundingClientRect();
    menu.style.left = clamp(r.left + r.width / 2 - menu.offsetWidth / 2, 8, W - menu.offsetWidth - 8) + 'px';
    const barTop = root.querySelector('.rp-bar').getBoundingClientRect().top;
    menu.style.top = Math.max(8, barTop - menu.offsetHeight - 8) + 'px'; // над всей панелью, чтобы не закрывать кнопки
  }
  root.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && e.target !== speedBtn && !speedBtn.contains(e.target)) { menu.remove(); menu = null; } }, true);

  // ---------- перемотка ----------
  let scrubbing = false, resume = false;
  range.addEventListener('pointerdown', () => { scrubbing = true; resume = playing; playing = false; });
  range.addEventListener('input', () => { pos = (+range.value / 10000) * TOTAL; request(); });
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; range.blur(); if (resume) { resume = false; playing = true; last = performance.now(); } request(); };
  range.addEventListener('change', endScrub);
  range.addEventListener('pointerup', endScrub);
  range.addEventListener('pointercancel', endScrub);
  range.addEventListener('pointermove', (e) => {
    const r = range.getBoundingClientRect(); const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    tipEl.hidden = false; tipEl.textContent = mmss((f * TOTAL) / speed); tipEl.style.left = f * 100 + '%';
  });
  range.addEventListener('pointerleave', () => { tipEl.hidden = true; });

  // ---------- приближение и перемещение картинки ----------
  const ptrs = new Map(); let dragging = false, pinch = null, downAt = null, lastTap = 0;
  cv.addEventListener('pointerdown', (e) => {
    if (e.button > 1) return;
    cv.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    anim = null;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: { ...view } }; downAt = null; return;
    }
    downAt = { x: e.clientX, y: e.clientY, v: { ...view }, moved: false, t: performance.now() };
    dragging = true; root.classList.add('grabbing');
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const z = clamp(pinch.v.z * (d / pinch.d), zMin(), zMax());
      const wx = (pinch.cx - pinch.v.x) / pinch.v.z, wy = (pinch.cy - pinch.v.y) / pinch.v.z;
      setView({ z, x: cx - wx * z, y: cy - wy * z }); return;
    }
    if (!downAt) return;
    const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
    if (!downAt.moved && Math.hypot(dx, dy) < 5) return;
    downAt.moved = true;
    setView({ ...downAt.v, x: downAt.v.x + dx, y: downAt.v.y + dy });
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size) return;
    dragging = false; root.classList.remove('grabbing');
    const d = downAt; downAt = null;
    if (!d || d.moved || e.type === 'pointercancel') return;
    // двойное касание — приблизить в этом месте (а если уже близко — показать весь лист); одиночное — пауза/смотреть
    const now = performance.now();
    if (now - lastTap < 320) {
      lastTap = 0; clearTimeout(tapTimer);
      if (view.z > fitV.z * 2.2) fitAll();
      else { const wx = (e.clientX - view.x) / view.z, wy = (e.clientY - view.y) / view.z, z = Math.min(zMax(), view.z * 2.5); animateTo({ z, x: e.clientX - wx * z, y: e.clientY - wy * z }); }
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => { if (lastTap === now) toggle(); }, 330);
  };
  let tapTimer = 0;
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  // колесо мыши — приблизить к курсору; щипок на тачпаде (приходит с Ctrl) — тоже; два пальца по тачпаду — двигать
  root.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.target.closest?.('.rp-bar, .rp-menu')) return;
    anim = null;
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else if (mouseWheel) zoomAt(e.clientX, e.clientY, Math.pow(1.2, -Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 100))));
    else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
  }, { passive: false });

  // ---------- клавиши ----------
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey) { if (['=', '+', '-', '0'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); e.key === '0' ? fitAll() : zoomBy(e.key === '-' ? 1 / 1.4 : 1.4); } else e.stopImmediatePropagation(); return; }
    const k = e.key;
    if (k === 'Escape') { if (menu) { menu.remove(); menu = null; } else close(); }
    else if (k === ' ' || e.code === 'Space') { if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur(); toggle(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') skip(k === 'ArrowRight' ? 5000 : -5000);
    else if (k === '+' || k === '=') zoomBy(1.4);
    else if (k === '-' || k === '_') zoomBy(1 / 1.4);
    else if (k === '0') fitAll();
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') setFollow(!follow);
    else if (k === '>' || k === '.' || k === 'ю' || k === 'Ю') { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)]); }
    else if (k === '<' || k === ',' || k === 'б' || k === 'Б') { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[Math.max(0, i - 1)]); }
    else if (k === 'Home') { pos = 0; request(); }
    else if (k === 'End') { pos = TOTAL; playing = false; request(); }
    else { e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', layout);
  function close() {
    cancelAnimationFrame(raf); raf = 0; playing = false; clearTimeout(tapTimer);
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout);
    root.classList.add('out'); setTimeout(() => root.remove(), 200);
  }
  layout(); paintZoom();
  last = performance.now(); request();
  return { close, state: () => ({ pos, TOTAL, speed, playing, view: { ...view }, fit: { ...fitV }, follow }) };
}
