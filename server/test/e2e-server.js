// Сервер для проверок в браузере: поддельная ЮKassa + Lodl с файлами сайта. Управление: /__test/finish?id=&ok=1
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lodl-e2e-'));
Object.assign(process.env, { DATA_DIR: dir, SITE_URL: 'http://127.0.0.1:4021', SHOP_ID: 'shop1', SECRET_KEY: 'key1', YK_API: 'http://127.0.0.1:4020', AUTOPAY: process.env.AUTOPAY || '1', STATIC_DIR: path.join(__dirname, '../../dist/lodl'), OLD_ORIGIN: 'http://localhost:4031', FEEDBACK_TO: 'owner@lodl.test' });
const yk = require('./mockyk.js');
const mails = []; const ol = console.log; console.log = (...a) => { const s = a.join(' '); if (s.includes('[письмо')) { mails.push(s); ol(s); } else ol(...a); };
const { server, renewTick, db } = require('../index.js');
yk.server.listen(4020);
server.listen(4021, '127.0.0.1');
// управление для тестов
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const out = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname === '/code') { const e = u.searchParams.get('email'); const m = [...mails].reverse().find((x) => x.includes(e) && x.includes('Код для входа')); return out({ code: m && m.match(/(\d{6})/)[1] }); }
    if (u.pathname === '/last') { const ps = [...yk.pays.values()]; return out(ps.at(-1) || null); }
    if (u.pathname === '/finish') { yk.finish(u.searchParams.get('id'), u.searchParams.get('ok') === '1', u.searchParams.get('type') || 'bank_card'); return out({ ok: true }); }
    if (u.pathname === '/sql') { return out(db.prepare(u.searchParams.get('q')).all()); }
    if (u.pathname === '/run') { db.prepare(u.searchParams.get('q')).run(); return out({ ok: true }); }
    if (u.pathname === '/tick') { renewTick().then(() => out({ ok: true })); return; }
    if (u.pathname === '/mails') return out(mails);
    if (u.pathname === '/next') { yk.setNext(u.searchParams.get('s')); return out({ ok: true }); }
  } catch (e) { return out({ error: String(e) }); }
  out({});
}).listen(4022);
ol('e2e ready');
