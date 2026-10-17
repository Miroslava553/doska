// Синхронизация: Yjs-документ + «эфемерные» сообщения (курсоры, рисуемые штрихи, лазер)
// по любым двусторонним каналам: PeerJS (авто), ручной WebRTC (обмен кодами), BroadcastChannel (вкладки).
import * as Y from 'yjs';
import { Peer } from 'peerjs';

const T_SV = 1, T_UPDATE = 2, T_CHUNK = 3;
const CHUNK = 15000;

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Бесплатный TURN от PeerJS: выручает, когда прямое соединение невозможно.
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

function concat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a, 0); r.set(b, a.length); return r; }

// Link — один собеседник. pipe: { send(data), close(), onmessage(data), onclose() }
class Link {
  constructor(hub, pipe, kind) {
    this.hub = hub; this.pipe = pipe; this.kind = kind; this.alive = true;
    this.chunks = new Map();
    this.remote = null; // hello собеседника
    this.lastRx = Date.now(); this.pings = false; this.remoteHidden = false; // проверка «жив ли канал»
    pipe.onmessage = (d) => { this.lastRx = Date.now(); this.receive(d); };
    pipe.onclose = () => this.closed();
  }
  start() {
    this.sendBin(T_SV, Y.encodeStateVector(this.hub.doc));
    this.sendJSON(this.hub.helloMsg());
  }
  sendBin(type, payload) {
    if (!this.alive) return;
    const msg = concat(Uint8Array.of(type), payload);
    try {
      if (msg.length <= CHUNK) { this.pipe.send(msg); return; }
      const id = (Math.random() * 0xffffffff) >>> 0;
      const total = Math.ceil(msg.length / CHUNK);
      for (let i = 0; i < total; i++) {
        const head = new Uint8Array(9);
        const dv = new DataView(head.buffer);
        head[0] = T_CHUNK; dv.setUint32(1, id); dv.setUint16(5, i); dv.setUint16(7, total);
        this.pipe.send(concat(head, msg.subarray(i * CHUNK, (i + 1) * CHUNK)));
      }
    } catch (e) { console.warn('send failed', e); }
  }
  sendJSON(o) { if (this.alive) try { this.pipe.send(JSON.stringify(o)); } catch (e) { console.warn(e); } }
  receive(d) {
    if (typeof d === 'string') {
      let o; try { o = JSON.parse(d); } catch { return; }
      if (o.t === 'ping') { this.pings = true; this.remoteHidden = !!o.hid; return; }
      if (o.t === 'hello') { this.remote = o; this.hub.emitStatus(); }
      else if (!this.hub.isPrimary(this)) return;
      this.hub.onEphemeral(o, this);
      return;
    }
    const u8 = d instanceof Uint8Array ? d : new Uint8Array(d);
    const type = u8[0];
    if (type === T_CHUNK) {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const id = dv.getUint32(1), i = dv.getUint16(5), total = dv.getUint16(7);
      let c = this.chunks.get(id);
      if (!c) { c = { parts: new Array(total), got: 0 }; this.chunks.set(id, c); }
      if (!c.parts[i]) { c.parts[i] = u8.slice(9); c.got++; }
      if (c.got === total) {
        this.chunks.delete(id);
        const len = c.parts.reduce((s, p) => s + p.length, 0);
        const all = new Uint8Array(len); let o = 0;
        for (const p of c.parts) { all.set(p, o); o += p.length; }
        this.receive(all);
      }
      return;
    }
    const payload = u8.subarray(1);
    if (type === T_SV) {
      this.sendBin(T_UPDATE, Y.encodeStateAsUpdate(this.hub.doc, payload));
    } else if (type === T_UPDATE) {
      Y.applyUpdate(this.hub.doc, payload, this);
    }
  }
  closed() {
    if (!this.alive) return;
    this.alive = false;
    this.hub.links.delete(this);
    if (this.remote && !this.hub.aliveFor(this.remote.id)) this.hub.onEphemeral({ t: 'bye', id: this.remote.id }, this);
    this.hub.emitStatus();
    this.onclose?.();
  }
  close() { try { this.pipe.close(); } catch {} this.closed(); }
}

