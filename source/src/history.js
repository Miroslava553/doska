// История доски: запись всего, что происходило на доске за последние 10 часов работы. Смотрится как запись экрана:
// можно включить воспроизведение, перемотать на любую минуту и добавить лист из прошлого на доску отдельным листом.
// Пишутся только сами изменения (новая линия, сдвиг, удаление), поэтому запись занимает мало места. Хранится в этом браузере (IndexedDB).
// Паузы длиннее нескольких секунд вырезаются, поэтому 10 часов записи означают 10 часов, когда на доске что-то происходило.
import * as Y from 'yjs';
import { ICONS } from './icons.js';
import { decodePts, drawItem, drawBackground, worldBox, fitShade } from './render.js';

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const ic = (name) => el('span', { class: 'ic', html: ICONS[name] || '' });
const MIN = 60 * 1000, HOUR = 60 * MIN;
const KEEP = 10 * HOUR;   // сколько активного времени хранится
const CAP = 4000;         // пауза длиннее 4 секунд в записи сжимается до 4 секунд
const SESSION = 30 * MIN; // перерыв, после которого начинается новое занятие (отметка на шкале)
const FLUSH = 1000;

// ---------- хранилище ----------
try { indexedDB.deleteDatabase('doska-history'); } catch {} // прежние снимки больше не нужны
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('doska-rec', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('log', { keyPath: 'k', autoIncrement: true }).createIndex('room', 'room');
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => d.close(); res(d); };
    r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(mode) { const d = await db(); return d.transaction('log', mode).objectStore('log'); }
async function listLog(room) { return (await req((await store('readonly')).index('room').getAll(room))).sort((a, b) => a.k - b.k); }
async function addLog(entry) { return req((await store('readwrite')).add(entry)); }

// Доску удалили с устройства: её запись тоже стираем
export async function forgetHistory(room) {
  try { const s = await store('readwrite'); const keys = await req(s.index('room').getAllKeys(room)); for (const k of keys) s.delete(k); } catch {}
}
// Всё, что старше 10 часов активной работы, сливается в одну начальную запись
async function compact(room) {
  const all = await listLog(room); let acc = 0, cut = -1;
  for (let i = all.length - 1; i > 0; i--) { acc += Math.min(CAP, all[i].t - all[i - 1].t); if (acc > KEEP) { cut = i - 1; break; } }
  if (cut < 1) return;
  const d = new Y.Doc(); for (let i = 0; i <= cut; i++) Y.applyUpdate(d, all[i].u);
  const s = await store('readwrite');
  for (let i = 0; i < cut; i++) s.delete(all[i].k);
  s.put({ k: all[cut].k, room, t: all[cut].t, u: Y.encodeStateAsUpdate(d), base: true });
}

// Состояние доски из документа: только живые листы и объекты на них
function docState(d) {
  const pages = []; const ids = new Set();
  for (const [id, m] of d.getMap('pages').entries()) { if (m.get('deletedAt')) continue; pages.push({ id, name: m.get('name') || 'Лист', order: m.get('order') || 0 }); ids.add(id); }
  pages.sort((a, b) => a.order - b.order);
  const items = new Map();
  for (const [id, m] of d.getMap('items').entries()) { const it = Object.assign(m.toJSON ? m.toJSON() : { ...m }, { id }); if (ids.has(it.page)) items.set(id, it); }
  for (const [id, it] of items) if (it.type === 'shade') items.set(id, fitShade(it, (i) => items.get(i)));
  const meta = d.getMap('meta');
  return { pages, items, meta: { title: meta.get('title') || '', bg: meta.get('bg') || 'grid' } };
}

const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayName = (t) => {
  const d = new Date(t), now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};
const when = (t) => dayName(t) + ', ' + hm(t);
const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const EMPTY = [Infinity, Infinity, -Infinity, -Infinity];

