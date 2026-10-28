// «Материалы»: картинки, PDF и свои заготовки, разложенные по папкам. Доступны на любой доске.
// Пока сервера нет, хранятся в этом браузере (IndexedDB). С сервером — в облаке, у Про — 10 ГБ.
import { ICONS } from './icons.js';
import { ACCOUNTS, isPro, openPro, PLAN, onAccount, account } from './account.js';
import { SERVER, cloudStore } from './cloud.js';

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
const ic = (name, cls = 'ic') => el('span', { class: cls, html: ICONS[name] || '' });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- хранилище ----------
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('doska-materials', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('folders', { keyPath: 'id' }); d.createObjectStore('files', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = async (store, mode, f) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const st = t.objectStore(store); const out = f(st); t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
const getAll = (store) => tx(store, 'readonly', (st) => st.getAll());
const put = (store, v) => tx(store, 'readwrite', (st) => st.put(v));
const del = (store, id) => tx(store, 'readwrite', (st) => st.delete(id));
// На сайте с сервером Материалы лежат в облаке аккаунта: записи отдельно, файлы отдельно
const cloudOn = () => SERVER && !!account();
const S = {
  all: (store) => (cloudOn() ? cloudStore.list(store) : getAll(store)),
  put: (store, v) => { if (!cloudOn()) return put(store, v); const { blob, ...rec } = v; return cloudStore.put(store, rec); },
  del: (store, id) => { if (!cloudOn()) return del(store, id); if (store === 'files') cloudStore.delBlob(id); return cloudStore.del(store, id); },
};
const cloudMsg = (e) => (e.status === 402 ? 'Сохранять в Материалы можно с подпиской Про' : e.status === 413 ? 'Место в Материалах закончилось' : e.message || 'Не получилось сохранить');

const limitBytes = () => PLAN.proMaterialsGB * 1024 * 1024 * 1024;
// Материалы — облако Про. Без подписки сохранить ничего нельзя: панель открывается, а сохранение ведёт к окну Про.
const locked = () => ACCOUNTS && !isPro();
const fmtSize = (b) => !b ? '0 КБ' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : b < 1024 ** 3 ? (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' МБ' : (b / 1024 ** 3).toFixed(1).replace('.', ',') + ' ГБ';

async function thumbOfImage(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let t = c.toDataURL('image/webp', 0.8); if (!t.startsWith('data:image/webp')) t = c.toDataURL('image/jpeg', 0.82);
  return { thumb: t, w: bmp.width, h: bmp.height };
}
async function thumbOfPdf(blob) {
  const pdfjs = await import('./pdf.js');
  const pdf = await pdfjs.load(await blob.arrayBuffer());
  const page = await pdf.getPage(1);
  const v1 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 320 / v1.width });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: cx, viewport: vp }).promise;
  return { thumb: c.toDataURL('image/jpeg', 0.8), pages: pdf.numPages };
}