export class Hub {
  constructor(doc, me) {
    this.doc = doc; this.me = me; this.links = new Set();
    this.listeners = { ephemeral: [], status: [] };
    this.peerState = 'off'; this.peerError = '';
    doc.on('update', (u, origin) => {
      for (const l of this.links) if (l !== origin) l.sendBin(T_UPDATE, u);
    });
    // Связь «подвисла» (пропал Wi-Fi, уснул ноутбук): канал вроде открыт, но ничего не доходит.
    // Каждые 2 с шлём «я тут»; молчит дольше 6 с — закрываем канал и сразу переподключаемся.
    // У собеседника со старой версией (не шлёт «я тут») ничего не закрываем. Вкладка в фоне шлёт реже — ей даём 90 с.
    setInterval(() => {
      const hid = typeof document !== 'undefined' && document.hidden;
      for (const l of [...this.links]) {
        if (!l.alive || l.kind === 'tab') continue;
        l.sendJSON({ t: 'ping', hid });
        if (l.pings && Date.now() - l.lastRx > (l.remoteHidden ? 90000 : 6000)) { console.warn('link silent, reconnecting', l.kind); l.close(); }
      }
    }, 2000);
    if (typeof window !== 'undefined') {
      const wake = () => this.wake();
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    }
  }
  // Интернет вернулся или вкладку снова открыли: если прямой связи нет — пробуем сразу, не ждём таймера
  wake() {
    if (!this.room || this.stopped) return;
    if ([...this.links].some((l) => l.alive && l.kind === 'peer')) return;
    clearTimeout(this.retryTimer); this.tryHost();
  }
  on(ev, f) { this.listeners[ev].push(f); }
  onEphemeral(o, link) { for (const f of this.listeners.ephemeral) f(o, link); }
  emitStatus() { for (const f of this.listeners.status) f(this.status()); }
  helloMsg() { return { t: 'hello', id: this.me.id, name: this.me.name, color: this.me.color }; }
  isPrimary(link) {
    if (link.kind === 'tab' || !link.remote) return true;
    for (const l of this.links) if (l.alive && l.kind !== 'tab' && l.remote && l.remote.id === link.remote.id) return l === link;
    return true;
  }
  aliveFor(id) { for (const l of this.links) if (l.alive && l.remote && l.remote.id === id && l.kind !== 'tab') return l; return null; }
  status() {
    const seen = new Map();
    for (const l of this.links) if (l.kind !== 'tab' && l.remote && l.alive) { const r = seen.get(l.remote.id) || { ...l.remote, via: [] }; r.via.push(l.kind); seen.set(l.remote.id, r); }
    const tabs = [...this.links].filter((l) => l.kind === 'tab').length;
    let nostrOpen = 0, nostrTotal = 0;
    try { const socks = this.getRelaySockets ? this.getRelaySockets() : {}; for (const ws of Object.values(socks)) { nostrTotal++; if (ws && ws.readyState === 1) nostrOpen++; } } catch {}
    return { peers: [...seen.values()], tabs, peerState: this.peerState, peerError: this.peerError, nostrOpen, nostrTotal, startedAt: this.startedAt || 0, online: !!this.startedAt };
  }
  broadcast(o) { const s = JSON.stringify(o); for (const l of this.links) if (l.alive) try { l.pipe.send(s); } catch {} }
  addPipe(pipe, kind) {
    const l = new Link(this, pipe, kind);
    this.links.add(l); l.start(); this.emitStatus();
    return l;
  }

  // --- Вкладки одного браузера ---
  startTabs(room) {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('doska-' + room);
    const pipe = { send: (d) => bc.postMessage(d), close: () => bc.close(), onmessage: null, onclose: null };
    bc.onmessage = (e) => pipe.onmessage?.(e.data);
    this.addPipe(pipe, 'tab');
  }

