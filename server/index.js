// CITY CHAOS - Node.js server: serves the website AND runs the WebSocket multiplayer.
// One process, one port, so it deploys to a single web service (Render, Railway, Fly.io...).
import express from 'express';
import { bugsPage } from './bugs.js';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Room, now } from './room.js';
import { Parties } from './party.js';
import { Leaderboard } from './leaderboard.js';
import { loadProfile } from './profiles.js';
import { tokenPid } from '../public/shared/profile.js';
import { CODE_CHARS, MAX_PLAYERS, SNAPSHOT_RATE } from '../public/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  // allow the page to be used for WebXR + mic (voice chat)
  res.setHeader('Permissions-Policy', 'xr-spatial-tracking=(self), microphone=(self)');
  // the website may be hosted elsewhere (e.g. Netlify) and call this server's API
  if (req.path.startsWith('/api/') || req.path === '/health') res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
// no-cache = the browser always checks for the newest version (cheap thanks to ETags), so updating
// the game never leaves a headset running a mix of old and new files
app.use(express.static(path.join(ROOT, 'public'), { etag: true, lastModified: true, setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); } }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

const state = {
  rooms: new Map(),     // code -> Room
  tokens: new Map(),    // reconnect token -> { code, id }
  board: new Leaderboard({ persist: process.env.CC_TEST !== '1' }),   // 🏆 leaderboards
};
app.get('/bugs', bugsPage);   // bug reports (needs ADMIN_KEY)
app.get('/api/leaderboard', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); const pid = String(req.query.pid || ''); res.json({ ...state.board.top(), me: pid ? state.board.rankOf(pid) : null }); });
app.get('/health', (req, res) => res.json({ ok: true, rooms: state.rooms.size, uptime: Math.round(process.uptime()) }));
// Optional: set ICE_SERVERS env var (JSON array) to add a TURN server for voice chat on strict networks
app.get('/api/ice', (req, res) => {
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  try { if (process.env.ICE_SERVERS) iceServers = JSON.parse(process.env.ICE_SERVERS); } catch {}
  res.json({ iceServers });
});
app.get('/api/room/:code', (req, res) => {
  const r = state.rooms.get(String(req.params.code).toUpperCase());
  if (!r) return res.status(404).json({ ok: false });
  res.json({ ok: true, mode: r.mode, players: r.connectedCount, max: MAX_PLAYERS });
});

const parties = new Parties(state);   // groups of friends who follow the leader between rooms
const clients = new Set();
let nextId = 1;
function makeCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!state.rooms.has(c)) return c;
  }
  throw new Error('no codes left');
}
function createRoom(opts) {
  const code = makeCode();
  const room = new Room(code, opts, state);
  state.rooms.set(code, room);
  console.log(`[room] created ${code} mode=${room.mode} public=${room.isPublic}`);
  return room;
}

