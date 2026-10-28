// Шаблоны уроков: доска, сохранённая один раз, из которой можно создать готовую доску для каждого ученика.
// Хранятся в этом браузере (IndexedDB), с сервером будут в облаке.
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('doska-templates', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tpls', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function st(mode) { return (await db()).transaction('tpls', mode).objectStore('tpls'); }
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
import { SERVER, cloudStore } from './cloud.js';
import { account } from './account.js';
// На сайте с сервером шаблоны лежат в аккаунте: в списке название и картинка, сама доска — отдельным файлом
const cloudOn = () => SERVER && !!account();

export async function saveTemplate(name, state, thumb) {
  const t = { id: uid(), name, t: Date.now(), state, thumb, n: state.items.length };
  if (cloudOn()) {
    const { state: body, ...meta } = t;
    await cloudStore.putBlob('tpl-' + t.id, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    await cloudStore.put('tpls', meta);
    return t;
  }
  await req((await st('readwrite')).put(t));
  return t;
}
export async function listTemplates() {
  try {
    if (cloudOn()) return (await cloudStore.list('tpls')).sort((a, b) => b.t - a.t);
    return (await req((await st('readonly')).getAll())).sort((a, b) => b.t - a.t);
  } catch { return []; }
}
export async function loadTemplate(id) {
  if (cloudOn()) {
    const meta = (await cloudStore.list('tpls')).find((x) => x.id === id); if (!meta) return null;
    return { ...meta, state: JSON.parse(await (await cloudStore.getBlob('tpl-' + id)).text()) };
  }
  return req((await st('readonly')).get(id));
}
export async function deleteTemplate(id) {
  if (cloudOn()) { cloudStore.delBlob('tpl-' + id); return cloudStore.del('tpls', id); }
  return req((await st('readwrite')).delete(id));
}
export async function renameTemplate(id, name) {
  if (cloudOn()) { const meta = (await cloudStore.list('tpls')).find((x) => x.id === id); if (meta) await cloudStore.put('tpls', { ...meta, name }); return; }
  const t = await loadTemplate(id); if (t) { t.name = name; await req((await st('readwrite')).put(t)); }
}