  // --- Авто: сервер-«знакомство» PeerJS. Кто первый занял id комнаты — ждёт, второй подключается.
  startPeer(room) {
    this.room = room; this.stopped = false; this.startedAt = Date.now();
    this.tryHost();
    this.startNostr(room);
    setInterval(() => this.emitStatus(), 3000);
  }
  // Запасной путь знакомства: открытые Nostr-реле (их десятки по миру, блокировка одного не страшна)
  async startNostr(room) {
    try {
      const { joinRoom, getRelaySockets } = await import('trystero');
      this.getRelaySockets = getRelaySockets;
      const tr = joinRoom({ appId: 'doska-tutor-board-v1', password: 'doska:' + room, rtcConfig: { iceServers: ICE_SERVERS }, relayConfig: { redundancy: 8, warnOnRelayFailure: false } }, 'r-' + room);
      this.tr = tr;
      const act = tr.makeAction('d');
      const pipes = new Map(), links = new Map();
      const join = (pid) => {
        const pipe = { send: (d) => { act.send(d, { target: pid }).catch(() => {}); }, close: () => {}, onmessage: null, onclose: null };
        pipes.set(pid, pipe); links.set(pid, this.addPipe(pipe, 'nostr'));
      };
      tr.onPeerJoin = join;
      tr.onPeerLeave = (pid) => { const pp = pipes.get(pid); pipes.delete(pid); links.delete(pid); pp?.onclose?.(); };
      act.onMessage = (data, ctx) => {
        const l = links.get(ctx.peerId);
        if (!l || !l.alive) join(ctx.peerId); // канал закрыли из-за тишины, а собеседник снова на связи
        pipes.get(ctx.peerId)?.onmessage?.(data);
      };
    } catch (e) { console.warn('nostr signalling failed', e); }
  }
  stopPeer() { this.stopped = true; this.peer?.destroy(); this.peer = null; this.setPeer('off'); }
  setPeer(s, err = '') { this.peerState = s; this.peerError = err; this.emitStatus(); }
  hostId() { return 'doska-' + this.room.toLowerCase(); }
  peerOpts() { return { config: { iceServers: ICE_SERVERS }, debug: 1 }; }
  retry(ms) {
    clearTimeout(this.retryTimer);
    if (this.stopped) return;
    this.retryTimer = setTimeout(() => this.tryHost(), ms + Math.random() * 1000);
  }
  wrapConn(conn) {
    const pipe = { send: (d) => conn.send(d), close: () => conn.close(), onmessage: null, onclose: null };
    conn.on('data', (d) => pipe.onmessage?.(d));
    conn.on('close', () => pipe.onclose?.());
    conn.on('error', () => pipe.onclose?.());
    // если ICE оборвался, PeerJS может не прислать close — следим сами
    const pc = conn.peerConnection;
    let dcT = 0;
    if (pc) pc.addEventListener('iceconnectionstatechange', () => {
      clearTimeout(dcT);
      if (['failed', 'closed'].includes(pc.iceConnectionState)) pipe.onclose?.();
      else if (pc.iceConnectionState === 'disconnected') dcT = setTimeout(() => { if (pc.iceConnectionState === 'disconnected') { try { conn.close(); } catch {} pipe.onclose?.(); } }, 4000);
    });
    if (conn.dataChannel) conn.dataChannel.binaryType = 'arraybuffer';
    return pipe;
  }
  tryHost() {
    if (this.stopped) return;
    this.peer?.destroy();
    this.setPeer('connecting');
    const peer = new Peer(this.hostId(), this.peerOpts());
    this.peer = peer;
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      if (this.peer === peer && this.peerState === 'connecting') { this.setPeer('error', 'Сервер PeerJS не отвечает'); this.retry(15000); }
    }, 12000);
    peer.on('open', () => { clearTimeout(this.openTimer); if (this.peer === peer) this.setPeer('waiting'); });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const link = this.addPipe(this.wrapConn(conn), 'peer');
        link.onclose = () => { if (this.peer === peer) this.setPeer('waiting'); };
        this.setPeer('connected');
      });
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id') { peer.destroy(); this.tryGuest(); return; }
      this.onPeerError(err);
    });
    peer.on('disconnected', () => { if (this.peer === peer && !this.stopped) try { peer.reconnect(); } catch {} });
  }
  tryGuest() {
    if (this.stopped) return;
    if (this.peer && !this.peer.destroyed) try { this.peer.destroy(); } catch {}
    const peer = new Peer(this.peerOpts());
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(this.hostId(), { reliable: true, serialization: 'raw' });
      const t = setTimeout(() => { if (!conn.open) { conn.close(); this.retry(2000); } }, 15000);
      conn.on('open', () => {
        clearTimeout(t);
        const link = this.addPipe(this.wrapConn(conn), 'peer');
        this.setPeer('connected');
        link.onclose = () => { if (this.peer === peer) { this.setPeer('connecting'); this.retry(800); } };
      });
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'peer-unavailable') { this.retry(300); return; } // хозяин ушёл — займём его место
      this.onPeerError(err);
    });
  }
  onPeerError(err) {
    console.warn('peer error', err.type, err);
    // уже соединены напрямую — сервер знакомства больше не нужен, связь не рвём
    if ([...this.links].some((l) => l.kind === 'peer' && l.alive)) return;
    const map = {
      network: 'Нет связи с сервером знакомства',
      'server-error': 'Сервер знакомства недоступен',
      'socket-error': 'Сервер знакомства недоступен',
      'socket-closed': 'Сервер знакомства отключился',
      'browser-incompatible': 'Браузер не поддерживает WebRTC',
      webrtc: 'Не удалось установить прямое соединение',
    };
    this.setPeer('error', map[err.type] || ('Ошибка: ' + err.type));
    this.retry(5000);
  }
}

