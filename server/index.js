// Сервер Lodl: вход по коду из письма, подписка Про через ЮKassa, облако для Материалов, шаблонов и досок.
// Настройки берутся из переменных окружения (на сервере файл /etc/lodl/env, его заполняет setup.sh):
//   SITE_URL      адрес сайта, например https://lodl.ru
//   SHOP_ID, SECRET_KEY   магазин ЮKassa (секретный ключ хранится только на сервере)
//   AUTOPAY=1     автоплатежи разрешены ЮKassa (иначе подписка продлевается оплатой вручную)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   почта для писем
//   DATA_DIR      где лежат база и файлы (по умолчанию ./data)
//   PORT          порт (3000), YK_API — адрес API ЮKassa (для проверок можно подменить)
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Y = require('yjs');
const mail = require('./mail.js');

const env = process.env;
const SITE = (env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PORT = +env.PORT || 3000;
const DATA = env.DATA_DIR || path.join(__dirname, 'data');
const YK = (env.YK_API || 'https://api.yookassa.ru/v3').replace(/\/$/, '');
const SHOP = env.SHOP_ID || '', KEY = env.SECRET_KEY || '';
const AUTOPAY = env.AUTOPAY !== '0';
const PRICE = { month: 199, year: 1990 };
const QUOTA = 10 * 1024 ** 3; // Материалы у Про
const DAY = 864e5, MIN = 6e4;
const now = () => Date.now();
fs.mkdirSync(path.join(DATA, 'blobs'), { recursive: true });

// ---------- база ----------
const db = new DatabaseSync(path.join(DATA, 'lodl.db'));
db.exec(`
PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, hash TEXT, exp INTEGER, tries INTEGER, sent INTEGER, day TEXT, n INTEGER);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER, seen INTEGER);
CREATE TABLE IF NOT EXISTS subs (user INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  period TEXT, until INTEGER, canceled INTEGER DEFAULT 0, pm_id TEXT, pm_title TEXT, pm_type TEXT,
  price_month INTEGER, price_year INTEGER, next_period TEXT, fails INTEGER DEFAULT 0, next_try INTEGER, reminded INTEGER, started INTEGER);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user INTEGER, kind TEXT, period TEXT, amount INTEGER, status TEXT, created INTEGER, done INTEGER);
CREATE TABLE IF NOT EXISTS kv (user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, coll TEXT, id TEXT, data TEXT, size INTEGER, t INTEGER, PRIMARY KEY (user, coll, id));
CREATE TABLE IF NOT EXISTS blobs (user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT, size INTEGER, type TEXT, t INTEGER, PRIMARY KEY (user, id));
CREATE TABLE IF NOT EXISTS boards (room TEXT PRIMARY KEY, state BLOB, size INTEGER, t INTEGER);
CREATE INDEX IF NOT EXISTS pay_user ON payments(user);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY, t INTEGER, kind TEXT, text TEXT, contact TEXT, user INTEGER, info TEXT);
`);
const q = (sql) => { const st = db.prepare(sql); return { get: (...a) => st.get(...a), all: (...a) => st.all(...a), run: (...a) => st.run(...a) }; };
const tx = (f) => { db.exec('BEGIN IMMEDIATE'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

// ---------- мелочи ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = (n = 32) => crypto.randomBytes(n).toString('base64url');
const okEmail = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const okId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
const okRoom = (s) => typeof s === 'string' && /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(s);
const COLLS = new Set(['folders', 'files', 'tpls', 'boards', 'bfolders']);
const FREE_COLLS = new Set(['boards', 'bfolders']); // список досок и папки для досок есть у всех, кто вошёл
function addPeriod(t, period) { // календарный месяц или год; 31 января + месяц = 28 (29) февраля
  const d = new Date(t), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + (period === 'year' ? 12 : 1));
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last)); return d.getTime();
}
const dayRu = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const rub = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- подписка ----------
const GRACE = 3 * DAY; // пока списание не прошло, Про ещё три дня работает
function subOf(user) { return q('SELECT * FROM subs WHERE user = ?').get(user) || null; }
function proActive(s, t = now()) {
  if (!s || !s.until) return false;
  if (t < s.until) return true;
  return !s.canceled && !!s.pm_id && AUTOPAY && s.fails < 3 && t < s.until + GRACE;
}
function priceOf(s, period) { return (s && (period === 'year' ? s.price_year : s.price_month)) || PRICE[period]; }
function meJson(user) {
  const u = q('SELECT id, email FROM users WHERE id = ?').get(user); if (!u) return null;
  const s = subOf(user), active = proActive(s);
  const used = q('SELECT COALESCE(SUM(size),0) AS n FROM blobs WHERE user = ?').get(user).n + q("SELECT COALESCE(SUM(size),0) AS n FROM kv WHERE user = ? AND coll IN ('files','tpls')").get(user).n;
  return {
    email: u.email, used, quota: QUOTA,
    pro: s && s.until ? {
      active, period: s.period, until: s.until, canceled: !!s.canceled, autopay: AUTOPAY && !!s.pm_id,
      method: s.pm_type === 'sbp' ? 'sbp' : 'card', title: s.pm_title || '', nextPeriod: s.next_period || null,
      price: priceOf(s, s.next_period || s.period), failing: !!s.fails, started: s.started,
    } : null,
  };
}