// ---------- панель ----------
// deps: insertFile(file, at), insertClip(items, at), centerAt() -> [wx, wy], toWorld(sx, sy), selection() -> items[],
//       clipThumb(items) -> dataURL, toast(msg), ask(opts) -> Promise<string|null>, confirm(opts) -> Promise<bool>
export function materialsPanel(deps) {
  let folders = [], files = [], cur = '', q = '', loaded = false;
  const panel = el('div', { class: 'mat panel', hidden: true });
  const head = el('div', { class: 'mat-h' });
  const crumbs = el('div', { class: 'mat-path' });
  const search = el('input', { class: 'mat-search', placeholder: 'Поиск', spellcheck: 'false' });
  const saveSel = el('button', { class: 'mat-save', hidden: true, onclick: () => saveSelection() });
  const grid = el('div', { class: 'mat-grid' });
  const foot = el('div', { class: 'mat-foot' });
  const fileIn = el('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', multiple: true, hidden: true });
  fileIn.addEventListener('change', () => { upload([...fileIn.files]); fileIn.value = ''; });
  head.append(el('b', {}, 'Материалы'), el('span', { class: 'grow' }),
    el('button', { class: 'mat-ib', title: 'Новая папка', onclick: () => newFolder() }, ic('folderPlus')),
    el('button', { class: 'mat-ib', title: 'Загрузить картинки или PDF', onclick: () => (locked() ? needPro() : fileIn.click()) }, ic('upload')),
    el('button', { class: 'mat-ib', title: 'Закрыть', onclick: () => close() }, ic('plus', 'ic rot45')));
  panel.append(head, crumbs, search, saveSel, grid, foot, fileIn);
  document.body.append(panel);
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); render(); });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { search.value = ''; q = ''; render(); search.blur(); } });
  // файлы с компьютера — прямо в текущую папку (а не на лист)
  panel.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); panel.classList.add('drop'); });
  panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop'); });
  panel.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); panel.classList.remove('drop'); upload([...(e.dataTransfer?.files || [])]); });
  panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  onAccount(() => { if (SERVER) loaded = false; if (!panel.hidden) (SERVER ? load() : Promise.resolve()).then(render); });

  async function load() {
    try { [folders, files] = await Promise.all([S.all('folders'), S.all('files')]); loaded = true; }
    catch (e) { folders = []; files = []; loaded = false; deps.toast(e.message || 'Не получилось загрузить Материалы'); }
  }
  const used = () => files.reduce((s, f) => s + (f.size || 0), 0);
  const inFolder = (id) => files.filter((f) => f.folder === id).length + folders.filter((f) => f.parent === id).length;
  const pathOf = (id) => { const out = []; let f = folders.find((x) => x.id === id); while (f) { out.unshift(f); f = folders.find((x) => x.id === f.parent); } return out; };

  function render() {
    // путь
    crumbs.innerHTML = '';
    const go = (id) => { cur = id; search.value = ''; q = ''; render(); };
    crumbs.append(el('button', { class: 'mat-crumb' + (cur ? '' : ' on'), onclick: () => go('') }, 'Все'));
    for (const f of pathOf(cur)) crumbs.append(el('span', { class: 'mat-sl' }, '›'), el('button', { class: 'mat-crumb' + (f.id === cur ? ' on' : ''), onclick: () => go(f.id) }, f.name));
    crumbs.dataset.drop = '';
    // выделенное — сохранить как заготовку
    const sel = deps.selection();
    saveSel.hidden = !sel.length;
    saveSel.innerHTML = ''; saveSel.append(ic('plus'), `Сохранить выделенное (${sel.length})`);
    // плитки
    grid.innerHTML = '';
    const fl = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders.filter((f) => (f.parent || '') === cur);
    const fs = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files.filter((f) => (f.folder || '') === cur);
    fl.sort((a, b) => a.name.localeCompare(b.name, 'ru')); fs.sort((a, b) => b.t - a.t);
    for (const f of fl) grid.append(folderTile(f));
    for (const f of fs) grid.append(fileTile(f));
    if (!fl.length && !fs.length) {
      grid.append(el('div', { class: 'mat-empty' },
        el('div', { class: 'mat-empty-ic' }, ic(q ? 'select' : 'image')),
        el('b', {}, q ? 'Ничего не нашлось' : cur ? 'Папка пустая' : 'Здесь будут ваши материалы'),
        q ? null : el('span', {}, 'Загрузите сюда картинки и PDF или сохраните свои заготовки, и их можно будет перетащить на лист с любой доски.'),
        q ? null : locked() ? el('span', { class: 'mat-lock' }, ic('lock'), 'Материалы доступны с подпиской Про') : null,
        q ? null : el('button', { class: 'btn primary', onclick: () => (locked() ? needPro() : fileIn.click()) }, locked() ? 'Подключить Про' : 'Загрузить')));
    }
    // место
    const u = used(), lim = limitBytes(), share = Math.min(1, u / lim);
    foot.innerHTML = '';
    if (locked()) { foot.append(el('div', { class: 'mat-foot-row' }, el('span', {}, 'Только с подпиской Про'), el('button', { class: 'mat-pro', onclick: () => openPro({ feature: 'materials' }) }, ic('lock'), 'Подключить'))); return; }
    foot.append(el('div', { class: 'mat-bar' }, el('span', { style: `width:${(share * 100).toFixed(1)}%`, class: share > 0.9 ? 'full' : share <= 0 ? 'zero' : '' })),
      el('div', { class: 'mat-foot-row' }, el('span', {}, `${fmtSize(u)} из ${PLAN.proMaterialsGB} ГБ`), el('span', { class: 'muted' }, ACCOUNTS ? 'в облаке' : 'в этом браузере')));
  }

  function folderTile(f) {
    const t = el('div', { class: 'mat-tile folder', 'data-folder': f.id, title: f.name },
      el('div', { class: 'mat-th' }, ic('folder', 'ic mat-fold-ic')),
      el('div', { class: 'mat-name' }, f.name), el('div', { class: 'mat-meta' }, `${inFolder(f.id)} шт.`));
    t.addEventListener('click', () => { cur = f.id; search.value = ''; q = ''; render(); });
    t.addEventListener('contextmenu', (e) => { e.preventDefault(); tileMenu(e.clientX, e.clientY, { folder: f }); });
    longPress(t, (x, y) => tileMenu(x, y, { folder: f }));
    return t;
  }
  function fileTile(f) {
    const t = el('div', { class: 'mat-tile', title: f.name + ' — перетащите на лист или нажмите' },
      el('div', { class: 'mat-th' }, el('img', { src: f.thumb, alt: '', draggable: 'false' }), f.kind === 'pdf' ? el('span', { class: 'mat-kind' }, 'PDF') : f.kind === 'clip' ? el('span', { class: 'mat-kind clip' }, 'Заготовка') : null),
      el('div', { class: 'mat-name' }, f.name),
      el('div', { class: 'mat-meta' }, f.kind === 'pdf' ? `${f.pages || 1} стр. · ${fmtSize(f.size)}` : f.kind === 'clip' ? `${f.items.length} об.` : fmtSize(f.size)));
    t.addEventListener('contextmenu', (e) => { e.preventDefault(); tileMenu(e.clientX, e.clientY, { file: f }); });
    dragOut(t, f);
    return t;
  }
  // Перетащить плитку: на лист — вставить туда, на папку — переложить. Просто нажать — вставить в центр экрана.
  function dragOut(t, f) {
    t.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY; let ghost = null, holdT = setTimeout(() => { holdT = 0; if (!ghost) { cleanup(); tileMenu(x0, y0, { file: f }); } }, 550);
      const target = (x, y) => { const o = document.elementFromPoint(x, y); return { folder: o?.closest?.('[data-folder]'), crumbs: o?.closest?.('.mat-crumb'), inPanel: !!o?.closest?.('.mat') }; };
      const mv = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
          clearTimeout(holdT); holdT = 0;
          ghost = el('div', { class: 'mat-ghost' }, el('img', { src: f.thumb, alt: '' }));
          document.body.append(ghost); panel.classList.add('dragging');
        }
        if (ghost) {
          ghost.style.transform = `translate(${ev.clientX - 44}px, ${ev.clientY - 44}px)`;
          const tg = target(ev.clientX, ev.clientY);
          for (const x of grid.querySelectorAll('.mat-tile.folder.over')) x.classList.remove('over');
          tg.folder?.classList.add('over');
          ghost.classList.toggle('out', !tg.inPanel);
        }
      };
      const cleanup = () => { clearTimeout(holdT); window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true); };
      const cancel = () => { cleanup(); ghost?.remove(); panel.classList.remove('dragging'); };
      const up = async (ev) => {
        const wasHold = holdT === 0 && !ghost; cleanup();
        if (!ghost) { if (!wasHold) insert(f); return; }
        const tg = target(ev.clientX, ev.clientY);
        ghost.remove(); panel.classList.remove('dragging');
        for (const x of grid.querySelectorAll('.over')) x.classList.remove('over');
        if (tg.folder) { f.folder = tg.folder.dataset.folder; try { await S.put('files', f); } catch (e) { deps.toast(cloudMsg(e)); return; } render(); deps.toast('Перенесено в папку'); return; }
        if (tg.inPanel) return;
        insert(f, deps.toWorld(ev.clientX, ev.clientY));
      };
      window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true);
    });
  }
  function longPress(t, f) {
    t.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const x0 = e.clientX, y0 = e.clientY;
      const tm = setTimeout(() => { done(); f(x0, y0); }, 550);
      const done = () => { clearTimeout(tm); t.removeEventListener('pointerup', done); t.removeEventListener('pointermove', mv); };
      const mv = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) done(); };
      t.addEventListener('pointerup', done); t.addEventListener('pointermove', mv);
    });
  }
  async function insert(f, at) {
    const p = at || deps.centerAt();
    try {
      if (f.kind === 'clip') deps.insertClip(f.items, p);
      else {
        const blob = f.blob || (cloudOn() ? await cloudStore.getBlob(f.id) : null);
        if (!blob) throw new Error('нет файла');
        const file = new File([blob], f.name + (f.kind === 'pdf' && !/\.pdf$/i.test(f.name) ? '.pdf' : ''), { type: f.blob.type || (f.kind === 'pdf' ? 'application/pdf' : 'image/png') });
        await deps.insertFile(file, p); // по центру точки
      }
    } catch (e) { console.error(e); deps.toast('Не получилось вставить'); }
  }

  function tileMenu(x, y, { file, folder }) {
    document.querySelector('.mat-menu')?.remove();
    const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); };
    const outside = (e) => { if (!m.contains(e.target)) close(); };
    const item = (icn, t, f, cls = '') => el('button', { class: 'mi mat-mi ' + cls, onclick: () => { close(); f(); } }, el('span', { class: 'mi-l' }, ic(icn), t));
    const obj = file || folder;
    const moveTargets = [{ id: '', name: 'Все материалы' }, ...folders].filter((d) => d.id !== (file ? file.folder || '' : folder.parent || '') && (!folder || (d.id !== folder.id && !pathOf(d.id).some((p) => p.id === folder.id))));
    const m = el('div', { class: 'pop panel mat-menu' },
      file ? item('image', 'Вставить на лист', () => insert(file)) : item('folder', 'Открыть', () => { cur = folder.id; render(); }),
      item('text', 'Переименовать', async () => {
        const n = await deps.ask({ title: 'Название', value: obj.name, maxlength: 60 }); if (!n) return;
        obj.name = n.slice(0, 60); try { await S.put(file ? 'files' : 'folders', obj); } catch (e) { deps.toast(cloudMsg(e)); } render();
      }),
      moveTargets.length ? el('div', { class: 'mh' }, 'Переложить в') : null,
      ...moveTargets.slice(0, 12).map((d) => el('button', { class: 'mi mat-mi sub', onclick: async () => { close(); if (file) file.folder = d.id; else folder.parent = d.id; try { await S.put(file ? 'files' : 'folders', obj); } catch (e) { deps.toast(cloudMsg(e)); } render(); } }, el('span', { class: 'mi-l' }, ic('folder'), d.name))),
      item('trash', 'Удалить', async () => {
        const n = folder ? inFolder(folder.id) : 0;
        const ok = await deps.confirm({ title: folder ? `Удалить папку «${folder.name}»?` : `Удалить «${file.name}»?`, text: folder && n ? 'Вместе с папкой удалится всё, что в ней лежит.' : 'Со всех досок, где он уже вставлен, ничего не пропадёт.', ok: 'Удалить', danger: true, icon: 'trash' });
        if (!ok) return;
        if (file) { await S.del('files', file.id).catch(() => {}); files = files.filter((x) => x !== file); }
        else {
          const gone = new Set([folder.id]); let grew = true;
          while (grew) { grew = false; for (const d of folders) if (gone.has(d.parent) && !gone.has(d.id)) { gone.add(d.id); grew = true; } }
          for (const f of files.filter((x) => gone.has(x.folder))) await S.del('files', f.id).catch(() => {});
          for (const id of gone) await S.del('folders', id).catch(() => {});
          files = files.filter((x) => !gone.has(x.folder)); folders = folders.filter((x) => !gone.has(x.id));
          if (gone.has(cur)) cur = '';
        }
        render();
      }, 'danger'));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.round(Math.min(x, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.round(Math.min(y, innerHeight - r.height - 8)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  function needPro() { deps.toast('Сохранять в Материалы можно с подпиской Про'); openPro({ feature: 'materials' }); }
  async function newFolder() {
    if (locked()) return needPro();
    const n = await deps.ask({ title: 'Новая папка', placeholder: 'Например: Геометрия, 9 класс', maxlength: 60, ok: 'Создать' });
    if (!n) return;
    const f = { id: uid(), name: n.slice(0, 60), parent: cur, t: Date.now() };
    try { await S.put('folders', f); } catch (e) { deps.toast(cloudMsg(e)); if (e.status === 402) openPro({ feature: 'materials' }); return; }
    folders.push(f); render();
  }
  async function upload(list) {
    const all = list;
    list = list.filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (list.length < all.length) deps.toast(list.length ? 'Часть файлов пропущена: в Материалы можно загружать картинки и PDF' : 'В Материалы можно загружать картинки и PDF');
    if (!list.length) return;
    if (locked()) return needPro();
    const add = list.reduce((s, f) => s + f.size, 0);
    if (used() + add > limitBytes()) { deps.toast('Место в Материалах закончилось'); return; }
    let ok = 0;
    for (const f of list) {
      try {
        const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        const meta = pdf ? await thumbOfPdf(f) : await thumbOfImage(f);
        const rec = { id: uid(), folder: cur, name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Без названия', kind: pdf ? 'pdf' : 'image', blob: f, size: f.size, t: Date.now(), ...meta };
        if (cloudOn()) { busy(`Загружаем ${f.name}…`); await cloudStore.putBlob(rec.id, f); }
        await S.put('files', rec); files.push(rec); ok++; render();
      } catch (e) { console.error(e); deps.toast(e.status ? cloudMsg(e) : 'Не получилось загрузить ' + f.name); if (e.status === 402 || e.status === 413) break; }
      finally { busy(''); }
    }
  }
  async function saveSelection() {
    const items = deps.selection(); if (!items.length) return;
    if (locked()) return needPro();
    const n = await deps.ask({ title: 'Сохранить как заготовку', text: 'Её можно будет вставить на любую доску.', value: 'Заготовка', maxlength: 60, ok: 'Сохранить' });
    if (!n) return;
    const thumb = deps.clipThumb(items);
    const json = JSON.stringify(items);
    const rec = { id: uid(), folder: cur, name: n.slice(0, 60), kind: 'clip', items, thumb, size: json.length + thumb.length, t: Date.now() };
    if (used() + rec.size > limitBytes()) { deps.toast('Место в Материалах закончилось'); return; }
    try { await S.put('files', rec); } catch (e) { deps.toast(cloudMsg(e)); return; }
    files.push(rec); render(); deps.toast('Сохранено в Материалы');
  }

  // строка «Загружаем…» внизу панели, пока файл уходит в облако
  const busyLine = el('div', { class: 'mat-busy', hidden: true });
  panel.insertBefore(busyLine, foot);
  function busy(t) { busyLine.hidden = !t; busyLine.textContent = t; }
  async function open() { panel.hidden = false; if (!loaded) { grid.innerHTML = ''; busy('Загружаем Материалы…'); await load(); busy(''); } render(); deps.onToggle?.(true); }
  function close() { panel.hidden = true; document.querySelector('.mat-menu')?.remove(); deps.onToggle?.(false); }
  return {
    open, close, el: panel,
    toggle: () => (panel.hidden ? open() : close()),
    isOpen: () => !panel.hidden,
    selectionChanged: () => { if (!panel.hidden) render(); },
  };
}
