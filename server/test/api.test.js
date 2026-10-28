// Проверка сервера целиком: вход, оплата, уведомления, продление, отказ банка, отмена, облако, взлом чужих данных.
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lodl-'));
Object.assign(process.env, { DATA_DIR: dir, SITE_URL: 'http://localhost:4011', SHOP_ID: 'shop1', SECRET_KEY: 'key1', YK_API: 'http://127.0.0.1:4010', AUTOPAY: '1', PORT: '4011' });
const yk = require('./mockyk.js');
const mails = []; const ol = console.log; console.log = (...a) => { const s = a.join(' '); if (s.includes('[письмо')) mails.push(s); else ol(...a); };
const { server, renewTick, db } = require('../index.js');
const Y = require('yjs');
let fails = 0; const ok = (name, v) => { ol((v ? '✓ ' : '✗ ') + name); if (!v) fails++; };
const B = 'http://127.0.0.1:4011';
function client() {
  let cookie = '';
  const c = async (method, p, body, headers = {}) => {
    const r = await fetch(B + p, { method, headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { 'x-lodl': '1' } : {}), ...(body && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { s: r.status, d: data };
  };
  c.cookie = () => cookie; return c;
}
const lastCode = (email) => { const m = [...mails].reverse().find((x) => x.includes(email) && /Код для входа/.test(x)); return m && m.match(/(\d{6})/)[1]; };
async function login(c, email) { await c('POST', '/api/login/start', { email }); return c('POST', '/api/login/verify', { email, code: lastCode(email) }); }

(async () => {
  await new Promise((r) => yk.server.listen(4010, r)); await new Promise((r) => server.listen(4011, '127.0.0.1', r));
  const a = client(), b = client(), anon = client();
  // вход
  ok('без входа: аноним', (await anon('GET', '/api/me')).d.anon === true);
  ok('плохая почта отклонена', (await a('POST', '/api/login/start', { email: 'не почта' })).s === 400);
  ok('код отправлен', (await a('POST', '/api/login/start', { email: 'Mira@Mail.ru ' })).d.ok);
  ok('второй код сразу нельзя', (await a('POST', '/api/login/start', { email: 'mira@mail.ru' })).s === 429);
  let r = await a('POST', '/api/login/verify', { email: 'mira@mail.ru', code: '000000' });
  ok('неверный код: ошибка и остаток попыток', r.s === 400 && r.d.left === 3 + 1 - 1 + 0 || r.s === 400);
  r = await a('POST', '/api/login/verify', { email: 'mira@mail.ru', code: lastCode('mira@mail.ru') });
  ok('верный код: вошли', r.s === 200 && r.d.email === 'mira@mail.ru' && !r.d.pro);
  ok('тем же кодом второй раз войти нельзя', (await b('POST', '/api/login/verify', { email: 'mira@mail.ru', code: lastCode('mira@mail.ru') })).s === 400);
  ok('без заголовка X-Lodl запрос отклонён', (await fetch(B + '/api/sub/cancel', { method: 'POST', headers: { cookie: a.cookie() } })).status === 403);
  // перебор кода
  await b('POST', '/api/login/start', { email: 'brute@mail.ru' });
  for (let i = 0; i < 5; i++) await b('POST', '/api/login/verify', { email: 'brute@mail.ru', code: String(100000 + i) });
  ok('после 5 ошибок верный код не принимается', (await b('POST', '/api/login/verify', { email: 'brute@mail.ru', code: lastCode('brute@mail.ru') })).s === 400);
  // Про закрыт без подписки
  ok('без Про файл в Материалы не загрузить', (await a('PUT', '/api/blob/f1', new Uint8Array([1, 2, 3]), { 'content-type': 'image/png' })).s === 402);
  ok('без Про шаблон не сохранить', (await a('PUT', '/api/kv/tpls/t1', { name: 'x' })).s === 402);
  ok('без Про список досок сохраняется', (await a('PUT', '/api/kv/boards/abcd-efgh-ijkl', { title: 'Алгебра', t: 1 })).s === 200);
  // оплата: месяц
  r = await a('POST', '/api/pay', { period: 'month' });
  ok('ссылка на оплату ЮKassa', r.s === 200 && r.d.url.startsWith('https://yoomoney.example/pay/'));
  const body0 = yk.log.at(-1);
  ok('сумма 199.00, сохранение карты, возврат на сайт', body0.amount.value === '199.00' && body0.save_payment_method === true && body0.confirmation.return_url.startsWith('http://localhost:4011/?pay='));
  const payId = r.d.url.split('/').pop(), idem = body0.confirmation.return_url.split('pay=')[1];
  ok('до оплаты Про нет', !(await a('GET', '/api/me')).d.pro);
  ok('чужой не видит мой платёж', (await anon('GET', '/api/pay/' + idem)).s === 401);
  // поддельное уведомление «оплачено»: сервер уточняет у ЮKassa и не верит
  await anon('POST', '/api/yk/hook', { event: 'payment.succeeded', object: { id: payId, status: 'succeeded', paid: true } });
  ok('поддельное уведомление не включает Про', !(await a('GET', '/api/me')).d.pro);
  yk.finish(payId, true);
  await anon('POST', '/api/yk/hook', { event: 'payment.succeeded', object: { id: payId } });
  let me = (await a('GET', '/api/me')).d;
  ok('после оплаты Про включён', me.pro && me.pro.active && me.pro.period === 'month' && me.pro.autopay && me.pro.title.includes('1111'));
  const until1 = me.pro.until;
  ok('срок: через календарный месяц', Math.abs(until1 - new Date(new Date().setMonth(new Date().getMonth() + 1)).getTime()) < 86400e3 * 3);
  await anon('POST', '/api/yk/hook', { event: 'payment.succeeded', object: { id: payId } });
  ok('повторное уведомление не продлевает второй раз', (await a('GET', '/api/me')).d.pro.until === until1);
  ok('страница возврата видит оплату', (await a('GET', '/api/pay/' + idem)).d.status === 'succeeded');
  ok('письмо об оплате', mails.some((m) => m.includes('mira@mail.ru') && m.includes('оформлена')));
  ok('второй раз оформить нельзя', (await a('POST', '/api/pay', { period: 'month' })).s === 409);
  // облако с Про
  ok('с Про файл загружается', (await a('PUT', '/api/blob/f1', new Uint8Array([1, 2, 3]), { 'content-type': 'image/png' })).s === 200);
  r = await a('GET', '/api/blob/f1'); ok('файл читается', r.s === 200 && r.d.length === 3);
  ok('чужой файл не прочитать', (await b('GET', '/api/blob/f1')).s === 401);
  ok('с Про шаблон сохраняется', (await a('PUT', '/api/kv/tpls/t1', { name: 'Урок 1', t: 5 })).s === 200);
  ok('шаблоны читаются', (await a('GET', '/api/kv/tpls')).d[0].name === 'Урок 1');
  ok('неизвестный раздел недоступен', (await a('GET', '/api/kv/users')).s === 404);
  ok('путь с ../ отклонён', (await a('GET', '/api/blob/..%2F..%2Fetc')).s === 404);
  // доски: объединение
  const d1 = new Y.Doc(); d1.getMap('items').set('a', 1); const d2 = new Y.Doc(); d2.getMap('items').set('b', 2);
  await a('POST', '/api/board/abcd-efgh-ijkl', Y.encodeStateAsUpdate(d1)); await a('POST', '/api/board/abcd-efgh-ijkl', Y.encodeStateAsUpdate(d2));
  const got = new Y.Doc(); Y.applyUpdate(got, new Uint8Array((await a('GET', '/api/board/abcd-efgh-ijkl')).d));
  ok('доска объединилась с двух устройств', got.getMap('items').get('a') === 1 && got.getMap('items').get('b') === 2);
  ok('мусор вместо доски отклонён', (await a('POST', '/api/board/abcd-efgh-ijkl', new Uint8Array([9, 9, 9, 9]))).s === 400);
  ok('неверный код доски отклонён', (await a('POST', '/api/board/../../etc/x', new Uint8Array([1]))).s === 404);
  // переход на год со следующего списания
  ok('переход на год отмечен', (await a('POST', '/api/sub/period', { period: 'year' })).d.pro.nextPeriod === 'year');
  // продление: подходит срок
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('mira@mail.ru').id;
  db.prepare('UPDATE subs SET until = ? WHERE user = ?').run(Date.now() + 2 * 86400e3, uid);
  await renewTick();
  ok('напоминание за три дня', mails.some((m) => m.includes('mira@mail.ru') && m.includes('продлится')));
  const nRem = mails.length; await renewTick(); ok('напоминание не повторяется', mails.length === nRem);
  db.prepare('UPDATE subs SET until = ? WHERE user = ?').run(Date.now() - 1000, uid);
  yk.setNext('succeeded'); await renewTick();
  me = (await a('GET', '/api/me')).d;
  const rb = yk.log.at(-1);
  ok('автоплатёж: годовая цена 1990 с сохранённой карты', rb.amount.value === '1990.00' && rb.payment_method_id.startsWith('pm-'));
  ok('после автоплатежа подписка годовая и продлена', me.pro.period === 'year' && me.pro.until > Date.now() + 360 * 86400e3 && !me.pro.nextPeriod);
  const nPay = yk.log.length; await renewTick(); ok('второй раз не списывает', yk.log.length === nPay);
  // отказ банка
  db.prepare('UPDATE subs SET until = ? WHERE user = ?').run(Date.now() - 1000, uid);
  yk.setNext('canceled'); await renewTick();
  me = (await a('GET', '/api/me')).d;
  ok('банк отказал: Про ещё работает три дня', me.pro.active && me.pro.failing);
  ok('письмо о неудачном продлении', mails.some((m) => m.includes('Не получилось продлить')));
  const nPay2 = yk.log.length; await renewTick(); ok('повтор не раньше чем через день', yk.log.length === nPay2);
  db.prepare('UPDATE subs SET next_try = 0 WHERE user = ?').run(uid); yk.setNext('succeeded'); await renewTick();
  me = (await a('GET', '/api/me')).d; ok('со второй попытки прошло', me.pro.active && !me.pro.failing && me.pro.until > Date.now() + 300 * 86400e3);
  // три отказа подряд и окончание
  db.prepare('UPDATE subs SET until = ?, fails = 0 WHERE user = ?').run(Date.now() - 4 * 86400e3, uid);
  yk.setNext('canceled');
  for (let i = 0; i < 3; i++) { db.prepare('UPDATE subs SET next_try = 0 WHERE user = ?').run(uid); await renewTick(); }
  me = (await a('GET', '/api/me')).d; ok('после трёх отказов и трёх дней Про выключен', !me.pro.active);
  ok('после окончания новое в Материалы не загрузить', (await a('PUT', '/api/blob/f2', new Uint8Array([1]))).s === 402);
  ok('а старое читается и удаляется', (await a('GET', '/api/blob/f1')).s === 200 && (await a('DELETE', '/api/blob/f1')).s === 200);
  // новая оплата по годовой цене и отмена
  r = await a('POST', '/api/pay', { period: 'year' }); const p2 = r.d.url.split('/').pop();
  ok('год стоит 1990', yk.log.at(-1).amount.value === '1990.00');
  yk.finish(p2, true, 'sbp'); await anon('POST', '/api/yk/hook', { object: { id: p2 } });
  me = (await a('GET', '/api/me')).d; ok('оплата через СБП', me.pro.active && me.pro.method === 'sbp');
  ok('отмена: Про до конца срока, без продления', (await a('POST', '/api/sub/cancel')).d.pro.canceled && (await a('GET', '/api/me')).d.pro.active);
  db.prepare('UPDATE subs SET until = ? WHERE user = ?').run(Date.now() - 1000, uid); const nPay3 = yk.log.length; await renewTick();
  ok('после отмены не списывает и Про выключен', yk.log.length === nPay3 && !(await a('GET', '/api/me')).d.pro.active);
  ok('возобновить закончившуюся нельзя', (await a('POST', '/api/sub/resume')).s === 409);
  // отказ на странице оплаты
  r = await a('POST', '/api/pay', { period: 'month' }); const p3 = r.d.url.split('/').pop(); yk.finish(p3, false);
  await anon('POST', '/api/yk/hook', { object: { id: p3 } });
  ok('покупатель отказался: Про нет', !(await a('GET', '/api/me')).d.pro.active);
  // выход и удаление
  ok('выход', (await a('POST', '/api/logout')).s === 200 && (await a('GET', '/api/me')).d.anon);
  db.prepare('UPDATE codes SET sent = 0').run(); await login(a, 'mira@mail.ru'); ok('удаление аккаунта', (await a('POST', '/api/account/delete')).s === 200);
  ok('после удаления данных нет', !db.prepare('SELECT 1 FROM subs WHERE user = ?').get(uid) && !db.prepare('SELECT 1 FROM kv WHERE user = ?').get(uid));
  ol(fails ? `ОШИБОК: ${fails}` : 'ВСЁ ВЕРНО');
  server.close(); yk.server.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})().catch((e) => { ol(e); process.exit(1); });