// deps: room, doc, skipOrigin (загрузка из IndexedDB), whenSynced, currentPage(), addSheet(name, items), secret(item), toast(msg), allowed(), openPro()
export function versionHistory(deps) {
  const { room, doc } = deps;
  // ученик не видит в истории ответы, которые закрыты шторкой сейчас или были закрыты когда-либо за время записи
  // а ещё всё, что хоть раз лежало внутри закрытой шторки: так не видно и недописанных кусков ответа
  let everCovered = new Set(), coveredAreas = new Map();
  const inArea = (it) => {
    const list = coveredAreas.get(it.page); if (!list) return false;
    let b; try { b = worldBox(it); } catch { return false; }
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return list.some((q) => cx >= q[0] && cx <= q[2] && cy >= q[1] && cy <= q[3]);
  };
  const hide = (it) => !!deps.secret?.(it) || (!!deps.student?.() && it.type !== 'shade' && (everCovered.has(it.id) || inArea(it)));
  let buf = [], timer = 0, ready = false;
  const flush = async () => {
    clearTimeout(timer); timer = 0;
    if (!ready || !buf.length) return;
    const u = buf.length === 1 ? buf[0] : Y.mergeUpdates(buf); buf = [];
    try { await addLog({ room, t: Date.now(), u }); } catch (e) { console.warn('history', e); }
  };
  doc.on('update', (u, origin) => {
    if (origin === deps.skipOrigin) return;
    buf.push(u); if (!timer) timer = setTimeout(flush, FLUSH);
  });
  // Первое открытие доски с записью: сохраняем, какой доска была до начала записи
  deps.whenSynced.then(async () => {
    try {
      const all = await listLog(room);
      if (!all.length) await addLog({ room, t: Date.now(), u: Y.encodeStateAsUpdate(doc), base: true });
      else await compact(room);
    } catch (e) { console.warn('history', e); }
    ready = true; flush();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', () => flush());

  async function open() {
    if (!deps.allowed()) { deps.openPro(); return; }
    document.querySelector('.hp')?.remove();
    await flush();

    const root = el('div', { class: 'hp' });
    const cv = el('canvas', { class: 'hp-cv' });
    const layer = document.createElement('canvas');
    const chips = el('div', { class: 'hp-pages' });
    const note = el('div', { class: 'hp-note', hidden: true });
    const playBtn = el('button', { class: 'hp-play', 'aria-label': 'Смотреть' });
    const range = el('input', { class: 'hp-range', type: 'range', min: 0, max: 10000, step: 1, value: 10000 });
    const ticks = el('div', { class: 'hp-ticks' });
    const tip = el('div', { class: 'hp-tip', hidden: true });
    const time = el('span', { class: 'hp-time' });
    const speedBtn = el('button', { class: 'hp-speed', 'aria-label': 'Скорость' });
    const addBtn = el('button', { class: 'btn primary hp-add' }, 'Добавить этот лист на доску');
    const closeBtn = el('button', { class: 'hp-x', 'aria-label': 'Закрыть' }, el('span', { class: 'ic rot45', html: ICONS.plus }));
    root.append(cv,
      el('div', { class: 'hp-top' }, el('div', { class: 'hp-title' }, ic('history'), el('span', {}, 'История доски')), chips, closeBtn),
      note,
      el('div', { class: 'hp-bar' }, playBtn, el('div', { class: 'hp-track' }, ticks, range, tip), time, speedBtn, addBtn));
    document.body.append(root);
    note.hidden = false; note.textContent = 'Загружаю запись…';

    const log = await listLog(room);
    // один документ со всей историей; снимок состояния запоминаем через каждые 50 записей,
    // а заодно собираем рамку каждого листа по всему, что на нём когда-либо было
    const STEP = 50;
    const full = new Y.Doc({ gc: false }); const snaps = new Map(), vs = [], finalBox = new Map(); everCovered = new Set(); coveredAreas = new Map();
    const fItems = full.getMap('items');
    fItems.observeDeep((evs) => {
      const keys = new Set();
      for (const ev of evs) { if (ev.target === fItems) ev.keysChanged.forEach((k) => keys.add(k)); else { let it = ev.target._item; while (it && it.parent !== fItems) it = it.parent?._item; if (it?.parentSub) keys.add(it.parentSub); } }
      for (const k of keys) { const m = fItems.get(k); if (!m?.toJSON) continue; const it = m.toJSON(); it.id = k;
        if (it.type === 'shade' && Array.isArray(it.cover)) {
          for (const c of it.cover) everCovered.add(c);
          if (!it.open) { const f = fitShade(it, (i) => { const m = fItems.get(i); return m?.toJSON ? { ...m.toJSON(), id: i } : null; }); if (f.w > 0) { const a = coveredAreas.get(it.page) || []; a.push([f.x, f.y, f.x + f.w, f.y + f.h]); coveredAreas.set(it.page, a); } }
        }
        if (!it.page || hide(it)) continue; try { finalBox.set(it.page, unionBox(finalBox.get(it.page) || EMPTY, worldBox(it))); } catch {} }
    });
    for (let i = 0; i < log.length; i++) {
      Y.applyUpdate(full, log[i].u); if (i % STEP === 0) snaps.set(i, Y.snapshot(full));
      vs.push(i ? vs[i - 1] + Math.min(CAP, Math.max(0, log[i].t - log[i - 1].t)) : 0);
      if (i % 400 === 399) await new Promise((r) => setTimeout(r, 0));
    }
    const n = log.length, TOTAL = n ? vs[n - 1] + 600 : 0;
    note.hidden = true;
    for (let i = 1; i < n; i++) if (log[i].t - log[i - 1].t > SESSION) ticks.append(el('span', { style: `left:${(vs[i] / TOTAL) * 100}%` }));

    // документ на нужную запись: вперёд докатываем изменения, назад начинаем с ближайшего снимка
    let wd = null, wi = -1;
    const docFor = (i) => {
      if (!wd || i < wi || i - wi > STEP) { const c = Math.floor(i / STEP) * STEP; wd = Y.createDocFromSnapshot(full, snaps.get(c)); wi = c; }
      while (wi < i) { wi++; Y.applyUpdate(wd, log[wi].u); }
      return wd;
    };
    const cache = new Map();
    const stateAt = (i) => {
      if (cache.has(i)) return cache.get(i);
      const s = docState(docFor(i));
      if (cache.size > 6) cache.delete(cache.keys().next().value);
      cache.set(i, s); return s;
    };
    const sigs = new WeakMap();
    const sigOf = (it) => { let s = sigs.get(it); if (s == null) { s = JSON.stringify(it, (k, v) => (k[0] === '_' ? undefined : v)); sigs.set(it, s); } return s; };
    // что изменилось в записи i по сравнению с предыдущей: нужно, чтобы следить за листом, где идёт работа
    const diffCache = new Map();
    const changedAt = (i) => {
      if (diffCache.has(i)) return diffCache.get(i);
      const a = i ? stateAt(i - 1) : null, b = stateAt(i); const out = [];
      for (const [id, it] of b.items) { const p = a?.items.get(id); if (!p || sigOf(p) !== sigOf(it)) out.push(it); }
      diffCache.set(i, out); return out;
    };
    const pageBox = (st, page) => { let b = EMPTY; for (const it of st.items.values()) if (it.page === page && !hide(it)) { try { b = unionBox(b, worldBox(it)); } catch {} } return b; };

    let V = TOTAL, playing = false, speed = 1, follow = true, page = null, last = 0, raf = 0;
    let W = 0, H = 0, DPR = 1, view = { x: 0, y: 0, z: 1 }, layerKey = '';
    const idxAt = (v) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (vs[m] <= v) lo = m; else hi = m - 1; } return lo; };

    // рамка листа: всё, что было на нём за запись, чтобы картинка не прыгала при перемотке
    function fit(st) {
      let b = unionBox(finalBox.get(page) || EMPTY, pageBox(st, page)); finalBox.set(page, b);
      if (!isFinite(b[0])) b = [0, 0, 800, 500];
      const padT = 80, padB = 110, padX = 40;
      const bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
      const z = Math.min(2, (W - padX * 2) / bw, (H - padT - padB) / bh);
      return { z, x: (W - bw * z) / 2 - b[0] * z, y: padT + (H - padT - padB - bh * z) / 2 - b[1] * z };
    }
    function layout() {
      DPR = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
      for (const c of [cv, layer]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
      cv.style.width = W + 'px'; cv.style.height = H + 'px'; layerKey = ''; draw();
    }
    const lctx = layer.getContext('2d'), ctx = cv.getContext('2d');
    function paintChips(st) {
      const key = st.pages.map((p) => p.id + p.name).join('|') + '#' + page;
      if (chips.dataset.k === key) return; chips.dataset.k = key; chips.innerHTML = '';
      if (st.pages.length > 1) for (const p of st.pages) chips.append(el('button', { class: 'chip' + (p.id === page ? ' on' : ''), onclick: () => { page = p.id; follow = false; layerKey = ''; draw(); } }, p.name));
    }
    function draw() {
      if (!n) return;
      const i = idxAt(V), st = stateAt(i);
      const next = i + 1 < n ? i + 1 : -1;
      const span = next >= 0 ? Math.min(1500, vs[next] - vs[i]) : 0;
      const animating = next >= 0 && V > vs[next] - span;
      // лист: тот, где сейчас идёт работа, пока пользователь сам не выбрал другой
      if (follow) { const ch = changedAt(animating ? next : i); const p = ch.filter((it) => !hide(it)).pop()?.page; if (p && st.pages.some((x) => x.id === p)) page = p; }
      if (!st.pages.some((x) => x.id === page)) page = st.pages.some((x) => x.id === deps.currentPage()) ? deps.currentPage() : st.pages[0]?.id;
      paintChips(st);
      const key = i + '|' + page + '|' + W + 'x' + H;
      if (key !== layerKey) {
        layerKey = key; view = fit(st);
        lctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawBackground(lctx, st.meta.bg, view, W, H);
        lctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
        const its = [...st.items.values()].filter((it) => it.page === page && !hide(it)).sort((a, b) => (a.z || 0) - (b.z || 0));
        for (const it of its) { try { drawItem(lctx, it, null, view.z); } catch {} }
        addBtn.disabled = !its.length;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0);
      // новые линии следующей записи дорисовываются постепенно, как рукой
      if (animating) {
        const k = Math.max(0, Math.min(1, (V - (vs[next] - span)) / Math.max(1, span)));
        const nst = stateAt(next);
        const fresh = [...nst.items.values()].filter((it) => it.page === page && !st.items.has(it.id) && !hide(it)).sort((a, b) => (a.z || 0) - (b.z || 0));
        ctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.x, DPR * view.y);
        const strokes = fresh.filter((it) => it.type === 'stroke');
        const total = strokes.reduce((s, it) => s + decodePts(it).length, 0) || 1; let acc = 0;
        for (const it of fresh) {
          try {
            if (it.type === 'stroke') {
              const pts = decodePts(it), from = acc / total, to = (acc + pts.length) / total; acc += pts.length;
              const f = Math.max(0, Math.min(1, (k - from) / Math.max(1e-6, to - from))); if (f <= 0) continue;
              drawItem(ctx, { ...it, _pts: pts.slice(0, Math.max(1, Math.round(pts.length * f))), _path: null }, null, view.z);
            } else { ctx.globalAlpha = k * k * (3 - 2 * k); drawItem(ctx, it, null, view.z); ctx.globalAlpha = 1; }
          } catch {}
        }
      }
      paintCtl(i);
    }
    function paintCtl(i = idxAt(V)) {
      playBtn.innerHTML = ''; playBtn.append(ic(playing ? 'pause' : 'play'));
      if (document.activeElement !== range) range.value = String(Math.round((V / Math.max(1, TOTAL)) * 10000));
      range.style.setProperty('--p', (V / Math.max(1, TOTAL)) * 100 + '%');
      time.textContent = n ? when(log[i].t) : '';
      speedBtn.textContent = speed + '×';
    }
    function tick(now) {
      raf = 0;
      const dt = Math.min(100, now - last); last = now;
      if (playing) { V = Math.min(TOTAL, V + dt * speed); if (V >= TOTAL) playing = false; }
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    }
    function toggle() {
      if (!n) return;
      if (!playing && V >= TOTAL - 1) V = 0;
      playing = !playing; follow = true; last = performance.now();
      if (playing && !raf) raf = requestAnimationFrame(tick); else draw();
    }
    playBtn.addEventListener('click', toggle);
    speedBtn.addEventListener('click', () => { speed = { 1: 2, 2: 4, 4: 8, 8: 16, 16: 1 }[speed]; paintCtl(); });
    let resume = false;
    range.addEventListener('pointerdown', () => { resume = playing; playing = false; });
    range.addEventListener('input', () => { V = (+range.value / 10000) * TOTAL; follow = true; draw(); });
    range.addEventListener('change', () => { range.blur(); if (resume) { resume = false; toggle(); } });
    // подсказка со временем над шкалой
    range.addEventListener('pointermove', (e) => {
      if (!n) return; const r = range.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      tip.hidden = false; tip.textContent = when(log[idxAt(f * TOTAL)].t); tip.style.left = f * 100 + '%';
    });
    range.addEventListener('pointerleave', () => { tip.hidden = true; });
    addBtn.addEventListener('click', () => {
      const st = stateAt(idxAt(V)); const p = st.pages.find((x) => x.id === page); if (!p) return;
      const its = [...st.items.values()].filter((it) => it.page === page && !hide(it)).map((it) => Object.fromEntries(Object.entries(it).filter(([k]) => k[0] !== '_'))); if (!its.length) return;
      const t = log[idxAt(V)].t;
      const stamp = new Date(t).toDateString() === new Date().toDateString() ? hm(t) : new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' }) + ', ' + hm(t);
      close();
      deps.addSheet(`${p.name.slice(0, 18)} (${stamp})`, its);
      deps.toast('Лист из истории добавлен на доску');
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); V = Math.max(0, Math.min(TOTAL, V + (e.key === 'ArrowRight' ? 5000 : -5000) * speed)); follow = true; draw(); }
      else e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', layout);
    root.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    closeBtn.addEventListener('click', () => close());
    function close() {
      cancelAnimationFrame(raf); raf = 0; playing = false;
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout);
      root.classList.add('out'); setTimeout(() => root.remove(), 200);
    }
    if (n < 2) { note.hidden = false; note.textContent = 'Запись идёт. Здесь появится всё, что будет происходить на доске.'; }
    layout();
    setTimeout(() => { layerKey = ''; draw(); }, 400); setTimeout(() => { layerKey = ''; draw(); }, 1200); // картинки догружаются
  }
  return { open, flush };
}
