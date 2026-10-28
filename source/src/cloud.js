// Связь с сервером Lodl: запросы к API, доски в аккаунте, облако Материалов и шаблонов.
// SERVER = true в сборке для сайта на своём домене. В тестовом файле сервера нет, и всё хранится в браузере.
import * as Y from 'yjs';

export const SERVER = typeof __SERVER__ !== 'undefined' ? __SERVER__ : false;

export class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; } }
// Запрос к серверу. Заголовок X-Lodl защищает от запросов с чужих сайтов.
export async function api(method, path, body, { raw = false, keepalive = false, timeout = 30000 } = {}) {
  const bin = body instanceof Uint8Array || body instanceof Blob || body instanceof ArrayBuffer;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin', keepalive, signal: ctl.signal,
      headers: { ...(method !== 'GET' ? { 'X-Lodl': '1' } : {}), ...(body != null && !bin ? { 'Content-Type': 'application/json' } : {}), ...(body instanceof Blob && body.type ? { 'Content-Type': body.type } : {}) },
      body: body == null ? undefined : bin ? body : JSON.stringify(body),
    });
  } catch (e) { throw new ApiError(navigator.onLine === false ? 'Нет интернета. Проверьте подключение и попробуйте ещё раз.' : 'Сервер не ответил. Попробуйте ещё раз через минуту.', 0); }
  finally { clearTimeout(tm); }
  if (raw && r.ok) return r;
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new ApiError(data.error || 'Что-то пошло не так. Попробуйте ещё раз.', r.status, data);
  return data;
}

// ---------- список досок в аккаунте ----------
// В браузере список лежит в localStorage (recent). После входа он объединяется со списком в аккаунте.
export async function syncRecent(LS, { deleted = [] } = {}) {
  const cloud = await api('GET', '/kv/boards');
  const local = LS.get('recent', []);
  const map = new Map(local.map((r) => [r.room, r]));
  const fold = LS.get('bfolderOf', {});
  let changed = false;
  for (const c of cloud) {
    if (deleted.includes(c.id)) continue;
    const l = map.get(c.id);
    if (!l) { map.set(c.id, { room: c.id, t: c.t || 0, title: c.title || '' }); changed = true; }
    else if ((c.t || 0) > (l.t || 0)) { l.title = c.title || l.title; l.t = c.t; changed = true; }
    if (c.folder && !fold[c.id]) { fold[c.id] = c.folder; changed = true; }
  }
  const cloudBy = new Map(cloud.map((c) => [c.id, c]));
  const out = [...map.values()].sort((a, b) => b.t - a.t);
  for (const r of out) { // то, чего нет в аккаунте или что новее там, отправляем
    const c = cloudBy.get(r.room);
    if (!c || (r.t || 0) > (c.t || 0) || (fold[r.room] || '') !== (c.folder || '')) await pushBoard(r, fold[r.room]).catch(() => {});
  }
  // папки для досок: объединяем по id
  const bf = await api('GET', '/kv/bfolders').catch(() => []);
  const lf = LS.get('bfolders', []); const ids = new Set(lf.map((f) => f.id));
  for (const f of bf) if (!ids.has(f.id) && !f.gone) { lf.push({ id: f.id, name: f.name }); changed = true; }
  for (const f of lf) if (!bf.some((x) => x.id === f.id)) api('PUT', '/kv/bfolders/' + f.id, { name: f.name, t: Date.now() }).catch(() => {});
  if (changed) { LS.set('recent', out.slice(0, 200)); LS.set('bfolderOf', fold); LS.set('bfolders', lf); }
  return changed;
}
export const pushBoard = (r, folder) => api('PUT', '/kv/boards/' + r.room, { title: (r.title || '').slice(0, 60), t: r.t || Date.now(), folder: folder || '' });
export const dropBoard = (room) => api('DELETE', '/kv/boards/' + room).catch(() => {});
export const putBoardFolder = (f) => api('PUT', '/kv/bfolders/' + f.id, { name: f.name, t: Date.now() }).catch(() => {});
export const dropBoardFolder = (id) => api('DELETE', '/kv/bfolders/' + id).catch(() => {});

// ---------- содержимое доски в аккаунте ----------
// При открытии подтягиваем с сервера то, что рисовали на других устройствах, и отправляем своё.
// Дальше изменения уходят пачками раз в несколько секунд и при закрытии вкладки.
export function boardSync(room, doc, { skip = [], onState } = {}) {
  const CLOUD = 'cloud';
  let pending = [], timer = 0, alive = true, busy = false, ready = false, failed = 0;
  const flush = async (keepalive = false) => {
    clearTimeout(timer); timer = 0;
    if (!ready || busy || !pending.length) return;
    const u = pending.length === 1 ? pending[0] : Y.mergeUpdates(pending); const sent = pending; pending = [];
    if (keepalive && u.length > 60000) { pending = sent; return; } // закрытие вкладки: большое не успеет, его допишет следующий раз
    busy = true;
    try { await api('POST', '/board/' + room, u, { keepalive }); failed = 0; onState?.('ok'); }
    catch (e) { pending = sent.concat(pending); failed++; onState?.('error', e); if (e.status !== 413 && e.status !== 401) schedule(Math.min(60000, 3000 * 2 ** failed)); }
    finally { busy = false; if (pending.length && !timer) schedule(); }
  };
  const schedule = (ms = 2500) => { if (!timer && alive) timer = setTimeout(() => flush(), ms); };
  const onUpd = (u, origin) => { if (origin === CLOUD || skip.includes(origin)) return; pending.push(u); schedule(); };
  doc.on('update', onUpd);
  const start = async () => {
    try {
      const r = await api('GET', '/board/' + room, null, { raw: true });
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length) Y.applyUpdate(doc, buf, CLOUD);
      // своё, чего нет на сервере
      const diff = Y.encodeStateAsUpdate(doc, buf.length ? Y.encodeStateVectorFromUpdate(buf) : undefined);
      ready = true; pending = []; // всё, что успело накопиться, уже входит в diff
      if (diff.length > 2) { pending.push(diff); await flush(); }
      onState?.('ok');
    } catch (e) { onState?.('error', e); if (alive && e.status !== 401) setTimeout(start, 15000); }
  };
  const bye = () => flush(true);
  addEventListener('pagehide', bye);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  start();
  return { flush, stop() { alive = false; flush(true); doc.off('update', onUpd); removeEventListener('pagehide', bye); }, pending: () => pending.length };
}

// ---------- облако Материалов и шаблонов ----------
// Записи лежат в /kv/<раздел>, файлы — в /blob. Скачанные файлы держим в памяти, чтобы не качать дважды.
const blobCache = new Map();
export const cloudStore = {
  list: (coll) => api('GET', '/kv/' + coll),
  put: (coll, rec) => api('PUT', '/kv/' + coll + '/' + rec.id, rec),
  del: (coll, id) => api('DELETE', '/kv/' + coll + '/' + id),
  putBlob: async (id, blob) => { await api('PUT', '/blob/' + id, blob, { timeout: 10 * 60000 }); blobCache.set(id, blob); },
  getBlob: async (id) => {
    if (blobCache.has(id)) return blobCache.get(id);
    const r = await api('GET', '/blob/' + id, null, { raw: true, timeout: 5 * 60000 });
    const b = await r.blob(); blobCache.set(id, b); return b;
  },
  delBlob: (id) => { blobCache.delete(id); return api('DELETE', '/blob/' + id).catch(() => {}); },
};