wss.on('connection', (ws, req) => {
  const client = {
    id: nextId++, token: null, room: null, ws, info: { name: 'Player', cos: {} }, alive: true, msgCount: 0,
    send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    sendRaw(data) { if (ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(data); }
  };
  clients.add(client);
  ws.on('pong', () => { client.alive = true; });

  ws.on('message', (raw) => {
    client.alive = true; // any message proves the connection works (don't rely only on ws pings through tunnels)
    client.msgCount++;
    if (client.msgCount > 400) return; // flood protection (per second, reset below)
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'ping') return client.send({ type: 'pong', t: msg.t, st: now() });
    // clientError goes to the room (server/bugs.js logs it with the player's name, position and game version)

    if (msg.type === 'hello') {
      client.info = { name: msg.name, cos: msg.cos };
      // reconnect?
      const tk = typeof msg.token === 'string' ? state.tokens.get(msg.token) : null;
      if (tk) {
        const room = state.rooms.get(tk.code);
        const p = room && room.players.get(tk.id);
        if (p) {
          if (p.connected && p.client && p.client !== client) { try { p.client.ws.close(4000, 'replaced'); } catch {} p.client.room = null; }
          client.token = msg.token; client.id = p.id;
          room.reattach(p, client);
          console.log(`[room] ${room.code} player ${p.id} reconnected`);
          return;
        }
      }
      client.token = crypto.randomBytes(16).toString('hex');
      return client.send({ type: 'welcome', id: client.id, token: client.token });
    }

    if (!client.token) return; // must say hello first
    if (msg.type === 'lbSubmit') { const r = loadProfile(msg.token); if (r.loaded && tokenPid(msg.token)) state.board.update(r.prof, String(msg.name || '').replace(/[<>]/g, '').slice(0, 16) || 'Player'); return; }
    if (msg.type.startsWith('party')) { if (msg.type === 'partyCreate' || msg.type === 'partyJoin') { if (msg.name) client.info.name = String(msg.name); } return parties.handle(client, msg); }

    if (msg.type === 'create' || msg.type === 'join' || msg.type === 'quick') {
      let room;
      if (msg.type === 'create') room = createRoom({ mode: msg.mode, isPublic: false, killLimit: msg.killLimit, timeLimit: msg.timeLimit, crimes: msg.crimes });
      else if (msg.type === 'join') {
        room = state.rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!room) return client.send({ type: 'error', code: 'NO_ROOM', message: 'Room not found. Check the code and try again.' });
        if (room.connectedCount >= MAX_PLAYERS) return client.send({ type: 'error', code: 'FULL', message: 'That room is full (8 players).' });
      } else {
        room = [...state.rooms.values()].filter(r => r.isPublic && r.connectedCount < MAX_PLAYERS && r.match.state === 'playing')
          .sort((a, b) => b.connectedCount - a.connectedCount)[0] || createRoom({ mode: msg.mode === 'tdm' ? 'tdm' : 'ffa', isPublic: true });
      }
      if (client.room) leave(client);
      if (msg.name) client.info.name = msg.name;
      if (msg.cos) client.info.cos = msg.cos;
      if (msg.role) client.info.role = msg.role === 'cop' ? 'cop' : 'civilian';
      client.info.profile = typeof msg.profile === 'string' ? msg.profile : null;   // signed save token (saved cash + stats)
      const p = room.addPlayer(client, client.info);
      state.tokens.set(client.token, { code: room.code, id: p.id });
      console.log(`[room] ${room.code} +player ${p.id} (${p.name}) now ${room.connectedCount}`);
      parties.entered(client, room);
      return;
    }
    if (msg.type === 'leave') return leave(client, true);

    const room = client.room;
    if (!room) return;
    const p = room.players.get(client.id);
    if (!p || p.client !== client) return;
    try { room.handle(p, msg); } catch (e) { console.error(`[error] handling ${msg.type}:`, e); }
  });

  ws.on('close', () => {
    clients.delete(client);
    parties.closed(client);
    const room = client.room;
    if (!room) return;
    const p = room.players.get(client.id);
    if (p && p.client === client) {
      room.dropConnection(p);
      console.log(`[room] ${room.code} player ${p.id} disconnected (grace period)`);
    }
  });
});

function leave(client, explicit = false) {
  const room = client.room;
  if (!room) return;
  room.removePlayer(client.id);
  client.room = null;
  parties.left(client);
  if (explicit) client.send({ type: 'left' });
  // issue a fresh token so an old one can't rejoin the slot
  client.token = crypto.randomBytes(16).toString('hex');
  client.send({ type: 'welcome', id: client.id, token: client.token });
}

// ------------------------------------------------------------------ loops
const TICK = 1 / 30;
let last = now();
setInterval(() => {
  const t = now();
  const dt = Math.min(0.1, t - last); last = t;
  for (const [code, room] of state.rooms) {
    try { room.tick(dt); } catch (e) { console.error(`[error] room ${code} tick:`, e); }
    if (room.size === 0) { state.rooms.delete(code); console.log(`[room] closed ${code}`); }
  }
}, TICK * 1000);

setInterval(() => { for (const room of state.rooms.values()) { try { room.snapshot(); } catch (e) { console.error('[error] snapshot:', e); } } }, 1000 / SNAPSHOT_RATE);
// last line of defense: log unexpected errors instead of letting the whole server stop
process.on('uncaughtException', (e) => console.error('[error] uncaught:', e));
process.on('SIGTERM', () => { try { state.board.flush(); } catch {} process.exit(0); });
process.on('unhandledRejection', (e) => console.error('[error] unhandled rejection:', e));

// heartbeat (drops dead sockets so reconnect grace starts) + flood counter reset
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { try { c.ws.terminate(); } catch {} continue; }
    c.alive = false; try { c.ws.ping(); } catch {}
  }
}, 10000);
setInterval(() => { for (const c of clients) c.msgCount = 0; parties.tick(); }, 1000);

server.listen(PORT, () => console.log(`CITY CHAOS server running on http://localhost:${PORT}`));