// --- Ручное подключение без серверов: обмен двумя кодами ---
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let data = bytes;
  if (typeof CompressionStream !== 'undefined') {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    data = new Uint8Array(await new Response(cs).arrayBuffer());
  }
  let s = ''; for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(code) {
  const b64 = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const data = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let bytes = data;
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function waitIce(pc) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 5000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function chanPipe(pc, ch) {
  ch.binaryType = 'arraybuffer';
  const pipe = { send: (d) => ch.send(d), close: () => { ch.close(); pc.close(); }, onmessage: null, onclose: null };
  ch.onmessage = (e) => pipe.onmessage?.(e.data);
  ch.onclose = () => pipe.onclose?.();
  pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) pipe.onclose?.(); });
  return pipe;
}

export class ManualConnect {
  constructor(hub) { this.hub = hub; }
  // Шаг 1 (у того, кто начинает): создать код-приглашение
  async createOffer() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.ch = this.pc.createDataChannel('doska', { ordered: true });
    this.ch.onopen = () => this.hub.addPipe(chanPipe(this.pc, this.ch), 'manual');
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc);
    return 'A' + (await pack(this.pc.localDescription.toJSON()));
  }
  // Шаг 2 (у второго): вставить приглашение, получить ответный код
  async acceptOffer(code) {
    code = code.trim();
    if (code[0] !== 'A') throw new Error('Это не код-приглашение (он начинается с буквы A)');
    const offer = await unpack(code.slice(1));
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.ondatachannel = (e) => {
      const ch = e.channel;
      ch.onopen = () => this.hub.addPipe(chanPipe(this.pc, ch), 'manual');
    };
    await this.pc.setRemoteDescription(offer);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc);
    return 'B' + (await pack(this.pc.localDescription.toJSON()));
  }
  // Шаг 3 (у первого): вставить ответный код
  async acceptAnswer(code) {
    code = code.trim();
    if (code[0] !== 'B') throw new Error('Это не ответный код (он начинается с буквы B)');
    await this.pc.setRemoteDescription(await unpack(code.slice(1)));
  }
}
