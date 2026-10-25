import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Hub, ManualConnect } from './sync.js';
import {
  decodePts, encodePts, strokeOptions, outlinePath, paintInk, localBox, worldBox, geomWorldBox, itemTransform, hitItem, distSeg,
  drawItem, drawBackground, setAsyncLoad, texImage, FONT, GRID, shapePolys, ERASABLE_SHAPES, rotOf, rotCenter, bakeShape, SCALE_BAKED,
} from './render.js';
import { compileMany } from './expr.js';
import { SOLID_KINDS, prepared, reproject, moveVertex, viewOf, solidHandles, solidEdges, regularSolid } from './solid.js';
import { StrokeBuilder, oneEuro } from './pen.js';
import { penCursor, eraserCursor, rotateCursor, selectCursor, resizeCursor, moveCursor, vertexCursor } from './cursors.js';
import { ICONS } from './icons.js';
import { RELEASE } from './changelog.js';
import { FIGS, figIcon, figPrims } from './figs.js';

// ============ утилиты ============
const $ = (s, r = document) => r.querySelector(s);
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
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('doska:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('doska:' + k, JSON.stringify(v)); } catch {} },
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function newRoomCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
function normalizeCode(s) {
  s = (s || '').trim();
  const m = s.match(/[#&]r=([a-z0-9-]+)/i); if (m) s = m[1];
  s = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length !== 12) return null;
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

const COLORS = ['#1e1e1e', '#1971c2', '#e03131', '#2f9e44', '#f08c00', '#9c36b5', '#fab005', '#ffffff'];
const COLOR_NAMES = ['Чёрный', 'Синий', 'Красный', 'Зелёный', 'Оранжевый', 'Фиолетовый', 'Жёлтый', 'Белый'];
// Толщина: ползунок + готовые значения
const SIZE_CFG = {
  pen: { min: 0.5, max: 20, step: 0.5, presets: [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 14], def: 3.5, name: 'Толщина' },
  hl: { min: 4, max: 64, step: 1, presets: [6, 10, 14, 20, 28, 36, 48], def: 20, name: 'Толщина маркера' },
  eraser: { min: 4, max: 120, step: 1, presets: [8, 12, 20, 28, 40, 56, 80], def: 28, name: 'Размер ластика' },
  shape: { min: 0.5, max: 20, step: 0.5, presets: [1, 2, 3, 4, 6, 8, 12], def: 3.5, name: 'Толщина фигур' },
  text: { min: 10, max: 96, step: 1, presets: [14, 18, 22, 28, 36, 48, 64], def: 28, name: 'Размер текста' },
};
const OLD_SIZES = { pen: [2, 3.5, 6], hl: [12, 20, 32], eraser: [12, 28, 56], text: [20, 28, 40] };
const LINE_TOOLS = new Set(['line', 'dline', 'arrow', 'darrow', 'arrow2', 'arrowin']);
// стрелки: обычная, пунктирная, двусторонняя (двояковыпуклая линза), с обратными концами (двояковогнутая линза)
const ARROW_KINDS = { arrow: {}, darrow: { dash: true }, arrow2: { heads: 'both' }, arrowin: { heads: 'in' } };
const TOOLS = [
  { id: 'select', key: 'V', name: 'Выделение', hint: 'V ещё раз — лассо' },
  { id: 'hand', key: 'H', name: 'Рука', hint: 'или удерживайте Пробел' },
  { id: 'pen', key: 'P', name: 'Перо', hint: 'Shift — прямая линия' },
  { id: 'dpen', key: 'D', name: 'Пунктирная ручка', hint: 'для невидимых линий, построений и траекторий; Shift — прямая' },
  { id: 'hl', key: 'M', name: 'Маркер' },
  { id: 'eraser', key: 'E', name: 'Ластик', hint: 'E ещё раз — точный/целиком' },
  { sep: true },
  { id: 'line', key: 'L', name: 'Линия', hint: 'L ещё раз — пунктирная; Shift — шаг 15°' },
  { id: 'dline', key: 'L L', name: 'Пунктирная линия', hint: 'Shift — шаг 15°' },
  { id: 'arrow', key: 'A', name: 'Стрелка / вектор' },
  { id: 'darrow', key: '', name: 'Пунктирная стрелка' },
  { id: 'arrow2', key: '', name: 'Двусторонняя стрелка (двояковыпуклая линза)' },
  { id: 'arrowin', key: '', name: 'Двояковогнутая линза' },
  { id: 'rect', key: 'R', name: 'Прямоугольник', hint: 'Shift — квадрат' },
  { id: 'ellipse', key: 'O', name: 'Эллипс', hint: 'Shift — круг' },
  { id: 'circle', key: 'C', name: 'Окружность от центра', hint: 'как циркуль' },
  { id: 'poly', key: 'Y', name: 'Многоугольник по точкам', hint: 'щелчки по вершинам; замкнуть — щелчок в первую точку, закончить ломаную — Enter или двойной щелчок' },
  { sep: true },
  { id: 'text', key: 'T', name: 'Текст' },
  { id: 'tex', key: 'F', name: 'Формула' },
  { id: 'graph', key: 'G', name: 'График функции' },
  { id: 'note', key: '', name: 'Стикер' }, // стикеры убраны из панели; старые на досках по-прежнему видны и правятся
  { id: 'image', key: 'I', name: 'Картинка или PDF' },
];
for (const [k, f] of Object.entries(FIGS)) TOOLS.push({ id: 'fig:' + k, name: f.name, fig: k, g: f.g, hidden: true });

// ============ настройки пользователя ============
const prefs = Object.assign({
  name: '', color: COLORS[Math.floor(Math.random() * 6) + 1],
  penColor: '#1e1e1e', hlColor: '#fab005', size: {},
  gamma: 1, thin: 0.45, steady: 0.6, wheel: 'scroll', eraserPrecise: false, lasso: false, edgePan: true,
  recentColors: ['#1e1e1e', '#1971c2', '#e03131', '#2f9e44'],
}, LS.get('prefs', {}));
if (prefs.wheel === 'auto') prefs.wheel = 'scroll';
for (const k of Object.keys(SIZE_CFG)) {
  if (k === 'shape') continue; // у фигур своя толщина появляется, только если её выбрали; иначе — как у ручки
  if (!(prefs.size[k] > 0)) prefs.size[k] = prefs.sizeIdx && prefs.sizeIdx[k] != null ? OLD_SIZES[k][prefs.sizeIdx[k]] : SIZE_CFG[k].def;
}
const sz = (k) => (k === 'shape' ? (prefs.shapeSize > 0 ? prefs.shapeSize : prefs.size.pen) : prefs.size[k]);
const savePrefs = () => LS.set('prefs', prefs);
if (!(prefs.shapeSize > 0)) { prefs.shapeSize = prefs.size.pen; savePrefs(); } // у фигур своя толщина, ручка на неё больше не влияет
if (!prefs.v9) { prefs.steady = Math.max(prefs.steady ?? 0, 0.85); prefs.v9 = 1; savePrefs(); }
const me = { id: uid(), get name() { return prefs.name || 'Без имени'; }, get color() { return prefs.color; }, get role() { return prefs.role || ''; } };

// ============ свои диалоги вместо системных prompt/confirm ============
function uiDialog({ title, text, input, value = '', placeholder = '', maxlength = 60, ok = 'Готово', cancel = 'Отмена', danger = false, readonlyText = null, icon = null }) {
  return new Promise((resolve) => {
    const inp = input ? el('input', { class: 'inp', value, placeholder, maxlength }) : null;
    const ro = readonlyText != null ? el('textarea', { class: 'inp mono small', rows: 3, readonly: true }, readonlyText) : null;
    let okBtn;
    const done = (v) => { m.remove(); window.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(null); }
      else if (e.key === 'Enter' && document.activeElement !== ro) { e.preventDefault(); e.stopImmediatePropagation(); done(inp ? inp.value.trim() : true); }
    };
    const m = el('div', { class: 'modal', onpointerdown: (e) => { if (e.target === m) done(null); } },
      el('div', { class: 'panel dialog small-dialog' + (icon ? ' with-icon' : '') },
        icon ? el('div', { class: 'dlg-icon' + (danger ? ' danger' : ''), html: ICONS[icon] || '' }) : null,
        el('div', { class: 'dialog-h' }, el('b', {}, title)),
        text ? el('div', { class: 'muted' }, text) : null, inp, ro,
        el('div', { class: 'row end' },
          cancel ? el('button', { class: 'btn', onclick: () => done(null) }, cancel) : null,
          okBtn = el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(inp ? inp.value.trim() : true) }, ok))));
    window.addEventListener('keydown', onKey, true);
    document.body.append(m);
    setTimeout(() => { if (inp) { inp.focus(); inp.select(); } else if (ro) { ro.focus(); ro.select(); } else okBtn?.focus(); }, 0);
  });
}
// Плашка внизу с таймером: действие выполнится через N секунд, пока можно «Отменить»
function undoBar(text, onCommit, onUndo, seconds = 6) {
  let box = document.querySelector('.undo-stack');
  if (!box) { box = el('div', { class: 'undo-stack' }); document.body.append(box); }
  let left = seconds, finished = false;
  const num = el('span', { class: 'undo-num' }, String(left));
  const ring = el('span', { class: 'undo-ring', style: `--t:${seconds}s` }, num);
  const finish = (undo) => {
    if (finished) return; finished = true; clearInterval(timer);
    bar.classList.add('out'); setTimeout(() => bar.remove(), 250);
    if (undo) onUndo?.(); else onCommit?.();
  };
  const bar = el('div', { class: 'undo-bar' }, ring, el('span', { class: 'undo-text' }, text),
    el('button', { class: 'undo-btn', onclick: () => finish(true) }, 'Отменить'));
  box.append(bar);
  const timer = setInterval(() => { left--; num.textContent = String(Math.max(0, left)); if (left <= 0) finish(false); }, 1000);
  window.addEventListener('pagehide', () => finish(false), { once: true });
  return { commitNow: () => finish(false) };
}

// ============ стартовый экран / комната ============
function roomFromHash() { const m = location.hash.match(/r=([a-z0-9-]+)/i); return m ? normalizeCode(m[1]) : null; }
// Статус «репетитор / ученик». Видно на доске и на главном экране.
// Сменить можно только на главном экране и не чаще раза в сутки (первые 2 минуты после выбора — свободно).
const ROLE_GRACE = 2 * 60 * 1000;
const ROLE_COOLDOWN = 24 * 60 * 60 * 1000;
const ROLE_NAMES = { tutor: 'Репетитор', student: 'Ученик' };
// roleFirst — когда выбрали впервые; roleAt — когда последний раз меняли (после первых 2 минут).
const roleNextAt = () => !prefs.role || Date.now() - (prefs.roleFirst || 0) < ROLE_GRACE ? 0 : (prefs.roleAt || 0) + ROLE_COOLDOWN;
const roleCanChange = () => Date.now() >= roleNextAt();
function setRole(r) {
  if (!ROLE_NAMES[r] || r === prefs.role) return false;
  if (!prefs.role) { prefs.roleFirst = Date.now(); prefs.roleAt = 0; }
  else if (!roleCanChange()) return false;
  else if (Date.now() - (prefs.roleFirst || 0) >= ROLE_GRACE) prefs.roleAt = Date.now();
  prefs.role = r; savePrefs(); return true;
}
// Окно выбора статуса. Если статус уже есть — это окно смены (с ограничением раз в сутки).
function roleDialog(onDone) {
  const had = !!prefs.role, can = roleCanChange();
  const close = () => m.remove();
  const pick = (r) => { if (r === prefs.role) { close(); return; } if (setRole(r)) { close(); onDone?.(r); } };
  const btn = (id, icon) => el('button', { class: 'role-btn' + (prefs.role === id ? ' on' : ''), disabled: had && !can && prefs.role !== id, onclick: () => pick(id) },
    el('span', { class: 'ic', html: icon }), ROLE_NAMES[id]);
  const when = () => { const d = new Date(roleNextAt()), t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return (d.toDateString() === new Date().toDateString() ? 'сегодня' : 'завтра') + ' в ' + t; };
  const m = el('div', { class: 'modal', onpointerdown: (e) => { if (had && e.target === m) close(); } },
    el('div', { class: 'panel dialog role-dialog' },
      el('div', { class: 'dialog-h' }, el('b', {}, had ? 'Ваш статус' : 'Кто вы?')),
      el('div', { class: 'role-btns' }, btn('tutor', ICONS.graph), btn('student', ICONS.pen)),
      had && !can ? el('div', { class: 'small muted role-note' }, 'Сменить можно ' + when()) : null,
      had ? el('div', { class: 'role-foot' }, el('button', { class: 'btn', onclick: close }, 'Закрыть')) : null));
  document.body.append(m);
  return m;
}
// На главном экране: кнопки выбора, если статуса нет; иначе — статус (нажатие открывает смену)
function roleBox(onPick) {
  if (prefs.role) return el('button', { class: 'role-pill click', onclick: () => roleDialog(onPick) }, ROLE_NAMES[prefs.role]);
  return el('div', { class: 'role-choose' }, el('span', { class: 'muted' }, 'Кто вы?'),
    ...Object.entries(ROLE_NAMES).map(([id, label]) => el('button', { class: 'chip', onclick: () => { if (setRole(id)) onPick?.(); } }, label)));
}
// Анонимные предложения: Яндекс Форма во всплывающем окне. Имя и статус не передаются.
const FEEDBACK_URL = 'https://forms.yandex.ru/u/6ad4be566d2d73ec38a5a6c9/';
function feedbackDialog() {
  const close = () => m.remove();
  const src = FEEDBACK_URL ? FEEDBACK_URL + (FEEDBACK_URL.includes('?') ? '&' : '?') + 'iframe=1' : '';
  const m = el('div', { class: 'modal', onpointerdown: (e) => { if (e.target === m) close(); } },
    el('div', { class: 'panel dialog fb-dialog' },
      el('div', { class: 'dialog-h' }, el('b', {}, 'Предложить улучшение'), el('button', { class: 'ibtn fb-x', title: 'Закрыть', onclick: close }, '×')),
      src ? el('iframe', { class: 'fb-frame', src, title: 'Форма' })
        : el('div', { class: 'fb-frame fb-empty muted' }, 'Здесь будет форма')));
  document.body.append(m);
}
const room = roomFromHash();
if (!room) showStart(); else startBoard(room);

function showStart() {
  const nameIn = el('input', { class: 'inp', placeholder: 'Ваше имя', value: prefs.name, maxlength: 30, autocomplete: 'off', spellcheck: 'false', title: 'Отображается у собеседника рядом с вашим курсором' });
  const titleIn = el('input', { class: 'inp', placeholder: 'Название новой доски', maxlength: 40, autocomplete: 'off' });
  const codeIn = el('input', { class: 'inp', placeholder: 'Код или ссылка на доску', autocomplete: 'off', spellcheck: 'false' });
  const err = el('div', { class: 'err' });
  const saveName = () => { prefs.name = nameIn.value.trim() || prefs.name; savePrefs(); };
  const open = (code) => { saveName(); location.hash = 'r=' + code; location.reload(); };
  const create = () => {
    const code = newRoomCode(); const t = titleIn.value.trim().slice(0, 40);
    if (t) LS.set('pendingTitle:' + code, t);
    LS.set('created:' + code, 1); // доску создали здесь — первый лист можно заводить сразу
    const recent = LS.get('recent', []); recent.unshift({ room: code, t: Date.now(), title: t }); LS.set('recent', recent);
    open(code);
  };
  const join = () => { const c = normalizeCode(codeIn.value); if (!c) { err.textContent = 'Неверный код. Формат: XXXX-XXXX-XXXX'; codeIn.focus(); } else open(c); };
  titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

  const listBox = el('div', { class: 'blist' });
  const hiddenRooms = new Set();
  const search = el('input', { class: 'inp', placeholder: 'Поиск по названию…' });
  function renderList() {
    const all = LS.get('recent', []);
    const q = search.value.trim().toLowerCase();
    const rows = all.filter((r) => !hiddenRooms.has(r.room) && (!q || (r.title || '').toLowerCase().includes(q) || r.room.includes(q)));
    listBox.innerHTML = '';
    if (!all.length) { listBox.append(el('div', { class: 'small muted empty-list' }, 'Досок пока нет')); return; }
    for (const r of rows) {
      listBox.append(el('div', { class: 'brow' },
        el('button', { class: 'bopen', title: r.title || r.room, onclick: () => open(r.room) },
          el('span', { class: 'bname' + (r.title ? '' : ' empty') }, r.title || 'Без названия'),
          el('span', { class: 'bmeta' }, r.room.toUpperCase() + ' · ' + new Date(r.t).toLocaleDateString('ru-RU'))),
        el('button', { class: 'bdel', title: 'Удалить доску с этого компьютера (у собеседника копия останется)', onclick: () => {
          hiddenRooms.add(r.room); renderList();
          undoBar(`Доска «${r.title || 'Без названия'}» удалена`, () => {
            try { indexedDB.deleteDatabase('doska-' + r.room); } catch {}
            for (const k of ['views:', 'lastPage:']) localStorage.removeItem('doska:' + k + r.room);
            LS.set('recent', LS.get('recent', []).filter((x) => x.room !== r.room)); hiddenRooms.delete(r.room); renderList();
          }, () => { hiddenRooms.delete(r.room); renderList(); });
        } }, '×')));
    }
    if (!rows.length) listBox.append(el('div', { class: 'small muted' }, 'Ничего не нашлось'));
  }
  search.addEventListener('input', renderList);
  codeIn.addEventListener('input', () => { err.textContent = ''; });
  const roleSlot = el('div', { class: 'role-slot' });
  const paintRole = () => { roleSlot.innerHTML = ''; roleSlot.append(roleBox(paintRole)); };
  paintRole();
  const card = el('div', { class: 'start-card' },
    el('div', { class: 'start-head' }, el('h1', {}, 'Доска для занятий'), roleSlot),
    nameIn,
    el('div', { class: 'srow' }, titleIn, el('button', { class: 'btn primary', onclick: create }, 'Создать')),
    el('div', { class: 'srow' }, codeIn, el('button', { class: 'btn', onclick: join }, 'Подключиться')),
    err,
    el('div', { class: 'mh2' }, 'Недавние'),
    LS.get('recent', []).length > 6 ? search : null,
    listBox,
  );
  renderList();
  document.body.append(el('div', { id: 'start' }, card));
}

