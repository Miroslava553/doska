// Связь через наш сервер: запасной путь, когда прямое соединение между репетитором и учеником не получается
// (мобильный интернет, школьный или рабочий Wi-Fi). Сервер только пересылает куски между участниками одной доски.
// Содержимое зашифровано в браузере ключом из ссылки на доску, а ссылка на сервер не попадает, поэтому сервер его не видит.
'use strict';
const { WebSocketServer } = require('ws');

const MAX_PEOPLE = 12;      // участников одной доски
const MAX_ROOMS = 5000;     // досок одновременно
const MAX_MSG = 256 * 1024; // один кусок (доска шлёт кусками по 15 КБ)
const STUCK = 8 * 1024 * 1024; // у получателя скопилось столько непрочитанного — не добавляем, а ждём, пока он догонит

function attach(server, log = () => {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG, perMessageDeflate: false });
  const rooms = new Map();
  let seq = 0;
  const refuse = (sock, code, text) => { try { sock.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); } catch {} sock.destroy(); };
  server.on('upgrade', (req, sock, head) => {
    let u; try { u = new URL(req.url, 'http://x'); } catch { return refuse(sock, 400, 'Bad Request'); }
    if (u.pathname !== '/api/relay') return refuse(sock, 404, 'Not Found');
    const room = u.searchParams.get('room') || '';
    if (!/^[0-9a-f]{32}$/.test(room)) return refuse(sock, 400, 'Bad Request');
    const r = rooms.get(room);
    if ((r && r.size >= MAX_PEOPLE) || (!r && rooms.size >= MAX_ROOMS)) return refuse(sock, 503, 'Busy');
    wss.handleUpgrade(req, sock, head, (ws) => join(ws, room));
  });
  function join(ws, room) {
    let r = rooms.get(room);
    if (!r) rooms.set(room, (r = new Map()));
    seq = (seq % 0xfffffffe) + 1;
    const id = seq;
    ws.alive = true;
    const say = (o, m) => { if (o.readyState === 1) try { o.send(JSON.stringify(m)); } catch {} };
    say(ws, { t: 'hi', id, peers: [...r.keys()] });
    for (const o of r.values()) say(o, { t: 'join', id });
    r.set(id, ws);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, isBinary) => {
      ws.alive = true;
      if (!isBinary || !Buffer.isBuffer(data) || data.length < 5) return;
      const dst = r.get(data.readUInt32BE(0));
      if (!dst || dst === ws || dst.readyState !== 1 || dst.bufferedAmount > STUCK) return;
      const out = Buffer.from(data); out.writeUInt32BE(id, 0); // получатель видит, от кого
      dst.send(out, { binary: true });
    });
    ws.on('close', () => {
      r.delete(id);
      if (!r.size) rooms.delete(room);
      else for (const o of r.values()) say(o, { t: 'leave', id });
    });
    ws.on('error', () => {});
  }
  // молчит больше минуты (уснул ноутбук, пропал интернет) — закрываем, чтобы не держать «призраков»
  const timer = setInterval(() => {
    for (const r of rooms.values()) for (const ws of r.values()) {
      if (!ws.alive) { try { ws.terminate(); } catch {} continue; }
      ws.alive = false; try { ws.ping(); } catch {}
    }
  }, 30000);
  timer.unref?.();
  log && log(`связь через сервер включена`);
  return { rooms, wss, close: () => { clearInterval(timer); wss.close(); } };
}

module.exports = { attach };