// ---------- ЮKassa ----------
async function yk(method, p, body, idem) {
  if (!SHOP || !KEY) throw Object.assign(new Error('ЮKassa не настроена'), { status: 503 });
  const r = await fetch(YK + p, {
    method, headers: { Authorization: 'Basic ' + Buffer.from(SHOP + ':' + KEY).toString('base64'), 'Content-Type': 'application/json', ...(idem ? { 'Idempotence-Key': idem } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { log('yk error', r.status, JSON.stringify(j).slice(0, 300)); throw Object.assign(new Error(j.description || 'Ошибка ЮKassa'), { status: 502, yk: j }); }
  return j;
}
const money = (n) => ({ value: n.toFixed(2), currency: 'RUB' });
const DESC = { month: 'Подписка Lodl Про на месяц', year: 'Подписка Lodl Про на год' };

async function createFirstPayment(user, period) {
  const s = subOf(user);
  const amount = priceOf(s && proActive(s) ? s : null, period); // цена, по которой оформили, остаётся, пока подписка действует
  const idem = rnd(16);
  const body = {
    amount: money(amount), capture: true, description: DESC[period],
    confirmation: { type: 'redirect', return_url: SITE + '/?pay=' + idem },
    metadata: { user: String(user), kind: 'first', period, idem },
  };
  if (AUTOPAY) body.save_payment_method = true;
  const p = await yk('POST', '/payments', body, idem);
  q('INSERT INTO payments (id, user, kind, period, amount, status, created) VALUES (?,?,?,?,?,?,?)').run(p.id, user, 'first', period, amount, p.status, now());
  q('INSERT OR REPLACE INTO kv (user, coll, id, data, size, t) VALUES (?,?,?,?,?,?)').run(user, '_pay', idem, p.id, 0, now()); // по метке из ссылки возврата находим платёж
  return p.confirmation && p.confirmation.confirmation_url;
}
// Платёж закончился: включаем или продлеваем Про. Повторное уведомление ничего не меняет.
function applyPayment(p) {
  const row = q('SELECT * FROM payments WHERE id = ?').get(p.id);
  if (!row) { log('unknown payment', p.id); return; }
  if (row.status === 'succeeded' || row.status === 'canceled') return;
  const amount = Math.round(parseFloat(p.amount && p.amount.value) || 0);
  if (p.status === 'succeeded' && amount !== row.amount) log('amount mismatch', p.id, amount, row.amount);
  if (p.status === 'succeeded' && p.paid) {
    tx(() => {
      q('UPDATE payments SET status = ?, done = ? WHERE id = ?').run('succeeded', now(), p.id);
      const s = subOf(row.user), pm = p.payment_method || {};
      const pmTitle = pm.card ? `${pm.card.card_type || 'Карта'} •• ${pm.card.last4}` : pm.type === 'sbp' ? 'СБП' : (pm.title || '');
      const saved = pm.saved && AUTOPAY ? pm.id : null;
      if (row.kind === 'first') {
        const base = s && s.until > now() ? s.until : now();
        const pmonth = row.period === 'month' ? row.amount : (s && s.price_month) || PRICE.month;
        const pyear = row.period === 'year' ? row.amount : (s && s.price_year) || PRICE.year;
        q(`INSERT INTO subs (user, period, until, canceled, pm_id, pm_title, pm_type, price_month, price_year, next_period, fails, next_try, reminded, started)
           VALUES (?,?,?,0,?,?,?,?,?,NULL,0,NULL,NULL,?)
           ON CONFLICT(user) DO UPDATE SET period=excluded.period, until=excluded.until, canceled=0, pm_id=COALESCE(excluded.pm_id, subs.pm_id), pm_title=CASE WHEN excluded.pm_id IS NULL THEN subs.pm_title ELSE excluded.pm_title END,
           pm_type=CASE WHEN excluded.pm_id IS NULL THEN subs.pm_type ELSE excluded.pm_type END, price_month=excluded.price_month, price_year=excluded.price_year, next_period=NULL, fails=0, next_try=NULL, reminded=NULL`)
          .run(row.user, row.period, addPeriod(base, row.period), saved, pmTitle, pm.type || '', pmonth, pyear, now());
      } else if (s) {
        const per = s.next_period || s.period;
        q('UPDATE subs SET period = ?, until = ?, next_period = NULL, fails = 0, next_try = NULL, reminded = NULL WHERE user = ?').run(per, addPeriod(Math.max(s.until, now() - GRACE), per), row.user);
      }
    });
    const u = q('SELECT email FROM users WHERE id = ?').get(row.user), s = subOf(row.user);
    if (u && s) mail.send(u.email, row.kind === 'first' ? 'paid' : 'renewed', { amount: rub(row.amount), until: dayRu(s.until), period: row.period, autopay: AUTOPAY && !!s.pm_id && !s.canceled, site: SITE }).catch((e) => log('mail', e.message));
    log('payment ok', p.id, row.kind, row.user);
  } else if (p.status === 'canceled') {
    q('UPDATE payments SET status = ?, done = ? WHERE id = ?').run('canceled', now(), p.id);
    if (row.kind === 'renew') {
      const s = subOf(row.user); if (!s) return;
      const fails = s.fails + 1, reason = p.cancellation_details && p.cancellation_details.reason;
      // способ оплаты больше не работает (карта закрыта, отозвано разрешение) — повторять бесполезно
      const dead = ['permission_revoked', 'card_expired', 'invalid_card_number', 'payment_method_restricted'].includes(reason);
      q('UPDATE subs SET fails = ?, next_try = ? WHERE user = ?').run(dead ? 3 : fails, now() + DAY, row.user);
      if (fails === 1 || dead) { const u = q('SELECT email FROM users WHERE id = ?').get(row.user); if (u) mail.send(u.email, 'failed', { until: dayRu(s.until + GRACE), site: SITE }).catch((e) => log('mail', e.message)); }
    }
    log('payment canceled', p.id, row.kind, p.cancellation_details && p.cancellation_details.reason);
  } else q('UPDATE payments SET status = ? WHERE id = ?').run(p.status, p.id);
}
async function refreshPayment(id) { const p = await yk('GET', '/payments/' + encodeURIComponent(id)); applyPayment(p); return p; }

// Продление и напоминания: раз в пять минут
async function renewTick() {
  if (!AUTOPAY || !SHOP) return;
  const due = q(`SELECT * FROM subs WHERE canceled = 0 AND pm_id IS NOT NULL AND fails < 3 AND until <= ? AND (next_try IS NULL OR next_try <= ?)`).all(now() + 10 * MIN, now());
  for (const s of due) {
    if (q("SELECT 1 FROM payments WHERE user = ? AND kind = 'renew' AND status = 'pending' AND created > ?").get(s.user, now() - DAY)) continue;
    const per = s.next_period || s.period, amount = priceOf(s, per), idem = 'renew-' + s.user + '-' + s.until + '-' + s.fails;
    try {
      const p = await yk('POST', '/payments', { amount: money(amount), capture: true, payment_method_id: s.pm_id, description: DESC[per] + ', продление', metadata: { user: String(s.user), kind: 'renew', period: per } }, idem);
      q('INSERT OR IGNORE INTO payments (id, user, kind, period, amount, status, created) VALUES (?,?,?,?,?,?,?)').run(p.id, s.user, 'renew', per, amount, 'pending', now());
      if (p.status !== 'pending') applyPayment(p);
    } catch (e) { log('renew error', s.user, e.message); q('UPDATE subs SET next_try = ? WHERE user = ?').run(now() + 3 * 3600e3, s.user); }
  }
  // напоминание за три дня до списания, один раз за период
  const soon = q('SELECT s.*, u.email FROM subs s JOIN users u ON u.id = s.user WHERE s.canceled = 0 AND s.pm_id IS NOT NULL AND s.until > ? AND s.until <= ? AND (s.reminded IS NULL OR s.reminded != s.until)').all(now(), now() + 3 * DAY);
  for (const s of soon) {
    q('UPDATE subs SET reminded = ? WHERE user = ?').run(s.until, s.user);
    const per = s.next_period || s.period;
    mail.send(s.email, 'reminder', { date: dayRu(s.until), amount: rub(priceOf(s, per)), period: per, site: SITE }).catch((e) => log('mail', e.message));
  }
  // зависшие платежи старше часа уточняем у ЮKassa (если уведомление потерялось)
  for (const p of q("SELECT id FROM payments WHERE status = 'pending' AND created < ? AND created > ?").all(now() - 15 * MIN, now() - 3 * DAY)) await refreshPayment(p.id).catch(() => {});
  // старые коды и сессии
  q('DELETE FROM codes WHERE exp < ? AND sent < ?').run(now() - DAY, now() - 2 * DAY);
  q('DELETE FROM sessions WHERE seen < ?').run(now() - 180 * DAY);
}

// ---------- вход ----------
function sendCode(email, ip) {
  const c = q('SELECT * FROM codes WHERE email = ?').get(email);
  const today = new Date().toISOString().slice(0, 10);
  if (c && c.hash && now() - c.sent < 55e3) return { error: 'Код уже отправлен. Новый можно запросить через минуту.', wait: Math.ceil((60e3 - (now() - c.sent)) / 1000) };
  const n = c && c.day === today ? c.n : 0;
  if (n >= 10) return { error: 'Сегодня отправлено слишком много кодов на эту почту. Попробуйте завтра.' };
  if (!limit('code-ip:' + ip, 20, 3600e3)) return { error: 'Слишком много попыток. Попробуйте через час.' };
  const code = String(crypto.randomInt(100000, 1000000));
  q('INSERT OR REPLACE INTO codes (email, hash, exp, tries, sent, day, n) VALUES (?,?,?,?,?,?,?)').run(email, sha(email + ':' + code), now() + 10 * MIN, 0, now(), today, n + 1);
  mail.send(email, 'code', { code, site: SITE }).catch((e) => log('mail code', email, e.message));
  return { ok: true };
}
function checkCode(email, code) {
  const c = q('SELECT * FROM codes WHERE email = ?').get(email);
  if (!c || !c.hash) return { error: 'Код устарел. Отправьте новый.', expired: true };
  if (c.exp < now()) return { error: 'Код устарел. Отправьте новый.', expired: true };
  if (c.tries >= 5) return { error: 'Код введён неверно 5 раз. Отправьте новый код.', expired: true };
  if (sha(email + ':' + String(code).replace(/\D/g, '')) !== c.hash) { q('UPDATE codes SET tries = tries + 1 WHERE email = ?').run(email); return { error: 'Неверный код', left: 4 - c.tries }; }
  q('UPDATE codes SET hash = NULL WHERE email = ?').run(email);
  let u = q('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) { q('INSERT INTO users (email, created) VALUES (?, ?)').run(email, now()); u = q('SELECT id FROM users WHERE email = ?').get(email); }
  const token = rnd();
  q('INSERT INTO sessions (hash, user, created, seen) VALUES (?,?,?,?)').run(sha(token), u.id, now(), now());
  return { ok: true, token, user: u.id };
}

// ---------- ограничение частоты ----------
const buckets = new Map();
function limit(key, n, ms) {
  const t = now(); let b = buckets.get(key);
  if (!b || t - b.t > ms) { b = { t, n: 0 }; buckets.set(key, b); }
  return ++b.n <= n;
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t - b.t > 3600e3) buckets.delete(k); }, 600e3).unref();

// ---------- HTTP ----------
const COOKIE = 'lodl_s';
function sessionUser(req) {
  const m = /(?:^|;\s*)lodl_s=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const s = q('SELECT user, seen FROM sessions WHERE hash = ?').get(sha(m[1])); if (!s) return null;
  if (now() - s.seen > 3600e3) q('UPDATE sessions SET seen = ? WHERE hash = ?').run(now(), sha(m[1]));
  return s.user;
}
const secure = SITE.startsWith('https:');
const setCookie = (res, token, age) => res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`);
function send(res, code, obj, headers = {}) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store', ...headers });
  res.end(b);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const len = +req.headers['content-length'] || 0;
    if (len > max) { reject(Object.assign(new Error('Слишком большой файл'), { status: 413 })); req.resume(); return; }
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('Слишком большой файл'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
const json = async (req, max = 1e6) => { const b = await readBody(req, max); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch { throw Object.assign(new Error('Неверный запрос'), { status: 400 }); } };
const fail = (status, msg) => Object.assign(new Error(msg), { status });

const routes = [];
const route = (method, re, f, opts = {}) => routes.push({ method, re, f, ...opts });

route('GET', /^\/api\/config$/, () => ({ autopay: AUTOPAY, prices: PRICE, pay: !!(SHOP && KEY) }), { anon: true });
route('GET', /^\/api\/me$/, ({ user }) => (user ? meJson(user) : { anon: true }), { anon: true });
route('POST', /^\/api\/login\/start$/, async ({ req, ip }) => {
  const { email } = await json(req); const e = String(email || '').trim().toLowerCase();
  if (!okEmail(e)) throw fail(400, 'Проверьте адрес почты');
  const r = sendCode(e, ip); if (r.error) throw Object.assign(fail(429, r.error), { extra: { wait: r.wait } }); return r;
}, { anon: true });
route('POST', /^\/api\/login\/verify$/, async ({ req, res, ip }) => {
  if (!limit('verify-ip:' + ip, 60, 3600e3)) throw fail(429, 'Слишком много попыток. Попробуйте через час.');
  const { email, code } = await json(req); const e = String(email || '').trim().toLowerCase();
  if (!okEmail(e)) throw fail(400, 'Проверьте адрес почты');
  const r = checkCode(e, code); if (r.error) throw Object.assign(fail(400, r.error), { extra: { expired: !!r.expired, left: r.left } });
  setCookie(res, r.token, 180 * 86400); return meJson(r.user);
}, { anon: true });
route('POST', /^\/api\/logout$/, ({ req, res }) => {
  const m = /(?:^|;\s*)lodl_s=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); if (m) q('DELETE FROM sessions WHERE hash = ?').run(sha(m[1]));
  setCookie(res, '', 0); return { ok: true };
}, { anon: true });
route('POST', /^\/api\/account\/delete$/, ({ user, res }) => {
  const s = subOf(user);
  for (const b of q('SELECT id FROM blobs WHERE user = ?').all(user)) fs.rm(blobPath(user, b.id), { force: true }, () => {});
  fs.rm(path.join(DATA, 'blobs', String(user)), { recursive: true, force: true }, () => {});
  q('DELETE FROM users WHERE id = ?').run(user); // подписка, сессии и облако удаляются вместе с ним
  setCookie(res, '', 0); log('account deleted', user, s && proActive(s) ? '(с действующим Про)' : ''); return { ok: true };
});

route('POST', /^\/api\/pay$/, async ({ req, user }) => {
  const { period } = await json(req); if (period !== 'month' && period !== 'year') throw fail(400, 'Неверный срок');
  const s = subOf(user);
  if (proActive(s) && !s.canceled && s.pm_id && AUTOPAY) throw fail(409, 'Подписка уже оформлена');
  if (!limit('pay:' + user, 10, 3600e3)) throw fail(429, 'Слишком много попыток оплаты. Попробуйте через час.');
  const url = await createFirstPayment(user, period); if (!url) throw fail(502, 'ЮKassa не вернула страницу оплаты');
  return { url };
});
route('GET', /^\/api\/pay\/([A-Za-z0-9_-]{8,64})$/, async ({ user, m }) => {
  const r = q("SELECT data FROM kv WHERE user = ? AND coll = '_pay' AND id = ?").get(user, m[1]); if (!r) throw fail(404, 'Платёж не найден');
  let p = q('SELECT * FROM payments WHERE id = ?').get(r.data);
  if (p.status === 'pending') { await refreshPayment(p.id).catch(() => {}); p = q('SELECT * FROM payments WHERE id = ?').get(r.data); }
  return { status: p.status, me: meJson(user) };
});
route('POST', /^\/api\/sub\/cancel$/, ({ user }) => { q('UPDATE subs SET canceled = 1 WHERE user = ?').run(user); return meJson(user); });
route('POST', /^\/api\/sub\/resume$/, ({ user }) => {
  const s = subOf(user); if (!s || !proActive(s)) throw fail(409, 'Подписка уже закончилась, её можно оформить заново');
  if (!s.pm_id) throw fail(409, 'Чтобы подписка продлевалась сама, оплатите её ещё раз');
  q('UPDATE subs SET canceled = 0, fails = 0, next_try = NULL WHERE user = ?').run(user); return meJson(user);
});
route('POST', /^\/api\/sub\/period$/, async ({ req, user }) => {
  const { period } = await json(req); const s = subOf(user);
  if (!s || !proActive(s)) throw fail(409, 'Подписка не оформлена');
  q('UPDATE subs SET next_period = ? WHERE user = ?').run(period === 'year' && s.period !== 'year' ? 'year' : period === 'month' && s.period !== 'month' ? 'month' : null, user);
  return meJson(user);
});
// Уведомления от ЮKassa. Телу не верим: статус всегда уточняем запросом в ЮKassa.
route('POST', /^\/api\/yk\/hook$/, async ({ req }) => {
  const b = await json(req, 2e5); const id = b && b.object && b.object.id;
  if (typeof id !== 'string' || !q('SELECT 1 FROM payments WHERE id = ?').get(id)) return { ok: true };
  await refreshPayment(id); return { ok: true };
}, { anon: true, noCsrf: true });

// предложения и сообщения о проблемах: сохраняем и пересылаем на почту
const FB_KINDS = { idea: 'Идея', bug: 'Проблема', wish: 'Пожелание' };
route('POST', /^\/api\/feedback$/, async ({ req, user, ip }) => {
  if (!limit('fb:' + ip, 8, 3600e3)) throw fail(429, 'Вы отправили много сообщений подряд. Попробуйте через час.');
  const b = await json(req, 6e4);
  const kind = FB_KINDS[b.kind] ? b.kind : 'idea';
  const text = String(b.text || '').trim().slice(0, 5000); if (text.length < 3) throw fail(400, 'Напишите хотя бы пару слов');
  const contact = String(b.contact || '').trim().slice(0, 120);
  const info = String(b.info || '').slice(0, 600);
  // почту из аккаунта не берём: человек сам решает, оставить ли адрес для ответа
  q('INSERT INTO feedback (t, kind, text, contact, user, info) VALUES (?,?,?,?,?,?)').run(now(), kind, text, contact, null, info);
  const to = env.FEEDBACK_TO || env.SMTP_USER;
  if (to) mail.send(to, 'feedback', { site: SITE, kind: FB_KINDS[kind], text, contact: contact || 'не указана', info, replyTo: okEmail(contact) ? contact : '' }).catch((e) => log('mail feedback', e.message));
  return { ok: true };
}, { anon: true });

// облако: записи (папки, материалы, шаблоны, список досок)
const proOrThrow = (user) => { if (!proActive(subOf(user))) throw fail(402, 'Нужна подписка Про'); };
route('GET', /^\/api\/kv\/([a-z]+)$/, ({ user, m }) => {
  if (!COLLS.has(m[1])) throw fail(404, 'Нет такого раздела');
  return q('SELECT id, data, t FROM kv WHERE user = ? AND coll = ? ORDER BY t DESC').all(user, m[1]).map((r) => ({ id: r.id, t: r.t, ...JSON.parse(r.data) }));
});
route('PUT', /^\/api\/kv\/([a-z]+)\/([A-Za-z0-9_-]{1,64})$/, async ({ req, user, m }) => {
  const coll = m[1]; if (!COLLS.has(coll)) throw fail(404, 'Нет такого раздела');
  const raw = await readBody(req, 8e6); let data; try { data = JSON.parse(raw.toString('utf8')); } catch { throw fail(400, 'Неверный запрос'); }
  const exists = q('SELECT size FROM kv WHERE user = ? AND coll = ? AND id = ?').get(user, coll, m[2]);
  // новое в Материалы и шаблоны — только с Про; переименовать, переложить и удалить можно всегда
  if (!FREE_COLLS.has(coll) && !exists) proOrThrow(user);
  if (FREE_COLLS.has(coll) && raw.length > 4000) throw fail(413, 'Слишком длинная запись');
  if (FREE_COLLS.has(coll) && !exists && q('SELECT COUNT(*) AS n FROM kv WHERE user = ? AND coll = ?').get(user, coll).n >= 2000) throw fail(413, 'Слишком много записей');
  if (!FREE_COLLS.has(coll)) { const me = meJson(user); if (me.used - (exists ? exists.size : 0) + raw.length > QUOTA) throw fail(413, 'Место в Материалах закончилось'); }
  q('INSERT OR REPLACE INTO kv (user, coll, id, data, size, t) VALUES (?,?,?,?,?,?)').run(user, coll, m[2], raw.toString('utf8'), FREE_COLLS.has(coll) ? 0 : raw.length, +data.t || now());
  return { ok: true };
});
route('DELETE', /^\/api\/kv\/([a-z]+)\/([A-Za-z0-9_-]{1,64})$/, ({ user, m }) => { q('DELETE FROM kv WHERE user = ? AND coll = ? AND id = ?').run(user, m[1], m[2]); return { ok: true }; });
// облако: файлы Материалов
const blobPath = (user, id) => path.join(DATA, 'blobs', String(user), id);
route('PUT', /^\/api\/blob\/([A-Za-z0-9_-]{1,64})$/, async ({ req, user, m }) => {
  proOrThrow(user);
  const max = 200 * 1024 * 1024, len = +req.headers['content-length'] || 0;
  const me = meJson(user); if (me.used + len > QUOTA) throw fail(413, 'Место в Материалах закончилось');
  const body = await readBody(req, max);
  fs.mkdirSync(path.dirname(blobPath(user, m[1])), { recursive: true });
  fs.writeFileSync(blobPath(user, m[1]) + '.tmp', body); fs.renameSync(blobPath(user, m[1]) + '.tmp', blobPath(user, m[1]));
  q('INSERT OR REPLACE INTO blobs (user, id, size, type, t) VALUES (?,?,?,?,?)').run(user, m[1], body.length, String(req.headers['content-type'] || 'application/octet-stream').slice(0, 80), now());
  return { ok: true };
});
route('GET', /^\/api\/blob\/([A-Za-z0-9_-]{1,64})$/, ({ user, m, res }) => {
  const b = q('SELECT * FROM blobs WHERE user = ? AND id = ?').get(user, m[1]); if (!b) throw fail(404, 'Файл не найден');
  res.writeHead(200, { 'Content-Type': b.type, 'Content-Length': b.size, 'Cache-Control': 'private, max-age=31536000, immutable' });
  fs.createReadStream(blobPath(user, m[1])).pipe(res); return undefined;
});
route('DELETE', /^\/api\/blob\/([A-Za-z0-9_-]{1,64})$/, ({ user, m }) => { q('DELETE FROM blobs WHERE user = ? AND id = ?').run(user, m[1]); fs.rm(blobPath(user, m[1]), { force: true }, () => {}); return { ok: true }; });
// облако: доски (состояние Yjs, объединяется с тем, что уже лежит на сервере)
const BOARD_MAX = 40 * 1024 * 1024;
route('GET', /^\/api\/board\/([a-z0-9-]{14})$/, ({ m, res }) => {
  if (!okRoom(m[1])) throw fail(400, 'Неверный код доски');
  const b = q('SELECT state FROM boards WHERE room = ?').get(m[1]);
  const buf = b ? Buffer.from(b.state) : Buffer.alloc(0);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'no-store' }); res.end(buf); return undefined;
});
route('POST', /^\/api\/board\/([a-z0-9-]{14})$/, async ({ req, m, user }) => {
  if (!okRoom(m[1])) throw fail(400, 'Неверный код доски');
  if (!limit('board:' + user, 600, 3600e3)) throw fail(429, 'Слишком часто');
  const up = await readBody(req, BOARD_MAX); if (!up.length) return { ok: true };
  const old = q('SELECT state FROM boards WHERE room = ?').get(m[1]);
  let merged;
  try { merged = old ? Buffer.from(Y.mergeUpdates([new Uint8Array(old.state), new Uint8Array(up)])) : up; const d = new Y.Doc(); Y.applyUpdate(d, merged); d.destroy(); }
  catch { throw fail(400, 'Повреждённые данные доски'); }
  if (merged.length > BOARD_MAX) throw fail(413, 'Доска слишком большая');
  q('INSERT OR REPLACE INTO boards (room, state, size, t) VALUES (?,?,?,?)').run(m[1], merged, merged.length, now());
  return { ok: true, size: merged.length };
});

// Файлы сайта. На сервере их отдаёт Caddy, а это нужно для проверок и на случай, если Caddy не настроен.
const STATIC = env.STATIC_DIR || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
function serveStatic(req, res, p) {
  const rel = p === '/' ? '/index.html' : decodeURIComponent(p);
  const f = path.join(path.resolve(STATIC), path.normalize(rel).replace(/^([/\\]*\.\.)+/, ''));
  if (!f.startsWith(path.resolve(STATIC)) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end('Не найдено'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /index\.html$|version\.json$/.test(f) ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(f).pipe(res);
}
// Переезд со старого адреса (GitHub Pages): старая страница отправляет доски из браузера сюда и получает метку,
// а новая страница по метке забирает их один раз. Метка живёт два часа.
const OLD_ORIGIN = env.OLD_ORIGIN || 'https://miroslava553.github.io';
const IMPORT_DIR = path.join(DATA, 'import'); fs.mkdirSync(IMPORT_DIR, { recursive: true });
route('POST', /^\/api\/import$/, async ({ req, ip }) => {
  if (!limit('import:' + ip, 5, 3600e3)) throw fail(429, 'Слишком часто');
  const body = await readBody(req, 150 * 1024 * 1024);
  try { JSON.parse(body.toString('utf8')); } catch { throw fail(400, 'Неверные данные'); }
  const token = rnd(18); fs.writeFileSync(path.join(IMPORT_DIR, token), body);
  return { token };
}, { anon: true, noCsrf: true, cors: true });
route('GET', /^\/api\/import\/([A-Za-z0-9_-]{20,40})$/, ({ m, res }) => {
  const f = path.join(IMPORT_DIR, m[1]); if (!fs.existsSync(f)) throw fail(404, 'Данные для переноса не найдены');
  const b = fs.readFileSync(f); fs.rmSync(f, { force: true });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); res.end(b); return undefined;
}, { anon: true });
setInterval(() => { for (const f of fs.readdirSync(IMPORT_DIR)) { const st = fs.statSync(path.join(IMPORT_DIR, f)); if (now() - st.mtimeMs > 2 * 3600e3) fs.rmSync(path.join(IMPORT_DIR, f), { force: true }); } }, 600e3).unref();

// Настройка магазина и почты через браузер: setup.sh печатает одноразовую ссылку /setup/<метка>.
// Так секретный ключ не нужно набирать в консоли сервера, его можно вставить в обычном браузере.
const ENV_FILE = env.ENV_FILE || '/etc/lodl/env';
const TOKEN_FILE = env.SETUP_TOKEN_FILE || '/etc/lodl/setup-token';
// ссылка действует сутки после выдачи, потом нужна новая (команда lodl-link)
const setupToken = () => { try { if (now() - fs.statSync(TOKEN_FILE).mtimeMs > DAY) return ''; return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; } };
const FIELDS = [['SHOP_ID', 'ShopID магазина', 'Например 1509002'], ['SECRET_KEY', 'Секретный ключ', 'live_… из раздела «Интеграция → Ключи API»'],
  ['SMTP_HOST', 'Почтовый сервер (SMTP)', 'Например smtp.mail.ru'], ['SMTP_PORT', 'Порт', '465'], ['SMTP_USER', 'Логин почты', 'no-reply@ваш-домен'],
  ['SMTP_PASS', 'Пароль почты', 'Пароль для внешних приложений'], ['MAIL_FROM', 'От кого письма', 'Lodl <no-reply@ваш-домен>']];
const htmlEsc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function setupPage(token, msg = '') {
  const cur = (k) => (k === 'SECRET_KEY' || k === 'SMTP_PASS' ? '' : env[k] || '');
  const set = (k) => (env[k] ? (k === 'SECRET_KEY' || k === 'SMTP_PASS' ? ' (уже задан, оставьте пустым, чтобы не менять)' : '') : '');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Настройка Lodl</title>
<style>body{font:16px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:#f6f7fb;color:#15171a;margin:0;padding:24px}form,.box{max-width:520px;margin:0 auto 16px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(20,30,60,.07)}h1{font-size:22px;margin:0 0 6px}label{display:block;font-weight:600;margin:16px 0 4px;font-size:14px}input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d9dce5;border-radius:10px;font-size:15px}.h{color:#6c727f;font-size:13px}button{margin-top:20px;background:#4c6ef5;color:#fff;border:0;border-radius:10px;padding:13px 20px;font-weight:700;font-size:16px;cursor:pointer}.ok{background:#e8f7ee;color:#11713b;padding:12px 14px;border-radius:10px}code{background:#f1f3f9;padding:2px 6px;border-radius:6px;word-break:break-all}</style></head><body>
<div class="box"><h1>Настройка Lodl</h1><p class="h">Адрес для уведомлений ЮKassa: <code>${htmlEsc(SITE)}/api/yk/hook</code>. Его нужно вставить в личном кабинете ЮKassa в разделе «Интеграция → HTTP-уведомления» и отметить события payment.succeeded и payment.canceled.</p>${msg ? `<p class="ok">${htmlEsc(msg)}</p>` : ''}</div>
<form method="post" action="/setup/${htmlEsc(token)}"><b>ЮKassa</b>${FIELDS.slice(0, 2).map(([k, l, h]) => `<label>${l}${set(k)}</label><input ${k === 'SECRET_KEY' ? 'type=password' : 'type=text'} name="${k}" value="${htmlEsc(cur(k))}" autocomplete="off"><div class="h">${h}</div>`).join('')}
<label><input type="checkbox" name="AUTOPAY" value="1" ${AUTOPAY ? 'checked' : ''}> Автоплатежи подключены (подписка продлевается сама)</label>
<br><b>Почта для писем</b>${FIELDS.slice(2).map(([k, l, h]) => `<label>${l}${set(k)}</label><input ${k === 'SMTP_PASS' ? 'type=password' : 'type=text'} name="${k}" value="${htmlEsc(cur(k))}" autocomplete="off"><div class="h">${h}</div>`).join('')}
<label><input type="checkbox" name="_test" value="1" checked> Отправить пробное письмо на адрес из «Логин почты»</label>
<button type="submit">Сохранить</button></form></body></html>`;
}
routes.push({ method: 'GET', re: /^\/setup\/([A-Za-z0-9_-]{20,64})$/, anon: true, html: true, f: ({ m, res }) => {
  const t = setupToken(); if (!t || t !== m[1]) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Ссылка недействительна. Получите новую командой sudo lodl-link на сервере.'); return undefined; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); res.end(setupPage(m[1])); return undefined;
} });
routes.push({ method: 'POST', re: /^\/setup\/([A-Za-z0-9_-]{20,64})$/, anon: true, noCsrf: true, f: async ({ m, req, res }) => {
  const t = setupToken(); if (!t || t !== m[1]) throw fail(404, 'Ссылка недействительна');
  const form = new URLSearchParams((await readBody(req, 1e5)).toString('utf8'));
  let cur = ''; try { cur = fs.readFileSync(ENV_FILE, 'utf8'); } catch {}
  const vals = new Map(cur.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  for (const [k] of FIELDS) { const v = (form.get(k) || '').trim().replace(/[\r\n]/g, ''); if (v || (k !== 'SECRET_KEY' && k !== 'SMTP_PASS')) { if (v) vals.set(k, v); else vals.delete(k); } }
  vals.set('AUTOPAY', form.get('AUTOPAY') ? '1' : '0');
  fs.writeFileSync(ENV_FILE, [...vals].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch {}
  let msg = 'Сохранено. Сервер перезапустится за несколько секунд.';
  if (form.get('_test') && vals.get('SMTP_HOST') && vals.get('SMTP_USER')) {
    try {
      const nodemailer = require('nodemailer'); const port = +vals.get('SMTP_PORT') || 465;
      await nodemailer.createTransport({ host: vals.get('SMTP_HOST'), port, secure: port === 465, auth: { user: vals.get('SMTP_USER'), pass: vals.get('SMTP_PASS') || '' } })
        .sendMail({ from: vals.get('MAIL_FROM') || vals.get('SMTP_USER'), to: vals.get('SMTP_USER'), subject: 'Проверка почты Lodl', text: 'Письма Lodl отправляются. Это пробное письмо, отвечать на него не нужно.' });
      msg += ' Пробное письмо отправлено, проверьте ящик ' + vals.get('SMTP_USER') + '.';
    } catch (e) { msg += ' Пробное письмо отправить не удалось: ' + e.message; }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(setupPage(m[1], msg));
  log('настройки сохранены, перезапуск'); setTimeout(() => process.exit(0), 800); return undefined;
} });

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  if (STATIC && !p.startsWith('/api/') && !p.startsWith('/setup/') && req.method === 'GET') return serveStatic(req, res, p);
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
  if (!limit('ip:' + ip, 900, 60e3)) return send(res, 429, { error: 'Слишком много запросов' });
  const corsH = req.headers.origin === OLD_ORIGIN ? { 'Access-Control-Allow-Origin': OLD_ORIGIN, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } : null;
  if (req.method === 'OPTIONS') { const ok = corsH && routes.some((x) => x.cors && x.re.test(p)); res.writeHead(ok ? 204 : 403, ok ? corsH : {}); res.end(); return; }
  const r = routes.find((x) => x.method === req.method && x.re.test(p));
  if (!r) return send(res, 404, { error: 'Не найдено' });
  if (r.cors && corsH) for (const [k, v] of Object.entries(corsH)) res.setHeader(k, v);
  // защита от чужих сайтов: изменения принимаем только с заголовком X-Lodl (браузер не даст чужой странице его поставить)
  if (req.method !== 'GET' && !r.noCsrf && req.headers['x-lodl'] !== '1') return send(res, 403, { error: 'Запрещено' });
  const user = sessionUser(req);
  if (!r.anon && !user) return send(res, 401, { error: 'Нужно войти' });
  try {
    const out = await r.f({ req, res, user, ip, m: p.match(r.re), url });
    if (out !== undefined && !res.headersSent) send(res, 200, out);
  } catch (e) {
    if (!e.status) log('error', req.method, p, e.stack || e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Что-то пошло не так. Попробуйте ещё раз.', ...(e.extra || {}) });
    else res.destroy();
  }
}

const server = http.createServer((req, res) => { handle(req, res).catch((e) => { log('fatal', e); try { res.destroy(); } catch {} }); });
server.requestTimeout = 10 * 60e3;
if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => log(`Lodl на ${PORT}, сайт ${SITE}, ЮKassa ${SHOP ? 'есть' : 'нет'}, автоплатежи ${AUTOPAY ? 'да' : 'нет'}, почта ${mail.ready() ? 'есть' : 'нет'}`));
  const tick = () => renewTick().catch((e) => log('tick', e.stack || e));
  setTimeout(tick, 5000); setInterval(tick, 5 * MIN);
}
module.exports = { server, renewTick, db, addPeriod };