// ============ доска ============
function startBoard(room) {
  const prev = LS.get('recent', []);
  const old = prev.find((r) => r.room === room);
  const recent = prev.filter((r) => r.room !== room);
  recent.unshift({ room, t: Date.now(), title: old?.title || LS.get('pendingTitle:' + room, '') || '' });
  LS.set('recent', recent.slice(0, 20));
  navigator.storage?.persist?.();

  const doc = new Y.Doc();
  const yItems = doc.getMap('items');
  const yPages = doc.getMap('pages');
  const yMeta = doc.getMap('meta');
  const LOCAL = 'local';
  const NOUNDO = 'noundo';
  const undo = new Y.UndoManager([yItems], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });

  const hub = new Hub(doc, me);
  if (!prefs.name) setTimeout(async () => {
    const n = await uiDialog({ title: 'Ваше имя', text: 'Отображается у собеседника рядом с вашим курсором.', input: true, placeholder: 'Имя', maxlength: 30, cancel: null });
    if (n) { prefs.name = n.slice(0, 30); savePrefs(); hub.broadcast(hub.helloMsg()); }
  }, 300);
  const idb = new IndexeddbPersistence('doska-' + room, doc);

  // ---------- кэш модели ----------
  const items = new Map();
  let pageListCache = null, pageItemsCache = new Map();
  function refreshItem(id) {
    const m = yItems.get(id);
    if (!m) items.delete(id); else items.set(id, Object.assign(m.toJSON(), { id }));
  }
  const undoPages = new Set();
  yItems.observeDeep((events, txn) => {
    const changed = new Set();
    for (const ev of events) {
      if (ev.target === yItems) for (const k of ev.changes.keys.keys()) changed.add(k);
      else { const id = ev.target.get('id'); if (id) changed.add(id); }
    }
    const hadBefore = new Set([...changed].filter((id) => items.has(id)));
    for (const id of changed) {
      const before = items.get(id);
      refreshItem(id);
      if (txn.origin === undo) { const it = items.get(id) || before; if (it) undoPages.add(it.page); }
    }
    pageItemsCache.clear();
    // собеседник закончил действие и сохранил его — его промежуточный вид больше не нужен (иначе на миг двоится)
    let pvDrop = false;
    if (txn.origin !== LOCAL && remotePv && remotePv.size) for (const v of remotePv.values()) if (v.tmp || v.ov || v.hid.size || v.er) { v.tmp = null; v.ov = null; v.hid = new Set(); v.er = null; pvDrop = true; }
    for (const id of [...S.sel]) if (!items.has(id)) S.sel.delete(id);
    if (S.editingId && !items.has(S.editingId)) closeEditors(false);
    // Только что добавленные объекты поверх всего — дорисовываем их, не перерисовывая весь лист.
    // Это главное, что держит 60 кадров/с на заполненной доске при быстром письме.
    const added = [...changed].filter((id) => !hadBefore.has(id) && items.has(id));
    // «Глаз»: собеседник добавил картинку, текст, формулу, фигуру — показываем это по центру
    if (S.follow && txn.origin && txn.origin.remote && txn.origin.remote.id === S.follow) {
      const its = added.map((id) => items.get(id)).filter((it) => it.page === S.page && it.type !== 'stroke');
      if (its.length) {
        let b = null; for (const it of its) { const w = worldBox(it); b = b ? [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])] : w; }
        const big = its.some((it) => it.type === 'image');
        queueMicrotask(() => followCenter((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, big ? b : null));
      }
    }
    const onPage = added.filter((id) => items.get(id).page === S.page);
    const top = pageItems().slice(-onPage.length).map((it) => it.id);
    const simple = !pvDrop && added.length === changed.size && !S.ov && !S.hidden.size && onPage.every((id) => top.includes(id));
    if (simple && !dirtyMain) { for (const id of added) if (items.get(id).page === S.page) pendingAppend.push(id); dirtyOver = true; if (!rafId) rafId = requestAnimationFrame(frame); }
    else invalidate();
  });
  yPages.observeDeep(() => {
    pageListCache = null; renderPages();
    if (S.page && !pages().some((p) => p.id === S.page) && pages()[0]) setPage(pages()[0].id);
    else if (S.page && !S.pageShown && pages().some((p) => p.id === S.page)) setPage(S.page, true); // дождались листов собеседника
  });
  yMeta.observe(() => invalidate());

  function pages() {
    if (!pageListCache) {
      pageListCache = [...yPages.entries()].filter(([, m]) => !m.get('deletedAt')).map(([id, m]) => ({ id, name: m.get('name'), order: m.get('order') }))
        .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    }
    return pageListCache;
  }
  function pageItems(page = S.page) {
    let a = pageItemsCache.get(page);
    if (!a) {
      a = [];
      for (const it of items.values()) if (it.page === page) a.push(it);
      a.sort((p, q) => p.z - q.z || (p.id < q.id ? -1 : 1));
      pageItemsCache.set(page, a);
    }
    return a;
  }
  const zTop = (page) => { const a = pageItems(page); return a.length ? a[a.length - 1].z + 1 : 1; };
  function addItem(data) {
    const m = new Y.Map();
    for (const [k, v] of Object.entries(data)) if (v !== undefined && !k.startsWith('_')) m.set(k, v);
    yItems.set(data.id, m);
  }
  function setFields(id, fields) { const m = yItems.get(id); if (m) for (const [k, v] of Object.entries(fields)) m.set(k, v); }
  const act = (f) => doc.transact(f, LOCAL);

  // ---------- состояние ----------
  const S = {
    tool: 'pen', page: null, view: { x: 0, y: 0, z: 1 }, sel: new Set(), editingId: null,
    ov: null, hidden: new Set(), pieces: null, space: false, follow: null,
  };
  const viewByPage = LS.get('views:' + room, {});

  // ---------- DOM ----------
  const app = el('div', { id: 'app' });
  const cvMain = el('canvas', { id: 'cv-main' });
  const cvOver = el('canvas', { id: 'cv-over' });
  const ctx = cvMain.getContext('2d', { alpha: false });
  const octx = cvOver.getContext('2d', { desynchronized: true });
  let inkPresenter = null;
  try { navigator.ink?.requestPresenter?.({ presentationArea: cvOver }).then((pr) => { inkPresenter = pr; }).catch(() => {}); } catch {}
  const topLeft = el('div', { class: 'bar tl' });
  const toolbar = el('div', { class: 'bar toolbar' });
  const topRight = el('div', { class: 'bar tr' });
  const selBar = el('div', { class: 'bar selbar', hidden: true });
  const toasts = el('div', { class: 'toasts' });
  const layer = el('div', { class: 'layer' }); // редакторы текста и т.п.
  app.append(cvMain, cvOver, layer, topLeft, toolbar, topRight, selBar, toasts);
  document.body.append(app);
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight;
    for (const c of [cvMain, cvOver]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); c.style.width = W + 'px'; c.style.height = H + 'px'; }
    invalidate();
  }
  window.addEventListener('resize', resize);

  function toast(msg, ms = 2600, key = msg) {
    let t = [...toasts.children].find((x) => x.dataset.key === key);
    if (t) { t.textContent = msg; clearTimeout(t._timer); t.classList.remove('out'); }
    else {
      t = el('div', { class: 'toast' }, msg); t.dataset.key = key; toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
    }
    t._timer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ---------- вид ----------
  const toWorld = (sx, sy) => [(sx - S.view.x) / S.view.z, (sy - S.view.y) / S.view.z];
  const toScreen = (wx, wy) => [wx * S.view.z + S.view.x, wy * S.view.z + S.view.y];
  let viewSaveT = 0;
  function viewChanged(byUser = true) {
    if (byUser && flyRaf) { cancelAnimationFrame(flyRaf); flyRaf = 0; } // сами двигаем доску — переезд «глаза» прерываем
    if (byUser && S.follow) { S.follow = null; renderStatus(); }
    invalidate(); updateSelBar();
    clearTimeout(viewSaveT);
    viewSaveT = setTimeout(() => { viewByPage[S.page] = { ...S.view }; LS.set('views:' + room, viewByPage); }, 400);
    sendView();
  }
  function zoomAt(sx, sy, factor) {
    const z = clamp(S.view.z * factor, 0.08, 12);
    const [wx, wy] = toWorld(sx, sy);
    S.view.z = z; S.view.x = sx - wx * z; S.view.y = sy - wy * z;
    viewChanged(); renderZoom();
  }
  function fitRect(x0, y0, x1, y1, maxZ = 2) {
    const pad = 60;
    const z = clamp(Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2 - 60) / Math.max(1, y1 - y0)), 0.08, maxZ);
    S.view.z = z; S.view.x = W / 2 - ((x0 + x1) / 2) * z; S.view.y = (H + 50) / 2 - ((y0 + y1) / 2) * z;
  }
  function fitContent() {
    const a = pageItems();
    if (!a.length) { S.view = { x: W / 2, y: H / 3, z: 1 }; viewChanged(); renderZoom(); return; }
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const it of a) { const w = worldBox(it); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])]; }
    fitRect(...b); viewChanged(); renderZoom();
  }

  // ---------- отрисовка ----------
  let dirtyMain = true, dirtyOver = true, rafId = 0;
  function invalidate(main = true) { if (main) dirtyMain = true; dirtyOver = true; if (!rafId) rafId = requestAnimationFrame(frame); }
  setAsyncLoad(() => { for (const it of items.values()) if (it.type === 'tex') { it._lb = null; } invalidate(); });
  let pendingAppend = [];
  const STATS = { full: 0, fullMs: 0, append: 0 };
  function frame() {
    rafId = 0;
    const fr0 = penRec ? performance.now() : 0;
    try { frameBody(); } finally { if (penRec) { const t = performance.now(); penRec.frames.push([+fr0.toFixed(1), +(t - fr0).toFixed(2)]); } }
  }
  function frameBody() {
    if (dirtyMain) { dirtyMain = false; pendingAppend = []; STATS.full++; const t0 = performance.now(); renderMain(); STATS.fullMs += performance.now() - t0; }
    else if (pendingAppend.length) {
      const v = S.view; ctx.setTransform(DPR * v.z, 0, 0, DPR * v.z, DPR * v.x, DPR * v.y);
      STATS.append++;
      for (const id of pendingAppend) { const it = items.get(id); if (it && it.page === S.page) drawItem(ctx, it, null, v.z); }
      pendingAppend = [];
    }
    if (dirtyOver) { dirtyOver = false; renderOver(); placeSelBar(); pvMaybeSend(); }
  }
  function renderMain() {
    const v = S.view;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(ctx, yMeta.get('bg') || 'grid', v, W, H);
    ctx.setTransform(DPR * v.z, 0, 0, DPR * v.z, DPR * v.x, DPR * v.y);
    const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(W, H);
    const rv = remotePv.size ? remoteView() : {};
    for (const it of pageItems()) {
      if (S.hidden.has(it.id) || S.editingId === it.id || rv.hidden?.has(it.id)) continue;
      const ov = rv.ovById?.get(it.id) || (S.ov && S.ov.copy ? null : S.ov);
      const b = worldBox(it, ov || S.ov);
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      drawItem(ctx, it, ov, v.z, S.pieces?.get(it.id) || rv.pieces?.get(it.id));
    }
    if (S.ov && S.ov.copy) { // копия под курсором, оригинал остаётся на месте
      ctx.globalAlpha = 0.75;
      for (const it of pageItems()) if (S.ov.ids.has(it.id)) drawItem(ctx, it, S.ov, v.z);
      ctx.globalAlpha = 1;
    }
    updateSelBar(); updateBadges();
  }

  // ---------- эфемерное: курсоры, «живые» штрихи, лазер ----------
  const remoteCursors = new Map(); // peerId -> {x,y,page,name,color,t}
  const remoteLive = new Map(); // sid -> {...}
  const liveEnded = new Set(); // линии собеседника, которые уже закончены
  // Подстраховка: живой след без обновлений дольше 10 с (связь оборвалась посреди линии) убираем
  setInterval(() => { const now = Date.now(); let ch = false; for (const [k, l] of remoteLive) if (now - (l.at || 0) > 10000) { remoteLive.delete(k); ch = true; } if (ch) invalidate(false); }, 2000);
  const peersById = new Map();
  hub.on('ephemeral', (o) => {
    switch (o.t) {
      case 'hello': peersById.set(o.id, o); break;
      case 'bye': remotePv.delete(o.id); remoteCursors.delete(o.id); for (const [k, l] of remoteLive) if (l.peer === o.id) remoteLive.delete(k); if (S.follow === o.id) S.follow = null; break;
      case 'cur': if (o.hide) remoteCursors.delete(o.id); else remoteCursors.set(o.id, { ...o, at: Date.now() }); break;
      case 'live': {
        if (liveEnded.has(o.sid)) break; // опоздавший кусок уже законченной линии — не воскрешаем его
        let l = remoteLive.get(o.sid);
        if (!l) { l = { ...o, pts: [] }; remoteLive.set(o.sid, l); }
        l.at = Date.now();
        for (let i = 0; i + 2 < o.pts.length; i += 3) l.pts.push([o.pts[i], o.pts[i + 1], o.pts[i + 2]]);
        notePeerActivity(o.peer, o.page, o.sid, o.pts);
        break;
      }
      case 'liveEnd': remoteLive.delete(o.sid); liveEnded.add(o.sid); if (liveEnded.size > 500) liveEnded.delete(liveEnded.values().next().value); invalidate(false); break;
      case 'view': {
        const p = peersById.get(o.id); if (p) p.view = o;
        if (S.follow === o.id) goToPeer(o);
        break;
      }
      case 'summon': applyPeerView(o.view); break;
      case 'pv': pvReceive(o); return;
    }
    invalidate(false);
  });
  // ---------- процесс собеседника вживую: выделение, перенос, растяжение, фигуры, ластик, текст ----------
  const PV_COLOR = '#f76707';
  const clean = (it) => { const o = {}; for (const k in it) if (k[0] !== '_') o[k] = it[k]; o.id = it.id; return o; };
  function pvSnapshot() {
    const o = {};
    const g = gesture;
    if (S.sel.size) o.sel = [...S.sel];
    if (S.ov) o.ov = { ...S.ov, ids: [...S.ov.ids] };
    if (g && g.pvMarq) o.marq = g.pvMarq().map((v) => Math.round(v * 10) / 10);
    const tmp = [], hid = [];
    if (g && g.pvTmp) tmp.push(...g.pvTmp());
    if (g && ((g.pvTmp && tmp.length) || g.isEraser) && S.hidden.size) hid.push(...S.hidden);
    if (g && g.pvEraser) { const e = g.pvEraser(); if (e && e.pts.length) o.er = e; }
    if (editorOpen && editorOpen.pv) { const e = editorOpen.pv(); tmp.push(...e.tmp); hid.push(...e.hidden); }
    if (poly && poly.pts.length) {
      const P = [...poly.pts, poly.cur]; let x0 = Infinity, y0 = Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
      tmp.push({ id: '_pvp', type: 'poly', x: x0, y: y0, s: 1, color: poly.color, size: poly.size, closed: false, pts: P.map(([x, y]) => [x - x0, y - y0]) });
    }
    if (tmp.length) o.tmp = tmp.map(clean);
    if (hid.length) o.hid = hid;
    return o;
  }
  let pvLast = '', pvSentAt = 0, pvTimer = 0;
  function pvMaybeSend() {
    const snap = pvSnapshot(); const empty = !Object.keys(snap).length;
    const key = empty ? '' : JSON.stringify(snap);
    const now = performance.now();
    if (key === pvLast && (empty || now - pvSentAt < 1500)) return; // без изменений; раз в 1,5 с — «я тут»
    if (now - pvSentAt < 40) { if (!pvTimer) pvTimer = setTimeout(() => { pvTimer = 0; pvMaybeSend(); }, 40 - (now - pvSentAt)); return; }
    pvLast = key; pvSentAt = now;
    hub.broadcast({ t: 'pv', id: me.id, page: S.page, ...snap });
  }
  setInterval(pvMaybeSend, 250);
  // приём: состояние каждого собеседника
  var remotePv = new Map(); // (var — наблюдатель за доской может сработать раньше этой строки) peerId -> {page, sel, ov, marq, tmp, hid, er, at}
  function pvReceive(o) {
    const prev = remotePv.get(o.id);
    if (!o.sel && !o.ov && !o.marq && !o.tmp && !o.hid && !o.er) { remotePv.delete(o.id); invalidate(); return; }
    const st = { page: o.page, sel: o.sel || null, marq: o.marq || null, tmp: o.tmp || null, hid: new Set(o.hid || []), at: Date.now(),
      ov: o.ov ? { ...o.ov, ids: new Set(o.ov.ids) } : null, er: null };
    if (o.er && o.page === S.page) { // точный ластик: повторяем стирание по его точкам
      let er = prev && prev.er && prev.er.sid === o.er.sid ? prev.er : { sid: o.er.sid, n: 0, st: { hidden: new Set(), pieces: new Map() } };
      const P = o.er.pts;
      for (let i = er.n; i < P.length; i++) {
        const [x, y, r] = P[i];
        if (i === 0) { eraseApply(er.st, x, y, r, true); continue; }
        const [px, py] = P[i - 1]; const d = Math.hypot(x - px, y - py); const n = Math.max(1, Math.ceil(d / (r * 0.3)));
        for (let k = 1; k <= n; k++) eraseApply(er.st, px + ((x - px) * k) / n, py + ((y - py) * k) / n, r, true);
      }
      er.n = P.length; st.er = er;
    }
    remotePv.set(o.id, st); invalidate();
  }
  // забытое состояние (связь оборвалась посреди действия) — убираем через 4 с тишины
  setInterval(() => { const now = Date.now(); let ch = false; for (const [k, v] of remotePv) if (now - v.at > 4000) { remotePv.delete(k); ch = true; } if (ch) invalidate(); }, 1000);
  // что из чужих действий касается рисования на этом листе
  function remoteView() {
    let hidden = null, pieces = null, ovById = null;
    for (const v of remotePv.values()) {
      if (v.page !== S.page) continue;
      for (const id of v.hid) (hidden ||= new Set()).add(id);
      if (v.er) { for (const id of v.er.st.hidden) (hidden ||= new Set()).add(id); for (const [id, pc] of v.er.st.pieces) (pieces ||= new Map()).set(id, pc); }
      if (v.ov && !v.ov.copy) for (const id of v.ov.ids) (ovById ||= new Map()).set(id, v.ov);
    }
    return { hidden, pieces, ovById };
  }

  // Где собеседник сейчас пишет: рамка его последней линии (обновляется, пока он пишет)
  const peerAct = new Map(); // peerId -> { page, sid, x0, y0, x1, y1, t }
  // Плавный переезд камеры (без рывка), масштаб — какой задан
  var flyRaf = 0; // var: viewChanged может сработать раньше этой строки
  function flyTo(v, ms = 260) {
    cancelAnimationFrame(flyRaf);
    const v0 = { ...S.view }, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      // масштаб меняем «по-логарифмически» — приближение/отдаление выглядит равномерным
      const z = Math.exp(Math.log(v0.z) + (Math.log(v.z) - Math.log(v0.z)) * e);
      // точка, которую ставим в центр, тоже едет плавно
      const c0 = [(W / 2 - v0.x) / v0.z, (H / 2 - v0.y) / v0.z], c1 = [(W / 2 - v.x) / v.z, (H / 2 - v.y) / v.z];
      const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      S.view = { z, x: W / 2 - cx * z, y: H / 2 - cy * z };
      invalidate(); renderZoom();
      if (k < 1) flyRaf = requestAnimationFrame(step); else { flyRaf = 0; viewChanged(false); }
    };
    flyRaf = requestAnimationFrame(step);
  }
  // «Глаз»: то, что собеседник начал рисовать или добавил, — у меня по центру.
  // Пока он пишет в середине моего экрана, камера стоит (иначе на каждой букве экран дёргался бы).
  // box — рамка добавленного (картинка): если не помещается при моём масштабе — отдаляемся ровно настолько, чтобы поместилась.
  function followCenter(x, y, box) {
    let z = S.view.z;
    if (box) { const fit = Math.min((W - 160) / Math.max(1, box[2] - box[0]), (H - 260) / Math.max(1, box[3] - box[1])); if (fit < z) z = clamp(fit, 0.08, 12); }
    const [sx, sy] = toScreen(x, y);
    const inCenter = sx > W * 0.3 && sx < W * 0.7 && sy > H * 0.3 && sy < H * 0.7;
    if (inCenter && z === S.view.z && !box) return;
    if (box && z === S.view.z) { const [a1, b1] = toScreen(box[0], box[1]), [a2, b2] = toScreen(box[2], box[3]); if (inCenter && a1 > 60 && b1 > 110 && a2 < W - 60 && b2 < H - 90) return; }
    flyTo({ z, x: W / 2 - x * z, y: H / 2 - y * z });
  }
  function notePeerActivity(id, page, sid, pts) {
    if (!id || !pts || pts.length < 3) return;
    let a = peerAct.get(id);
    if (!a || a.sid !== sid || a.page !== page) {
      a = { page, sid, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; peerAct.set(id, a);
      if (S.follow === id && page === S.page) { followCenter(pts[0], pts[1]); a.t = Date.now(); for (let i = 0; i + 2 < pts.length; i += 3) { a.x0 = Math.min(a.x0, pts[i]); a.x1 = Math.max(a.x1, pts[i]); a.y0 = Math.min(a.y0, pts[i + 1]); a.y1 = Math.max(a.y1, pts[i + 1]); } return; }
    }
    for (let i = 0; i + 2 < pts.length; i += 3) { a.x0 = Math.min(a.x0, pts[i]); a.x1 = Math.max(a.x1, pts[i]); a.y0 = Math.min(a.y0, pts[i + 1]); a.y1 = Math.max(a.y1, pts[i + 1]); }
    a.t = Date.now();
    // режим «глаз»: собеседник пишет за краем моего экрана — плавно переезжаем туда (масштаб свой)
    if (S.follow === id && page === S.page) {
      const lx = pts[pts.length - 3], ly = pts[pts.length - 2]; const [sx, sy] = toScreen(lx, ly);
      if (sx < 40 || sx > W - 40 || sy < 90 || sy > H - 90) { const p = peersById.get(id); goToPeer(p?.view || { id, page, x0: lx, y0: ly, x1: lx, y1: ly }); }
    }
  }
  // «Глаз»: переносимся к собеседнику, масштаб оставляем свой. Отдаляем, только если то,
  // где он сейчас пишет, не помещается на мой экран при моём масштабе — и ровно настолько, чтобы поместилось.
  function goToPeer(o) {
    if (!o) return;
    if (o.page && o.page !== S.page && yPages.has(o.page)) setPage(o.page, true);
    let z = S.view.z, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
    const a = peerAct.get(o.id);
    if (a && a.page === S.page && Date.now() - a.t < 15000 && isFinite(a.x0)) {
      cx = (a.x0 + a.x1) / 2; cy = (a.y0 + a.y1) / 2;
      const fit = Math.min((W - 120) / Math.max(1, a.x1 - a.x0), (H - 220) / Math.max(1, a.y1 - a.y0));
      if (fit < z) z = clamp(fit, 0.08, 12);
    }
    S.view = { z, x: W / 2 - cx * z, y: H / 2 - cy * z };
    invalidate(); renderZoom();
  }
  function applyPeerView(o) {
    if (o.page && o.page !== S.page && yPages.has(o.page)) setPage(o.page, true);
    const z = clamp(Math.min(W / (o.x1 - o.x0), H / (o.y1 - o.y0)), 0.08, 12);
    S.view = { z, x: W / 2 - ((o.x0 + o.x1) / 2) * z, y: H / 2 - ((o.y0 + o.y1) / 2) * z };
    invalidate(); renderZoom();
  }
  let viewSendT = 0;
  function viewMsg() { const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H); return { t: 'view', id: me.id, page: S.page, x0, y0, x1, y1 }; }
  function sendView() {
    if (viewSendT) return;
    viewSendT = setTimeout(() => { viewSendT = 0; hub.broadcast(viewMsg()); }, 120);
  }
  let curSendAt = 0;
  function sendCursor() {} // курсор собеседнику не показываем и не отправляем

  // живой штрих — накапливаем точки и отправляем раз в кадр
  let liveOut = null, liveFlushT = 0;
  // Конец линии: сначала отправить последние точки, потом «конец» — иначе хвост приходит позже конца и залипает у собеседника
  function liveEnd(g) {
    if (liveFlushT) { cancelAnimationFrame(liveFlushT); liveFlushT = 0; }
    if (liveOut) { if (liveOut.sid === g.sid) hub.broadcast(liveOut); liveOut = null; }
    hub.broadcast({ t: 'liveEnd', sid: g.sid });
  }
  function liveSend(g, pts) {
    if (!liveOut) liveOut = { t: 'live', sid: g.sid, peer: me.id, page: S.page, color: g.color, size: g.size, kind: g.kind, thin: g.thin, pts: [] };
    for (const p of pts) liveOut.pts.push(+p[0].toFixed(1), +p[1].toFixed(1), +p[2].toFixed(2));
    if (!liveFlushT) liveFlushT = requestAnimationFrame(() => { liveFlushT = 0; if (liveOut) { hub.broadcast(liveOut); liveOut = null; } });
  }

  function renderOver() {
    const v = S.view;
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.clearRect(0, 0, W, H);
    octx.setTransform(DPR * v.z, 0, 0, DPR * v.z, DPR * v.x, DPR * v.y);
    // чужие живые штрихи
    for (const l of remoteLive.values()) {
      if (l.page !== S.page || !l.pts.length) continue;
      octx.fillStyle = l.color; octx.globalAlpha = l.kind === 'hl' ? 0.38 : 1;
      paintInk(octx, l, l.pts, true);
    }
    octx.globalAlpha = 1;
    const g = gesture;
    // собеседник: то, что он сейчас рисует, тянет, печатает
    for (const pv of remotePv.values()) {
      if (pv.page !== S.page) continue;
      if (pv.tmp) for (const it of pv.tmp) { try { drawItem(octx, it, null, v.z); } catch {} }
      if (pv.ov && pv.ov.copy) { octx.globalAlpha = 0.75; for (const id of pv.ov.ids) { const it = items.get(id); if (it) drawItem(octx, it, pv.ov, v.z); } octx.globalAlpha = 1; }
    }
    if (g && g.drawOver) g.drawOver(octx);
    drawPolyPreview(octx);
    // выделение
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // выделение собеседника — оранжевым, без ручек
    for (const pv of remotePv.values()) {
      if (pv.page !== S.page) continue;
      octx.save(); octx.strokeStyle = PV_COLOR; octx.lineWidth = 1.5;
      if (pv.sel) {
        let bb = null;
        for (const id of pv.sel) {
          let it = items.get(id);
          if (pv.hid.has(id)) it = pv.tmp && pv.tmp.find((t) => t.id === id); // правит форму — рамка идёт за новой формой
          if (!it) continue;
          const w = worldBox(it, pv.ov); const [a1, b1] = toScreen(w[0], w[1]), [a2, b2] = toScreen(w[2], w[3]);
          bb = bb ? [Math.min(bb[0], a1), Math.min(bb[1], b1), Math.max(bb[2], a2), Math.max(bb[3], b2)] : [a1, b1, a2, b2];
        }
        if (bb) { // по пикселям — линия всегда чёткая, не дрожит при движении
          const q = (v) => Math.round(v) + 0.5; const L = q(bb[0] - 6), T = q(bb[1] - 6), R = q(bb[2] + 6), B = q(bb[3] + 6);
          octx.lineWidth = 1.2; octx.setLineDash([5, 4]); octx.strokeRect(L, T, R - L, B - T); octx.setLineDash([]);
        }
      }
      if (pv.marq) {
        const [a1, b1] = toScreen(pv.marq[0], pv.marq[1]), [a2, b2] = toScreen(pv.marq[2], pv.marq[3]);
        octx.fillStyle = 'rgba(247,103,7,0.08)'; octx.fillRect(a1, b1, a2 - a1, b2 - b1); octx.lineWidth = 1; octx.strokeRect(a1, b1, a2 - a1, b2 - b1);
      }
      octx.restore();
    }
    if (S.sel.size && !(g && g.hideSel)) {
      const bb = selectionBox();
      octx.strokeStyle = '#4c6ef5'; octx.lineWidth = 1;
      // несколько объектов — одна общая рамка вокруг всего, без рамки у каждого
      const smo = shapeSel();
      if (smo) { if (!S.ov) drawShapeOverlay(octx, smo.it, smo.k, S.hoverShape); } // правка формы: без рамки, только вершины
      else if (bb) {
        const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]);
        const P = selPad();
        octx.setLineDash([5, 4]); octx.strokeRect(x0 - P, y0 - P, x1 - x0 + 2 * P, y1 - y0 + 2 * P); octx.setLineDash([]);
        const lineSel = S.sel.size === 1 && ['line', 'arrow'].includes(items.get([...S.sel][0])?.type);
        handles(bb).forEach((h, i) => {
          if (!h) return; const [hx, hy] = h;
          if (i < 4) { octx.fillStyle = '#fff'; octx.fillRect(hx - 3.5, hy - 3.5, 7, 7); octx.strokeRect(hx - 3.5, hy - 3.5, 7, 7); return; } // небольшие квадратики: здесь размер, чуть снаружи — поворот
          if (!lineSel && (i % 2 === 0 ? x1 - x0 : y1 - y0) < 26) return; // на короткой стороне палочку не рисуем, но тянуть за сторону можно
          const w = i % 2 === 0 ? 16 : 6, hh = i % 2 === 0 ? 6 : 16;
          octx.fillStyle = '#4c6ef5'; octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; // палочки залиты — сразу видно, за что тянуть
          octx.beginPath(); octx.roundRect(hx - w / 2, hy - hh / 2, w, hh, 3); octx.fill(); octx.stroke();
          octx.strokeStyle = '#4c6ef5'; octx.lineWidth = 1;
        });
        const es = !S.ov && editSel(); if (es) drawEditHandles(octx, es);
      }
    }
    if (g && g.drawScreen) g.drawScreen(octx);
    // чужие курсоры — только если включено в меню (по умолчанию скрыты)
  }

  // ---------- страницы ----------
  function setPage(id, silent) {
    if (!id || !yPages.has(id) || yPages.get(id).get('deletedAt')) return;
    closeEditors(true);
    if (S.page) viewByPage[S.page] = { ...S.view };
    S.page = id; S.pageShown = true; S.sel.clear();
    S.view = viewByPage[id] ? { ...viewByPage[id] } : { x: W / 2, y: H / 3, z: 1 };
    LS.set('lastPage:' + room, id);
    renderPages(); renderZoom(); invalidate();
    hub.resync(200); // перешли на лист — заодно сверяемся с собеседником: всё ли у нас есть
    if (!silent) viewChanged(false); else sendView();
  }
  function addPage(name, afterId) {
    const ps = pages(); const id = 'p' + uid();
    let order = (ps.length ? ps[ps.length - 1].order : 0) + 1;
    const i = afterId ? ps.findIndex((p) => p.id === afterId) : -1;
    if (i >= 0) order = ps[i + 1] ? (ps[i].order + ps[i + 1].order) / 2 : ps[i].order + 1;
    const used = new Set(ps.map((p) => p.name)); let n = ps.length + 1; while (used.has('Лист ' + n)) n++;
    doc.transact(() => { const m = new Y.Map(); m.set('name', name || 'Лист ' + n); m.set('order', order); yPages.set(id, m); }, NOUNDO);
    setPage(id);
    return id;
  }
  function deletePage(id = S.page) {
    const p = pages().find((x) => x.id === id); if (!p) return;
    let spare = null;
    doc.transact(() => {
      yPages.get(id).set('deletedAt', Date.now());
      if (!pages().length || pages().every((x) => x.id === id)) { spare = 'p' + uid(); const m = new Y.Map(); m.set('name', 'Лист 1'); m.set('order', p.order + 1); yPages.set(spare, m); }
    }, NOUNDO);
    pageListCache = null;
    if (S.page === id) setPage(pages()[0].id);
    undoBar(`«${p.name}» удалён`, () => hardDeletePage(id), () => {
      doc.transact(() => {
        yPages.get(id)?.delete('deletedAt');
        if (spare && yPages.get(spare) && !pageItems(spare).length) yPages.delete(spare);
      }, NOUNDO);
      pageListCache = null; setPage(id);
    });
  }
  function hardDeletePage(id) {
    if (!yPages.get(id)?.get('deletedAt')) return;
    doc.transact(() => { for (const it of [...items.values()]) if (it.page === id) yItems.delete(it.id); yPages.delete(id); }, NOUNDO);
  }
  function duplicatePage(id) {
    const p = pages().find((x) => x.id === id); if (!p) return;
    const src = pageItems(id).map(({ _pts, _path, _lb, _tm, _segs, ...r }) => r);
    const nid = addPage(p.name.slice(0, 32) + ' (копия)', id);
    act(() => { for (const it of src) addItem({ ...it, id: uid(), page: nid }); });
    setPage(nid);
  }
  function movePage(id, dir) {
    const ps = pages(); const i = ps.findIndex((p) => p.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= ps.length) return;
    doc.transact(() => { const a = yPages.get(ps[i].id), b = yPages.get(ps[j].id); const t = a.get('order'); a.set('order', b.get('order')); b.set('order', t); }, NOUNDO);
  }
  function renamePageInline(id) {
    const tab = pagesBox.querySelector(`[data-page="${id}"]`); if (!tab) return;
    const p = pages().find((x) => x.id === id);
    const inp = el('input', { class: 'page-inp', value: p.name, maxlength: 30 });
    tab.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const save = (ok) => {
      if (done) return; done = true;
      const v = inp.value.trim().slice(0, 30);
      if (ok && v && v !== p.name) doc.transact(() => yPages.get(id)?.set('name', v), NOUNDO); else renderPages();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save(true); if (e.key === 'Escape') save(false); });
    inp.addEventListener('blur', () => save(true));
  }
  function pageMenu(id, x, y) {
    const ps = pages(); const i = ps.findIndex((p) => p.id === id);
    const item = (ic, label, f, opts = {}) => el('button', { class: 'mi' + (opts.danger ? ' danger' : ''), disabled: opts.disabled, onclick: () => { closePopovers(); f(); } },
      el('span', { class: 'mi-l' }, el('span', { class: 'ic', html: ICONS[ic] || '' }), label), opts.hint ? el('span', { class: 'hint' }, opts.hint) : null);
    popoverAt(x, y, [
      el('div', { class: 'mh' }, ps[i]?.name || 'Лист'),
      item('pen', 'Переименовать', () => renamePageInline(id)),
      item('copy', 'Дублировать лист', () => duplicatePage(id)),
      item('plus', 'Новый лист после этого', () => addPage(null, id)),
      item('left', 'Сдвинуть влево', () => movePage(id, -1), { disabled: i <= 0 }),
      item('right', 'Сдвинуть вправо', () => movePage(id, 1), { disabled: i >= ps.length - 1 }),
      item('broom', 'Очистить лист', () => { const its = pageItems(id); if (!its.length) return; act(() => { for (const it of its) yItems.delete(it.id); }); }),
      item('trash', 'Удалить лист', () => deletePage(id), { danger: true }),
    ]);
  }
  function scrollActiveTab() {
    const t = pagesBox.querySelector('.page.on');
    if (t) t.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }
  function ensureFirstPage() {
    if (yPages.size === 0) doc.transact(() => { const m = new Y.Map(); m.set('name', 'Лист 1'); m.set('order', 1); yPages.set('p1', m); }, NOUNDO);
  }

  // ---------- замочки ----------
  const badges = el('div', { class: 'badges' });
  app.insertBefore(badges, topLeft);
  const badgeEls = new Map();
  function updateBadges() {
    const want = new Set();
    if (S.tool === 'select') {
      const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(W, H);
      for (const it of pageItems()) {
        if (!it.locked) continue;
        const b = worldBox(it);
        if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
        want.add(it.id);
        let e = badgeEls.get(it.id);
        if (!e) {
          e = el('button', { class: 'lockbadge', title: 'Закреплено. Нажмите, чтобы открепить', html: ICONS.lock });
          e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
          e.addEventListener('click', (ev) => {
            ev.stopPropagation(); const id = it.id;
            act(() => setFields(id, { locked: false }));
            S.sel = new Set([id]); invalidate();
          });
          badges.append(e); badgeEls.set(it.id, e);
        }
        const [sx, sy] = toScreen(b[2], b[1]);
        e.style.transform = `translate(${Math.round(clamp(sx - 30, 4, W - 30))}px, ${Math.round(clamp(sy + 6, 4, H - 30))}px)`;
      }
    }
    for (const [id, e] of badgeEls) if (!want.has(id)) { e.remove(); badgeEls.delete(id); }
  }

  const INK_TOOLS = new Set(['pen', 'dpen', 'hl']);


  // ---------- выделение ----------
  function selectionBox(ov = S.ov) {
    let b = null;
    for (const id of S.sel) {
      const it = items.get(id); if (!it) continue;
      const w = worldBox(it, ov);
      b = b ? [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])] : w;
    }
    return b;
  }
  // 0–3 углы (пропорционально), 4–7 середины сторон (верх, право, низ, лево — растянуть по одной оси)
  // Отступ рамки: если у фигуры есть точки-вершины, рамка отходит дальше — углы рамки не налезают на вершины
  const selPad = () => { const e = editSel(); return !e || e.k === 'rot' ? 5 : e.k === 'line' ? 14 : 10; };
  // Поворот всего выделенного — как у фигур: зона чуть снаружи любого угла рамки (курсор-дуга). Ловить легко: до 34 px от угла.
  const ROT_ZONE = 34;
  function rotCornerAt(bb, x, y) {
    if (!bb || shapeSel() || editSel() || ![...S.sel].some((id) => { const it = items.get(id); return it && !it.locked; })) return -1;
    const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]); const P = selPad();
    const C = [[x0 - P, y0 - P], [x1 + P, y0 - P], [x1 + P, y1 + P], [x0 - P, y1 + P]], out = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [cx, cy] = C[k], dc = Math.hypot(x - cx, y - cy);
      if (dc > 4 && dc < ROT_ZONE && (x - cx) * out[k][0] > -6 && (y - cy) * out[k][1] > -6) return k;
    }
    return -1;
  }
  // Повернуть объект на угол th (радианы, по часовой) вокруг точки C (мир)
  function rotateFields(it, th, C) {
    const c = Math.cos(th), si = Math.sin(th), deg = th * 180 / Math.PI;
    const R = ([x, y]) => [C[0] + (x - C[0]) * c - (y - C[1]) * si, C[1] + (x - C[0]) * si + (y - C[1]) * c];
    const s = it.s || 1;
    const rebase = (W) => { let x0 = Infinity, y0 = Infinity; for (const [x, y] of W) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); } return [x0, y0]; };
    if (it.type === 'stroke') {
      const q = it.q || 10; const P = decodePts(it).map(([px, py, pr]) => [...R([it.x + px * s, it.y + py * s]), pr]);
      let [x0, y0] = rebase(P); x0 = Math.floor(x0 * q) / q; y0 = Math.floor(y0 * q) / q;
      return { x: x0, y: y0, pts: encodePts(P.map(([x, y, pr]) => [(x - x0) / s, (y - y0) / s, pr]), q) };
    }
    if (it.type === 'poly') { const P = it.pts.map(([px, py]) => R([it.x + px * s, it.y + py * s])); const [x0, y0] = rebase(P); return { x: x0, y: y0, pts: P.map(([x, y]) => [(x - x0) / s, (y - y0) / s]) }; }
    if (it.type === 'line' || it.type === 'arrow') {
      const A = R([it.x + it.x1 * s, it.y + it.y1 * s]), B = R([it.x + it.x2 * s, it.y + it.y2 * s]);
      return { x: A[0], y: A[1], x1: 0, y1: 0, x2: (B[0] - A[0]) / s, y2: (B[1] - A[1]) / s };
    }
    if (it.type === 'rect') { // прямоугольник после поворота — многоугольник с теми же свойствами (его можно выровнять обратно)
      const P = [[0, 0], [it.w, 0], [it.w, it.h], [0, it.h]].map(([px, py]) => R([it.x + px * s, it.y + py * s])); const [x0, y0] = rebase(P);
      return { type: 'poly', closed: true, fk: 'rect', x: x0, y: y0, s: 1, size: it.size * s, pts: P.map(([x, y]) => [x - x0, y - y0]), w: null, h: null };
    }
    if (it.type === 'fig' && SOLID_KINDS.has(it.kind)) { // тело: поворачиваем в плоскости экрана и переносим центр
      const base = prepared(it), v0 = viewOf(base);
      const r = reproject(base, { ...v0, roll: (v0.roll || 0) - deg }, base.m);
      const nt = { ...it, ...r }; const b0 = worldBox(it), b1 = worldBox(nt);
      const c0 = R([(b0[0] + b0[2]) / 2, (b0[1] + b0[3]) / 2]), c1 = [(b1[0] + b1[2]) / 2, (b1[1] + b1[3]) / 2];
      return { ...r, x: r.x + c0[0] - c1[0], y: r.y + c0[1] - c1[1] };
    }
    // остальное (эллипс, фигуры, текст, формулы, графики, картинки) — поворот вокруг своего центра + перенос центра
    const [rcx, rcy] = rotCenter(it); const cw = [it.x + rcx * s, it.y + rcy * s], cn = R(cw);
    let rot = ((it.rot || 0) + deg) % 360; if (rot > 180) rot -= 360; if (rot < -180) rot += 360;
    return { x: it.x + cn[0] - cw[0], y: it.y + cn[1] - cw[1], rot: Math.abs(rot) < 1e-6 ? 0 : Math.round(rot * 1000) / 1000 };
  }
  function rotateGesture(pt, bb, k = 2) {
    const ids = [...S.sel].filter((id) => { const it = items.get(id); return it && !it.locked; });
    const C = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    const a0 = Math.atan2(pt[1] - C[1], pt[0] - C[0]);
    let th = 0;
    S.hidden = new Set(ids); cvOver.style.cursor = rotateCursor(k); invalidate();
    const snap = (t, ev) => { let d = t * 180 / Math.PI; if (ev?.shiftKey) d = Math.round(d / 15) * 15; else { const n = Math.round(d / 90) * 90; if (Math.abs(d - n) < 4) d = n; } return d * Math.PI / 180; };
    return {
      hideSel: true, rotC: C,
      rotAngle: () => th,
      drawScreen() {}, // пока крутим — панель над выделенным спрятана
      move(p, ev) { let t = Math.atan2(p[1] - C[1], p[0] - C[0]) - a0; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; th = snap(t, ev); invalidate(false); },
      drawOver(c) {
        c.save(); c.translate(C[0], C[1]); c.rotate(th); c.translate(-C[0], -C[1]);
        for (const id of ids) { const it = items.get(id); if (it) drawItem(c, it, null, S.view.z); }
        c.restore();
      },
      pvTmp: () => ids.map((id) => items.get(id)).filter(Boolean).map((it) => ({ ...it, ...rotateFields(it, th, C) })),
      end() {
        S.hidden = new Set(); updateCursor();
        if (Math.abs(th) > 1e-4) act(() => { for (const id of ids) { const it = items.get(id); if (!it) continue; const f = rotateFields(it, th, C);
          if (f.type && f.type !== it.type) { const { _lb, _segs, _sv, _pts, _path, _rc, ...plain } = it; yItems.delete(id); addItem({ ...plain, ...f, id, w: undefined, h: undefined }); } else setFields(id, f); } });
        invalidate();
      },
      cancel() { S.hidden = new Set(); invalidate(); },
    };
  }
  function handles(bb) {
    const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]); const P = selPad();
    const its = [...S.sel].map((id) => items.get(id)).filter(Boolean);
    const isLine = its.length === 1 && (its[0].type === 'line' || its[0].type === 'arrow');
    const hs = isLine ? [null, null, null, null] : [[x0 - P, y0 - P], [x1 + P, y0 - P], [x1 + P, y1 + P], [x0 - P, y1 + P]];
    // повёрнутый эллипс по одной оси не растягиваем — только целиком за угол
    const stretchable = its.some((i) => !['text', 'tex'].includes(i.type)) && !its.some((i) => rotOf(i));
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const one = its.length === 1 ? its[0] : null;
    if (one && (one.type === 'line' || one.type === 'arrow')) {
      // у линии — две палочки по бокам: растянуть по длине (для пологой — слева/справа, для крутой — сверху/снизу)
      if (Math.abs(one.x2 - one.x1) >= Math.abs(one.y2 - one.y1)) hs.push(null, [x1 + P, my], null, [x0 - P, my]);
      else hs.push([mx, y0 - P], null, [mx, y1 + P], null);
    } else if (stretchable) hs.push([mx, y0 - P], [x1 + P, my], [mx, y1 + P], [x0 - P, my]);
    return hs;
  }
  // Какая ручка под курсором: квадратик в углу или сторона рамки по всей длине (кроме самых углов)
  function handleAt(bb, x, y) {
    const hs = handles(bb);
    const hi = hs.findIndex((h, i) => h && i < 4 && Math.abs(h[0] - x) < 8 && Math.abs(h[1] - y) < 8);
    if (hi >= 0) return hi;
    const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]); const P = selPad();
    const L = x0 - P, R = x1 + P, T = y0 - P, B = y1 + P, M = 9;
    const inX = x > L + M && x < R - M, inY = y > T + M && y < B - M;
    if (hs[4] && inX && Math.abs(y - T) < 6) return 4;
    if (hs[5] && inY && Math.abs(x - R) < 6) return 5;
    if (hs[6] && inX && Math.abs(y - B) < 6) return 6;
    if (hs[7] && inY && Math.abs(x - L) < 6) return 7;
    return -1;
  }
  const handleCursor = (hi) => resizeCursor([45, 135, 45, 135, 90, 0, 90, 0][hi] || 0);
  // «Запекаем» растяжение по осям в геометрию объекта (чтобы линии не становились толще с одной стороны)
  function bakeStretch(it, ov) {
    const kx = ov.kx, ky = ov.ky;
    const x = ov.ax + (it.x - ov.ax) * kx, y = ov.ay + (it.y - ov.ay) * ky;
    switch (it.type) {
      case 'text': case 'tex': return { x, y };
      case 'stroke': return { x, y, pts: encodePts(decodePts(it).map(([px, py, pr]) => [px * kx, py * ky, pr]), it.q || 10) };
      case 'line': case 'arrow': return { x, y, x1: it.x1 * kx, y1: it.y1 * ky, x2: it.x2 * kx, y2: it.y2 * ky };
      case 'poly': return { x, y, pts: it.pts.map(([px, py]) => [px * kx, py * ky]) };
      default: return { x, y, w: it.w * kx, h: it.h * ky };
    }
  }
  function topHit(wx, wy, tolPx = 7, allowLocked = false) {
    const a = pageItems(); const tol = tolPx / S.view.z;
    for (let i = a.length - 1; i >= 0; i--) {
      const it = a[i];
      if (it.locked && !allowLocked) continue;
      if (hitItem(it, wx, wy, tol)) return it;
    }
    return null;
  }

  // ---------- ввод ----------
  let gesture = null, hover = null, penSeenAt = 0;
  const touches = new Map();
  let pinch = null;
  function readPoint(e, kind) {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    let p = e.pressure;
    let real = kind === 'pen';
    if (kind === 'mouse' && p > 0 && p !== 0.5) real = true; // планшет без Windows Ink
    if (!real) p = 0.5;
    else { if (!(p > 0)) p = 0.01; p = Math.pow(p, prefs.gamma); }
    return [wx, wy, p, e.clientX, e.clientY];
  }
  function eraserRadius() { return sz('eraser') / 2; }
  function currentColor() { return S.tool === 'hl' ? prefs.hlColor : prefs.penColor; }

  cvOver.addEventListener('pointerdown', onDown, { passive: false });
  cvOver.addEventListener('pointermove', onMove, { passive: false });
  cvOver.addEventListener('pointerup', onUp, { passive: false });
  cvOver.addEventListener('pointercancel', onUp, { passive: false }); // Windows иногда отменяет перо у края экрана — сохраняем штрих, а не теряем
  cvOver.addEventListener('lostpointercapture', (e) => { if (gesture && gesture.pid === e.pointerId) onUp(e); });
  const dropHover = () => { if (S.hoverShape && !gesture) { S.hoverShape = null; S.hoverShapeKey = ''; invalidate(false); } if (hover && !gesture) { hover = null; lastPtr = null; invalidate(false); } };
  window.addEventListener('pointermove', (e) => { if (e.target !== cvOver) dropHover(); }, true);
  window.addEventListener('pointerdown', (e) => { if (e.target !== cvOver) dropHover(); }, true);
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) dropHover(); });
  document.addEventListener('mouseleave', dropHover);
  cvOver.addEventListener('pointerleave', (e) => { if (e.pointerType === 'pen') lastPenHover = null; if (!gesture) { lastPtr = null; hover = null; hub.broadcast({ t: 'cur', id: me.id, hide: true }); invalidate(false); } });
  cvOver.addEventListener('contextmenu', (e) => e.preventDefault());
  // средняя кнопка (колесо) — двигать доску, как в других досках; браузерную «автопрокрутку» не включаем
  for (const t of ['mousedown', 'auxclick']) cvOver.addEventListener(t, (e) => { if (e.button === 1) e.preventDefault(); });
  cvOver.addEventListener('dblclick', (e) => e.preventDefault());

  function onDown(e) {
    e.preventDefault();
    if (radialEl) { closeRadial(); if (e.button !== 2) return; }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    closePopovers();
    if (S.editingId || editorOpen) closeEditors(true);
    const kind = e.pointerType;
    if (kind === 'pen') penSeenAt = Date.now();
    if (kind === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const penMode = Date.now() - penSeenAt < 5 * 60 * 1000;
      if (touches.size >= 2) {
        if (gesture && gesture.touch) { gesture.cancel?.(); gesture = null; }
        startPinch(); return;
      }
      if (penMode || S.tool === 'hand') { gesture = panGesture(e); gesture.touch = true; return; }
    } else if (gesture) return; // уже рисуем другим указателем
    try { cvOver.setPointerCapture(e.pointerId); } catch {}
    hover = { sx: e.clientX, sy: e.clientY, kind };
    lastPtr = { sx: e.clientX, sy: e.clientY, p: 0.5, kind, ev: { shiftKey: e.shiftKey, altKey: e.altKey } };
    const pt = readPoint(e, kind);
    let g;
    const barrel = (kind === 'pen' && (e.button === 2 || (e.buttons & 2)));
    const eraserEnd = e.button === 5 || (e.buttons & 32);
    if (e.button === 1 || S.space || S.tool === 'hand' || barrel || (kind === 'mouse' && e.button === 2)) g = panGesture(e);
    else if (eraserEnd) g = eraserGesture(pt);
    else if (e.button === 0 || kind !== 'mouse') {
      const h = kind === 'pen' ? lastPenHover : null; lastPenHover = null;
      const lateMs = h ? e.timeStamp - h.t : 0, lateD = h ? Math.hypot(e.clientX - h.x, e.clientY - h.y) : 0;
      if (h && INK_TOOLS.has(S.tool) && lateMs > 45 && lateMs < 400 && lateD > 4 && lateD < 32) {
        const [hx, hy] = toWorld(h.x, h.y);
        g = inkGesture([hx, hy, pt[2], h.x, h.y], e);
        g.move(pt, e);
        STATS.lateStart = (STATS.lateStart || 0) + 1;
      } else g = toolGesture(pt, e);
    }
    if (!g) return;
    if (spring && !g.pan) spring.used = true;
    g.pid = e.pointerId; g.touch = kind === 'touch';
    gesture = g;
    invalidate(false);
  }
  // Запись сырых сигналов пера (Настройки → «Записать перо»), чтобы разобрать проблему по точным данным
  let penRec = null;
  function recEv(type, e) {
    if (!penRec) return;
    const base = { t: +e.timeStamp.toFixed(2), type, pt: e.pointerType, id: e.pointerId, b: e.buttons, btn: e.button };
    const one = (ev) => ({ ...base, t: +ev.timeStamp.toFixed(2), x: +ev.clientX.toFixed(2), y: +ev.clientY.toFixed(2), p: +ev.pressure.toFixed(4), tx: ev.tiltX, ty: ev.tiltY });
    if (type === 'move' && e.getCoalescedEvents) { const cs = e.getCoalescedEvents(); for (const c of (cs.length ? cs : [e])) penRec.ev.push(one(c)); }
    else penRec.ev.push(one(e));
    if (penRec.ev.length > 60000) stopPenRec();
  }
  function startPenRec(btn) {
    penRec = { started: new Date().toISOString(), ua: navigator.userAgent, dpr: devicePixelRatio, zoom: S.view.z, tool: S.tool, prefs: { steady: prefs.steady, gamma: prefs.gamma, thin: prefs.thin }, ev: [], btn,
      frames: [], long: [], items: items.size, ink: !!inkPresenter, screen: [W, H] };
    // долгие задачи браузера (если поддерживается) — видно, что именно тормозит
    try { penRec.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) penRec?.long.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]); }); penRec.po.observe({ type: 'longtask', buffered: false }); } catch {}
    penRec.timer = setTimeout(stopPenRec, 20000);
    penRec.badge = el('button', { class: 'rec-badge', onclick: stopPenRec }, el('span', { class: 'rec-dot' }), 'Запись пера · остановить');
    document.body.append(penRec.badge);
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave', 'pointerenter']) cvOver.addEventListener(t, recOther);
  }
  const recOther = (e) => recEv(e.type.replace('pointer', ''), e);
  function stopPenRec() {
    if (!penRec) return;
    clearTimeout(penRec.timer);
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave', 'pointerenter']) cvOver.removeEventListener(t, recOther);
    penRec.badge?.remove();
    try { penRec.po?.disconnect(); } catch {}
    const { timer, btn, badge, po, ...data } = penRec; penRec = null;
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `запись-пера-${stamp()}.json`);
    if (btn && document.body.contains(btn)) btn.textContent = 'Записать перо';
  }
  // Последняя точка, где перо висело над экраном (без касания). Windows иногда задерживает начало касания
  // (перо уже пишет, а браузер узнаёт об этом позже и в другом месте) — тогда начинаем линию отсюда.
  let lastPenHover = null;
  function onMove(e) {
    if (penRec) recEv('move', e);
    if (e.pointerType === 'pen') penSeenAt = Date.now();
    if (e.pointerType === 'pen' && !e.buttons) lastPenHover = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (e.pointerType !== 'touch') {
      const pr = readPoint(e, e.pointerType)[2];
      lastPtr = { sx: e.clientX, sy: e.clientY, p: pr, kind: e.pointerType, ev: { shiftKey: e.shiftKey, altKey: e.altKey } };
      kickAutoScroll();
    }
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { movePinch(); return; }
    }
    const kind = e.pointerType;
    if (gesture && gesture.pid === e.pointerId) {
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const list = evs.length ? evs : [e];
      for (const ev of list) gesture.move(readPoint(ev, kind), ev);
      hover = { sx: e.clientX, sy: e.clientY, kind };
      invalidate(false);
      if (inkPresenter && e.isTrusted && gesture.inkTrail) {
        const tr = gesture.inkTrail();
        if (tr) try {
          const d = 2 * tr.size * (0.5 - tr.thin * (0.5 - tr.p)) * S.view.z;
          inkPresenter.updateInkTrailStartPoint(e, { color: tr.color === '#ffffff' ? '#fefefe' : tr.color, diameter: Math.max(1, d) });
        } catch {}
      }
    } else if (!gesture) {
      if (S.space && kind !== 'touch' && !e.buttons && hover && hover.kind === kind) {
        S.view.x += e.clientX - hover.sx; S.view.y += e.clientY - hover.sy; viewChanged();
      }
      hover = { sx: e.clientX, sy: e.clientY, kind };
      if (poly) { const [wx, wy] = toWorld(e.clientX, e.clientY); poly.cur = [wx, wy]; }
      if (poly) invalidate(false);
      if (S.tool === 'select') hoverCursor(e.clientX, e.clientY);
    }
    if (kind !== 'touch' || !pinch) { const [wx, wy] = toWorld(e.clientX, e.clientY); sendCursor(wx, wy); }
  }
  function onUp(e) {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (pinch && touches.size < 2) { pinch = null; viewChanged(); } }
    if (gesture && gesture.pid === e.pointerId) {
      const g = gesture; gesture = null;
      try { cvOver.releasePointerCapture(e.pointerId); } catch {}
      if (g.finalPoint && e.type === 'pointerup' && Number.isFinite(e.clientX)) { const q = toWorld(e.clientX, e.clientY); g.finalPoint([q[0], q[1], 0.5]); }
      g.end(e);
      invalidate(!g.cheapEnd);
    }
  }
  function startPinch() {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...S.view } };
  }
  function movePinch() {
    const [a, b] = [...touches.values()]; if (!b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const v0 = pinch.view; const z = clamp(v0.z * (d / pinch.d), 0.08, 12);
    const wx = (pinch.mx - v0.x) / v0.z, wy = (pinch.my - v0.y) / v0.z;
    S.view = { z, x: mx - wx * z, y: my - wy * z };
    if (S.follow) { S.follow = null; renderStatus(); }
    invalidate(); renderZoom();
  }

  // колесо: Ctrl/щипок трекпада — масштаб; колесо мыши — масштаб (или прокрутка, см. настройки)
  cvOver.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Колесо: вверх/вниз. Shift+колесо: влево/вправо. Ctrl+колесо или щипок на тачпаде: масштаб.
    // Тачпад двумя пальцами: свободно в любую сторону (берём обе оси сразу).
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? H : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    const looksLikeMouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || (prefs.wheel === 'zoom' && looksLikeMouse && !e.shiftKey)) {
      const pinch = e.ctrlKey && !looksLikeMouse;
      zoomAt(e.clientX, e.clientY, Math.exp(-clamp(dy, -120, 120) * (pinch ? 0.01 : 0.0022)));
      return;
    }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    S.view.x -= dx; S.view.y -= dy;
    viewChanged();
  }, { passive: false });

  // курсор подсказывает, что будет: растянуть, сдвинуть
  let hoverRaf = 0, hoverXY = null;
  function hoverCursor(sx, sy) {
    hoverXY = [sx, sy];
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0; if (gesture || S.tool !== 'select' || S.space) return;
      const [x, y] = hoverXY; let c = 'default';
      const sm = shapeSel();
      const hs = sm ? shapeHit(sm, x, y) : null, hk = hs ? JSON.stringify(hs) : '';
      if (hk !== (S.hoverShapeKey || '')) { S.hoverShape = hs; S.hoverShapeKey = hk; invalidate(false); }
      if (hs) { cvOver.style.cursor = hs.mode === 'vertex' ? 'none' : moveCursor(); return; }
      const es = !sm && editSel(); const sh = es && editHit(es, x, y);
      const hv = sh && sh.mode === 'vertex' ? { id: es.it.id, i: sh.i } : null;
      if ((hv && hv.i) !== (S.hoverVert && S.hoverVert.i) || (hv && hv.id) !== (S.hoverVert && S.hoverVert.id)) { S.hoverVert = hv; invalidate(false); }
      if (sh) { cvOver.style.cursor = sh.mode === 'vertex' ? 'none' : sh.mode === 'roll' ? rotateCursor(sh.k) : 'grab'; return; }
      if (S.sel.size) {
        const bb = selectionBox();
        if (bb) {
          const hi = sm ? -1 : handleAt(bb, x, y);
          const rk = hi < 0 && !sm ? rotCornerAt(bb, x, y) : -1;
          if (rk >= 0) { cvOver.style.cursor = rotateCursor(rk); return; }
          if (hi >= 0) c = handleCursor(hi);
          else { const [wx, wy] = toWorld(x, y); if (wx >= bb[0] && wx <= bb[2] && wy >= bb[1] && wy <= bb[3]) c = moveCursor(); }
        }
      }
      if (c === 'default') { const [wx, wy] = toWorld(x, y); c = topHit(wx, wy) ? moveCursor() : selectCursor(); }
      cvOver.style.cursor = c;
    });
  }

  // Автопрокрутка у края экрана.
  // 1) Во время рисования, стирания, перетаскивания: упёрлась в край — доска сразу плавно едет, линия продолжается.
  // 2) Без нажатия: мышь или перо уткнулись в левый/правый край — доска едет вбок и разгоняется.
  let lastPtr = null, scrollRaf = 0, scrollT = 0, hoverEdgeSince = 0;
  function edgeVelocity(now) {
    if (!lastPtr || !prefs.edgePan || pinch || S.space) return [0, 0];
    const { sx, sy } = lastPtr;
    if (gesture && gesture.autoScroll) { // только перенос объектов; при рисовании и стирании доска сама не едет
      const Z = 44, ZB = 56, MAX = 900; // px/с
      const f = (d, z) => Math.pow(Math.min(1, Math.max(0, d) / z), 1.6) * MAX;
      const vx = sx < Z ? -f(Z - sx, Z) : sx > W - Z ? f(sx - (W - Z), Z) : 0;
      const vy = sy < Z ? -f(Z - sy, Z) : sy > H - ZB ? f(sy - (H - ZB), ZB) : 0;
      return [vx, vy];
    }
    if (!gesture && lastPtr.kind === 'mouse' && sy > 70 && sy < H - 8) { // перо у края — доска стоит на месте
      const Z = 6;
      const dir = sx <= Z ? -1 : sx >= W - 1 - Z ? 1 : 0;
      if (!dir) { hoverEdgeSince = 0; return [0, 0]; }
      if (!hoverEdgeSince) hoverEdgeSince = now;
      const held = (now - hoverEdgeSince) / 1000; // разгон: 250 → 1400 px/с за ~1,2 с
      return [dir * Math.min(1400, 250 + held * 950), 0];
    }
    hoverEdgeSince = 0;
    return [0, 0];
  }
  function kickAutoScroll() { if (!scrollRaf) { scrollT = 0; scrollRaf = requestAnimationFrame(autoScrollFrame); } }
  function autoScrollFrame(now) {
    scrollRaf = 0;
    const [vx, vy] = edgeVelocity(now);
    if (!vx && !vy) { scrollT = 0; return; }
    const dt = scrollT ? Math.min(0.05, (now - scrollT) / 1000) : 1 / 60; scrollT = now;
    S.view.x -= vx * dt; S.view.y -= vy * dt;
    if (gesture && gesture.autoScroll && lastPtr) {
      const [wx, wy] = toWorld(lastPtr.sx, lastPtr.sy);
      gesture.move([wx, wy, lastPtr.p, lastPtr.sx, lastPtr.sy], lastPtr.ev);
    }
    viewChanged(false); invalidate();
    scrollRaf = requestAnimationFrame(autoScrollFrame);
  }

  // ---------- жесты ----------
  function panGesture(e) {
    const sx = e.clientX, sy = e.clientY, v0 = { ...S.view }; let moved = false;
    const rightClick = e.button === 2 || (e.pointerType === 'pen' && (e.buttons & 2));
    cvOver.style.cursor = 'grabbing';
    return {
      pan: true, hideSel: false,
      move(pt) { if (Math.hypot(pt[3] - sx, pt[4] - sy) > 4) moved = true; if (!moved) return; S.view.x = v0.x + (pt[3] - sx); S.view.y = v0.y + (pt[4] - sy); viewChanged(); },
      end() {
        cvOver.style.cursor = ''; updateCursor();
        if (!rightClick || moved) return;
        const [wx, wy] = toWorld(sx, sy); const hit = topHit(wx, wy, 7, true);
        if (hit) canvasMenu(sx, sy); else radialMenu(sx, sy);
      },
    };
  }

  function toolGesture(pt, e) {
    switch (S.tool) {
      case 'pen': case 'hl': case 'dpen': return inkGesture(pt, e);
      case 'eraser': return eraserGesture(pt);
      case 'select': return selectGesture(pt, e);
      case 'line': case 'dline': case 'arrow': case 'darrow': case 'arrow2': case 'arrowin': case 'rect': case 'ellipse': case 'circle': return shapeGesture(pt);
      default: if (S.tool.startsWith('fig:')) return shapeGesture(pt);
      case 'poly': polyClick(pt); return null;
      case 'text': {
        const hit = topHit(pt[0], pt[1]);
        if (hit && hit.type === 'text') openTextEditor(hit); else openTextEditor(null, pt[0], pt[1] - sz('text') * 0.6);
        return null;
      }
      case 'tex': { const hit = topHit(pt[0], pt[1]); openTexEditor(hit && hit.type === 'tex' ? hit : null, pt[0], pt[1]); return null; }
      case 'graph': { const hit = topHit(pt[0], pt[1]); openGraphEditor(hit && hit.type === 'graph' ? hit : null, pt[0], pt[1]); return null; }
      case 'note': {
        const hit = topHit(pt[0], pt[1]);
        if (hit && hit.type === 'note') { openTextEditor(hit); return null; }
        const id = uid();
        act(() => addItem({ id, type: 'note', page: S.page, z: zTop(S.page), x: pt[0] - 110, y: pt[1] - 30, s: 1, w: 220, h: 200, bg: '#fff3bf', text: '', fs: 20, color: '#212529' }));
        openTextEditor(items.get(id));
        return null;
      }
      case 'image': pickFile(pt); return null;
    }
    return null;
  }

  // перо и маркер
  // Склейка разрыва: перо на миг теряет касание при очень лёгком нажиме. Признак — почти мгновенное
  // повторное касание почти в той же точке. Быстрые пунктиры сюда не попадают: у них и пауза, и шаг больше.
  let lastInk = null;
  const REJOIN_MS = 35, REJOIN_PX = 4;
  function inkGesture(pt, e) {
    const kind = S.tool === 'hl' ? 'hl' : S.tool === 'dpen' ? 'dash' : 'pen';
    const real = e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.pressure > 0 && e.pressure !== 0.5);
    const now0 = e.timeStamp || performance.now();
    const color = currentColor(), size = kind === 'dash' ? sz('pen') * 0.9 : sz(kind);
    const L = lastInk;
    const rejoin = L && now0 - L.t < REJOIN_MS && L.kind === kind && L.color === color && L.size === size && items.has(L.id) &&
      Math.hypot(pt[0] - L.end[0], pt[1] - L.end[1]) * S.view.z < REJOIN_PX;
    const sb = new StrokeBuilder({
      x: pt[0], y: pt[1], p: pt[2], t: now0, device: e.pointerType === 'pen' ? 'pen' : 'mouse',
      steady: prefs.steady, zoom: () => S.view.z, continueKeys: rejoin ? L.keys : null,
    });
    // толщина линии всегда одна и та же, нажим пера её не меняет (как маркер на доске)
    const g = { sid: uid(), kind, v: 2, color, size, thin: 0, prevId: rejoin ? L.id : null, cheapEnd: true };
    if (g.prevId) { S.hidden.add(g.prevId); STATS.rejoin = (STATS.rejoin || 0) + 1; }
    liveSend(g, sb.keys);
    g.move = (p, ev) => {
      if (ev && ev.shiftKey) { stopHold(); sb.straight(p[0], p[1]); return; }
      if (sb.straightLine) sb.unstraight();
      const f = sb.add(p[0], p[1], p[2], (ev && ev.timeStamp) || performance.now());
      if (!sb.isDot) stopHold();
      if (f) liveSend(g, [f]);
    };
    g.drawOver = (c) => {
      c.fillStyle = g.color; c.globalAlpha = kind === 'hl' ? 0.38 : 1;
      // пунктир: те же координаты, что попадут в сохранённую линию (шаг 0,1) — штрихи не сдвигаются при отпускании
      const lv = sb.live(kind !== 'dash');
      paintInk(c, g, kind === 'dash' ? lv.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, q[2]]) : lv, true);
      c.globalAlpha = 1;
    };
    g.finalPoint = (p) => { if (kind !== 'dash') sb.end(p[0], p[1]); };
    g.inkTrail = () => (!sb.isDot && !sb.straightLine && kind === 'pen' ? { color: g.color, size: g.size, thin: g.thin, p: sb.lastPressure() } : null);
    g.dbg = () => { const geo = sb.geometry(); return { body: geo[geo.length - 1], tip: sb.tip, raw: sb.raw, inSlop: sb.isDot }; };
    const stopHold = () => {}; // удержание пера больше не включает выделение — можно спокойно думать, не убирая ручку
    g.end = () => {
      stopHold();
      const pts = kind === 'dash' && !sb.isDot && !sb.straightLine ? sb.live(false).map((q) => q.slice(0, 3)) : sb.final(); // пунктир — как на экране, без пересглаживания
      let x0 = Infinity, y0 = Infinity;
      for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); }
      const q = S.view.z >= 2 ? 100 : 10; // при сильном увеличении храним точнее — маленькие буквы и кружки без «граней»
      x0 = Math.floor(x0 * q) / q; y0 = Math.floor(y0 * q) / q; // начало на сетке хранения — точки не сдвигаются при сохранении
      const local = pts.map((q) => [q[0] - x0, q[1] - y0, q[2]]);
      const id = uid(); const prev = g.prevId ? items.get(g.prevId) : null;
      act(() => {
        if (prev) yItems.delete(prev.id);
        addItem({ id, type: 'stroke', page: S.page, z: prev ? prev.z : zTop(S.page), x: x0, y: y0, s: 1, color: g.color, size: g.size, kind, v: 2, thin: g.thin, ...(q === 100 ? { q } : {}), pts: encodePts(local, q) });
      });
      if (g.prevId) S.hidden.delete(g.prevId);
      lastInk = { id, t: performance.now(), kind, color: g.color, size: g.size, keys: sb.keys, end: sb.isDot ? [sb.start[0], sb.start[1]] : [sb.raw[0], sb.raw[1]] };
      liveEnd(g);
    };
    g.cancel = () => { stopHold(); if (g.prevId) S.hidden.delete(g.prevId); liveEnd(g); };
    return g;
  }

  // ластик: целиком (по умолчанию) или точный (разрезает штрихи)
  // Ластик: целиком (по умолчанию) или точный — режет и линии, и фигуры ровно по своему кругу.
  // Точный: часть линии исчезает, если её чернила заходят в круг; края обрезаются точно по окружности.
  // длина пути от начала до каждой точки (4-я координата) — чтобы куски пунктира сохраняли свой рисунок
  function withArc(pts, s0 = 0) {
    let L = s0; return pts.map((q, i) => { if (i) L += Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]); return [q[0], q[1], q[2] ?? 1, L]; });
  }
  function clipOut(pts, cx, cy, R, hw, merge = true) {
    // R — радиус ластика, hw(p) — полуширина линии при нажиме p (край чернил, а не середина)
    const runs = []; let run = []; let changed = false;
    const rad = (p) => R + hw(p ?? 1);
    if (pts.length === 1) { const q = pts[0]; return Math.hypot(q[0] - cx, q[1] - cy) < rad(q[2]) ? { runs: [], changed: true } : { runs: [pts], changed: false }; }
    const a0 = pts[0];
    if (Math.hypot(a0[0] - cx, a0[1] - cy) < rad(a0[2])) changed = true; else run.push(a0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - cx, fy = a[1] - cy;
      const Rr = rad(((a[2] ?? 1) + (b[2] ?? 1)) / 2);
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - Rr * Rr;
      let s0 = 1, s1 = 0;
      if (A > 1e-12) { const disc = B * B - 4 * A * C; if (disc > 0) { const sq = Math.sqrt(disc); s0 = Math.max(0, (-B - sq) / (2 * A)); s1 = Math.min(1, (-B + sq) / (2 * A)); } }
      else if (C < 0) { s0 = 0; s1 = 1; }
      const lerp = (t) => a.map((v, k) => v + ((b[k] ?? v) - v) * t);
      if (s0 < s1) {
        changed = true;
        if (s0 > 0) run.push(lerp(s0));
        if (run.length) runs.push(run);
        run = s1 < 1 ? [lerp(s1), b] : [];
      } else run.push(b);
    }
    if (run.length) runs.push(run);
    // замкнутый контур (прямоугольник, эллипс): кусок через «шов» в начале — одна линия, а не две
    const z = pts[pts.length - 1];
    if (merge && changed && runs.length >= 2 && Math.hypot(a0[0] - z[0], a0[1] - z[1]) < 1e-9 && runs[0][0] === a0 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === z) {
      const lastRun = runs.pop(); runs[0] = [...lastRun, ...runs[0].slice(1)];
    }
    const len = (r) => { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); return L; };
    return { runs: changed ? runs.filter((r) => r.length >= 2 && len(r) > 0.05) : runs, changed };
  }
  // Одно касание ластика в точке (wx, wy) радиуса r. st — куда складывать результат: {hidden, pieces}.
  // Тем же кодом у собеседника повторяется стирание по ходу (по присланным точкам).
  function eraseApply(st, wx, wy, r, precise) {
    for (const it of pageItems()) {
      if (it.locked || st.hidden.has(it.id)) continue;
      if (it.type === 'image') { continue; }
      const isStroke = it.type === 'stroke', isShape = ERASABLE_SHAPES.has(it.type);
      if (precise && (isStroke || isShape)) {
        const s = it.s || 1; const lx = (wx - it.x) / s, ly = (wy - it.y) / s, lr = r / s;
        const lb = localBox(it);
        if (lx < lb[0] - lr || ly < lb[1] - lr || lx > lb[2] + lr || ly > lb[3] + lr) continue;
        let next = []; let changed = false;
        if (isStroke) {
          // полуширина пера при нажиме p (как в perfect-freehand), у пунктира и маркера — постоянная
          const thin = it.kind === 'pen' ? (it.thin ?? 0.5) : 0;
          const hw = (p) => it.size * Math.max(0.05, 0.5 - thin * (0.5 - p));
          const dash = it.kind === 'dash';
          for (const piece of st.pieces.get(it.id) || [dash ? withArc(decodePts(it), it.doff || 0) : decodePts(it)]) { const c = clipOut(piece, lx, ly, lr, hw, !dash); if (c.changed) changed = true; next.push(...c.runs); }
          if (changed) {
            const one = decodePts(it).length === 1;
            const kept = next.filter((r2) => r2.length >= 2 || one);
            if (!kept.length) { st.hidden.add(it.id); st.pieces.delete(it.id); } else st.pieces.set(it.id, kept);
          }
        } else {
          let cur = st.pieces.get(it.id);
          if (!cur) { const sp = shapePolys(it); cur = [...sp.polys.map((pc) => ({ ...pc, pts: withArc(pc.pts, it.type === 'poly' ? it.doff || 0 : 0) })), ...sp.texts.map((t) => ({ text: true, ...t }))]; }
          for (const pc of cur) {
            if (pc.text) { next.push(pc); continue; }
            const c = clipOut(pc.pts, lx, ly, lr, () => pc.w / 2, !pc.dash);
            if (c.changed) changed = true;
            for (const rn of c.runs) next.push({ pts: rn, dash: pc.dash, w: pc.w });
          }
          if (changed) {
            if (!next.some((pc) => !pc.text)) { st.hidden.add(it.id); st.pieces.delete(it.id); } else st.pieces.set(it.id, next);
          }
        }
      } else if (isStroke || isShape) {
        // целиком: линия или фигура исчезает, только если её чернила реально заходят в круг ластика
        const s = it.s || 1; const lx = (wx - it.x) / s, ly = (wy - it.y) / s, lr = r / s;
        const lb = localBox(it);
        if (lx < lb[0] - lr || ly < lb[1] - lr || lx > lb[2] + lr || ly > lb[3] + lr) continue;
        let hit = false;
        if (isStroke) {
          const thin = it.kind === 'pen' ? (it.thin ?? 0.5) : 0;
          hit = clipOut(decodePts(it), lx, ly, lr, (p) => it.size * Math.max(0.05, 0.5 - thin * (0.5 - p))).changed;
        } else {
          const filled = it.fill && (it.type === 'rect' || it.type === 'ellipse' || (it.type === 'poly' && it.closed));
          hit = (filled && hitItem(it, wx, wy, 0)) || shapePolys(it).polys.some((pc) => clipOut(pc.pts, lx, ly, lr, () => pc.w / 2).changed);
        }
        if (hit) st.hidden.add(it.id);
      } else if (hitItem(it, wx, wy, r)) st.hidden.add(it.id);
    }
  
  }
  function eraserGesture(pt) {
    const precise = prefs.eraserPrecise;
    S.hidden = new Set(); S.pieces = precise ? new Map() : null;
    let last = pt;
    const g = { isEraser: true, sid: uid(), precise };
    g.pvEraser = () => (precise ? { sid: g.sid, pts: trail } : null);
    const rec = (p) => { trail.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(eraserRadius() / S.view.z * 100) / 100]); };
    const trail = []; // точки ластика — собеседник повторяет по ним стирание
    const apply = (wx, wy) => { eraseApply(S, wx, wy, eraserRadius() / S.view.z, precise); };
    // круги ластика ставим часто (через 0,3 радиуса) — край стёртого ровный, без зубцов
    const step = (p) => {
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]); const r = eraserRadius() / S.view.z;
      const n = Math.max(1, Math.ceil(d / (r * 0.3)));
      for (let i = 1; i <= n; i++) apply(last[0] + ((p[0] - last[0]) * i) / n, last[1] + ((p[1] - last[1]) * i) / n);
      last = p; rec(p); invalidate();
    };
    apply(pt[0], pt[1]); rec(pt); invalidate();
    g.move = (p) => step(p);
    g.end = () => {
      const hidden = S.hidden, pieces = S.pieces;
      S.hidden = new Set(); S.pieces = null;
      if (!hidden.size && !(pieces && pieces.size)) return;
      act(() => {
        for (const id of hidden) yItems.delete(id);
        if (pieces) for (const [id, list] of pieces) {
          const it = items.get(id); if (!it) continue;
          yItems.delete(id);
          if (it.type === 'stroke') { list.forEach((p, k) => addItem({ ...it, id: uid(), z: it.z + k * 1e-6, pts: encodePts(p, it.q || 10), ...(it.kind === 'dash' && p[0][3] != null ? { doff: p[0][3] } : {}) })); continue; }
          // фигура распалась на куски — каждый кусок становится ломаной того же цвета, толщины и вида
          const base = { page: it.page, x: it.x, y: it.y, s: it.s || 1, color: it.color };
          list.forEach((pc, k) => {
            if (pc.text) { addItem({ ...base, id: uid(), type: 'text', z: it.z + k * 1e-6, x: it.x + (pc.x - pc.fs * 0.3) * (it.s || 1), y: it.y + (pc.y - pc.fs * 0.6) * (it.s || 1), s: it.s || 1, fs: pc.fs, text: pc.s }); return; }
            addItem({ ...base, id: uid(), type: 'poly', z: it.z + k * 1e-6, size: pc.w, dash: !!pc.dash, ...(pc.dash ? { doff: pc.pts[0][3] || 0, dfig: pc.dash === 'fig' } : {}), closed: false, pts: pc.pts.map(([x, y]) => [x, y]) });
          });
        }
      });
    };
    g.cancel = () => { S.hidden = new Set(); S.pieces = null; };
    return g;
  }
  function densify(pts, step) {
    if (pts.length < 2) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.floor(d / step);
      for (let k = 1; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
      out.push(b);
    }
    return out;
  }

  // фигуры
  function shapeGesture(pt) {
    const tool = S.tool; const color = prefs.penColor; const size = sz('shape') * 0.9;
    let cur = pt, shift = false;
    const isFig = tool.startsWith('fig:');
    const clickOnly = () => Math.hypot(cur[3] - pt[3], cur[4] - pt[4]) < 4;
    const geom = () => {
      let [x0, y0] = pt, [x1, y1] = cur;
      if (LINE_TOOLS.has(tool)) {
        if (shift) { const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 12)) * (Math.PI / 12); const d = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + d * Math.cos(a); y1 = y0 + d * Math.sin(a); }
        const kind = ARROW_KINDS[tool] ? { type: 'arrow', ...ARROW_KINDS[tool] } : { type: 'line', ...(tool === 'dline' ? { dash: true } : {}) };
        return { ...kind, x: x0, y: y0, x1: 0, y1: 0, x2: x1 - x0, y2: y1 - y0 };
      }
      if (tool === 'circle') { const r = Math.hypot(x1 - x0, y1 - y0); return { type: 'ellipse', center: true, x: x0 - r, y: y0 - r, w: 2 * r, h: 2 * r }; }
      let w = x1 - x0, h = y1 - y0;
      const aspect = isFig ? FIGS[tool.slice(4)]?.aspect : null;
      if (isFig && clickOnly()) { const d = 160 / Math.max(S.view.z, 0.5); const hh = aspect ? d * aspect : d; return { type: 'fig', kind: tool.slice(4), x: x0 - d / 2, y: y0 - hh / 2, w: d, h: hh }; }
      if (aspect) { const m = Math.max(Math.abs(w), Math.abs(h) / aspect); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m * aspect; }
      if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      const box = { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
      return isFig ? { type: 'fig', kind: tool.slice(4), ...box } : { type: tool, ...box };
    };
    const g = {
      move(p, ev) { cur = p; shift = !!(ev && ev.shiftKey); },
      pvTmp() { return clickOnly() ? [] : [{ ...geom(), color, size, s: 1, id: '_pv' }]; },
      drawOver(c) {
        if (clickOnly()) return; // пока не потянули — ничего не показываем: отпустишь сразу — встанет правильная, потянешь — твоя
        const it = { ...geom(), color, size, s: 1, id: '_preview' };
        drawItem(c, it, null, S.view.z);
        if (tool === 'circle') { c.strokeStyle = color; c.globalAlpha = 0.5; c.lineWidth = 1 / S.view.z; c.setLineDash([6 / S.view.z, 4 / S.view.z]); c.beginPath(); c.moveTo(pt[0], pt[1]); c.lineTo(cur[0], cur[1]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
      },
      end() {
        // щелчок по пустому месту в основной фигуре — к ручке (фигуры из списка ставятся щелчком)
        if (clickOnly() && !isFig) { setTool('pen', { noToggle: true }); return; }
        const id = uid();
        act(() => addItem({ id, page: S.page, z: zTop(S.page), s: 1, color, size, ...geom() }));
        // линии и стрелки обычно рисуют подряд — инструмент остаётся
        // основные фигуры: выделение → щелчок по пустому → снова эта фигура → ещё щелчок → ручка
        if (!LINE_TOOLS.has(tool)) selectNew(id); // выделение → щелчок по пустому месту → ручка
      },
    };
    return g;
  }

  // многоугольник по точкам
  let poly = null; // {pts:[[x,y]], cur:[x,y], t}
  function polyClick(pt) {
    const now = Date.now(); const close = 10 / S.view.z;
    if (!poly) { poly = { pts: [[pt[0], pt[1]]], cur: [pt[0], pt[1]], t: now, color: prefs.penColor, size: sz('shape') * 0.9 }; invalidate(false); return; }
    const first = poly.pts[0], last = poly.pts[poly.pts.length - 1];
    if (poly.pts.length >= 3 && Math.hypot(pt[0] - first[0], pt[1] - first[1]) < close) { finishPoly(true); return; }
    if (now - poly.t < 350 && Math.hypot(pt[0] - last[0], pt[1] - last[1]) < close) { finishPoly(false); return; }
    poly.pts.push([pt[0], pt[1]]); poly.t = now; invalidate(false);
  }
  function finishPoly(closed) {
    const p = poly; poly = null; invalidate(false);
    if (!p || p.pts.length < 2) return;
    let x0 = Infinity, y0 = Infinity; for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
    const id = uid();
    act(() => addItem({ id, type: 'poly', page: S.page, z: zTop(S.page), x: x0, y: y0, s: 1, color: p.color, size: p.size, closed: closed && p.pts.length >= 3, pts: p.pts.map(([x, y]) => [x - x0, y - y0]) }));
    selectNew(id);
  }
  function drawPolyPreview(c) {
    if (!poly) return;
    c.strokeStyle = poly.color; c.lineWidth = poly.size; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); poly.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    c.globalAlpha = 0.5; c.setLineDash([6 / S.view.z, 4 / S.view.z]); c.beginPath();
    const l = poly.pts[poly.pts.length - 1]; c.moveTo(l[0], l[1]); c.lineTo(poly.cur[0], poly.cur[1]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    const f = poly.pts[0]; const near = poly.pts.length >= 3 && Math.hypot(poly.cur[0] - f[0], poly.cur[1] - f[1]) < 10 / S.view.z;
    c.fillStyle = near ? '#4c6ef5' : '#fff'; c.strokeStyle = '#4c6ef5'; c.lineWidth = 1.5 / S.view.z;
    for (const [x, y] of poly.pts) { c.beginPath(); c.arc(x, y, 4 / S.view.z, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#fff'; }
  }

  // выделение: клик, рамка/лассо, перенос, масштаб, двойной клик — редактирование
  let lastClick = { t: 0, id: null };
  // ---------- поворот и вершины у одной выделенной фигуры ----------
  // solid — стереометрия (3D), line — отрезок/стрелка (концы), poly — многоугольники (вершины), rot — эллипс и прочее (только поворот)
  const ROT_R = 13; // радиус дуг поворота вокруг углов рамки
  const POLY_FIGS = new Set(['triangle', 'eqtriangle', 'rtriangle', 'square', 'parallelogram', 'trapezoid', 'rhombus', 'pentagon', 'hexagon']);
  function editKind(it) {
    if (!it || it.locked) return null;
    if (it.type === 'fig' && SOLID_KINDS.has(it.kind)) return 'solid';
    if (it.type === 'line' || it.type === 'arrow') return 'line';
    if (it.type === 'rect' || (it.type === 'poly' && it.pts.length >= 2) || (it.type === 'fig' && POLY_FIGS.has(it.kind))) return 'poly';
    if (it.type === 'ellipse' || it.type === 'fig') return 'rot';
    return null;
  }
  function editSel() { if (S.sel.size !== 1) return null; const it = items.get([...S.sel][0]); const k = editKind(it); return k ? { it, k } : null; }
  const solidSel = () => { const e = editSel(); return e && e.k === 'solid' ? e.it : null; };
  // ---------- правка формы (двойной щелчок): рамки нет, видны вершины, сторону можно тянуть целиком ----------
  const hasShape = (e) => !!e && (e.k === 'poly' || e.k === 'line' || (e.k === 'solid' && solidHandles(e.it).length > 0));
  function shapeSel() {
    if (!S.shapeEdit) return null;
    const e = editSel();
    if (!e || e.it.id !== S.shapeEdit || !hasShape(e)) { S.shapeEdit = null; S.hoverShape = null; return null; }
    return e;
  }
  function setShapeEdit(id) {
    S.shapeEdit = id || null; S.hoverShape = null; S.hoverShapeKey = ''; S.hoverVert = null;
    if (id) S.sel = new Set([id]);
    updateSelBar(); invalidate(false); updateCursor();
  }
  function editEdges(it, k) {
    if (k === 'solid') return solidEdges(it);
    if (k !== 'poly') return [];
    const n = polyLocal(it).length, closed = it.type !== 'poly' || !!it.closed;
    const E = []; for (let i = 0; i < n - 1; i++) E.push([i, i + 1]);
    if (closed && n > 2) E.push([n - 1, 0]);
    return E;
  }
  // сдвиг стороны: свободно; Shift — только по горизонтали или вертикали
  function alongEdge(dx, dy, a, b, ev) {
    if (ev && ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    return [dx, dy];
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  // что под курсором в режиме правки формы: вершина (10 px) или сторона (7 px)
  function shapeHit(e, x, y) {
    const V = editVerts(e.it, e.k).map((v) => ({ i: v.i, p: toScreen(v.w[0], v.w[1]) }));
    let best = null, bd = 10;
    for (const v of V) { const d = Math.hypot(v.p[0] - x, v.p[1] - y); if (d < bd) { bd = d; best = { mode: 'vertex', i: v.i }; } }
    if (best) return best;
    const P = new Map(V.map((v) => [v.i, v.p])); bd = 7;
    for (const [a, b] of editEdges(e.it, e.k)) { const pa = P.get(a), pb = P.get(b); if (!pa || !pb) continue; const d = segDist([x, y], pa, pb); if (d < bd) { bd = d; best = { mode: 'edge', a, b }; } }
    return best;
  }
  // точки на всех вершинах; та, что под курсором (или концы стороны) — залитые, сторона подсвечена
  function drawShapeOverlay(c, it, k, hot) {
    const V = new Map(editVerts(it, k).map((v) => [v.i, toScreen(v.w[0], v.w[1])]));
    c.save(); c.lineCap = 'round';
    if (hot && hot.mode === 'edge') { const a = V.get(hot.a), b = V.get(hot.b); if (a && b) { c.strokeStyle = 'rgba(76,110,245,.5)'; c.lineWidth = 6; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } }
    for (const [i, p] of V) {
      const on = hot && (hot.mode === 'vertex' ? hot.i === i : hot.mode === 'edge' && (hot.a === i || hot.b === i));
      c.fillStyle = on ? '#4c6ef5' : '#fff'; c.strokeStyle = on ? '#fff' : '#4c6ef5'; c.lineWidth = 2;
      c.beginPath(); c.arc(p[0], p[1], on ? 6 : 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
  }
  // вершины многоугольника в его собственных координатах
  function polyLocal(it) {
    if (it.type === 'rect') return [[0, 0], [it.w, 0], [it.w, it.h], [0, it.h]];
    if (it.type === 'poly') return it.pts;
    return figPrims(it).filter((p) => p.t === 'l').map((p) => [p.a[0] * it.w, p.a[1] * it.h]);
  }
  function editVerts(it, k) { // [{i, w:[x,y] мир}]
    const s = it.s || 1, W = (px, py) => [it.x + px * s, it.y + py * s];
    if (k === 'line') return [{ i: 0, w: W(it.x1, it.y1) }, { i: 1, w: W(it.x2, it.y2) }];
    if (k === 'poly') return polyLocal(it).map(([px, py], i) => ({ i, w: W(px, py) }));
    if (k === 'solid') return solidHandles(it).map(({ i, p }) => ({ i, w: W(p[0], p[1]) }));
    return [];
  }
  function editHandlesScreen(e) {
    const bb = selectionBox(); const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]); const P = selPad();
    const big = x1 - x0 > 34 || y1 - y0 > 34;
    const corners = [[x0 - P, y0 - P], [x1 + P, y0 - P], [x1 + P, y1 + P], [x0 - P, y1 + P]];
    return {
      corners, rot: corners.map(([x, y], k) => { const m = [-3, -1, 1, 3][k] * Math.PI / 4; return [x + ROT_R * Math.cos(m), y + ROT_R * Math.sin(m)]; }), // середина дуги
      orbit: e.k === 'solid' ? [(x0 + x1) / 2, y1 + selPad() + 26] : null, c: [(x0 + x1) / 2, (y0 + y1) / 2],
      verts: e.k === 'line' ? editVerts(e.it, e.k).map((v) => ({ i: v.i, p: toScreen(v.w[0], v.w[1]) })) : [],
    };
  }
  function editHit(e, x, y) {
    const H = editHandlesScreen(e); const d = (p) => Math.hypot(p[0] - x, p[1] - y);
    let best = null, bd = 9;
    for (const v of H.verts) { const dv = d(v.p); if (dv < bd) { bd = dv; best = { mode: 'vertex', i: v.i }; } }
    const hs = handles(selectionBox()).filter(Boolean); // ручка размера ближе вершины — значит, тянут размер
    if (best && hs.some((h) => d(h) < bd)) best = null;
    if (best) return best;
    // поворот — зона чуть снаружи угла рамки (на самом квадратике — изменение размера)
    if (hs.some((h) => Math.abs(h[0] - x) < 8 && Math.abs(h[1] - y) < 8)) return null;
    const out = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [cx, cy] = H.corners[k], dc = Math.hypot(x - cx, y - cy);
      if (dc > 4 && dc < ROT_ZONE && (x - cx) * out[k][0] > -6 && (y - cy) * out[k][1] > -6) return { mode: 'roll', c: H.c, k };
    }
    if (H.orbit && d(H.orbit) < 12) return { mode: 'orbit' };
    return null;
  }
  const solidHit = (it, x, y) => editHit({ it, k: 'solid' }, x, y);
  function drawEditHandles(c, e) {
    const H = editHandlesScreen(e);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (H.orbit) {
      const [ox, oy] = H.orbit;
      c.fillStyle = '#fff'; c.strokeStyle = '#4c6ef5'; c.lineWidth = 1.4; c.beginPath(); c.arc(ox, oy, 10, 0, Math.PI * 2); c.fill(); c.stroke();
      c.lineWidth = 1.6; c.beginPath(); c.ellipse(ox, oy, 6, 2.6, 0, 0.3, Math.PI * 2 - 0.7); c.stroke();
      c.beginPath(); c.moveTo(ox + 3.4, oy - 4.4); c.lineTo(ox + 6.2, oy - 1.2); c.lineTo(ox + 2.6, oy); c.stroke();
      c.beginPath(); c.moveTo(ox, oy - 6); c.lineTo(ox, oy + 6); c.stroke();
    }
    for (const v of H.verts) {
      const hot = S.hoverVert && S.hoverVert.id === e.it.id && S.hoverVert.i === v.i;
      if (e.k === 'line' && !hot) continue; // у линии точки на концах не рисуем — их видно, когда подводишь курсор
      c.fillStyle = hot ? '#4c6ef5' : '#fff'; c.strokeStyle = hot ? '#fff' : '#4c6ef5'; c.lineWidth = 2;
      c.beginPath(); c.arc(v.p[0], v.p[1], hot ? 6 : 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
  }
  // Точка вершины, за которую тянут: крупная, залитая, ровно на вершине
  function vertexDot(c, x, y) { c.save(); c.fillStyle = '#4c6ef5'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); }
  function drawAngleTag() {} // подписи угла при повороте нет — не нужна
  // Поворот и вершины у плоских фигур
  function editGesture(e, hit, pt) {
    if (e.k === 'solid') return solidGesture(e.it, hit, pt);
    const it = e.it, k = e.k, s = it.s || 1;
    const { _lb, _segs, _sv, _pts, _path, ...clean } = it;
    const V0 = editVerts(it, k).map((v) => v.w);
    const wc = toWorld(hit.c ? hit.c[0] : 0, hit.c ? hit.c[1] : 0);
    const ang = (p) => Math.atan2(p[1] - wc[1], p[0] - wc[0]) * 180 / Math.PI;
    const rot0 = it.rot || 0;
    let tmp = clean, moved = false, shown = 0, last = pt;
    S.hidden = new Set([it.id]); invalidate();
    const inShape = S.shapeEdit === it.id;
    cvOver.style.cursor = hit.mode === 'vertex' ? 'none' : hit.mode === 'edge' ? moveCursor() : rotateCursor(hit.k);
    // центр вращения многоугольника и отрезка — середина рамки вершин
    const vc = (() => { const xs = V0.map((q) => q[0]), ys = V0.map((q) => q[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; })();
    const rotW = (W, d) => { const r = d * Math.PI / 180, c = Math.cos(r), si = Math.sin(r); return W.map(([x, y]) => [vc[0] + (x - vc[0]) * c - (y - vc[1]) * si, vc[1] + (x - vc[0]) * si + (y - vc[1]) * c]); };
    const fromWorld = (W) => {
      if (k === 'line') return { ...clean, x1: (W[0][0] - it.x) / s, y1: (W[0][1] - it.y) / s, x2: (W[1][0] - it.x) / s, y2: (W[1][1] - it.y) / s };
      // многоугольник: прямоугольник и фигуры из списка становятся многоугольником по вершинам
      const x0 = Math.min(...W.map((q) => q[0])), y0 = Math.min(...W.map((q) => q[1]));
      const out = { id: it.id, type: 'poly', page: it.page, z: it.z, x: x0, y: y0, s: 1, color: it.color, size: it.size, closed: it.type === 'poly' ? !!it.closed : true, pts: W.map(([x, y]) => [x - x0, y - y0]) };
      if (it.dash) { out.dash = true; if (it.doff) out.doff = it.doff; if (it.dfig) out.dfig = true; }
      if (it.fill) out.fill = true;
      const fk = it.type === 'fig' ? it.kind : it.type === 'rect' ? 'rect' : it.fk; if (fk) out.fk = fk;
      return out;
    };
    return {
      hideSel: true,
      pvTmp: () => [tmp],
      move(p, ev) {
        moved = true; last = p;
        if (hit.mode === 'vertex') {
          const W = V0.map((q) => q.slice()); let nx = V0[hit.i][0] + p[0] - pt[0], ny = V0[hit.i][1] + p[1] - pt[1];
          if (k === 'line' && ev && ev.shiftKey) { // Shift — направление шагом 15°
            const o = V0[1 - hit.i], L = Math.hypot(nx - o[0], ny - o[1]), a = Math.round(Math.atan2(ny - o[1], nx - o[0]) / (Math.PI / 12)) * (Math.PI / 12);
            nx = o[0] + L * Math.cos(a); ny = o[1] + L * Math.sin(a);
          }
          W[hit.i] = [nx, ny]; tmp = fromWorld(W);
        } else if (hit.mode === 'edge') { // сторона едет целиком, остальное на месте; Shift — только по горизонтали или вертикали
          let [dx, dy] = alongEdge(p[0] - pt[0], p[1] - pt[1], V0[hit.a], V0[hit.b], ev);
          const W = V0.map((q) => q.slice()); for (const j of [hit.a, hit.b]) W[j] = [V0[j][0] + dx, V0[j][1] + dy];
          tmp = fromWorld(W);
        } else {
          let d = ang(p) - ang(pt); if (d > 180) d -= 360; if (d < -180) d += 360;
          if (k === 'rot') { let r = rot0 + d; if (ev && ev.shiftKey) r = Math.round(r / 15) * 15; tmp = { ...clean, rot: Math.round(r * 10) / 10 }; shown = r; }
          else { if (ev && ev.shiftKey) d = Math.round(d / 15) * 15; tmp = fromWorld(rotW(V0, d)); shown = d; }
        }
        invalidate(false);
      },
      drawOver(c) { drawItem(c, tmp, null, S.view.z); },
      drawScreen(c) {
        if (inShape) drawShapeOverlay(c, tmp, k, hit);
        else if (hit.mode === 'vertex') { const v = editVerts(tmp, k)[hit.i] || null; if (v) vertexDot(c, ...toScreen(v.w[0], v.w[1])); }
      },
      end() {
        S.hidden = new Set(); updateCursor();
        if (!moved) { invalidate(); return; }
        act(() => {
          if (tmp.type === 'poly' && it.type !== 'poly') { yItems.delete(it.id); addItem(tmp); } // стал многоугольником — тот же id, выделение остаётся
          else if (tmp.type === 'poly') setFields(it.id, { x: tmp.x, y: tmp.y, s: 1, pts: tmp.pts });
          else if (k === 'line') setFields(it.id, { x1: tmp.x1, y1: tmp.y1, x2: tmp.x2, y2: tmp.y2 });
          else setFields(it.id, { rot: tmp.rot });
        });
        S.sel = new Set([it.id]); invalidate();
      },
      cancel() { S.hidden = new Set(); invalidate(); },
    };
  }
  // Поворот на доске (roll), поворот в пространстве (orbit), перетаскивание вершины (vertex). Shift — шаг 15°.
  function solidGesture(it, hit, pt) {
    const base = prepared(it); const v0 = viewOf(base); const s = it.s || 1;
    let tmp = base, moved = false, lastS = [pt[3], pt[4]];
    S.hidden = new Set([it.id]); invalidate();
    const snap = (a, ev) => (ev && ev.shiftKey ? Math.round(a / 15) * 15 : Math.round(a * 10) / 10);
    const wc = hit.c ? toWorld(hit.c[0], hit.c[1]) : null;
    const ang = (p) => Math.atan2(p[1] - wc[1], p[0] - wc[0]) / (Math.PI / 180);
    const inShape = S.shapeEdit === it.id;
    cvOver.style.cursor = hit.mode === 'vertex' ? 'none' : hit.mode === 'edge' ? moveCursor() : hit.mode === 'roll' ? rotateCursor(hit.k) : 'grabbing';
    return {
      hideSel: true,
      pvTmp: () => [tmp],
      move(p, ev) {
        moved = true; lastS = [p[3], p[4]];
        if (hit.mode === 'vertex') {
          const m = moveVertex(base, hit.i, (p[0] - pt[0]) / s, (p[1] - pt[1]) / s);
          const pin = solidHandles(base).find((h) => h.i !== hit.i)?.i ?? 'c';
          tmp = { ...base, ...reproject(base, v0, m, pin) };
        } else if (hit.mode === 'edge') { // ребро едет целиком; Shift — только по горизонтали или вертикали
          const H0 = solidHandles(base), pa = H0.find((h) => h.i === hit.a)?.p, pb = H0.find((h) => h.i === hit.b)?.p;
          const [dx, dy] = alongEdge(p[0] - pt[0], p[1] - pt[1], pa, pb, ev);
          let m = moveVertex(base, hit.a, dx / s, dy / s); m = moveVertex({ ...base, m }, hit.b, dx / s, dy / s);
          const pin = solidHandles(base).find((h) => h.i !== hit.a && h.i !== hit.b)?.i ?? 'c';
          tmp = { ...base, ...reproject(base, v0, m, pin) };
        } else if (hit.mode === 'roll') {
          let d = ang(p) - ang(pt); if (d > 180) d -= 360; if (d < -180) d += 360;
          tmp = { ...base, ...reproject(base, { ...v0, roll: snap(v0.roll - d, ev) }, base.m) };
        } else {
          const dx = (p[3] - pt[3]), dy = (p[4] - pt[4]);
          tmp = { ...base, ...reproject(base, { ...v0, yaw: snap(v0.yaw - dx * 0.6, ev), pitch: Math.max(-85, Math.min(85, snap(v0.pitch + dy * 0.4, ev))) }, base.m) };
        }
        delete tmp._sv; invalidate(false);
      },
      drawOver(c) { drawItem(c, tmp, null, S.view.z); },
      drawScreen(c) {
        if (inShape) drawShapeOverlay(c, tmp, 'solid', hit);
        else if (hit.mode === 'vertex') { const h = solidHandles(tmp).find((q) => q.i === hit.i); if (h) { const ss = tmp.s || 1; vertexDot(c, ...toScreen(tmp.x + h.p[0] * ss, tmp.y + h.p[1] * ss)); } }
      },
      end() {
        S.hidden = new Set(); updateCursor();
        if (!moved) { invalidate(); return; }
        const r4 = (x) => Math.round(x * 1e4) / 1e4;
        act(() => setFields(it.id, { m: tmp.m.map((q) => q.map(r4)), yaw: tmp.yaw, pitch: tmp.pitch, roll: tmp.roll, x: tmp.x, y: tmp.y, w: tmp.w, h: tmp.h }));
      },
      cancel() { S.hidden = new Set(); invalidate(); },
    };
  }
  function selectGesture(pt, e) {
    const [sx, sy] = [pt[3], pt[4]];
    const sm = shapeSel();
    if (sm) { const h = shapeHit(sm, sx, sy); if (h) return editGesture(sm, h, pt); }
    else { const es = editSel(); if (es) { const h = editHit(es, sx, sy); if (h) return editGesture(es, h, pt); } }
    // ручки масштаба (в режиме правки формы их нет)
    if (S.sel.size && !sm) {
      const bb = selectionBox();
      const hs = handles(bb);
      const hi = handleAt(bb, sx, sy);
      if (hi < 0) { const rk = rotCornerAt(bb, sx, sy); if (rk >= 0) return rotateGesture(pt, bb, rk); }
      // масштаб считаем от рамки самой геометрии (без запаса на толщину линий) — размеры точные, ничего не «уплывает»
      let gb = null;
      for (const id of S.sel) { const it = items.get(id); if (!it) continue; const w = geomWorldBox(it); gb = gb ? [Math.min(gb[0], w[0]), Math.min(gb[1], w[1]), Math.max(gb[2], w[2]), Math.max(gb[3], w[3])] : w; }
      if (hi >= 0 && gb) { bb[0] = gb[0]; bb[1] = gb[1]; bb[2] = gb[2]; bb[3] = gb[3]; }
      if (hi >= 4) {
        // сторона: растягиваем только по одной оси, противоположная сторона стоит на месте
        const vert = hi === 4 || hi === 6;
        const ax = hi === 7 ? bb[2] : bb[0], ay = hi === 4 ? bb[3] : bb[1];
        // край следует за курсором ровно на столько, на сколько его сдвинули
        const len0 = (vert ? bb[3] - bb[1] : bb[2] - bb[0]) || 1;
        const dir = hi === 4 || hi === 7 ? -1 : 1;
        S.ov = { ids: new Set(S.sel), ax, ay, kx: 1, ky: 1, dx: 0, dy: 0 };
        cvOver.style.cursor = handleCursor(hi);
        return {
          move(p) {
            const k = (len0 + dir * (vert ? p[1] - pt[1] : p[0] - pt[0])) / len0;
            if (vert) S.ov.ky = clamp(k, 0.03, 50); else S.ov.kx = clamp(k, 0.03, 50);
            invalidate();
          },
          end() {
            const ov = S.ov; S.ov = null; updateCursor();
            if (Math.abs(ov.kx - 1) < 1e-3 && Math.abs(ov.ky - 1) < 1e-3) return;
            act(() => { for (const id of ov.ids) { const it = items.get(id); if (it) setFields(id, SCALE_BAKED.has(it.type) ? bakeShape(it, ov.kx, ov.ky, ov.ax, ov.ay) : bakeStretch(it, ov)); } });
          },
          cancel() { S.ov = null; },
        };
      }
      if (hi >= 0) {
        const ax = hi === 0 || hi === 3 ? bb[2] : bb[0], ay = hi === 0 || hi === 1 ? bb[3] : bb[1];
        const cx = hi === 0 || hi === 3 ? bb[0] : bb[2], cy = hi === 0 || hi === 1 ? bb[1] : bb[3];
        const g0 = Math.hypot(cx - ax, cy - ay) || 1, d0 = Math.hypot(pt[0] - ax, pt[1] - ay);
        S.ov = { ids: new Set(S.sel), ax, ay, k: 1, dx: 0, dy: 0 };
        cvOver.style.cursor = handleCursor(hi);
        return {
          move(p) { const d = Math.hypot(p[0] - ax, p[1] - ay); S.ov.k = clamp((g0 + d - d0) / g0, 0.05, 50); invalidate(); },
          end() {
            const ov = S.ov; S.ov = null; updateCursor();
            if (Math.abs(ov.k - 1) < 1e-3) return;
            act(() => { for (const id of ov.ids) { const it = items.get(id); if (!it) continue; if (SCALE_BAKED.has(it.type)) { setFields(id, bakeShape(it, ov.k, ov.k, ov.ax, ov.ay)); continue; } const t = itemTransform(it, ov); setFields(id, { x: t.x, y: t.y, s: t.s }); } });
          },
          cancel() { S.ov = null; },
        };
      }
    }
    const hit = topHit(pt[0], pt[1], 7, e.altKey);
    const now = Date.now();
    // двойной щелчок — по линии фигуры или внутри её рамки (у незалитой фигуры середина пустая)
    let dblT = hit;
    if (!dblT && S.sel.size === 1) { const b1 = selectionBox(); if (b1 && pt[0] >= b1[0] && pt[0] <= b1[2] && pt[1] >= b1[1] && pt[1] <= b1[3]) dblT = items.get([...S.sel][0]); }
    if (dblT && lastClick.id === dblT.id && now - lastClick.t < 400) {
      lastClick = { t: 0, id: null };
      if (!dblT.locked && hasShape({ it: dblT, k: editKind(dblT) })) setShapeEdit(S.shapeEdit === dblT.id ? null : dblT.id); // фигура: правка формы вкл/выкл
      else editItem(dblT);
      return null;
    }
    lastClick = { t: now, id: dblT ? dblT.id : null };
    const bb = S.sel.size ? selectionBox() : null;
    const inSel = bb && pt[0] >= bb[0] && pt[0] <= bb[2] && pt[1] >= bb[1] && pt[1] <= bb[3];
    // S.autoBack: id новой фигуры (выделение включилось само) или '*' (выделение на время — после удержания пера)
    if (hit && S.autoBack !== '*' && hit.id !== S.autoBack) S.autoBack = null;
    // щелчок по пустому месту возвращает к ручке
    if (!hit && !inSel && !e.shiftKey && S.autoBack && (S.autoBack === '*' || !S.sel.size || S.sel.has(S.autoBack))) {
      S.sel.clear(); setTool(S.autoBackTool || 'pen', { noToggle: true }); return null;
    }
    if (hit || (inSel && !e.shiftKey)) {
      if (hit) {
        if (e.shiftKey) { if (S.sel.has(hit.id)) S.sel.delete(hit.id); else S.sel.add(hit.id); }
        else if (!S.sel.has(hit.id)) { S.sel.clear(); S.sel.add(hit.id); }
      }
      if (!S.sel.size) return null;
      // Alt + перетаскивание — оставить оригинал на месте и вытащить копию (как в Miro и Figma)
      const canCopy = e.altKey && !(hit && hit.locked);
      S.ov = { ids: new Set(S.sel), dx: 0, dy: 0, copy: canCopy };
      let moved = false;
      return {
        hideSel: false, autoScroll: true,
        move(p, ev) {
          S.ov.dx = p[0] - pt[0]; S.ov.dy = p[1] - pt[1];
          if (ev && ev.altKey && !(hit && hit.locked)) S.ov.copy = true;
          if (Math.hypot(p[3] - sx, p[4] - sy) > 2) moved = true;
          cvOver.style.cursor = S.ov.copy ? 'copy' : moveCursor();
          invalidate();
        },
        end() {
          const ov = S.ov; S.ov = null; updateCursor();
          if (!moved) { invalidate(); return; }
          if (ov.copy) {
            const ids = []; let z = zTop(S.page);
            act(() => { for (const id of ov.ids) { const it = items.get(id); if (!it) continue; const nid = uid(); ids.push(nid); addItem({ ...it, id: nid, x: it.x + ov.dx, y: it.y + ov.dy, z: z++, locked: false }); } });
            S.sel = new Set(ids); invalidate();
            return;
          }
          act(() => { for (const id of ov.ids) { const it = items.get(id); if (it) setFields(id, { x: it.x + ov.dx, y: it.y + ov.dy }); } });
        },
        cancel() { S.ov = null; },
      };
    }
    // рамка или лассо
    if (!e.shiftKey) S.sel.clear();
    const base = new Set(S.sel);
    const lasso = false; const path = [[pt[0], pt[1]]]; let cur = pt;
    const g = {
      autoScroll: true, // рамка дошла до края экрана — доска едет, выделение продолжается
      move(p) { cur = p; if (lasso) path.push([p[0], p[1]]); update(); },
      pvMarq: () => [pt[0], pt[1], cur[0], cur[1]],
      drawScreen(c) {
        c.strokeStyle = '#4c6ef5'; c.fillStyle = 'rgba(76,110,245,0.08)'; c.lineWidth = 1;
        if (lasso) { c.beginPath(); path.forEach(([x, y], i) => { const [a, b] = toScreen(x, y); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.closePath(); c.fill(); c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]); }
        else { const [a, b] = toScreen(pt[0], pt[1]), [a2, b2] = toScreen(cur[0], cur[1]); c.fillRect(a, b, a2 - a, b2 - b); c.strokeRect(a, b, a2 - a, b2 - b); }
      },
      end() { updateSelBar(); },
    };
    const inPoly = (x, y) => { let ins = false; for (let i = 0, j = path.length - 1; i < path.length; j = i++) { const [xi, yi] = path[i], [xj, yj] = path[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
    function update() {
      S.sel = new Set(base);
      const x0 = Math.min(pt[0], cur[0]), x1 = Math.max(pt[0], cur[0]), y0 = Math.min(pt[1], cur[1]), y1 = Math.max(pt[1], cur[1]);
      for (const it of pageItems()) {
        if (it.locked) continue;
        // объект выделяется целиком, если рамка (лассо) задела хотя бы его часть
        const b = worldBox(it);
        if (lasso) {
          if (path.length < 3) continue;
          if (it.type === 'stroke') { const s = it.s || 1; if (decodePts(it).some((q) => inPoly(it.x + q[0] * s, it.y + q[1] * s))) S.sel.add(it.id); }
          else if ([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]].some(([x, y]) => inPoly(x, y)) || path.some(([x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) S.sel.add(it.id);
        } else {
          if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
          if (it.type === 'stroke') {
            const s = it.s || 1;
            if (decodePts(it).some((q) => { const X = it.x + q[0] * s, Yy = it.y + q[1] * s; return X >= x0 && X <= x1 && Yy >= y0 && Yy <= y1; })) S.sel.add(it.id);
          } else S.sel.add(it.id);
        }
      }
      invalidate(false);
    }
    return g;
  }
  function editItem(it) {
    if (it.type === 'text' || it.type === 'note') openTextEditor(it);
    else if (it.type === 'tex') openTexEditor(it);
    else if (it.type === 'graph') openGraphEditor(it);
  }

  // ---------- редакторы ----------
  let editorOpen = null;
  function closeEditors(commit) { if (editorOpen) { const e = editorOpen; editorOpen = null; e.close(commit); } }
  const TEXT_SYMS = [ // ряды → группы
    [['°', '√', 'π', '∞', '±', '·', '×', '÷'], ['≤', '≥', '≠', '≈'], ['∠', '△', '⊥', '∥', '∈', '⇒', '⇔']],
    [['α', 'β', 'γ', 'Δ', 'φ', 'ω', 'λ', 'μ'], ['²', '³', 'ⁿ', '₁', '₂'], ['½', '⅓', '¼', '¾', 'a/b']],
    [['sin', 'cos', 'tg', 'ctg', 'arcsin', 'arccos', 'arctg', 'log', 'ln', 'lim']],
  ];
  function openTextEditor(it, wx, wy) {
    closeEditors(true);
    const isNote = it && it.type === 'note';
    const fs = it ? it.fs : sz('text');
    const s = it ? it.s || 1 : 1;
    const color = it ? it.color : prefs.penColor;
    const x = it ? it.x : wx, y = it ? it.y : wy;
    const ta = el('textarea', { class: 'ed-text' + (isNote ? ' note' : ''), spellcheck: 'false' });
    ta.value = it ? it.text || '' : '';
    const place = () => {
      const [sx, sy] = toScreen(x, y); const z = S.view.z * s;
      ta.style.left = sx + 'px'; ta.style.top = sy + 'px';
      ta.style.fontSize = fs * z + 'px'; ta.style.lineHeight = isNote ? '1.3' : '1.25';
      ta.style.color = color; ta.style.fontFamily = FONT;
      if (isNote) { ta.style.width = it.w * z + 'px'; ta.style.height = it.h * z + 'px'; ta.style.padding = 12 * z + 'px'; ta.style.background = it.bg; }
      else { ta.style.height = '0px'; ta.style.width = '0px'; ta.style.width = Math.max(40, ta.scrollWidth + fs * z) + 'px'; ta.style.height = ta.scrollHeight + 'px'; ta.style.paddingTop = fs * z * 0.1 + 'px'; }
    };
    // готовые символы над полем: щелчок вставляет туда, где курсор (фокус из поля не уходит)
    const insSym = (t) => { const a = ta.selectionStart, b = ta.selectionEnd; ta.value = ta.value.slice(0, a) + t + ta.value.slice(b); ta.setSelectionRange(a + t.length, a + t.length); ta.dispatchEvent(new Event('input')); };
    const symBtn = (t) => (t === 'a/b'
        ? el('button', { class: 'sym frac', title: 'Дробь — откроется формула', onclick: () => { const fx = x, fy = y; closeEditors(true); openTexEditor(null, fx, fy, '\\frac{}{}'); } }, el('span', {}, 'a'), el('span', {}, 'b'))
        : el('button', { class: 'sym' + (/^[a-z]+$/.test(t) ? ' word' : ''), onclick: () => insSym(t) }, t));
    const bar = el('div', { class: 'symbar' }, TEXT_SYMS.map((row) => el('div', { class: 'symrow' }, row.map((grp, gi) => [gi ? el('i', { class: 'symsep' }) : null, ...grp.map(symBtn)]).flat())));
    bar.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    const placeBar = () => {
      const r = ta.getBoundingClientRect(), bh = bar.offsetHeight || 70;
      bar.style.left = Math.round(clamp(r.left, 8, W - (bar.offsetWidth || 400) - 8)) + 'px';
      bar.style.top = Math.round(r.top - bh - 8 >= 64 ? r.top - bh - 8 : r.bottom + 8) + 'px';
    };
    S.editingId = it ? it.id : null;
    layer.append(ta, bar); place(); placeBar(); ta.focus(); invalidate();
    ta.addEventListener('input', placeBar);
    ta.addEventListener('input', () => { place(); pvMaybeSend(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeEditors(true); }
      e.stopPropagation();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (editorOpen && editorOpen.ta === ta) closeEditors(true); }, 0));
    editorOpen = {
      ta, reposition: () => { place(); placeBar(); },
      pv: () => ({ tmp: ta.value ? [isNote ? { ...it, text: ta.value } : { ...(it || { id: '_pvt', type: 'text', page: S.page, x, y, s: 1, fs, color }), text: ta.value }] : [], hidden: it ? [it.id] : [] }),
      close(commit) {
        ta.remove(); bar.remove(); S.editingId = null;
        const text = ta.value.replace(/\s+$/, '');
        if (commit) act(() => {
          if (it && items.has(it.id)) { if (!text && !isNote) yItems.delete(it.id); else setFields(it.id, { text }); }
          else if (text) addItem({ id: uid(), type: 'text', page: S.page, z: zTop(S.page), x, y, s: 1, fs, color, text });
        });
        invalidate();
      },
    };
  }

  function floatingPanel(wx, wy, content, cls = '') {
    const p = el('div', { class: 'panel floating ' + cls }, content);
    layer.append(p);
    const [sx, sy] = wx != null ? toScreen(wx, wy) : [W / 2 - 200, H / 3];
    const r = p.getBoundingClientRect(), tb = toolbar.getBoundingClientRect(), pos = prefs.barPos || 'top';
    const topLim = pos === 'top' ? tb.bottom + 8 : 60, botLim = pos === 'bottom' ? tb.top - 8 : H - 8;
    p.style.left = clamp(sx, 8, W - r.width - 8) + 'px';
    p.style.top = Math.max(topLim, Math.min(sy + 12, botLim - r.height)) + 'px';
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    // окно можно двигать за заголовок
    const head = p.querySelector('.panel-title');
    if (head) head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault();
      const ox = e.clientX - p.offsetLeft, oy = e.clientY - p.offsetTop;
      head.setPointerCapture(e.pointerId); head.classList.add('drag');
      const mv = (ev) => { p.style.left = clamp(ev.clientX - ox, 8 - p.offsetWidth + 80, W - 80) + 'px'; p.style.top = clamp(ev.clientY - oy, 8, H - 40) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.classList.remove('drag'); };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
    p.addEventListener('keydown', (e) => e.stopPropagation());
    return p;
  }

  const TEX_SNIPPETS = [
    ['\\frac{}{}', 'a/b'], ['\\sqrt{}', '√'], ['^{}', 'xⁿ'], ['_{}', 'xₙ'], ['\\vec{}', 'вектор'], ['\\cdot', '·'],
    ['\\Delta', 'Δ'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\varphi', 'φ'], ['\\omega', 'ω'], ['\\pi', 'π'], ['\\lambda', 'λ'], ['\\mu', 'μ'],
    ['\\le', '≤'], ['\\ge', '≥'], ['\\ne', '≠'], ['\\approx', '≈'], ['\\infty', '∞'], ['\\pm', '±'], ['^\\circ', '°'],
    ['\\sin', 'sin'], ['\\cos', 'cos'], ['\\log_{}', 'log'], ['\\lim_{x\\to }', 'lim'], ['\\int_{}^{}', '∫'], ['\\sum_{}^{}', 'Σ'],
    ['\\begin{cases}  \\\\  \\end{cases}', 'система'], ['\\overline{}', 'отрезок'], ['\\angle ', '∠'], ['\\triangle ', '△'], ['\\parallel', '∥'], ['\\perp', '⊥'],
    ['\\Rightarrow', '⇒'], ['\\Leftrightarrow', '⇔'], ['\\in', '∈'], ['\\mathbb{R}', 'ℝ'], ['\\text{}', 'текст'],
  ];
  function openTexEditor(it, wx, wy, init = '') {
    closeEditors(true);
    const fs = it ? it.fs : sz('text') + 6;
    const color = it ? it.color : prefs.penColor;
    const ta = el('textarea', { class: 'inp mono', rows: 3, spellcheck: 'false', placeholder: 'например: F = ma  или  x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}' });
    ta.value = it ? it.tex : init;
    const prev = el('div', { class: 'tex-prev' });
    const upd = () => {
      prev.innerHTML = '';
      if (!ta.value.trim()) { prev.textContent = 'Здесь будет формула'; return; }
      try { const n = window.MathJax.tex2svg(ta.value, { display: true }); n.style.color = color; prev.append(n); } catch (e) { prev.textContent = String(e.message || e); }
    };
    ta.addEventListener('input', upd);
    const ins = (snip) => {
      const a = ta.selectionStart, b = ta.selectionEnd; const sel = ta.value.slice(a, b);
      const brace = snip.indexOf('{}');
      let txt = snip, caret;
      if (brace >= 0) { txt = snip.slice(0, brace + 1) + sel + snip.slice(brace + 1); caret = a + brace + 1 + sel.length; } else caret = a + snip.length;
      ta.setRangeText(txt, a, b, 'end'); ta.selectionStart = ta.selectionEnd = caret; ta.focus(); upd();
    };
    const commit = () => {
      const tex = ta.value.trim(); let newId = null;
      act(() => {
        if (it && items.has(it.id)) { if (!tex) yItems.delete(it.id); else setFields(it.id, { tex }); }
        else if (tex) { newId = uid(); addItem({ id: newId, type: 'tex', page: S.page, z: zTop(S.page), x: wx, y: wy, s: 1, fs, color, tex }); }
      });
      closeEditors(false);
      if (newId) selectNew(newId);
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); closeEditors(false); }
    });
    const p = floatingPanel(it ? it.x : wx, it ? worldBox(it)[3] : wy, [
      el('div', { class: 'panel-title' }, it ? 'Изменить формулу' : 'Новая формула', el('span', { class: 'muted small' }, ' — LaTeX, Enter вставить, Shift+Enter новая строка')),
      ta,
      el('div', { class: 'snips' }, TEX_SNIPPETS.map(([s, l]) => el('button', { class: 'snip', title: s, onclick: () => ins(s) }, l))),
      prev,
      el('div', { class: 'row end' }, el('button', { class: 'btn', onclick: () => closeEditors(false) }, 'Отмена'), el('button', { class: 'btn primary', onclick: commit }, it ? 'Сохранить' : 'Вставить')),
    ]);
    upd(); ta.focus();
    if (init && !it) { const k = init.indexOf('{}'); if (k >= 0) ta.setSelectionRange(k + 1, k + 1); }
    ta.addEventListener('input', () => pvMaybeSend());
    editorOpen = { close() { p.remove(); },
      pv: () => ({ tmp: ta.value.trim() ? [{ ...(it || { id: '_pvf', type: 'tex', page: S.page, x: wx, y: wy, s: 1, fs, color }), tex: ta.value }] : [], hidden: it ? [it.id] : [] }) };
  }

  const GRAPH_TPL = [
    ['Прямая', '2x + 1'], ['Парабола', 'x^2 - 2x - 3'], ['Гипербола', '4/x'], ['Корень', 'sqrt(x)'], ['Модуль', '|x - 1|'],
    ['Кубическая', 'x^3 - 3x'], ['Показательная', '2^x'], ['Логарифм', 'ln(x)'], ['sin', 'sin(x)'], ['cos', 'cos(x)'], ['tg', 'tg(x)'],
    ['Окружность', '(x - 1)^2 + (y + 2)^2 = 9'], ['Эллипс', 'x^2/9 + y^2/4 = 1'], ['Кусочная', 'x^2 + 2, x >= -1; -2x + 1, x < -1'],
  ];
  const prettyExpr = (c) => c.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\^x/g, 'ˣ').replace(/sqrt\(x\)/g, '√x').replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/ - /g, ' − ').replace(/-(\d)/g, '−$1').replace(/; /g, ';  ');
  function openGraphEditor(it, wx, wy) {
    closeEditors(true);
    const f = it || { expr: 'x^2 - 2x - 3', xmin: -6, xmax: 6, ymin: -4.5, ymax: 4.5, w: 480, h: 360 }; // клетка одинаковая по x и y — окружность круглая
    const ta = el('textarea', { class: 'inp mono', rows: 3, spellcheck: 'false' }); ta.value = f.expr;
    const num = (v) => el('input', { class: 'inp num', type: 'number', step: 'any', value: v });
    const xmin = num(f.xmin), xmax = num(f.xmax), ymin = num(f.ymin), ymax = num(f.ymax);
    const msg = el('div', { class: 'small muted' });
    const check = () => { try { const fs = compileMany(ta.value); msg.className = 'small err'; msg.textContent = fs.length ? '' : 'Введите хотя бы одну функцию'; return fs.length > 0; } catch (e) { msg.className = 'small err'; msg.textContent = e.message; return false; } };
    ta.addEventListener('input', check);
    const commit = () => {
      if (!check()) return;
      const vals = [xmin, xmax, ymin, ymax].map((i) => parseFloat(String(i.value).replace(',', '.')));
      if (vals.some((v) => !Number.isFinite(v)) || vals[0] >= vals[1] || vals[2] >= vals[3]) { msg.className = 'small err'; msg.textContent = 'Проверьте границы осей: «от» должно быть меньше «до»'; return; }
      const data = { expr: ta.value.trim(), xmin: vals[0], xmax: vals[1], ymin: vals[2], ymax: vals[3] }; let newId = null;
      act(() => {
        if (it && items.has(it.id)) setFields(it.id, data);
        else { newId = uid(); addItem({ id: newId, type: 'graph', page: S.page, z: zTop(S.page), x: wx, y: wy, s: 1, w: f.w, h: f.h, color: prefs.penColor, ...data }); }
      });
      closeEditors(false);
      if (newId) selectNew(newId);
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === 'Escape') closeEditors(false); });
    // Шаблон вставляется в строку там, где курсор: после «+», «−», «*», «(» — складывается с тем, что уже есть,
    // иначе — отдельный график через «;». Первое число выделяется — можно сразу печатать своё.
    let fresh = !it;
    ta.addEventListener('input', () => { fresh = false; });
    const insTpl = (code) => {
      const v = ta.value; let a = ta.selectionStart, b = ta.selectionEnd;
      if (fresh) { a = 0; b = v.length; fresh = false; }
      const before = v.slice(0, a).replace(/\s+$/, '');
      const join = !before || /[+\-*/(;\n,=]$/.test(before);
      const piece = join ? (before && !/[(\n]$/.test(before) ? ' ' : '') + code : '; ' + code;
      ta.value = v.slice(0, a).replace(/\s+$/, '') + piece + v.slice(b);
      const at = a - (v.slice(0, a).length - v.slice(0, a).replace(/\s+$/, '').length) + piece.length - code.length;
      const m = code.match(/(?<!\^)\d+(\.\d+)?/); // первое число, но не степень
      ta.focus();
      if (m) ta.setSelectionRange(at + m.index, at + m.index + m[0].length); else ta.setSelectionRange(at + code.length, at + code.length);
      check(); pvMaybeSend();
    };
    // внизу: «Шаблоны» и «Оси» — выпадающие списки, чтобы окно было свободным
    const menus = [];
    const dropdown = (label, content, cls) => {
      const menu = el('div', { class: 'gmenu ' + cls, hidden: true }, content);
      const btn = el('button', { class: 'btn ddbtn', onclick: () => {
        const open = menu.hidden; menus.forEach((m) => { m.menu.hidden = true; m.btn.classList.remove('on'); }); menu.hidden = !open; btn.classList.toggle('on', open);
        if (open) { menu.classList.remove('down'); if (menu.getBoundingClientRect().top < 8) menu.classList.add('down'); } // не помещается сверху — раскрываем вниз
      } }, label, el('span', { class: 'dd-tri' }));
      menus.push({ menu, btn }); return { menu, btn };
    };
    const closeMenus = () => menus.forEach((m) => { m.menu.hidden = true; m.btn.classList.remove('on'); });
    const tplMenu = dropdown('Шаблоны', GRAPH_TPL.map(([name, code]) => el('button', { class: 'tpl', onclick: () => { closeMenus(); insTpl(code); } }, el('b', {}, name), el('span', {}, prettyExpr(code)))), 'tpls');
    const axMenu = dropdown('Оси', [el('div', { class: 'axrow' }, el('span', {}, 'x от'), xmin, el('span', {}, 'до'), xmax), el('div', { class: 'axrow' }, el('span', {}, 'y от'), ymin, el('span', {}, 'до'), ymax)], 'axes');
    const p = floatingPanel(it ? it.x : wx, it ? worldBox(it)[3] : wy, [
      el('div', { class: 'panel-title' }, it ? 'Изменить график' : 'Новый график'),
      ta, msg, tplMenu.menu, axMenu.menu,
      el('div', { class: 'gfoot' }, tplMenu.btn, axMenu.btn, el('div', { class: 'grow' }),
        el('button', { class: 'btn', onclick: () => closeEditors(false) }, 'Отмена'), el('button', { class: 'btn primary', onclick: commit }, it ? 'Сохранить' : 'Вставить')),
    ], 'gpanel');
    p.addEventListener('pointerdown', (e) => { if (!menus.some((m) => m.menu.contains(e.target) || m.btn.contains(e.target))) closeMenus(); });
    check(); ta.focus(); ta.select();
    ta.addEventListener('input', () => pvMaybeSend());
    editorOpen = { close() { p.remove(); },
      pv: () => {
        let ok = false; try { ok = compileMany(ta.value).length > 0; } catch {}
        return { tmp: ok ? [{ ...(it || { id: '_pvg', type: 'graph', page: S.page, x: wx, y: wy, s: 1, w: f.w, h: f.h, color: prefs.penColor, xmin: f.xmin, xmax: f.xmax, ymin: f.ymin, ymax: f.ymax }), expr: ta.value.trim() }] : [], hidden: it ? [it.id] : [] };
      } };
  }

  // ---------- панель действий над выделением ----------
  // только что созданное — сразу выделено, можно тянуть
  function selectNew(id, backTo = null) {
    if (S.tool !== 'select') setTool('select', { noToggle: true });
    S.sel = new Set([id]); S.autoBack = id; S.autoBackTool = backTo; invalidate();
  }
  const KIND_NAMES = { text: 'текст', tex: 'формула', graph: 'график', note: 'стикер', image: 'картинка', stroke: 'линия', poly: 'многоугольник', rect: 'прямоугольник', ellipse: 'эллипс', line: 'отрезок', arrow: 'стрелка' };
  const itemName = (i) => (i.type === 'fig' ? (FIGS[i.kind]?.name || 'фигура').toLowerCase() : i.type === 'ellipse' && i.center ? 'окружность' : KIND_NAMES[i.type] || 'объект');
  const SQ3 = Math.sqrt(3) / 2;
  // Равнобедренный / равносторонний из треугольника, нарисованного по точкам
  function triangleFix(it, mode) {
    const P = it.pts.map(([x, y]) => [x, y]);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // вершина — та, у которой прилежащие стороны ближе всего по длине; основание — напротив
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < 3; i++) { const a = P[i], b = P[(i + 1) % 3], c = P[(i + 2) % 3]; const diff = Math.abs(d(a, b) - d(a, c)) / Math.max(d(a, b), d(a, c)); if (diff < bestDiff) { bestDiff = diff; best = i; } }
    const A = P[best], B = P[(best + 1) % 3], C = P[(best + 2) % 3];
    const mx = (B[0] + C[0]) / 2, my = (B[1] + C[1]) / 2; const bx = C[0] - B[0], by = C[1] - B[1]; const L = Math.hypot(bx, by) || 1;
    let nx = -by / L, ny = bx / L; // нормаль к основанию в сторону вершины
    const side = (A[0] - mx) * nx + (A[1] - my) * ny; if (side < 0) { nx = -nx; ny = -ny; }
    const hgt = mode === 'eq' ? L * SQ3 : Math.abs(side);
    if (Math.hypot(P[best][0] - (mx + nx * hgt), P[best][1] - (my + ny * hgt)) < 0.75) return null;
    P[best] = [mx + nx * hgt, my + ny * hgt];
    let x0 = Infinity, y0 = Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
    const s = it.s || 1;
    return { x: it.x + x0 * s, y: it.y + y0 * s, pts: P.map(([x, y]) => [x - x0, y - y0]) };
  }
  // «Выровнять»: каждая фигура возвращается к своим свойствам — параллелограмм снова параллелограмм,
  // прямоугольник — прямоугольник, квадрат — квадрат и т. д. Меняется как можно меньше (лишние вершины не двигаются).
  // undefined — к объекту неприменимо, null — он уже ровный.
  const FIX_NAME = { rect: 'прямоугольник', square: 'квадрат', parallelogram: 'параллелограмм', rhombus: 'ромб', trapezoid: 'трапеция',
    triangle: 'равнобедренный треугольник', eqtriangle: 'равносторонний треугольник', rtriangle: 'прямоугольный треугольник',
    pentagon: 'правильный пятиугольник', hexagon: 'правильный шестиугольник', inscribed: 'равносторонний треугольник', circumscribed: 'равносторонний треугольник',
    circle: 'окружность', ngon: 'правильный многоугольник', solid: 'ровное тело' };
  function regularKind(it) {
    if (it.locked) return null;
    if (it.type === 'ellipse') return it.center ? 'circle' : null;
    if (it.type === 'fig' && SOLID_KINDS.has(it.kind)) return 'solid';
    if (it.type === 'fig') return FIGS[it.kind]?.aspect ? it.kind : null; // у остальных пропорции любые — фигура всегда «та»
    if (it.type === 'poly' && it.closed && it.pts.length >= 3) {
      const n = it.pts.length, fk = it.fk;
      if (fk === 'scalene') return null; // произвольный треугольник «выравнивать» не во что
      const quad = { rect: 1, square: 1, parallelogram: 1, rhombus: 1, trapezoid: 1 }, tri = { triangle: 1, eqtriangle: 1, rtriangle: 1, inscribed: 1, circumscribed: 1 };
      if (fk && quad[fk] && n === 4) return fk;
      if (fk && tri[fk] && n === 3) return fk;
      if ((fk === 'pentagon' && n === 5) || (fk === 'hexagon' && n === 6)) return fk;
      return n === 3 ? 'eqtriangle' : 'ngon'; // свой многоугольник — правильный
    }
    return null;
  }
  const V2 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, k) => [a[0] * k, a[1] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1], len: (a) => Math.hypot(a[0], a[1]) };
  // из нескольких вариантов выбираем тот, где вершины сдвинулись меньше всего
  const nearest = (P, cands) => { let best = null, bd = Infinity; for (const Q of cands) { if (!Q) continue; let d = 0; for (let i = 0; i < P.length; i++) d += (Q[i][0] - P[i][0]) ** 2 + (Q[i][1] - P[i][1]) ** 2; if (d < bd) { bd = d; best = Q; } } return best; };
  function fixQuad(P, kind) {
    const { sub, add, mul, dot, len } = V2;
    const at = (i) => P[(i + 4) % 4];
    const put = (pairs) => { const Q = P.map((p) => p.slice()); for (const [i, q] of pairs) Q[(i + 4) % 4] = q; return Q; };
    const C = [];
    if (kind === 'parallelogram') for (let i = 0; i < 4; i++) C.push(put([[i, add(at(i - 1), sub(at(i + 1), at(i + 2)))]]));
    if (kind === 'rect' || kind === 'square') {
      for (let i = 0; i < 4; i++) {
        const A = at(i), B = at(i + 1), u = sub(B, A), L = len(u) || 1; let nrm = [-u[1] / L, u[0] / L];
        const hC = dot(sub(at(i + 2), A), nrm), hD = dot(sub(at(i + 3), A), nrm);
        let h = (hC + hD) / 2; if (h < 0) { nrm = mul(nrm, -1); h = -h; }
        if (kind === 'square') h = L;
        C.push(put([[i + 2, add(B, mul(nrm, h))], [i + 3, add(A, mul(nrm, h))]]));
      }
    }
    if (kind === 'rhombus') {
      for (let i = 0; i < 2; i++) {
        const A = at(i), B = at(i + 2), m = mul(add(A, B), 0.5), u = sub(B, A), L = len(u) || 1, nrm = [-u[1] / L, u[0] / L];
        const t1 = dot(sub(at(i + 1), m), nrm), t3 = dot(sub(at(i + 3), m), nrm);
        const t = (Math.abs(t1) + Math.abs(t3)) / 2, sg = t1 >= 0 ? 1 : -1;
        C.push(put([[i + 1, add(m, mul(nrm, sg * t))], [i + 3, add(m, mul(nrm, -sg * t))]]));
      }
    }
    if (kind === 'trapezoid') {
      // как в списке фигур: равнобокая трапеция с ровными (горизонтальными) основаниями, большее — снизу.
      // Основания — та пара сторон, что ближе к параллельным; их длины и высота сохраняются, центр остаётся на месте.
      // Если трапецию нарочно повернули на 90°/180°, так и остаётся: направление основания округляется до четверти оборота.
      const dirOf = (i) => { const u = sub(at(i + 1), at(i)); const L = len(u) || 1; return [u[0] / L, u[1] / L]; };
      const par = (i) => Math.abs(dirOf(i)[0] * dirOf(i + 2)[1] - dirOf(i)[1] * dirOf(i + 2)[0]); // 0 — параллельны
      const i0 = par(0) <= par(1) + 1e-9 ? 0 : 1;
      const iB = len(sub(at(i0 + 1), at(i0))) >= len(sub(at(i0 + 3), at(i0 + 2))) ? i0 : i0 + 2; // большая сторона — основание
      const A = at(iB), B = at(iB + 1), Cc = at(iB + 2), D = at(iB + 3);
      const L = len(sub(B, A)), e0 = dirOf(iB);
      const q = Math.round(Math.atan2(e0[1], e0[0]) / (Math.PI / 2)) * (Math.PI / 2);
      const e = [Math.round(Math.cos(q)), Math.round(Math.sin(q))];
      const mB = mul(add(A, B), 0.5), mT = mul(add(Cc, D), 0.5);
      let nrm = [-e[1], e[0]]; if (dot(sub(mT, mB), nrm) < 0) nrm = mul(nrm, -1);
      const hgt = Math.max(4, Math.abs(dot(sub(mT, mB), [-e0[1], e0[0]])));
      const l = Math.min(len(sub(Cc, D)), L * 0.96) / 2, c0 = mul(add(mB, mT), 0.5);
      const bM = add(c0, mul(nrm, -hgt / 2)), tM = add(c0, mul(nrm, hgt / 2));
      C.push(put([[iB, add(bM, mul(e, -L / 2))], [iB + 1, add(bM, mul(e, L / 2))], [iB + 2, add(tM, mul(e, l))], [iB + 3, add(tM, mul(e, -l))]]));
    }
    return nearest(P, C);
  }
  function fixRightTri(P) {
    const { sub, add, mul, dot, len } = V2; const C = [];
    for (let v = 0; v < 3; v++) for (const [a, b] of [[1, 2], [2, 1]]) {
      const V = P[v], A = P[(v + a) % 3], B = P[(v + b) % 3], u = sub(A, V), L = len(u) || 1; const nrm = [-u[1] / L, u[0] / L];
      const t = dot(sub(B, V), nrm); const Q = P.map((p) => p.slice()); Q[(v + b) % 3] = add(V, mul(nrm, t)); C.push(Q);
    }
    return nearest(P, C);
  }
  function regularNgon(P) {
    const n = P.length;
    const cx = P.reduce((a, p) => a + p[0], 0) / n, cy = P.reduce((a, p) => a + p[1], 0) / n;
    let area = 0; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const dir = area >= 0 ? 1 : -1; const a0 = Math.atan2(P[0][1] - cy, P[0][0] - cx);
    const ext = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
    const U = P.map((_, k) => [Math.cos(a0 + (dir * 2 * Math.PI * k) / n), Math.sin(a0 + (dir * 2 * Math.PI * k) / n)]);
    const [W0, H0] = ext(P), [wu, hu] = ext(U);
    const r = Math.min(W0 / (wu || 1), H0 / (hu || 1)) || 1; // вписываем в меньшую сторону рамки
    return U.map(([ux, uy]) => [cx + r * ux, cy + r * uy]);
  }
  function regularFields(it) {
    const kind = regularKind(it); if (!kind) return undefined;
    const s = it.s || 1;
    const fit = (aspect) => {
      let w = it.w, h = it.h;
      if (w * aspect <= h) h = w * aspect; else w = h / aspect; // меньшая сторона остаётся
      if (Math.abs(w - it.w) < 0.5 && Math.abs(h - it.h) < 0.5) return null;
      return { x: it.x + ((it.w - w) / 2) * s, y: it.y + ((it.h - h) / 2) * s, w, h };
    };
    if (kind === 'circle') return fit(1);
    if (kind === 'solid') return it.m ? regularSolid(it) : fit(FIGS[it.kind]?.aspect || 1);
    if (it.type === 'fig') return fit(FIGS[it.kind].aspect);
    // многоугольник
    const P = it.pts.map(([x, y]) => [x, y]);
    let Q;
    if (kind === 'triangle' || kind === 'eqtriangle' || kind === 'inscribed' || kind === 'circumscribed') return triangleFix(it, kind === 'triangle' ? 'iso' : 'eq');
    else if (kind === 'rtriangle') Q = fixRightTri(P);
    else if (FIX_NAME[kind] && P.length === 4 && kind !== 'ngon') Q = fixQuad(P, kind);
    else Q = regularNgon(P);
    if (!Q || Q.every((q, k) => Math.hypot(q[0] - P[k][0], q[1] - P[k][1]) < 0.75)) return null;
    let x0 = Infinity, y0 = Infinity; for (const [x, y] of Q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); }
    return { x: it.x + x0 * s, y: it.y + y0 * s, pts: Q.map(([x, y]) => [x - x0, y - y0]) };
  }
  // Зеркало слева направо: фигура остаётся на месте, меняется только сторона. null — отражать нечего (симметрична).
  function mirrorFields(it) {
    if (it.locked) return null;
    const flipX = (xs) => { const a = Math.min(...xs), b = Math.max(...xs); return (x) => a + b - x; };
    if (it.type === 'poly') {
      const f = flipX(it.pts.map((p) => p[0])); const Q = it.pts.map(([x, y]) => [f(x), y]);
      if (Q.every((q) => it.pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.75))) return null; // симметрична — отражать нечего
      return { pts: Q };
    }
    if (it.type === 'line' || it.type === 'arrow') { const f = flipX([it.x1, it.x2]); return it.x1 === it.x2 ? null : { x1: f(it.x1), x2: f(it.x2) }; }
    if (it.type === 'fig' && !SOLID_KINDS.has(it.kind) && FIGS[it.kind]) {
      if (['square', 'rhombus', 'triangle', 'eqtriangle', 'pentagon', 'hexagon', 'inscribed', 'circumscribed', 'trapezoid', 'axes'].includes(it.kind)) return null;
      return { flip: !it.flip, ...(it.rot ? { rot: -it.rot } : {}) };
    }
    return null;
  }
  function mirrorSel() {
    const todo = [...S.sel].map((id) => items.get(id)).filter(Boolean).map((i) => [i, mirrorFields(i)]).filter(([, f]) => f);
    if (todo.length) act(() => { for (const [i, f] of todo) setFields(i.id, f); });
  }
  function makeRegularSel() {
    const its = [...S.sel].map((id) => items.get(id)).filter(Boolean);
    const todo = its.map((i) => [i, regularFields(i)]).filter(([, f]) => f);
    if (!todo.length) return;
    act(() => { for (const [i, f] of todo) setFields(i.id, f); });
  }
  // Удаление листа по Delete — с подтверждением
  async function confirmDeletePage(id) {
    const p = pages().find((x) => x.id === id); if (!p) return;
    const n = pageItems(id).length;
    const ok = await uiDialog({
      title: `Удалить «${p.name}»?`,
      text: n ? `Вместе с листом удалится всё, что на нём: ${n} ${plural(n, 'объект', 'объекта', 'объектов')}.` : 'Лист пустой.',
      ok: 'Да, удалить', cancel: 'Нет', danger: true, icon: 'trash',
    });
    if (!ok) return;
    doc.transact(() => {
      if (pages().length <= 1) { const m = new Y.Map(); m.set('name', 'Лист 1'); m.set('order', p.order + 1); yPages.set('p' + uid(), m); }
      for (const it of [...items.values()]) if (it.page === id) yItems.delete(it.id);
      yPages.delete(id);
    }, NOUNDO);
    pageListCache = null;
    if (S.page === id || !pages().some((x) => x.id === S.page)) setPage(pages()[0].id);
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  function selectionActions(its) {
    const A = [];
    const add = (ic, label, title, f, cls = '') => A.push({ ic, label, title, f, cls });
    const single = its.length === 1 ? its[0] : null;
    if (single && ['text', 'tex', 'graph', 'note'].includes(single.type)) add('pen', 'Изменить', 'Двойной щелчок или Enter', () => editItem(single));
    if (single && !single.locked && hasShape({ it: single, k: editKind(single) })) {
      const on = S.shapeEdit === single.id;
      add('shape', on ? 'Готово' : (single.type === 'line' || single.type === 'arrow' ? 'Тянуть концы' : 'Правка формы'), 'Двойной щелчок по фигуре', () => setShapeEdit(on ? null : single.id), on ? 'on' : '');
    }
    // «Правильная форма»: выровнять пропорции по меньшей стороне (центр остаётся на месте)
    {
      const fixable = its.filter((i) => regularFields(i));
      if (fixable.length) {
        const names = [...new Set(fixable.map((i) => FIX_NAME[regularKind(i)]))];
        add('regular', names.length === 1 ? 'Выровнять: ' + names[0] : 'Выровнять фигуры', 'Shift+R', makeRegularSel);
      }
    }
    // геометрия: виды треугольников
    if (single) {
      const it = single; const set = (f) => act(() => setFields(it.id, f));
      const keepBottom = (h) => ({ y: it.y + (it.h - h) * (it.s || 1), h });
      if (it.type === 'fig' && ['scalene', 'triangle', 'eqtriangle', 'rtriangle'].includes(it.kind)) {
        if (it.kind !== 'eqtriangle') add('fig:eqtriangle', 'Сделать равносторонним', 'Все стороны равны', () => set({ kind: 'eqtriangle', ...keepBottom(it.w * SQ3) }));
        if (it.kind !== 'triangle') add('fig:triangle', 'Сделать равнобедренным', 'Две боковые стороны равны', () => set({ kind: 'triangle' }));
        if (it.kind !== 'rtriangle') add('fig:rtriangle', 'Сделать прямоугольным', 'С прямым углом', () => set({ kind: 'rtriangle' }));
      }
      if (it.type === 'poly' && it.closed && it.pts.length === 3) {
        add('fig:eqtriangle', 'Сделать равносторонним', 'Основание остаётся, вершина встаёт на нужную высоту', () => set(triangleFix(it, 'eq')));
        add('fig:triangle', 'Сделать равнобедренным', 'Вершина встаёт над серединой основания', () => set(triangleFix(it, 'iso')));
      }
    }
    const dashable = (i) => ['line', 'arrow', 'rect', 'ellipse', 'poly'].includes(i.type);
    if (its.some(dashable)) add('dash', its.filter(dashable).every((i) => i.dash) ? 'Сплошная линия' : 'Пунктир', 'Сплошная / пунктир', () => act(() => { const v = !its.filter(dashable).every((i) => i.dash); for (const i of its) if (dashable(i)) setFields(i.id, { dash: v }); }));
    add('trash', 'Удалить', 'Delete', deleteSelection, 'danger');
    add('copy', 'Дублировать', 'Ctrl+D', duplicate);
    if (its.some((i) => mirrorFields(i))) add('mirror', 'Отразить', 'Зеркально слева направо', mirrorSel);
    add('lock', its.every((i) => i.locked) ? 'Открепить' : 'Закрепить', 'Закреплённое нельзя случайно сдвинуть, выделить рамкой или стереть — Shift+L', toggleLock);
    return A;
  }
  // толщина выделенного (как её показывает ползунок пера: у фигур хранится ×0,9)
  const SIZED_SHAPES = ['line', 'arrow', 'rect', 'ellipse', 'fig', 'poly'];
  function selSizeKind(its) {
    const sized = its.filter((i) => !i.locked && (i.type === 'text' || i.type === 'stroke' || SIZED_SHAPES.includes(i.type)));
    if (!sized.length) return null;
    if (sized.every((i) => i.type === 'text')) return { k: 'text', v: sized[0].fs || sz('text') };
    const pen = sized.find((i) => i.type !== 'text' && !(i.type === 'stroke' && i.kind === 'hl'));
    if (pen) return { k: 'pen', v: Math.round((pen.type === 'stroke' && pen.kind !== 'dash' ? pen.size : pen.size / 0.9) * 2) / 2 };
    return { k: 'hl', v: sized.find((i) => i.type === 'stroke').size };
  }
  // ползунок с числом; live — менять выделенное прямо во время перетаскивания (одним шагом отмены)
  function sizeRow(k, get, set, live) {
    const c = SIZE_CFG[k];
    const val = el('span', { class: 'sz-val' });
    const range = el('input', { type: 'range', class: 'sz-range', min: c.min, max: c.max, step: c.step, value: get() });
    const paint = () => { const v = get(); if (document.activeElement !== range || !dragging) range.value = v; val.textContent = String(+range.value).replace('.', ','); };
    let dragging = false;
    const begin = () => { if (dragging) return; dragging = true; undo.stopCapturing(); undo.captureTimeout = 1e9; };
    const finish = () => { if (!dragging) return; dragging = false; undo.captureTimeout = 0; undo.stopCapturing(); };
    range.addEventListener('pointerdown', begin);
    range.addEventListener('keydown', begin);
    range.addEventListener('input', () => { if (live) { begin(); set(+range.value); } else set(+range.value, false); val.textContent = String(+range.value).replace('.', ','); });
    range.addEventListener('change', () => { if (!live) set(+range.value, true); finish(); paint(); range.blur(); }); // фокус не держим — Ctrl+Z и клавиши инструментов работают сразу
    range.addEventListener('pointerup', finish);
    range.addEventListener('blur', finish);
    paint();
    return { el: el('div', { class: 'sz-row' }, range, val), paint, range };
  }
  const actIcon = (ic) => (ic.startsWith('fig:') ? figIcon(ic.slice(4)) : ICONS[ic] || '');
  function updateSelBar() {
    const its = [...S.sel].map((id) => items.get(id)).filter(Boolean);
    if (!its.length || editorOpen) { selBar.hidden = true; selBar.dataset.key = ''; return; }
    const key = (S.shapeEdit || '') + its.map((i) => `${i.id}${i.locked}${i.fill}${i.dash}${i.kind}${i.flip}${i.w}${i.h}${i.type === 'poly' && Array.isArray(i.pts) ? i.pts.map((q) => (+q[0]).toFixed(1) + ',' + (+q[1]).toFixed(1)).join(';') : i.pts ? i.pts.length : ''}`).join('|');
    if ((selBar.dataset.key === key || selBar._dragging) && !selBar.hidden) { selBar._sync?.(); placeSelBar(); return; } // ничего не поменялось — не трогаем (не мигает)
    selBar.dataset.key = key; selBar.innerHTML = '';
    selBar._sync = null;
    const sk = selSizeKind(its);
    if (sk) {
      const cfg = SIZE_CFG[sk.k];
      const cur = () => selSizeKind([...S.sel].map((id) => items.get(id)).filter(Boolean))?.v ?? sk.v;
      const row = sizeRow(sk.k, cur, (v) => setSize(sk.k, v, true, true), true);
      // «по умолчанию» — как у ручки (у текста — как у инструмента «Текст»)
      const def = el('button', { class: 'ibtn sq', title: sk.k === 'text' ? 'Размер по умолчанию' : 'Толщина по умолчанию — как у ручки', onclick: (e) => { e.stopPropagation(); setSize(sk.k, sz(sk.k), true, true); } }, el('span', { class: 'ic', html: ICONS.reset }));
      selBar.append(el('div', { class: 'isize', title: cfg.name }, el('span', { class: 'ic', html: ICONS[sk.k === 'text' ? 'text' : 'sizeLine'] }), row.el), def);
      selBar._sync = () => { row.paint(); def.disabled = Math.abs(cur() - sz(sk.k)) < 1e-6; };
      selBar._sync();
      selBar.append(el('div', { class: 'isep' }));
    }
    const acts = selectionActions(its);
    acts.forEach((a, i) => {
      selBar.append(el('button', { class: 'ibtn sq ' + a.cls, title: a.label + ((a.title || '').match(/(Ctrl\S*|Shift\+\S+|Delete)$/) ? ' (' + a.title.match(/(Ctrl\S*|Shift\+\S+|Delete)$/)[1] + ')' : ''), onclick: (e) => { e.stopPropagation(); a.f(); } }, el('span', { class: 'ic', html: actIcon(a.ic) })));
    });
    selBar.hidden = false;
    placeSelBar();
  }
  // Панель — над выделенным, по центру; нет места сверху — под ним. Пока двигаешь или тянешь — спрятана.
  function placeSelBar() {
    if (selBar.hidden) return;
    const ov = S.ov;
    const busy = (ov && (ov.dx || ov.dy || (ov.k ?? 1) !== 1 || (ov.kx ?? 1) !== 1 || (ov.ky ?? 1) !== 1)) || (gesture && gesture.drawScreen);
    const bb = !busy && selectionBox();
    if (!bb) { selBar.classList.add('away'); return; }
    const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]);
    const w = selBar.offsetWidth, h = selBar.offsetHeight;
    const pos = prefs.barPos || 'top', tbr = toolbar.getBoundingClientRect();
    const topLimit = pos === 'top' ? tbr.bottom + 8 : 62;
    const bottomLimit = pos === 'bottom' ? tbr.top - 8 : H - 8;
    const rightLimit = pos === 'right' ? tbr.left - 8 : W - 8;
    const leftLimit = pos === 'left' ? tbr.right + 8 : 8;
    const es = !shapeSel() && editSel(); const gapT = es ? 42 : 18, gapB = es && es.k === 'solid' ? 64 : es ? 42 : 18; // стрелки поворота у углов, у стереометрии снизу — вращение
    // панель привязана к фигуре: двигаешь доску — она едет вместе с фигурой и уходит за край вместе с ней
    let top = y0 - h - gapT;
    if (top < topLimit) {
      if (y1 + gapB + h <= bottomLimit) top = y1 + gapB; // сверху места нет — под фигурой
      else if (y0 < topLimit && y1 > bottomLimit) top = topLimit; // фигура больше экрана — у верхнего края видимой части
    }
    // по центру над фигурой; к краю экрана прижимаем, только если фигура шире панели и видна частично
    let left = (x0 + x1) / 2 - w / 2;
    const lo = Math.max(leftLimit, x0), hi = Math.min(rightLimit, x1) - w;
    if (lo <= hi) left = clamp(left, lo, hi);
    selBar.style.left = Math.round(left) + 'px';
    selBar.style.top = Math.round(top) + 'px';
    selBar.classList.remove('away');
  }
  // Быстрое меню у курсора: инструменты по кругу, последние цвета внутри
  let radialEl = null;
  function closeRadial() { if (radialEl) { radialEl.remove(); radialEl = null; } }
  function radialMenu(sx, sy) {
    closePopovers(); closeRadial();
    const R = 74, cx = clamp(sx, R + 30, W - R - 30), cy = clamp(sy, R + 30, H - R - 30);
    const shapeTool = (prefs.last_shapes && toolDef(prefs.last_shapes)) ? prefs.last_shapes : 'line';
    const ring = [
      ['select', 'Выделение'], ['pen', 'Перо'], ['dpen', 'Пунктир'], ['hl', 'Маркер'],
      ['eraser', 'Ластик'], [shapeTool, toolDef(shapeTool)?.name || 'Фигуры'], ['text', 'Текст'], ['hand', 'Рука'],
    ];
    const wrap = el('div', { class: 'radial', style: `left:${cx}px;top:${cy}px` });
    wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === wrap) closeRadial(); });
    wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); closeRadial(); });
    ring.forEach(([t, name], i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
      wrap.append(el('button', {
        class: 'rbtn' + (S.tool === t ? ' on' : ''), title: name,
        style: `transform: translate(${(R * Math.cos(a)).toFixed(1)}px, ${(R * Math.sin(a)).toFixed(1)}px)`,
        onclick: () => { closeRadial(); setTool(t, { noToggle: true }); },
      }, el('span', { class: 'ic', html: iconHtml(t) })));
    });
    const cur = currentColor();
    (prefs.recentColors || []).slice(0, 4).forEach((c, i) => {
      const a = -Math.PI / 4 + (i * Math.PI) / 2;
      wrap.append(el('button', {
        class: 'rcol' + (c === cur ? ' on' : ''), style: `--c:${c};transform: translate(${(30 * Math.cos(a)).toFixed(1)}px, ${(30 * Math.sin(a)).toFixed(1)}px)`,
        onclick: () => { closeRadial(); if (!['pen', 'dpen', 'hl'].includes(S.tool) && !S.sel.size) setTool('pen', { noToggle: true }); setColor(c); },
      }));
    });
    wrap.append(el('button', { class: 'rmore', title: 'Ещё', onclick: () => { closeRadial(); canvasMenu(sx, sy, true); } }, '···'));
    document.body.append(wrap); radialEl = wrap;
  }
  window.addEventListener('keydown', (e) => { if (radialEl && e.key === 'Escape') closeRadial(); }, true);

  // правая кнопка мыши по доске — те же действия рядом с курсором
  function canvasMenu(sx, sy, boardOnly = false) {
    const [wx, wy] = toWorld(sx, sy);
    const hit = boardOnly ? null : topHit(wx, wy, 7, true);
    const row = (ic, label, f, cls = '', hint) => el('button', { class: 'mi ' + cls, onclick: () => { closePopovers(); f(); } }, el('span', { class: 'mi-l' }, el('span', { class: 'ic', html: actIcon(ic) }), label), hint ? el('span', { class: 'hint' }, hint) : null);
    if (hit) {
      if (!S.sel.has(hit.id)) S.sel = new Set([hit.id]);
      if (S.tool !== 'select') setTool('select', { noToggle: true });
      invalidate();
      const its = [...S.sel].map((id) => items.get(id)).filter(Boolean);
      popoverAt(sx + 4, sy + 4, [el('div', { class: 'mh' }, its.length === 1 ? itemName(its[0]) : `Выделено: ${its.length}`), ...selectionActions(its).map((a) => row(a.ic, a.label, a.f, a.cls))]);
    } else {
      popoverAt(sx + 4, sy + 4, [
        el('div', { class: 'mh' }, 'Доска'),
        row('select', 'Выделить всё на листе', () => { setTool('select', { noToggle: true }); S.sel = new Set(pageItems().filter((i) => !i.locked).map((i) => i.id)); invalidate(); }, '', 'Ctrl+A'),
        row('image', 'Вставить картинку или PDF…', () => pickFile([wx, wy]), '', 'I'),
        row('tex', 'Формулу сюда', () => openTexEditor(null, wx, wy), '', 'F'),
        row('graph', 'График сюда', () => openGraphEditor(null, wx, wy), '', 'G'),
        row('full', 'Показать всё', fitContent, '', 'Shift+1'),
        row('plus', 'Новый лист', () => addPage(), '', 'Shift+N'),
      ]);
    }
  }
  function deleteSelection() { if (!S.sel.size) return; act(() => { for (const id of S.sel) yItems.delete(id); }); S.sel.clear(); invalidate(); }
  function duplicate() {
    if (!S.sel.size) return;
    const ids = []; let z = zTop(S.page);
    act(() => { for (const id of S.sel) { const it = items.get(id); if (!it) continue; const nid = uid(); ids.push(nid); addItem({ ...it, id: nid, x: it.x + 24, y: it.y + 24, z: z++, locked: false }); } });
    S.sel = new Set(ids); invalidate();
  }
  function reorder(dir) {
    const a = pageItems(); if (!a.length) return;
    const sel = a.filter((i) => S.sel.has(i.id));
    act(() => {
      if (dir > 0) { let z = a[a.length - 1].z + 1; for (const i of sel) setFields(i.id, { z: z++ }); }
      else { let z = a[0].z - sel.length; for (const i of sel) setFields(i.id, { z: z++ }); }
    });
  }
  function toggleLock() {
    const its = [...S.sel].map((id) => items.get(id)).filter(Boolean); if (!its.length) return;
    const v = !its.every((i) => i.locked);
    act(() => { for (const i of its) setFields(i.id, { locked: v }); });
    if (v) S.sel.clear();
    invalidate(); selBar.dataset.key = '';
  }
  function setColor(c) {
    if (S.sel.size) {
      act(() => { for (const id of S.sel) { const it = items.get(id); if (it && it.type !== 'image') setFields(id, it.type === 'note' ? { bg: noteBg(c) } : { color: c }); } });
    }
    if (S.tool === 'hl') prefs.hlColor = c; else prefs.penColor = c;
    prefs.recentColors = [c, ...(prefs.recentColors || []).filter((x) => x !== c)].slice(0, 4);
    savePrefs(); renderToolbar(); updateCursor();
  }
  const noteBg = (c) => ({ '#1e1e1e': '#e9ecef', '#1971c2': '#d0ebff', '#e03131': '#ffe3e3', '#2f9e44': '#d3f9d8', '#f08c00': '#ffe8cc', '#9c36b5': '#f3d9fa', '#fab005': '#fff3bf', '#ffffff': '#ffffff' }[c] || '#fff3bf');

  // ---------- инструменты и клавиши ----------
  function setTool(t, opts = {}) {
    if (t === 'image') { pickFile(null); return; }
    // ластик при выделенном — стираем выделенное (как Delete), дальше — обычный ластик
    if (t === 'eraser' && S.tool === 'select' && S.sel.size && !opts.keepSel) { const n = [...S.sel].filter((id) => !items.get(id)?.locked).length; if (n) { S.sel = new Set([...S.sel].filter((id) => !items.get(id)?.locked)); deleteSelection(); toast(n === 1 ? 'Выделенное стёрто' : `Стёрто: ${n}`); } }
    if (S.tool === t && !opts.noToggle && !(t === 'select' && S.autoBack)) { // V при автовыделении — просто остаёмся в выделении
      if (t === 'eraser') { prefs.eraserPrecise = !prefs.eraserPrecise; savePrefs(); }
    }
    if (poly) finishPoly(false);
    S.tool = t; S.autoBack = null; closeEditors(true);
    if (INK_TOOLS.has(t) && prefs.lastInk !== t) { prefs.lastInk = t; savePrefs(); }
    for (const [gn, g] of Object.entries(GROUPS)) if (g.tools.includes(t)) { prefs['last_' + gn] = t; savePrefs(); }
    if (t !== 'select') { S.sel.clear(); }
    renderToolbar(); updateCursor(); invalidate();
  }
  function updateCursor() {
    const c = INK_TOOLS.has(S.tool) ? penCursor(S.tool === 'hl' ? 'hl' : S.tool === 'dpen' ? 'dash' : 'pen', currentColor())
      : S.tool === 'eraser' ? eraserCursor(eraserRadius() * 2, prefs.eraserPrecise)
      : S.tool === 'select' ? selectCursor() : { hand: 'grab', text: 'text' }[S.tool] || 'crosshair';
    cvOver.style.cursor = S.space ? 'grab' : c;
  }
  const sizeKey = () => (S.tool === 'hl' ? 'hl' : S.tool === 'eraser' ? 'eraser' : S.tool === 'text' || S.tool === 'tex' ? 'text' : GROUPS.shapes.tools.includes(S.tool) ? 'shape' : 'pen');
  // [ и ] — к соседнему готовому значению
  function sizeStep(d) {
    const k = sizeKey(); const P = SIZE_CFG[k].presets; const v = sz(k);
    const next = d > 0 ? P.find((x) => x > v + 1e-6) ?? P[P.length - 1] : [...P].reverse().find((x) => x < v - 1e-6) ?? P[0];
    setSize(k, next, true);
  }
  // Новая толщина — для следующих линий и для выделенного (как с цветом)
  // onlySel — из панели выделения: меняем только выделенное, перо остаётся прежним
  function setSize(k, v, applyToSel, onlySel = false) {
    const c = SIZE_CFG[k]; v = clamp(Math.round(v / c.step) * c.step, c.min, c.max);
    if (!onlySel) { if (k === 'shape') prefs.shapeSize = v; else prefs.size[k] = v; savePrefs(); updateCursor(); }
    // поменяли толщину выделенных фигур — следующая фигура будет такой же
    else if (applyToSel && k === 'pen' && [...S.sel].some((id) => SIZED_SHAPES.includes(items.get(id)?.type))) { prefs.shapeSize = v; savePrefs(); }
    queueMicrotask(() => { sizePaint?.(); selBar._sync?.(); });
    if (applyToSel && S.sel.size && k !== 'eraser') {
      act(() => {
        for (const id of S.sel) {
          const it = items.get(id); if (!it || it.locked) continue;
          const put = (f, x) => { if (Math.abs((it[f] ?? -1) - x) > 1e-9) setFields(id, { [f]: x }); }; // без пустых шагов отмены
          if (k === 'text' && it.type === 'text') put('fs', v);
          else if (k === 'hl' && it.type === 'stroke' && it.kind === 'hl') put('size', v);
          else if (k === 'pen' && it.type === 'stroke' && it.kind !== 'hl') put('size', it.kind === 'dash' ? v * 0.9 : v);
          else if ((k === 'pen' || k === 'shape') && SIZED_SHAPES.includes(it.type)) put('size', v * 0.9);
        }
      });
    }
  }
  // Толщина фигур прямо в меню фигур: ползунок с шагом 0,5. Каждый новый выбор фигуры начинается с толщины ручки.
  // Толщина фигур своя: остаётся последней выбранной (ручка на неё не влияет). Образцы показывают, какой будет линия.
  function shapeSizeRow() {
    const toShape = () => { if (!GROUPS.shapes.tools.includes(S.tool)) { const l = prefs.last_shapes; setTool(l && GROUPS.shapes.tools.includes(l) ? l : 'line', { noToggle: true }); } };
    const row = sizeRow('shape', () => sz('shape'), (v, final) => { toShape(); setSize('shape', v, false); paint(); }, false);
    const chips = el('div', { class: 'sz-chips sh-chips' });
    for (const v of SIZE_CFG.shape.presets) chips.append(el('button', { class: 'sz-chip sh-chip', 'data-v': v, title: 'Толщина ' + String(v).replace('.', ','), onclick: () => { toShape(); setSize('shape', v, false); paint(); } },
      el('span', { class: 'sz-line', style: `height:${clamp(v * 0.9 * 1.1, 1, 13)}px` }), el('span', { class: 'sz-n' }, String(v).replace('.', ','))));
    const same = el('button', { class: 'btn small sh-same', title: 'Сделать толщину фигур такой же, как у ручки', onclick: () => { toShape(); setSize('shape', prefs.size.pen, false); paint(); } }, 'Как у ручки');
    const paint = () => { row.paint(); const v = sz('shape'); for (const c of chips.children) c.classList.toggle('on', Math.abs(+c.dataset.v - v) < 1e-6); same.disabled = Math.abs(prefs.size.pen - v) < 1e-6; };
    const wrap = el('div', { class: 'shape-size', title: 'Толщина фигур' },
      el('div', { class: 'sh-top' }, el('span', { class: 'ic', html: ICONS.sizeLine }), row.el, same), chips);
    sizePaint = paint; paint();
    return wrap;
  }
  // Толщина выпадает у своего инструмента: перо, пунктир, маркер, ластик, текст
  const SIZE_OF = { pen: 'pen', dpen: 'pen', hl: 'hl', eraser: 'eraser', text: 'text' };
  let sizePaint = null;
  const dotPx = (k, v) => clamp(k === 'text' ? v * 0.35 : k === 'eraser' ? v * 0.3 : v * (k === 'hl' ? 0.55 : 1.4), 2, 20);
  function openSizePop(tool, anchor) {
    const k = SIZE_OF[tool]; const c = SIZE_CFG[k];
    let gp = null;
    const pick = () => { if (S.tool !== tool && !(S.sel.size && S.tool === 'select')) { setTool(tool, { noToggle: true }); groupPop = gp; } };
    const row = sizeRow(k, () => sz(k), (v, final) => { setSize(k, v, final); if (final) pick(); }, false);
    const chips = el('div', { class: 'sz-chips' });
    for (const v of c.presets) {
      const d = dotPx(k, v);
      chips.append(el('button', { class: 'sz-chip', 'data-v': v, onclick: () => { setSize(k, v, true); pick(); } },
        k === 'text' ? el('span', { class: 'sz-a', style: `font-size:${clamp(v * 0.5, 9, 26)}px` }, 'A')
          : el('span', { class: 'sz-dot' + (k === 'eraser' ? ' er' : ''), style: `width:${d}px;height:${d}px;${k === 'hl' ? 'opacity:.6;' : ''}${tool === 'dpen' ? 'border-radius:1px;' : ''}` }),
        el('span', { class: 'sz-n' }, String(v).replace('.', ','))));
    }
    const content = [row.el, chips];
    // цвет — сразу здесь, чтобы не тянуться к панели (у ластика цвета нет)
    let cols = null;
    if (tool !== 'eraser') {
      cols = el('div', { class: 'sz-colors' }, COLORS.map((c, i) => el('button', { class: 'cbtn', 'data-c': c, title: COLOR_NAMES[i], style: `--c:${c}`,
        onclick: () => { pick(); setColor(c); groupPop = gp; paintAll(); } })));
      content.push(cols);
    }
    let modes = null;
    if (tool === 'eraser') {
      const mode = (precise, ic, label, title) => el('button', { class: 'sz-mode', 'data-p': precise ? 1 : 0, title, onclick: () => { prefs.eraserPrecise = precise; savePrefs(); pick(); renderToolbar(); groupPop = gp; updateCursor(); paintAll(); } },
        el('span', { class: 'ic', html: ICONS[ic] }), label);
      modes = el('div', { class: 'sz-modes' }, mode(false, 'eraser', 'Целиком', 'Стирает линию целиком — E'), mode(true, 'eraserPrecise', 'Точно', 'Стирает только то, чего касается — E'));
      content.unshift(modes);
    }
    const paintAll = () => {
      row.paint(); const v = sz(k);
      for (const ch of chips.children) ch.classList.toggle('on', Math.abs(+ch.dataset.v - v) < 1e-6);
      if (modes) for (const b of modes.children) b.classList.toggle('on', !!+b.dataset.p === !!prefs.eraserPrecise);
      if (cols) { const cc = tool === 'hl' ? (prefs.hlColor || currentColor()) : (prefs.penColor || currentColor()); for (const b of cols.children) b.classList.toggle('on', b.dataset.c === cc); }
    };
    const pop = popover(anchor, content);
    pop.classList.add('sz-pop');
    gp = hoverPop(pop, anchor, 'size:' + tool);
    sizePaint = () => { if (document.body.contains(pop)) paintAll(); else sizePaint = null; };
    paintAll();
  }
  function doUndo() { closeEditors(true); undoPages.clear(); undo.undo(); afterUndo(); }
  function doRedo() { closeEditors(true); undoPages.clear(); undo.redo(); afterUndo(); }
  function afterUndo() {
    if (undoPages.size && !undoPages.has(S.page)) { const p = [...undoPages][0]; if (yPages.has(p)) { setPage(p); } }
  }

  const keyTool = {}; for (const t of TOOLS) if (t.key) keyTool[t.key.toLowerCase()] = t.id;
  Object.assign(keyTool, { b: 'pen' });
  const RU = { 'м': 'v', 'р': 'h', 'з': 'p', 'и': 'b', 'ь': 'm', 'у': 'e', 'д': 'l', 'ф': 'a', 'к': 'r', 'щ': 'o', 'с': 'c', 'е': 't', 'а': 'f', 'п': 'g', 'т': 'n', 'ш': 'i', 'л': 'k', 'я': 'z', 'н': 'y', 'в': 'd', 'ы': 's', 'х': '[', 'ъ': ']' };
  window.addEventListener('keydown', (e) => {
    // защита от ухода со страницы
    if ((e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) || e.key === 'BrowserBack' || e.key === 'BrowserForward') { e.preventDefault(); return; }
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    // e.code не зависит от раскладки: русская раскладка тоже работает
    let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (RU[k]) k = RU[k];
    if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3).toLowerCase();
    if (e.code === 'BracketLeft') k = '['; if (e.code === 'BracketRight') k = ']';
    if (e.code && /^Digit\d$/.test(e.code)) k = e.code.slice(5);

    if (e.key === ' ' || e.code === 'Space') { if (!S.space) { S.space = true; updateCursor(); } e.preventDefault(); return; }
    if (ctrl) {
      // Ctrl +, Ctrl −, Ctrl 0 — масштаб доски (а не всей страницы браузера)
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') { e.preventDefault(); zoomStep(1); return; }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') { e.preventDefault(); zoomStep(-1); return; }
      if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); zoomAt(W / 2, H / 2, 1 / S.view.z); return; }
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
      else if (k === 'a') { e.preventDefault(); S.sel = new Set(pageItems().filter((i) => !i.locked).map((i) => i.id)); if (S.tool !== 'select') { S.tool = 'select'; renderToolbar(); updateCursor(); } invalidate(false); }
      else if (k === 'd') { e.preventDefault(); duplicate(); }
      else if (k === 's') { e.preventDefault(); exportLesson(); }
      else if (k === 'o') { e.preventDefault(); importLesson(); }
      else if (k === ']') { e.preventDefault(); reorder(1); }
      else if (k === '[') { e.preventDefault(); reorder(-1); }
      else if (k === '=' || k === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); zoomAt(W / 2, H / 2, 1.25); }
      else if (k === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomAt(W / 2, H / 2, 0.8); }
      else if (k === '0') { e.preventDefault(); zoomAt(W / 2, H / 2, 1 / S.view.z); }
      return;
    }
    if (e.altKey) { if (e.key === 'Alt') e.preventDefault(); return; }
    if (poly && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); if (e.key === 'Enter') finishPoly(false); else { poly = null; invalidate(false); } return; }
    if (e.key === 'Escape') { if (gesture) { gesture.cancel?.(); gesture = null; } closePopovers(); if (shapeSel()) { setShapeEdit(null); return; } S.sel.clear(); invalidate(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (S.sel.size) deleteSelection();
      else if (e.key === 'Delete') confirmDeletePage(S.page);
      return;
    }
    if (e.key === 'Enter' && S.sel.size === 1) { e.preventDefault(); editItem(items.get([...S.sel][0])); return; }
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault(); const ps = pages(); const i = ps.findIndex((p) => p.id === S.page);
      const j = i + (e.key === 'PageDown' ? 1 : -1); if (ps[j]) setPage(ps[j].id); else if (e.key === 'PageDown') addPage();
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? GRID : 2; const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      if (S.sel.size) act(() => { for (const id of S.sel) { const it = items.get(id); if (it) setFields(id, { x: it.x + dx, y: it.y + dy }); } });
      else { S.view.x -= dx * 20; S.view.y -= dy * 20; viewChanged(); }
      return;
    }
    if (e.key === '?' || e.key === 'F1' || (e.shiftKey && e.code === 'Slash')) { e.preventDefault(); showHelp(); return; }
    if (e.shiftKey) {
      if (k === 'l') { toggleLock(); return; }
      if (k === 'r') { makeRegularSel(); return; }
      if (k === 'f') { toggleFollow(); return; }
      if (k === 's') { summon(); return; }
      if (k === 'n') { addPage(); return; }
      if (k === '1') { fitContent(); return; }
      return;
    }
    if (/^[1-8]$/.test(k)) { setColor(COLORS[+k - 1]); return; }
    if (k === '[') { sizeStep(-1); return; }
    if (k === ']') { sizeStep(1); return; }
    if (k === 'x') { /* резерв */ return; }
    if (keyTool[k]) {
      e.preventDefault();
      if (e.repeat) return;
      let t = keyTool[k];
      if (t === 'line' && S.tool === 'line') t = 'dline'; // L, L — пунктирная
      // Короткое нажатие — инструмент остаётся. Зажала и поработала — после отпускания вернётся прежний.
      if (SPRING_TOOLS.has(t) && !spring) spring = { code: e.code, prev: S.tool, used: false };
      setTool(t);
    }
  });
  const SPRING_TOOLS = new Set(['select', 'hand', 'pen', 'dpen', 'hl', 'eraser', 'line', 'dline', 'arrow', 'darrow', 'arrow2', 'arrowin', 'rect', 'ellipse', 'circle']);
  let spring = null;
  function releaseSpring() {
    const sp = spring; spring = null;
    if (!sp || !sp.used) return;
    const back = () => { if (S.tool !== sp.prev) setTool(sp.prev, { noToggle: true, keepSel: true }); };
    if (gesture) { const g = gesture; const end = g.end; g.end = (ev) => { end.call(g, ev); back(); }; } else back();
  }
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.code === 'Space') { S.space = false; updateCursor(); }
    if (spring && e.code === spring.code) releaseSpring();
  });
  window.addEventListener('blur', () => { S.space = false; updateCursor(); releaseSpring(); });
  // боковые кнопки мыши и жест «назад»
  for (const t of ['mouseup', 'mousedown', 'pointerup', 'pointerdown', 'auxclick']) window.addEventListener(t, (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); }, { passive: false });
  history.pushState({ doska: 1 }, '', location.href);
  window.addEventListener('popstate', () => { history.pushState({ doska: 1 }, '', location.href); });
  window.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------- буфер обмена, перетаскивание ----------
  const CLIP_MARK = 'doska-items:';
  window.addEventListener('copy', (e) => {
    if (isTyping(e) || !S.sel.size) return;
    const data = [...S.sel].map((id) => items.get(id)).filter(Boolean).map(({ _pts, _path, _lb, _tm, ...r }) => r);
    e.clipboardData.setData('text/plain', CLIP_MARK + JSON.stringify(data)); e.preventDefault();
  });
  window.addEventListener('cut', (e) => {
    if (isTyping(e) || !S.sel.size) return;
    const data = [...S.sel].map((id) => items.get(id)).filter(Boolean).map(({ _pts, _path, _lb, _tm, ...r }) => r);
    e.clipboardData.setData('text/plain', CLIP_MARK + JSON.stringify(data)); e.preventDefault(); deleteSelection();
  });
  window.addEventListener('paste', async (e) => {
    if (isTyping(e)) return;
    const dt = e.clipboardData; if (!dt) return;
    const at = hover ? toWorld(hover.sx, hover.sy) : toWorld(W / 2, H / 2);
    const files = [...dt.files];
    if (files.length) { e.preventDefault(); await insertFiles(files, at); return; }
    const text = dt.getData('text/plain');
    if (text && text.startsWith(CLIP_MARK)) {
      e.preventDefault();
      let arr; try { arr = JSON.parse(text.slice(CLIP_MARK.length)); } catch { return; }
      let b = [Infinity, Infinity]; for (const it of arr) { b = [Math.min(b[0], it.x), Math.min(b[1], it.y)]; }
      const ids = []; let z = zTop(S.page);
      act(() => { for (const it of arr) { const id = uid(); ids.push(id); addItem({ ...it, id, page: S.page, z: z++, x: it.x - b[0] + at[0], y: it.y - b[1] + at[1] }); } });
      setTool('select', { noToggle: true }); S.sel = new Set(ids); invalidate();
    } else if (text && text.trim()) {
      e.preventDefault();
      const id = uid();
      act(() => addItem({ id, type: 'text', page: S.page, z: zTop(S.page), x: at[0], y: at[1], s: 1, fs: sz('text'), color: prefs.penColor, text: text.slice(0, 5000) }));
      setTool('select', { noToggle: true }); S.sel = new Set([id]); invalidate();
    }
  });
  const isTyping = (e) => { const t = document.activeElement; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); };
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const at = toWorld(e.clientX, e.clientY);
    await insertFiles([...(e.dataTransfer?.files || [])], at);
  });

  // ---------- картинки и PDF ----------
  let pickAt = null;
  const fileIn = el('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', multiple: true, hidden: true });
  fileIn.addEventListener('change', async () => {
    const at = pickAt || toWorld(W / 2, H / 3);
    await insertFiles([...fileIn.files], at);
    fileIn.value = '';
  });
  document.body.append(fileIn);
  function pickFile(at) { pickAt = at; fileIn.click(); }
  let insertBatch = false;
  async function insertFiles(files, at) {
    S.sel = new Set(); insertBatch = true;
    try { let k = 0; for (const f of files) { await insertFile(f, [at[0] + k * 30, at[1] + k * 30]); k++; } } finally { insertBatch = false; }
  }
  async function insertFile(f, at) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return insertPdf(f, at);
    if (!f.type.startsWith('image/')) { toast('Этот тип файла не поддерживается: ' + (f.name || f.type)); return; }
    const { src, w, h } = await compressImage(f, 1800);
    const maxW = (W * 0.55) / S.view.z, maxH = (H * 0.6) / S.view.z;
    const k = Math.min(1, maxW / w, maxH / h);
    const id = uid();
    act(() => addItem({ id, type: 'image', page: S.page, z: zTop(S.page), x: at[0], y: at[1], s: 1, w: w * k, h: h * k, src }));
    // сразу выделяем — можно тут же перетащить или растянуть
    if (S.tool !== 'select') setTool('select', { noToggle: true });
    if (!insertBatch) S.sel = new Set(); S.sel.add(id); invalidate();
    return id;
  }
  async function compressImage(blob, maxSide) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'); cx.drawImage(bmp, 0, 0, w, h);
    let src = c.toDataURL('image/webp', 0.86);
    if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/jpeg', 0.86);
    if (blob.size < 250000 && blob.type === 'image/png' && k === 1) src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    return { src, w, h };
  }
  async function insertPdf(f, at) {
    try {
      const pdfjs = await import('./pdf.js');
      const pdf = await pdfjs.load(await f.arrayBuffer());
      const n = Math.min(pdf.numPages, 40);
      let y = at[1]; const ids = [];
      for (let i = 1; i <= n; i++) {
        const page = await pdf.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 1500 / vp1.width);
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: cx, viewport: vp }).promise;
        let src = c.toDataURL('image/webp', 0.82); if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/jpeg', 0.85);
        const w = 900, h = (900 * c.height) / c.width; const id = uid(); ids.push(id);
        act(() => addItem({ id, type: 'image', page: S.page, z: zTop(S.page), x: at[0], y, s: 1, w, h, src, locked: true }));
        y += h + 30;
        if (n > 2) toast(`Страница ${i} из ${n}`, 900);
      }
      if (n < pdf.numPages) toast(`Вставлены первые ${n} страниц из ${pdf.numPages}`, 4000);
    } catch (e) { console.error(e); toast('Не получилось открыть PDF: ' + (e.message || e), 5000); }
  }

  // ---------- сохранение и экспорт ----------
  function download(blob, name) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  const stamp = () => new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
  function exportLesson() {
    const u = Y.encodeStateAsUpdate(doc);
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    download(new Blob([JSON.stringify({ format: 'doska', v: 1, room, saved: new Date().toISOString(), update: btoa(s) })], { type: 'application/json' }), `Урок ${stamp()}.doska`);
  }
  // Урок из файла .doska добавляется на новые листы этой доски (ничего на доске не заменяет).
  // Так можно вернуть урок после смены браузера или режима инкогнито: сохранили Ctrl+S — открыли здесь.
  function importLesson() {
    const inp = el('input', { type: 'file', accept: '.doska,.json' });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (o.format !== 'doska') throw new Error('это не файл урока');
        const src = new Y.Doc();
        Y.applyUpdate(src, Uint8Array.from(atob(o.update), (c) => c.charCodeAt(0)));
        const sp = src.getMap('pages'), si = src.getMap('items');
        const srcPages = [...sp.entries()].filter(([, m]) => !m.get('deletedAt')).map(([id, m]) => ({ id, name: m.get('name') || 'Лист', order: m.get('order') || 0 })).sort((a, b) => a.order - b.order);
        const byPage = new Map(srcPages.map((p) => [p.id, []]));
        si.forEach((m) => { const it = m.toJSON(); if (byPage.has(it.page)) byPage.get(it.page).push(it); });
        const withItems = srcPages.filter((p) => byPage.get(p.id).length);
        if (!withItems.length) { toast('В файле нет записей'); return; }
        const base = f.name.replace(/\.(doska|json)$/i, '').slice(0, 24);
        let after = S.page, first = null;
        for (const p of withItems) {
          const nm = (withItems.length > 1 ? `${base} · ${p.name}` : base).slice(0, 30);
          const nid = addPage(nm, after); after = nid; first = first || nid;
          act(() => { for (const it of byPage.get(p.id)) addItem({ ...it, id: uid(), page: nid }); });
        }
        setPage(first); requestAnimationFrame(fitContent);
      } catch (e) { toast('Не удалось открыть: ' + e.message, 4000); }
    };
    inp.click();
  }
  function renderPageCanvas(pageId, maxSide = 6000, jpeg = false) {
    const a = pageItems(pageId);
    if (!a.length) return null;
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const it of a) { const w = worldBox(it); b = [Math.min(b[0], w[0]), Math.min(b[1], w[1]), Math.max(b[2], w[2]), Math.max(b[3], w[3])]; }
    const pad = 40; b = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
    const k = Math.min(2, maxSide / Math.max(b[2] - b[0], b[3] - b[1]));
    const c = document.createElement('canvas'); c.width = Math.ceil((b[2] - b[0]) * k); c.height = Math.ceil((b[3] - b[1]) * k);
    const cx = c.getContext('2d');
    const v = { x: -b[0] * k, y: -b[1] * k, z: k };
    drawBackground(cx, yMeta.get('bg') || 'grid', v, c.width, c.height);
    cx.setTransform(k, 0, 0, k, v.x, v.y);
    for (const it of a) drawItem(cx, it, null, k);
    return c;
  }
  async function exportPng() {
    const c = renderPageCanvas(S.page); if (!c) { toast('Лист пустой'); return; }
    c.toBlob((bl) => download(bl, `${pages().find((p) => p.id === S.page)?.name || 'Лист'} ${stamp()}.png`), 'image/png');
  }
  async function exportPdf() {
    const imgs = [];
    for (const p of pages()) {
      const c = renderPageCanvas(p.id, 3000); if (!c) continue;
      const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      imgs.push({ w: c.width, h: c.height, data: new Uint8Array(await bl.arrayBuffer()) });
    }
    if (!imgs.length) { toast('Доска пустая'); return; }
    download(makePdf(imgs), `Урок ${stamp()}.pdf`);
  }
  function makePdf(imgs) {
    // минимальный PDF: каждая страница — одна JPEG-картинка
    const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const n = imgs.length; const kids = [];
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    offs[1] = len; push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
    for (let i = 0; i < n; i++) kids.push(`${3 + i * 3} 0 R`);
    offs[2] = len; push(`2 0 obj<</Type/Pages/Count ${n}/Kids[${kids.join(' ')}]>>endobj\n`);
    imgs.forEach((im, i) => {
      const pid = 3 + i * 3, iid = pid + 1, cid = pid + 2;
      const scale = Math.min(1, 1190 / Math.max(im.w, im.h)); // не больше A3 по длинной стороне
      const pw = (im.w * scale).toFixed(2), ph = (im.h * scale).toFixed(2);
      offs[pid] = len; push(`${pid} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pw} ${ph}]/Resources<</XObject<</I ${iid} 0 R>>>>/Contents ${cid} 0 R>>endobj\n`);
      offs[iid] = len; push(`${iid} 0 obj<</Type/XObject/Subtype/Image/Width ${im.w}/Height ${im.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${im.data.length}>>stream\n`); push(im.data); push('\nendstream endobj\n');
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /I Do Q`;
      offs[cid] = len; push(`${cid} 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\n`);
    });
    const total = 3 + n * 3; const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer<</Size ${total}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  // ---------- подсказки ----------
  // Вместо системных: тёмные, снизу справа от курсора, появляются плавно. Атрибут title переносится в data-tip.
  const tipEl = el('div', { class: 'tip', role: 'tooltip' }); document.body.append(tipEl);
  let tipFor = null, tipTimer = 0, tipXY = [0, 0];
  const hideTip = () => { clearTimeout(tipTimer); tipFor = null; tipEl.classList.remove('on'); };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest ? e.target.closest('[title],[data-tip]') : null;
    if (t && t.hasAttribute('title')) { const v = t.getAttribute('title'); t.removeAttribute('title'); if (v) t.dataset.tip = v; }
    if (t === tipFor) return;
    hideTip();
    if (!t || !t.dataset.tip || e.pointerType === 'touch') return;
    tipFor = t; tipXY = [e.clientX, e.clientY];
    tipTimer = setTimeout(() => {
      if (tipFor !== t || !document.body.contains(t)) return;
      // всегда в одном месте — в левом нижнем углу; если там панель инструментов — рядом с ней, не поверх
      tipEl.textContent = t.dataset.tip;
      const r = tipEl.getBoundingClientRect(), z = zoomBar.getBoundingClientRect();
      let x = 12, y = z.top + (z.height - r.height) / 2;
      const hits = (bx) => !(x + r.width + 6 <= bx.left || x - 6 >= bx.right || y + r.height + 6 <= bx.top || y - 6 >= bx.bottom);
      // обходим панель, масштаб, открытые окошки и панель выделенного: боковую панель — справа от неё, остальное — сверху
      const obst = [toolbar, zoomBar, selBar, whatsNew, ...popovers].filter((n) => n && !n.hidden && document.body.contains(n));
      for (let k = 0; k < 6; k++) {
        const o = obst.find((n) => hits(n.getBoundingClientRect())); if (!o) break;
        const bx = o.getBoundingClientRect();
        if (o === toolbar && toolbar.classList.contains('vert')) x = bx.right + 10; else y = bx.top - 10 - r.height;
      }
      tipEl.style.left = Math.round(x) + 'px';
      tipEl.style.top = Math.round(y) + 'px';
      tipEl.classList.add('on');
    }, 300);
  }, true);
  document.addEventListener('pointermove', (e) => { if (tipFor && !tipEl.classList.contains('on')) tipXY = [e.clientX, e.clientY]; }, true);
  for (const ev of ['pointerdown', 'wheel', 'keydown']) document.addEventListener(ev, hideTip, true);
  document.addEventListener('pointerout', (e) => { if (tipFor && !e.relatedTarget) hideTip(); }, true);
  // системная подсказка не должна успеть появиться: title снимаем сразу, как только он появился в документе
  const untitle = (n) => { if (n.nodeType !== 1) return; const v = n.getAttribute('title'); if (v != null) { n.removeAttribute('title'); if (v) n.dataset.tip = v; } };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes') untitle(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1) { untitle(n); n.querySelectorAll('[title]').forEach(untitle); }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  document.querySelectorAll('[title]').forEach(untitle);

  // ---------- интерфейс ----------
  const icon = (name) => { const s = el('span', { class: 'ic', html: ICONS[name] || '' }); return s; };
  const popovers = new Set();
  function closePopovers() { for (const p of popovers) p.remove(); popovers.clear(); }
  function popoverAt(x, y, content) {
    closePopovers();
    const p = el('div', { class: 'panel pop' }, content);
    document.body.append(p); popovers.add(p);
    const pr = p.getBoundingClientRect();
    p.style.left = clamp(x, 8, W - pr.width - 8) + 'px'; p.style.top = clamp(y, 8, H - pr.height - 8) + 'px';
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    p.addEventListener('contextmenu', (e) => e.preventDefault());
    setTimeout(() => document.addEventListener('pointerdown', function h(e) { if (!p.contains(e.target)) { p.remove(); popovers.delete(p); document.removeEventListener('pointerdown', h, true); } }, true), 0);
    return p;
  }
  function popover(anchor, content, align = 'left') {
    closePopovers();
    const p = el('div', { class: 'panel pop' }, content);
    document.body.append(p); popovers.add(p);
    // место окна считаем от его настоящего размера; если содержимое потом поменяло высоту — p.place() ставит заново,
    // чтобы окно всегда прилегало к своей кнопке (при нижней панели — нижним краем к панели)
    p.place = () => {
      const r = anchor.getBoundingClientRect(); const pr = p.getBoundingClientRect();
      const side = toolbar.contains(anchor) ? (prefs.barPos || 'top') : 'top';
      // окна у панели инструментов — по центру своей кнопки (у края экрана сдвигаются, чтобы не обрезаться)
      const onBar = toolbar.contains(anchor);
      const midX = r.left + r.width / 2 - pr.width / 2, midY = r.top + r.height / 2 - pr.height / 2;
      if (side === 'right') { // слева от кнопки
        p.style.left = Math.max(8, r.left - 8 - pr.width) + 'px';
        p.style.top = clamp(midY, 8, H - pr.height - 8) + 'px';
      } else if (side === 'left') { // справа от кнопки
        p.style.left = Math.min(W - pr.width - 8, r.right + 8) + 'px';
        p.style.top = clamp(midY, 8, H - pr.height - 8) + 'px';
      } else {
        p.style.top = (side === 'bottom' ? Math.max(8, r.top - 8 - pr.height) : r.bottom + 8) + 'px';
        p.style.left = clamp(onBar ? midX : align === 'right' ? r.right - pr.width : r.left, 8, W - pr.width - 8) + 'px';
      }
    };
    p.place();
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    setTimeout(() => document.addEventListener('pointerdown', function h(e) {
      if (!document.body.contains(p)) { document.removeEventListener('pointerdown', h, true); return; }
      if (p.contains(e.target)) return;
      // щелчок по кнопке, у которой открыто это окно, его не закрывает (окно закрывается, когда уводишь курсор)
      if (p.dataset.grp && e.target.closest && e.target.closest(`[data-grp="${p.dataset.grp}"]`)) return;
      p.remove(); popovers.delete(p); if (groupPop && groupPop.el === p) closeGroupPop();
      document.removeEventListener('pointerdown', h, true);
    }, true), 0);
    return p;
  }

  const FIG_IDS = Object.keys(FIGS).map((k) => 'fig:' + k);
  const GROUPS = {
    shapes: { tools: ['line', 'dline', 'arrow', 'darrow', 'arrow2', 'arrowin', 'rect', 'ellipse', 'circle', 'poly', ...FIG_IDS], name: 'Фигуры',
      sections: [['Основные', ['line', 'dline', 'arrow', 'darrow', 'arrow2', 'arrowin', 'rect', 'ellipse', 'circle', 'poly']],
        ['Планиметрия', FIG_IDS.filter((id) => FIGS[id.slice(4)].g === 'plane')],
        ['Стереометрия', FIG_IDS.filter((id) => FIGS[id.slice(4)].g === 'solid')]] },
    more: { tools: ['note', 'image'], name: 'Ещё', sections: [['', ['note', 'image']]] },
  };
  // Порядок по умолчанию: ладонь, выделение, ручки (основная, пунктир, маркер), ластик | фигуры | текст, формула, график, картинка | цвета.
  // Каждый может поменять порядок и спрятать лишнее: меню → «Кнопки на панели…» (хранится в этом браузере).
  const BAR_DEFAULT = ['hand', 'select', 'pen', 'dpen', 'hl', 'eraser', '|', '@shapes', '|', 'text', 'tex', 'graph', 'image'];
  const barOrder = () => {
    const known = new Set(BAR_DEFAULT.filter((b) => b !== '|'));
    let ord = Array.isArray(prefs.barOrder) ? prefs.barOrder.filter((b) => b === '|' || known.has(b)) : BAR_DEFAULT.slice();
    for (const b of known) if (!ord.includes(b)) ord.push(b); // новые кнопки из обновлений — в конец
    return ord;
  };
  function barList() {
    const hidden = new Set(prefs.barHidden || []);
    const out = [];
    for (const b of barOrder()) {
      if (b === '|') { if (out.length && out[out.length - 1] !== '|') out.push('|'); continue; }
      if (!hidden.has(b)) out.push(b);
    }
    while (out[out.length - 1] === '|') out.pop();
    return out;
  }
  const toolDef = (id) => TOOLS.find((t) => t.id === id);
  function toolIcon(id) {
    if (id === 'eraser' && prefs.eraserPrecise) return 'eraserPrecise';
    return id;
  }
  const iconHtml = (id) => (id.startsWith('fig:') ? figIcon(id.slice(4)) : ICONS[toolIcon(id)] || '');
  const HOVER_MS = 120; // сколько держать курсор на кнопке, чтобы раскрылся список
  let hoverTimer = 0, groupPop = null;
  function cancelGroupClose() {}
  const popOpen = (gname) => !!(groupPop && groupPop.gname === gname && document.body.contains(groupPop.el));
  // Выпадающее окно у кнопки: курсор ушёл с кнопки и с окна — окно сразу исчезает.
  // Между кнопкой и окном — невидимый «мостик», чтобы по дороге вниз окно не закрылось.
  function hoverPop(pop, anchor, gname) {
    const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    let bx, by, bw, bh;
    if (pr.left >= r.right - 1) { bx = r.right - 2; bw = pr.left - r.right + 4; by = Math.min(r.top, pr.top); bh = Math.max(r.bottom, pr.bottom) - by; } // окно справа
    else if (pr.right <= r.left + 1) { bx = pr.right - 2; bw = r.left - pr.right + 4; by = Math.min(r.top, pr.top); bh = Math.max(r.bottom, pr.bottom) - by; } // окно слева
    else if (pr.bottom <= r.top + 1) { by = pr.bottom - 2; bh = r.top - pr.bottom + 4; bx = Math.min(r.left, pr.left); bw = Math.max(r.right, pr.right) - bx; } // окно сверху
    else { by = r.bottom - 2; bh = Math.max(4, pr.top - r.bottom + 4); bx = Math.min(r.left, pr.left); bw = Math.max(r.right, pr.right) - bx; } // окно снизу
    const bridge = el('div', { class: 'pop-bridge', style: `left:${bx}px;top:${by}px;width:${Math.max(4, bw)}px;height:${Math.max(4, bh)}px` });
    document.body.append(bridge); popovers.add(bridge);
    const gp = { gname, el: pop, bridge };
    groupPop = gp; pop.dataset.grp = gname;
    pop.addEventListener('pointerleave', scheduleGroupClose);
    bridge.addEventListener('pointerleave', scheduleGroupClose);
    return gp;
  }
  function closeGroupPop() {
    const gp = groupPop; groupPop = null; if (!gp) return;
    gp.el.remove(); gp.bridge?.remove(); popovers.delete(gp.el); popovers.delete(gp.bridge);
  }
  function scheduleGroupClose(e) {
    const gp = groupPop; if (!gp) return;
    const to = e && e.relatedTarget;
    if (to && to.nodeType === 1 && (gp.el.contains(to) || gp.bridge.contains(to) || to.closest(`[data-grp="${gp.gname}"]`))) return;
    closeGroupPop();
  }
  function renderToolbar() {
    clearTimeout(hoverTimer); // открытое окно остаётся привязанным: у новых кнопок тот же data-grp
    const keepScroll = [toolbar.scrollLeft, toolbar.scrollTop];
    toolbar.innerHTML = '';
    for (const b of barList()) {
      if (b === '|') { toolbar.append(el('div', { class: 'sep' })); continue; }
      if (b[0] === '@') {
        const gname = b.slice(1); const grp = GROUPS[gname];
        const active = grp.tools.includes(S.tool);
        const last = active ? S.tool : (prefs['last_' + gname] && grp.tools.includes(prefs['last_' + gname]) ? prefs['last_' + gname] : grp.tools[0]);
        const show = gname === 'more' && !active ? 'more' : last;
        const btn = el('button', {
          class: 'tbtn grp' + (active ? ' on' : ''), 'data-grp': gname,
          title: gname === 'shapes' ? 'Фигуры' : 'Ещё',
        }, el('span', { class: 'ic', html: show === 'more' ? ICONS.more : iconHtml(show) }), el('span', { class: 'tri' }));
        // Список открывается сам, если задержать курсор на кнопке (полоска внизу показывает отсчёт)
        btn.style.setProperty('--hover-ms', HOVER_MS + 'ms');
        btn.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || popOpen(gname)) return; // перо и палец над панелью окна сами не открывают
          clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { btn.classList.remove('hovering'); if (btn.isConnected && btn.matches(':hover') && !gesture) openGroup(); }, HOVER_MS);
        });
        btn.addEventListener('pointerleave', (e) => { clearTimeout(hoverTimer); btn.classList.remove('hovering'); scheduleGroupClose(e); });
        // щелчок: выбрать (если это фигуры) и оставить окно открытым — закроется, когда уведёте курсор
        btn.onclick = () => {
          clearTimeout(hoverTimer); btn.classList.remove('hovering');
          if (gname === 'shapes' && !active) setTool(last);
          if (!popOpen(gname)) openGroup();
        };
        const openGroup = () => {
          cancelGroupClose();
          const secs = grp.sections.map(([title, ids]) => [
              title ? el('div', { class: 'mh' }, title) : null,
              el('div', { class: gname === 'more' ? 'mlist' : 'fig-grid' }, ids.map((t) => {
                const d = toolDef(t);
                const label = d.name + (d.key ? ` (${d.key})` : '');
                const pick = () => { closePopovers(); setTool(t, { noToggle: true }); };
                if (gname === 'more') return el('button', { class: 'mi', onclick: pick }, el('span', { class: 'mi-l' }, el('span', { class: 'ic', html: iconHtml(t) }), d.name), el('kbd', {}, d.key));
                const bb = el('button', { class: 'figbtn' + (S.tool === t ? ' on' : ''), title: label, onclick: pick },
                  el('span', { class: 'ic', html: iconHtml(t) }));
                return bb;
              })),
            ]).flat();
          // фигуры: список прокручивается (стереометрия — ниже, колесом), толщина всегда видна внизу
          const scroll = gname === 'shapes' ? el('div', { class: 'fig-scroll' }, secs) : null;
          const pop = popover(btn, scroll ? [scroll, shapeSizeRow()] : secs);
          if (scroll) {
            pop.classList.add('fig-pop');
            const stereo = [...scroll.querySelectorAll('.mh')].find((h) => /стерео/i.test(h.textContent));
            if (stereo) { scroll.style.maxHeight = Math.max(120, stereo.offsetTop - scroll.offsetTop + 22) + 'px'; } // виден краешек заголовка — понятно, что ниже есть ещё
            scroll.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
            pop.place(); // высота стала меньше — придвигаем окно к кнопке
          }
          hoverPop(pop, btn, gname);
        };
        toolbar.append(btn);
        continue;
      }
      const t = toolDef(b);
      const tb = el('button', {
        class: 'tbtn' + (S.tool === t.id ? ' on' : ''), title: `${t.name} (${t.key})`, 'data-grp': 'size:' + t.id,
        // повторный щелчок по выбранному перу/ластику/тексту — открыть толщину
        onclick: () => {
          clearTimeout(hoverTimer);
          const wasOn = S.tool === t.id;
          if (!wasOn || !SIZE_OF[t.id]) setTool(t.id); // V ещё раз — лассо, как раньше
          // пером и пальцем: первое касание — только выбрать инструмент, окно толщины — по второму касанию
          if (SIZE_OF[t.id] && !popOpen('size:' + t.id) && (wasOn || !penTapNow)) { const nb = toolbar.querySelector(`[data-grp="size:${t.id}"]`) || tb; openSizePop(t.id, nb); }
        },
      }, icon(toolIcon(t.id)));
      if (SIZE_OF[t.id]) {
        tb.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || popOpen('size:' + t.id)) return;
          clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { if (tb.isConnected && tb.matches(':hover') && !gesture) openSizePop(t.id, tb); }, HOVER_MS); // только если курсор всё ещё на кнопке
        });
        tb.addEventListener('pointerleave', (e) => { clearTimeout(hoverTimer); scheduleGroupClose(e); });
      }
      toolbar.append(tb);
    }
    toolbar.append(el('div', { class: 'sep' }));
    const cur = currentColor();
    const colorBtns = () => COLORS.map((c, i) => el('button', { class: 'cbtn' + (c === cur ? ' on' : ''), title: `${COLOR_NAMES[i]} — ${i + 1}`, style: `--c:${c}`, onclick: () => { setColor(c); } }));
    const vert = ['left', 'right'].includes(prefs.barPos);
    if (!vert) toolbar.append(el('div', { class: 'colors' }, colorBtns()));
    else {
      // сбоку цвета не занимают полпанели: одна кнопка текущего цвета, палитра — при наведении
      const cb = el('button', { class: 'tbtn cur-color', 'data-grp': 'colors', title: 'Цвет (1–8)' }, el('span', { class: 'swatch', style: `--c:${cur}` }));
      const openColors = () => { const pop = popover(cb, [el('div', { class: 'palette' }, colorBtns())]); pop.classList.add('pal-pop'); hoverPop(pop, cb, 'colors'); };
      cb.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse' || popOpen('colors')) return; clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { if (cb.isConnected && cb.matches(':hover') && !gesture) openColors(); }, HOVER_MS); });
      cb.addEventListener('pointerleave', (e) => { clearTimeout(hoverTimer); scheduleGroupClose(e); });
      cb.onclick = () => { clearTimeout(hoverTimer); if (!popOpen('colors')) openColors(); };
      toolbar.append(cb);
    }
    if (typeof layoutBars === 'function') layoutBars();
    if (toolbar.userScrolled) { toolbar.scrollLeft = keepScroll[0]; toolbar.scrollTop = keepScroll[1]; } else centerCore();
  }
  // Узкий экран: панель прокручивается — сразу показываем середину (ручку, ластик), а не край
  // Кнопки — сразу по касанию. Перо и палец при нажатии почти всегда чуть сдвигаются, и браузер тогда
  // не считает это щелчком: кнопка «не реагирует с первого раза». Срабатываем сами, как только перо оторвали над кнопкой.
  let fastTap = null, fastDone = null; var penTapNow = false;
  let palmAt = 0;
  document.addEventListener('pointerdown', (e) => {
    // ладонь: пишут пером, а рука касается панели — такие касания не считаем нажатием кнопки
    if (e.pointerType === 'touch' && (Date.now() - penSeenAt < 1500 || (gesture && !gesture.touch)) && e.target.closest?.('.bar, .pop')) { fastTap = null; palmAt = performance.now(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.pointerType === 'mouse' || e.button > 0) { fastTap = null; return; }
    const b = e.target.closest?.('button'); fastTap = b && !b.disabled && b.closest('.bar, .pop, .panel, .modal') ? { b, id: e.pointerId } : null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    const f = fastTap; fastTap = null; if (!f || f.id !== e.pointerId || !document.body.contains(f.b)) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (!over || !(over === f.b || f.b.contains(over))) return;
    fastDone = { b: f.b, t: performance.now() };
    penTapNow = true; try { f.b.click(); } finally { penTapNow = false; }
  }, true);
  // настоящий щелчок, который браузер пришлёт следом, — уже лишний
  document.addEventListener('click', (e) => {
    if (e.isTrusted && e.pointerType === 'touch' && performance.now() - palmAt < 900) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (!e.isTrusted || !fastDone) return;
    // кнопка могла уже перерисоваться (новый элемент на том же месте) — гасим любой щелчок пера/пальца сразу после касания
    if (performance.now() - fastDone.t < 700 && (e.pointerType !== 'mouse' || e.target === fastDone.b || fastDone.b.contains(e.target))) { e.stopImmediatePropagation(); e.preventDefault(); }
    fastDone = null;
  }, true);
  // Правая кнопка по свободному месту панели (не по кнопке) — настройка кнопок
  toolbar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.closest('button')) return;
    closePopovers(); barSettings();
  });
  function centerCore() {
    const pen = toolbar.querySelector('[data-grp="size:pen"]'); if (!pen) return;
    toolbar.progScroll = true;
    if (toolbar.classList.contains('vert')) toolbar.scrollTop = pen.offsetTop + pen.offsetHeight / 2 - toolbar.clientHeight / 2;
    else toolbar.scrollLeft = pen.offsetLeft + pen.offsetWidth / 2 - toolbar.clientWidth / 2;
    requestAnimationFrame(() => { toolbar.progScroll = false; });
  }
  toolbar.addEventListener('scroll', () => { if (!toolbar.progScroll) toolbar.userScrolled = true; }, { passive: true });

  const menuBtn = el('button', { class: 'tbtn', title: 'Меню', onclick: () => openMenu(menuBtn) }, icon('menu'));
  const pagesBox = el('div', { class: 'pages' });
  const titleBtn = el('button', { class: 'btitle', onclick: () => editTitle() });
  const titleTip = el('div', { class: 'ttip', hidden: true });
  titleBtn.addEventListener('pointerenter', () => { if (titleBtn.scrollWidth > titleBtn.clientWidth) { titleTip.textContent = boardTitle(); titleTip.hidden = false; const r = titleBtn.getBoundingClientRect(); titleTip.style.left = r.left + 'px'; titleTip.style.top = r.bottom + 6 + 'px'; } });
  titleBtn.addEventListener('pointerleave', () => { titleTip.hidden = true; });
  const addPageBtn = el('button', { class: 'page add', title: 'Новый лист — Shift+N', onclick: () => addPage() }, '+');
  topLeft.append(menuBtn, titleBtn, el('div', { class: 'sep' }), pagesBox, addPageBtn);
  document.body.append(titleTip);
  const TITLE_MAX = 40;
  const boardTitle = () => yMeta.get('title') || '';
  function renderTitle() {
    const t = boardTitle();
    titleBtn.textContent = t || 'Без названия'; titleBtn.classList.toggle('empty', !t);
    titleBtn.title = t ? 'Переименовать доску' : 'Задать название доски';
    document.title = (t || 'Доска') + ' — доска для занятий';
    const recent = LS.get('recent', []); const r = recent.find((x) => x.room === room);
    if (r && r.title !== t) { r.title = t; LS.set('recent', recent); }
  }
  function editTitle() {
    titleTip.hidden = true;
    const inp = el('input', { class: 'inp title-inp', maxlength: TITLE_MAX, value: boardTitle(), placeholder: 'Например: Алгебра — Петя' });
    const counter = el('span', { class: 'small muted' });
    const upd = () => { counter.textContent = `${inp.value.length}/${TITLE_MAX}`; };
    inp.addEventListener('input', upd); upd();
    const save = () => { const v = inp.value.trim().slice(0, TITLE_MAX); doc.transact(() => yMeta.set('title', v), NOUNDO); closePopovers(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') closePopovers(); e.stopPropagation(); });
    popover(titleBtn, [el('div', { class: 'mh' }, 'Название доски'), el('div', { class: 'row' }, inp), el('div', { class: 'row end' }, counter, el('button', { class: 'btn primary', onclick: save }, 'Сохранить'))]);
    inp.focus(); inp.select();
  }
  yMeta.observe(() => renderTitle());
  function renderPages() {
    pagesBox.innerHTML = '';
    for (const p of pages()) {
      const b = el('button', { class: 'page' + (p.id === S.page ? ' on' : ''), 'data-page': p.id, title: p.name + ' — правая кнопка: переименовать, удалить и др.', onclick: () => setPage(p.id) }, p.name);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); pageMenu(p.id, e.clientX, e.clientY); });
      pagesBox.append(b);
    }
    requestAnimationFrame(scrollActiveTab);
  }

  function openMenu(anchor) {
    const bg = yMeta.get('bg') || 'grid';
    const item = (label, f, hint) => el('button', { class: 'mi', onclick: () => { closePopovers(); f(); } }, label, hint ? el('span', { class: 'hint' }, hint) : null);
    const bgBtn = (id, label) => el('button', { class: 'chip' + (bg === id ? ' on' : ''), onclick: () => { doc.transact(() => yMeta.set('bg', id), NOUNDO); closePopovers(); } }, label);
    popover(anchor, [
      el('div', { class: 'mh' }, 'Фон'), el('div', { class: 'row' }, bgBtn('grid', 'Клетка'), bgBtn('lines', 'Линейка'), bgBtn('dots', 'Точки'), bgBtn('plain', 'Чисто')),
      el('div', { class: 'mh' }, 'Вставить'),
      item('Картинку или PDF…', () => pickFile(toWorld(W / 2 - 200, H / 4)), 'I, Ctrl+V'),
      el('div', { class: 'mh' }, 'Сохранить'),
      item('Урок в файл (.doska)', exportLesson, 'Ctrl+S'),
      item('Урок из файла — на новый лист…', importLesson, 'Ctrl+O'),
      item('Лист картинкой (PNG)', exportPng),
      item('Все листы в PDF', exportPdf),
      el('div', { class: 'mh' }, 'Лист'),
      item('Показать всё на листе', fitContent, 'Shift+1'),
      item('Удалить этот лист', () => deletePage(S.page)),
      el('div', { class: 'mh' }, 'Панель инструментов'),
      el('div', { class: 'row' }, ...[['top', 'Сверху'], ['bottom', 'Снизу'], ['left', 'Слева'], ['right', 'Справа']].map(([id, label]) =>
        el('button', { class: 'chip' + ((prefs.barPos || 'top') === id ? ' on' : ''), onclick: () => { prefs.barPos = id; savePrefs(); closePopovers(); renderToolbar(); invalidate(false); } }, label))),
      item('Кнопки на панели…', () => { closePopovers(); barSettings(); }),
      el('div', { class: 'mh' }, 'Прочее'),
      item('Горячие клавиши и подсказки', showHelp, '?'),
    ]);
  }
  // Настройка кнопок: перетащить строку — поменять порядок, глаз — показать/спрятать кнопку
  function barSettings() {
    let ord = barOrder().slice(); const hidden = new Set(prefs.barHidden || []);
    const nameOf = (b) => b === '|' ? 'Разделитель' : b === '@shapes' ? 'Фигуры' : toolDef(b)?.name || b;
    const iconOf = (b) => b === '|' ? '' : b === '@shapes' ? iconHtml(prefs.last_shapes && toolDef(prefs.last_shapes) ? prefs.last_shapes : 'line') : iconHtml(b);
    const list = el('div', { class: 'bs-list' });
    const apply = () => { prefs.barOrder = ord.slice(); prefs.barHidden = [...hidden]; savePrefs(); renderToolbar(); invalidate(false); };
    const paint = () => {
      list.innerHTML = '';
      ord.forEach((b, i) => {
        const off = b !== '|' && hidden.has(b);
        const row = el('div', { class: 'bs-row' + (b === '|' ? ' sep-row' : '') + (off ? ' off' : ''), 'data-i': i },
          el('span', { class: 'bs-grip', title: 'Перетащите, чтобы поменять место' }, '⋮⋮'),
          b === '|' ? el('span', { class: 'bs-sepline' }) : el('span', { class: 'ic', html: iconOf(b) }),
          el('span', { class: 'bs-name' }, nameOf(b)),
          b === '|' ? null : el('button', { class: 'bs-eye' + (off ? ' off' : ''), title: off ? 'Показать на панели' : 'Спрятать с панели',
            onclick: () => { if (off) hidden.delete(b); else { if (ord.filter((x) => x !== '|' && !hidden.has(x)).length <= 1) return; hidden.add(b); } apply(); paint(); } },
            el('span', { class: 'ic', html: ICONS.eye })));
        row.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.bs-eye')) return;
          e.preventDefault(); row.setPointerCapture(e.pointerId);
          const rows = [...list.children], h = row.getBoundingClientRect().height + 4, y0 = e.clientY;
          let at = i; row.classList.add('drag');
          const mv = (ev) => {
            const dy = ev.clientY - y0; row.style.transform = `translateY(${dy}px)`;
            at = clamp(i + Math.round(dy / h), 0, ord.length - 1);
            rows.forEach((r, k) => { if (r === row) return; const shift = (k > i && k <= at) ? -h : (k < i && k >= at) ? h : 0; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
          };
          const up = () => {
            row.removeEventListener('pointermove', mv); row.removeEventListener('pointerup', up); row.removeEventListener('pointercancel', up);
            if (at !== i) { const [x] = ord.splice(i, 1); ord.splice(at, 0, x); apply(); }
            paint();
          };
          row.addEventListener('pointermove', mv); row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up);
        });
        list.append(row);
      });
    };
    paint();
    const reset = el('button', { class: 'btn', onclick: () => { ord = BAR_DEFAULT.slice(); hidden.clear(); delete prefs.barOrder; delete prefs.barHidden; savePrefs(); renderToolbar(); paint(); } }, 'Как было');
    const d = modal('Кнопки на панели', el('div', { class: 'bs' }, list, el('div', { class: 'bs-foot' }, reset, el('button', { class: 'btn primary', onclick: () => d.close() }, 'Готово'))));
    d.m.querySelector('.dialog').classList.add('bs-dialog');
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Браузер не разрешил полный экран — нажмите F11'));
  }

  // правый верх: статус связи, слежение, масштаб, полный экран
  const statusBtn = el('button', { class: 'status', onclick: () => showConnect() });
  const followBtn = el('button', { class: 'tbtn', title: 'Смотреть туда же, куда собеседник — Shift+F', onclick: () => toggleFollow() }, icon('eye'));
  const summonBtn = el('button', { class: 'tbtn', title: 'Позвать собеседника к себе — Shift+S', onclick: () => summon() }, icon('summon'));
  const zoomBtn = el('button', { class: 'zoom', title: 'Показать всё (Shift+1)', onclick: fitContent });
  const fsBtn = el('button', { class: 'tbtn', title: 'Полный экран (помогает, если планшет не рисует у нижнего края)', onclick: toggleFullscreen }, icon('full'));
  const exitBtn = el('button', { class: 'tbtn', title: 'К списку досок (всё уже сохранено)', onclick: () => { location.hash = ''; location.reload(); } }, icon('exit'));
  // Ссылка для собеседника: одна кнопка — ссылка на эту доску уже в буфере, остаётся вставить в мессенджер
  const shareLink = () => location.protocol.startsWith('http') ? location.origin + location.pathname + '#r=' + room : null;
  const shareBtn = el('button', { class: 'tbtn', title: 'Скопировать ссылку на доску для собеседника', onclick: () => {
    const l = shareLink();
    if (!l) { showConnect(); return; }
    navigator.clipboard.writeText(l).then(() => toast('Ссылка скопирована'), () => uiDialog({ title: 'Ссылка на доску', text: 'Скопируйте вручную: выделите и нажмите Ctrl+C.', readonlyText: l, ok: 'Закрыть', cancel: null }));
  } }, icon('link'));
  const rolePill = el('div', { class: 'role-pill top', hidden: true });
  const paintRolePill = () => { rolePill.hidden = !prefs.role; rolePill.textContent = ROLE_NAMES[prefs.role] || ''; };
  paintRolePill();
  topRight.append(rolePill, statusBtn, shareBtn, followBtn, fsBtn, el('div', { class: 'sep' }), exitBtn);
  // «Что нового»: окно со списком изменений. Кнопка сбоку видна сутки после выхода версии.
  function showRelease(rel = RELEASE, pending = false) {
    const body = el('div', { class: 'rel' },
      el('div', { class: 'rel-sub' }, rel.title),
      ...rel.sections.map(([h, list]) => el('div', { class: 'rel-sec' }, el('div', { class: 'rel-h' }, h), el('ul', {}, ...list.map((t) => el('li', {}, t))))),
      pending ? el('div', { class: 'rel-foot' }, el('button', { class: 'btn primary', onclick: () => location.reload() }, 'Обновить')) : null);
    const d = modal('Что нового', body); d.m.querySelector('.dialog').classList.add('rel-dialog');
  }
  const relAt = (() => { const m = /^(\d{4})\.(\d\d)\.(\d\d)-(\d\d)(\d\d)(\d\d)$/.exec(__VERSION__); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; })();
  var whatsNew = el('button', { class: 'bar whatsnew', onclick: () => showRelease() }, el('span', { class: 'wn-dot' }), 'Что нового');
  if (relAt && Date.now() - relAt < 24 * 3600 * 1000) { app.append(whatsNew); placeWhatsNew(); setTimeout(() => whatsNew.remove(), Math.max(0, relAt + 24 * 3600 * 1000 - Date.now())); }
  // Новая версия на сайте: тихо проверяем раз в несколько минут и при возврате на вкладку
  if (location.protocol.startsWith('http')) {
    let shown = false;
    const check = async () => {
      if (shown || document.hidden) return;
      try {
        const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
        const { v, notes } = await r.json();
        if (v && v !== __VERSION__) {
          shown = true;
          document.body.append(el('div', { class: 'bar newver' }, el('span', {}, 'Доступна новая версия'),
            notes ? el('button', { class: 'btn small', onclick: () => showRelease(notes, true) }, 'Что нового') : null,
            el('button', { class: 'btn primary small', onclick: () => location.reload() }, 'Обновить')));
        }
      } catch {}
    };
    setTimeout(check, 15000); setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  // Масштаб — снизу справа. Шаг как у Ctrl + колесо, от центра экрана.
  const ZSTEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
  function zoomStep(d) {
    const z = S.view.z;
    const next = d > 0 ? ZSTEPS.find((v) => v > z * 1.001) ?? 12 : [...ZSTEPS].reverse().find((v) => v < z / 1.001) ?? 0.1;
    zoomAt(W / 2, H / 2, next / z);
  }
  // Отменить / вернуть — сверху, сразу справа от названия и листов. На узком экране, где сверху нет места, — снизу у масштаба.
  const urBtns = [
    el('button', { class: 'tbtn', title: 'Отменить своё действие — Ctrl+Z', onclick: doUndo }, icon('undo')),
    el('button', { class: 'tbtn', title: 'Вернуть — Ctrl+Shift+Z или Ctrl+Y', onclick: doRedo }, icon('redo'))];
  const urSep = el('div', { class: 'sep' });
  const urBar = el('div', { class: 'bar urbar' }, ...urBtns);
  app.append(urBar);
  // Снизу справа — масштаб
  const zoomBar = el('div', { class: 'bar zoombar' },
    el('button', { class: 'tbtn', title: 'Отдалить (Ctrl −)', onclick: () => zoomStep(-1) }, icon('minus')),
    zoomBtn,
    el('button', { class: 'tbtn', title: 'Приблизить (Ctrl +)', onclick: () => zoomStep(1) }, icon('plus')));
  document.body.append(zoomBar);
  function renderZoom() { zoomBtn.textContent = Math.round(S.view.z * 100) + '%'; }
  // Панель инструментов всегда строго по центру. Строку выбираем только по ширине окна
  // (левая и правая панели имеют фиксированную наибольшую ширину), поэтому при смене инструмента,
  // названия или статуса она не сдвигается ни на пиксель.
  const LEFT_MAX = 490, RIGHT_W = 430, BAR_LIFT = 30; // слева: название, листы и стрелки отмены
  // Панель: сверху (по умолчанию), снизу или справа — выбирается в меню
  // «Что нового» — справа сверху, под кнопкой выхода; если там панель инструментов — рядом с ней, не поверх
  function placeWhatsNew() {
    if (!whatsNew || !whatsNew.isConnected) return; // var: может вызваться раньше, чем кнопка создана
    const tr = topRight.getBoundingClientRect(), tb = toolbar.getBoundingClientRect(), wn = whatsNew.getBoundingClientRect();
    let right = 10, top = tr.bottom + 8;
    const hit = () => { const l = W - right - wn.width, rr = W - right; return !(rr <= tb.left || l >= tb.right || top + wn.height <= tb.top || top >= tb.bottom); };
    if (hit()) { if (toolbar.classList.contains('vert')) right = W - tb.left + 8; else top = tb.bottom + 8; }
    whatsNew.style.right = Math.round(right) + 'px'; whatsNew.style.top = Math.round(top) + 'px';
  }
  function placeUndo() {
    const tl = topLeft.getBoundingClientRect(), tr = topRight.getBoundingClientRect();
    const urW = 2 * 36 + 10; // две кнопки и поля
    const fitsTop = tl.right + 8 + urW + 8 <= tr.left;
    if (fitsTop) {
      if (urBtns[0].parentNode !== urBar) urBar.append(...urBtns);
      urSep.remove(); urBar.hidden = false;
      urBar.style.left = Math.round(tl.right + 8) + 'px'; urBar.style.top = Math.round(tl.top) + 'px'; urBar.style.height = Math.round(tl.height) + 'px';
    } else {
      if (urBtns[0].parentNode !== zoomBar) zoomBar.prepend(...urBtns, urSep);
      urBar.hidden = true;
    }
  }
  new ResizeObserver(() => placeUndo()).observe(topLeft);
  function layoutBars() {
    placeUndo(); queueMicrotask(placeWhatsNew);
    const pos = prefs.barPos || 'top';
    toolbar.classList.toggle('vert', pos === 'right' || pos === 'left');
    document.body.dataset.bar = pos;
    toolbar.style.right = ''; toolbar.style.bottom = '';
    let bottomUsed = 0;
    if (pos === 'right' || pos === 'left') {
      const top = 62, avail = H - top - 10; // масштаб уходит левее панели, панель может занять всю высоту
      toolbar.style.maxHeight = avail + 'px';
      const th = toolbar.offsetHeight;
      toolbar.style.left = (pos === 'right' ? W - toolbar.offsetWidth - 10 : 10) + 'px';
      toolbar.style.top = Math.round(top + Math.max(0, (avail - th) / 2)) + 'px';
      toasts.style.top = '62px';
    } else {
      toolbar.style.maxHeight = '';
      const tw = toolbar.offsetWidth; let left = Math.round((W - tw) / 2);
      if (pos === 'bottom') {
        // в один ряд с масштабом справа, если помещается
        const lEdge = 10, rEdge = W - 10 - zoomBar.offsetWidth - 10;
        if (tw <= rEdge - lEdge && (left < lEdge || left + tw > rEdge)) left = Math.round(Math.min(Math.max(left, lEdge), rEdge - tw));
      }
      toolbar.style.left = Math.max(10, left) + 'px';
      if (pos === 'bottom') {
        toolbar.style.top = H - toolbar.offsetHeight - BAR_LIFT + 'px'; // приподнята от края экрана
        toasts.style.top = '62px';
        bottomUsed = toolbar.offsetHeight + BAR_LIFT;
      } else {
        const row1 = left >= LEFT_MAX + 20 && left + tw <= W - RIGHT_W - 20;
        toolbar.style.top = row1 ? '10px' : '58px';
        toasts.style.top = (row1 ? 10 : 58) + toolbar.offsetHeight + 8 + 'px';
      }
    }
    // масштаб и строка «новая версия» не должны наезжать на нижнюю панель
    const tb = toolbar.getBoundingClientRect();
    const zoomHit = pos === 'bottom' && tb.right > W - 10 - (zoomBar.offsetWidth || 170) - 6;
    document.body.style.setProperty('--bar-bottom', (pos === 'bottom' ? bottomUsed + 8 : 12) + 'px');
    document.body.style.setProperty('--zoom-bottom', (zoomHit ? bottomUsed + 8 : pos === 'bottom' ? BAR_LIFT : 28) + 'px');
    document.body.style.setProperty('--zoom-right', (pos === 'right' ? W - tb.left + 8 : 10) + 'px');
  }
  new ResizeObserver(() => { layoutBars(); if (!toolbar.userScrolled) centerCore(); }).observe(document.body);
  function renderStatus(st = hub.status()) {
    const peer = st.peers[0];
    let cls = 'gray', text = 'Нет подключения';
    const age = Date.now() - (st.startedAt || Date.now());
    if (peer) { cls = 'green'; text = 'Подключено: ' + peer.name; }
    else if (!st.online) { cls = 'gray'; text = 'Офлайн'; }
    else if (st.peerState === 'waiting' || st.nostrOpen > 0) { cls = 'yellow'; text = 'Ожидание подключения'; }
    else if (age < 15000) { cls = 'yellow'; text = 'Подключение…'; }
    else { cls = 'red'; text = 'Сервер недоступен'; }
    statusBtn.title = peer ? `Связь через: ${peer.via.map((v) => ({ peer: 'PeerJS', nostr: 'Nostr', manual: 'ручной код' }[v] || v)).join(', ')}` : 'Код доски и ручное подключение';
    statusBtn.className = 'status ' + cls; statusBtn.innerHTML = '';
    statusBtn.append(el('span', { class: 'led' }), text);
    followBtn.classList.toggle('on', !!S.follow);
    followBtn.disabled = !peer; summonBtn.disabled = !peer;
  }
  hub.on('status', (st) => {
    const had = renderStatus.lastPeers || 0; renderStatus.lastPeers = st.peers.length;
    if (st.peers.length > had) {
      const pr = st.peers[st.peers.length - 1];
      const who = pr.role === 'student' ? 'Подключился ученик' : pr.role === 'tutor' ? 'Подключился репетитор' : 'Подключился собеседник';
      toast(`${who}: ${pr.name}`); sendView();
    }
    if (st.peers.length < had) toast('Собеседник отключился');
    renderStatus(st);
  });
  function toggleFollow() {
    const peer = hub.status().peers[0];
    if (!peer) { toast('Собеседник не подключён'); return; }
    S.follow = S.follow ? null : peer.id;
    if (S.follow) { const p = peersById.get(peer.id); if (p?.view) goToPeer(p.view); }
    renderStatus();
  }
  function summon() {
    const peer = hub.status().peers[0]; if (!peer) { toast('Собеседник не подключён'); return; }
    hub.broadcast({ t: 'summon', name: me.name, view: viewMsg() });
  }

  // ---------- модальные окна ----------
  function modal(title, content) {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    const close = () => { m.remove(); window.removeEventListener('keydown', onKey, true); };
    window.addEventListener('keydown', onKey, true);
    const m = el('div', { class: 'modal', onpointerdown: (e) => { if (e.target === m) close(); } },
      el('div', { class: 'panel dialog' }, el('div', { class: 'dialog-h' }, el('b', {}, title), el('button', { class: 'x', onclick: close }, '×')), content));
    m.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(m);
    return { close, m };
  }
  function showConnect() {
    const st = hub.status();
    const link = location.protocol.startsWith('http') ? location.origin + location.pathname + '#r=' + room : null;
    const copy = (txt, msg) => navigator.clipboard.writeText(txt).then(() => toast(msg), () => uiDialog({ title: 'Скопируйте вручную', text: 'Браузер не разрешил автоматическое копирование. Выделите текст и нажмите Ctrl+C.', readonlyText: txt, ok: 'Закрыть', cancel: null }));
    const nameIn = el('input', { class: 'inp', value: prefs.name, maxlength: 30 });
    nameIn.addEventListener('change', () => { prefs.name = nameIn.value.trim(); savePrefs(); hub.broadcast(hub.helloMsg()); });
    // ручное подключение
    const mc = new ManualConnect(hub);
    const out = el('textarea', { class: 'inp mono small', rows: 3, readonly: true, placeholder: 'Здесь появится код' });
    const inp = el('textarea', { class: 'inp mono small', rows: 3, placeholder: 'Код собеседника' });
    const mmsg = el('div', { class: 'small muted' });
    const step = (f) => async () => { try { mmsg.textContent = 'Секунду…'; await f(); } catch (e) { mmsg.textContent = 'Ошибка: ' + (e.message || e); } };
    const manual = el('details', { class: 'manual' }, el('summary', {}, 'Не подключается? Ручной режим без серверов'),
      el('p', { class: 'small muted' }, 'Работает, даже если сервер знакомства недоступен. Коды пересылаете друг другу в Telegram.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: step(async () => { out.value = await mc.createOffer(); mmsg.textContent = 'Отправьте этот код собеседнику и вставьте ниже его ответный код'; }) }, '1. Я начинаю: создать код'),
        el('button', { class: 'btn', onclick: step(async () => {
          const v = inp.value.trim();
          if (v[0] === 'A') { out.value = await mc.acceptOffer(v); mmsg.textContent = 'Отправьте этот ответный код собеседнику'; }
          else if (v[0] === 'B') { await mc.acceptAnswer(v); mmsg.textContent = 'Подключаемся… через пару секунд статус станет зелёным'; }
          else mmsg.textContent = 'Код должен начинаться с A или B';
        }) }, '2. Применить код собеседника')),
      el('div', { class: 'small muted' }, 'Мой код:'), out, el('button', { class: 'btn small', onclick: () => copy(out.value, 'Код скопирован') }, 'Копировать мой код'),
      el('div', { class: 'small muted' }, 'Код собеседника:'), inp, mmsg);
    modal('Подключение', [
      el('div', { class: 'small muted' }, 'Отправьте этот код собеседнику: он открывает такой же файл доски и подключается по коду.'),
      el('div', { class: 'code' }, room.toUpperCase()),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => copy(room, 'Код скопирован') }, 'Копировать код'),
        link ? el('button', { class: 'btn', onclick: () => copy(link, 'Ссылка скопирована') }, 'Копировать ссылку') : null),
      el('div', { class: 'small' }, st.peers.length ? `На связи: ${st.peers.map((p) => p.name).join(', ')}` : 'Собеседник пока не подключён'),
      el('div', { class: 'small muted' }, `Сервер знакомства PeerJS: ${({ waiting: 'работает ✓', connected: 'работает ✓', connecting: 'подключаюсь…', error: st.peerError || 'недоступен', off: 'выключен' })[st.peerState] || st.peerState}. Запасные Nostr-реле: доступно ${st.nostrOpen} из ${st.nostrTotal || '…'}. Хватит любого одного пути.`),
      el('label', {}, 'Ваше имя', nameIn),
      manual,
    ]);
  }
  function showSettings() {
    let recBtn = null, dlg = null; const closeModalForRec = () => dlg && dlg.close();
    const pad = el('canvas', { class: 'pad', width: 560, height: 160 });
    const readout = el('div', { class: 'small mono' }, 'Проведи пером по полю ниже');
    const gamma = el('input', { type: 'range', min: 0.3, max: 1.8, step: 0.05, value: prefs.gamma });
    const thin = el('input', { type: 'range', min: 0, max: 0.8, step: 0.05, value: prefs.thin });
    const steadyIn = el('input', { type: 'range', min: 0, max: 1.2, step: 0.05, value: prefs.steady });
    steadyIn.oninput = () => { prefs.steady = +steadyIn.value; savePrefs(); };
    const wheel = el('select', { class: 'inp' }, [['scroll', 'Колесо — вверх/вниз, Shift+колесо — влево/вправо, Ctrl+колесо — масштаб'], ['zoom', 'Колесо мыши — масштаб (как в Miro)']].map(([v, t]) => el('option', { value: v, selected: prefs.wheel === v }, t)));
    gamma.oninput = () => { prefs.gamma = +gamma.value; savePrefs(); };
    thin.oninput = () => { prefs.thin = +thin.value; savePrefs(); };
    wheel.onchange = () => { prefs.wheel = wheel.value; savePrefs(); };
    const edge = el('input', { type: 'checkbox', checked: prefs.edgePan });
    edge.onchange = () => { prefs.edgePan = edge.checked; savePrefs(); };
    const pc = pad.getContext('2d'); let sbp = null, padReal = false;
    const draw = () => {
      pc.clearRect(0, 0, pad.width, pad.height);
      if (sbp) { pc.fillStyle = '#1e1e1e'; pc.fill(outlinePath(sbp.live(), strokeOptions({ size: 4, v: 2, thin: padReal ? prefs.thin : 0 }, true))); }
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); const p = readPoint(e, e.pointerType);
      padReal = e.pointerType === 'pen' || (e.pressure > 0 && e.pressure !== 0.5);
      sbp = new StrokeBuilder({ x: e.clientX - r.left, y: e.clientY - r.top, p: p[2], t: e.timeStamp, device: e.pointerType === 'pen' ? 'pen' : 'mouse', steady: prefs.steady, zoom: () => 1 });
      draw();
    });
    pad.addEventListener('pointermove', (e) => {
      const r = pad.getBoundingClientRect();
      readout.textContent = `Устройство: ${({ pen: 'перо ✓', mouse: 'мышь', touch: 'палец' })[e.pointerType] || e.pointerType} · нажим: ${e.pressure.toFixed(3)} · после кривой: ${readPoint(e, e.pointerType)[2].toFixed(3)}${e.pointerType === 'mouse' && e.pressure === 0.5 ? ' · (нажим не передаётся — проверь Windows Ink)' : ''}`;
      if (sbp && e.buttons) { for (const ev of (e.getCoalescedEvents?.() || [e])) sbp.add(ev.clientX - r.left, ev.clientY - r.top, readPoint(ev, e.pointerType)[2], ev.timeStamp); draw(); }
    });
    pad.addEventListener('pointerup', () => { const keep = sbp; setTimeout(() => { if (sbp === keep) { sbp = null; draw(); } }, 1500); });
    dlg = modal('Настройки пера и мыши', [
      el('label', {}, 'Чувствительность пера (левее — лёгкое касание даёт более жирную линию)', gamma),
      el('label', {}, 'Насколько нажим меняет толщину (0 — всегда одинаковая)', thin),
      el('label', {}, 'Сглаживание линии', steadyIn),
      el('div', { class: 'row' }, recBtn = el('button', { class: 'btn small', onclick: () => {
        if (penRec) { stopPenRec(); return; }
        startPenRec(recBtn); recBtn.textContent = 'Остановить запись'; closeModalForRec?.();
      } }, penRec ? 'Остановить запись' : 'Записать перо'), el('span', { class: 'small muted' }, '20 секунд, сохранится файл')),
      el('label', {}, 'Колёсико', wheel),
      el('label', { class: 'check' }, edge, 'Прокручивать доску у края экрана'),
      readout, pad,
      el('div', { class: 'small muted' }, 'Если точка не ставится при самом лёгком касании, сделайте мягче «Ощущение кончика» (Wacom → Tip Feel) или кривую давления в драйвере Huion/XP-Pen: порог касания решает драйвер, до браузера такие касания просто не доходят.'),
    ]);
  }
  function showHelp() {
    const rows = [
      ['Инструменты', ''],
      ...TOOLS.filter((t) => !t.sep).map((t) => [t.name + (t.hint ? ` (${t.hint})` : ''), t.key]),
      ['Цвета 1–8, толщина', '1 … 8, [ ]'],
      ['Отменить своё / вернуть', 'Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y'],
      ['Удалить выделенное', 'Delete'],
      ['Удалить текущий лист (если ничего не выделено)', 'Delete'],
      ['Копия перетаскиванием', 'Alt + тянуть'],
      ['Правильная форма (квадрат, окружность, равносторонний…)', 'Shift+R'],
      ['Копировать / вставить / дублировать', 'Ctrl+C / Ctrl+V / Ctrl+D'],
      ['Выделить всё на листе', 'Ctrl+A'],
      ['Закрепить / открепить', 'Shift+L'],
      ['Выделить закреплённое', 'Alt+клик'],
      ['Изменить текст/формулу/график', 'двойной клик или Enter'],
      ['Двигать доску', 'Пробел+тянуть, правая или средняя кнопка, кнопка пера'],
      ['Быстрое меню (инструменты и цвета)', 'правый щелчок или кнопка пера по пустому месту'],
      ['Инструмент на время', 'удерживайте клавишу — после отпускания вернётся прежний'],
      ['Масштаб', 'Ctrl+колесо, Ctrl+= / Ctrl+-, Ctrl+0 — 100%'],
      ['Показать всё', 'Shift+1'],
      ['Листы: следующий / предыдущий / новый', 'PageDown / PageUp / Shift+N'],
      ['Смотреть за собеседником / позвать к себе', 'Shift+F / Shift+S'],
      ['Сохранить урок в файл', 'Ctrl+S'],
      ['Перо + Shift', 'прямая линия'],
      ['Обратный конец пера', 'ластик'],
    ];
    modal('Горячие клавиши', [
      el('table', { class: 'keys' }, rows.map(([a, b]) => b === '' ? el('tr', {}, el('th', { colspan: 2 }, a)) : el('tr', {}, el('td', {}, a), el('td', {}, el('kbd', {}, b))))),
      el('p', { class: 'small muted' }, 'Клавиши работают и в русской раскладке. Ctrl+Z отменяет только ваши действия — рисунки собеседника не пропадут.'),
    ]);
  }

  // ---------- запуск ----------
  resize(); renderToolbar(); updateCursor(); renderStatus(); renderZoom();
  // ---------- статус «репетитор / ученик» и счётчик ----------
  // Спрашиваем один раз; браузер запоминает. Без имён и регистрации — только для подсчёта.
  function askRole() { roleDialog(() => { paintRolePill(); countVisit(); }); }
  // GoatCounter: без cookie и личных данных. Считаем: открытие доски, статус и доску (код доски — зашифрованный).
  const GC_CODE = 'doska-mira';
  let gcReady = null;
  function countVisit() {
    if (!GC_CODE || location.protocol === 'file:') return;
    const send = () => {
      const h = [...room].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);
      const role = prefs.role || 'unknown';
      try {
        window.goatcounter.count({ path: '/open', title: 'Открыли доску' });
        window.goatcounter.count({ path: 'role-' + role, title: role === 'tutor' ? 'Репетитор' : role === 'student' ? 'Ученик' : 'Без статуса', event: true });
        window.goatcounter.count({ path: 'board-' + h, title: 'Доска', event: true });
      } catch {}
    };
    if (window.goatcounter?.count) { send(); return; }
    if (!gcReady) gcReady = new Promise((res) => {
      window.goatcounter = { no_onload: true };
      const sc = document.createElement('script'); sc.async = true; sc.src = 'https://gc.zgo.at/count.js';
      sc.dataset.goatcounter = 'https://' + GC_CODE + '.goatcounter.com/count';
      sc.onload = res; sc.onerror = () => res(); document.head.append(sc);
    });
    gcReady.then(() => { if (window.goatcounter?.count) send(); });
  }
  // если пользователь заходит впервые — подсказка про клавиши
  let started = false;
  const start = () => {
    if (started) return; started = true;
    for (const id of yItems.keys()) refreshItem(id);
    for (const [id, m] of [...yPages.entries()]) if (m.get('deletedAt') && Date.now() - m.get('deletedAt') > 15000) { m.set('deletedAt', 1); hardDeletePage(id); }
    // Зашли по ссылке на чужую доску впервые: свой «Лист 1» не заводим, а ждём листы собеседника.
    // Иначе два одинаковых первых листа спорят, и у одного пропадает название листа (а то и записи на нём не видны).
    const createdHere = LS.get('created:' + room, null); if (createdHere) localStorage.removeItem('doska:created:' + room);
    const waitPages = !yPages.size && !createdHere && !/[?&]nopeer\b/.test(location.search);
    const makeFirst = () => { ensureFirstPage(); if (!pages().length) doc.transact(() => { const m = new Y.Map(); m.set('name', 'Лист 1'); m.set('order', 1); yPages.set('p' + uid(), m); }, NOUNDO); };
    if (!waitPages) makeFirst();
    else setTimeout(() => { if (!pages().length) { makeFirst(); setPage(pages()[0].id, true); } }, 8000); // никого нет — тогда свой
    const pending = LS.get('pendingTitle:' + room, null);
    if (pending && !yMeta.get('title')) doc.transact(() => yMeta.set('title', pending), NOUNDO);
    if (pending) localStorage.removeItem('doska:pendingTitle:' + room);
    renderTitle(); layoutBars();
    const lp = LS.get('lastPage:' + room, null);
    if (pages().length) setPage(lp && pages().some((p) => p.id === lp) ? lp : pages()[0].id, true);
    else S.page = 'p1'; // лист появится, как только придут листы собеседника
    renderPages(); invalidate();
    hub.startTabs(room);
    if (!/[?&]nopeer\b/.test(location.search)) hub.startPeer(room);
    if (!prefs.role && !/[?&]nopeer\b/.test(location.search)) askRole(); else countVisit(); // в тестах (nopeer) не спрашиваем
    window.__doska = { remotePv, peersById, peerAct, goToPeer, solidSel: () => solidSel(), solidHit: (x, y) => { const so = solidSel(); return so ? solidHit(so, x, y) : 'nosel'; }, STATS, dbg: () => gesture && gesture.dbg && gesture.dbg(), doc, S, items, hub, setTool, act, addItem, pageItems, toWorld, toScreen, undo, selectionBox: () => selectionBox(), handles: () => handles(selectionBox()), Y, setPage, pages, viewByPage }; window.__MC = ManualConnect;
  };
  idb.whenSynced.then(start);
  setTimeout(start, 3000); // если IndexedDB недоступна — всё равно запускаемся
}
