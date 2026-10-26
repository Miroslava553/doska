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

export async function saveTemplate(name, state, thumb) {
  const t = { id: uid(), name, t: Date.now(), state, thumb, n: state.items.length };
  await req((await st('readwrite')).put(t));
  return t;
}
export async function listTemplates() {
  try { return (await req((await st('readonly')).getAll())).sort((a, b) => b.t - a.t); } catch { return []; }
}
export async function loadTemplate(id) { return req((await st('readonly')).get(id)); }
export async function deleteTemplate(id) { return req((await st('readwrite')).delete(id)); }
export async function renameTemplate(id, name) { const t = await loadTemplate(id); if (t) { t.name = name; await req((await st('readwrite')).put(t)); } }
