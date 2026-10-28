// Поддельная ЮKassa для проверок: создаёт платежи, хранит их и даёт изменить статус.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const pays = new Map(), byIdem = new Map();
let nextRecurring = 'succeeded'; // чем закончится следующий автоплатёж
const log = [];
function make(body) {
  const id = crypto.randomUUID();
  const recurring = !!body.payment_method_id;
  const p = {
    id, status: recurring ? nextRecurring : 'pending', paid: recurring && nextRecurring === 'succeeded', amount: body.amount, description: body.description, metadata: body.metadata,
    created_at: new Date().toISOString(),
    confirmation: recurring ? undefined : { type: 'redirect', confirmation_url: 'https://yoomoney.example/pay/' + id, return_url: body.confirmation && body.confirmation.return_url },
    payment_method: recurring ? { id: body.payment_method_id, type: 'bank_card', saved: true, card: { last4: '4444', card_type: 'Mir' } } : undefined,
    _save: !!body.save_payment_method,
    cancellation_details: recurring && nextRecurring === 'canceled' ? { party: 'payment_network', reason: 'insufficient_funds' } : undefined,
  };
  pays.set(id, p); return p;
}
const pub = (p) => { const { _save, ...o } = p; return o; };
const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (auth !== 'Basic ' + Buffer.from('shop1:key1').toString('base64')) return out(401, { type: 'error', code: 'invalid_credentials' });
    if (req.method === 'POST' && req.url === '/payments') {
      const idem = req.headers['idempotence-key']; if (!idem) return out(400, { code: 'invalid_request' });
      if (byIdem.has(idem)) return out(200, pub(pays.get(byIdem.get(idem))));
      const body = JSON.parse(b); log.push(body); const p = make(body); byIdem.set(idem, p.id); return out(200, pub(p));
    }
    const m = /^\/payments\/([\w-]+)$/.exec(req.url);
    if (req.method === 'GET' && m) { const p = pays.get(m[1]); return p ? out(200, pub(p)) : out(404, { code: 'not_found' }); }
    out(404, {});
  });
});
// покупатель оплатил на странице ЮKassa (или отказался)
function finish(id, ok = true, type = 'bank_card') {
  const p = pays.get(id); if (!p) throw new Error('нет платежа ' + id);
  if (ok) { p.status = 'succeeded'; p.paid = true; p.payment_method = { id: 'pm-' + id.slice(0, 8), type, saved: p._save, ...(type === 'bank_card' ? { card: { last4: '1111', card_type: 'Mir' } } : { title: 'СБП' }) }; }
  else { p.status = 'canceled'; p.cancellation_details = { party: 'yoo_money', reason: 'expired_on_confirmation' }; }
}
module.exports = { server, pays, finish, log, setNext: (s) => { nextRecurring = s; } };
