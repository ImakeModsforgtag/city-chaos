// Chaos test: many bots doing everything at once for ~90s; watch the server for errors.
import WebSocket from 'ws';
import { buildMap } from '../public/shared/map.js';
const map = buildMap();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const URL = 'ws://localhost:3000/ws';
let code = null; const bots = [];
function bot(i) {
  return new Promise(res => {
    const ws = new WebSocket(URL); const b = { ws, i, life: 0, pos: null, npcs: [], alive: true, w: 'pistol', inv: null };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', name: 'Chaos' + i })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type === 'welcome' && !b.joined) { b.joined = true; ws.send(JSON.stringify(code ? { type: 'join', code } : { type: 'create', mode: 'ffa' })); }
      if (m.type === 'joined') { code = m.code; b.id = m.you; b.life = m.life; b.pos = [m.spawn.p[0], 1.6, m.spawn.p[2]]; b.inv = m.inv; res(b); }
      if (m.type === 'respawn' && m.id === b.id) { b.life = m.life; b.pos = [m.p[0], 1.6, m.p[2]]; }
      if (m.type === 'npcs') b.npcs = m.n;
      if (m.type === 'inv') b.inv = m;
      if (m.type === 'snap') b.lastSnap = Date.now();
    });
    ws.on('error', () => {});
  });
}
const send = (b, m) => { if (b.ws.readyState === 1) b.ws.send(JSON.stringify(m)); };
(async () => {
  for (let i = 0; i < 6; i++) { bots.push(await bot(i)); }
  console.log('room', code, 'bots', bots.length);
  const t0 = Date.now(); let tick = 0;
  while (Date.now() - t0 < 90000) {
    tick++;
    for (const b of bots) {
      // wander toward a random NPC or pickup
      const tgt = (tick + b.i) % 3 === 0 && b.npcs.length ? b.npcs[(b.i * 7 + tick) % b.npcs.length] : null;
      const goal = tgt ? [tgt[2], 1.6, tgt[4] + 3] : map.pickups[(b.i * 11 + Math.floor(tick / 40)) % map.pickups.length].p;
      const dx = goal[0] - b.pos[0], dz = goal[2] - b.pos[2], d = Math.hypot(dx, dz) || 1, st = Math.min(1.5, d);
      b.pos[0] += dx / d * st; b.pos[2] += dz / d * st; b.pos[1] = goal[1] + 0.3;
      send(b, { type: 'state', life: b.life, h: [...b.pos, 0, 0, 0, 1], l: [...b.pos, 0, 0, 0, 1], r: [...b.pos, 0, 0, 0, 1], vr: b.i % 2 === 0 });
      const r = Math.random();
      const w = b.inv && b.inv.slots[b.inv.cur] ? b.inv.slots[b.inv.cur].w : 'pistol';
      if (r < 0.3) { const a = Math.random() * 6.28, dir = [Math.cos(a), (Math.random() - 0.6) * 0.5, Math.sin(a)]; const l = Math.hypot(...dir);
        send(b, { type: 'shoot', w, o: b.pos, d: Array(w === 'shotgun' ? 8 : 1).fill(dir.map(v => v / l)), ct: Math.random() < 0.5 ? undefined : 123 }); }
      else if (r < 0.4) send(b, { type: 'reload' });
      else if (r < 0.5) map.pickups.forEach(p => { if (Math.hypot(p.p[0] - b.pos[0], p.p[2] - b.pos[2]) < 3) send(b, { type: 'pickup', id: p.id }); });
      else if (r < 0.6 && b.npcs.length) { const s = b.npcs.find(n => n[1] === 1); if (s) send(b, { type: 'rob', id: s[0] }); }
      else if (r < 0.65) send(b, { type: 'switch', slot: Math.floor(Math.random() * 3) });
      else if (r < 0.67) send(b, { type: 'cosmetics', cos: { color: '#00ff00', hat: Math.floor(Math.random() * 7) } });
      else if (r < 0.672) send(b, { type: 'settings', mode: Math.random() < 0.5 ? 'tdm' : 'ffa' });
      else if (r < 0.674) send(b, { type: 'switchTeam' });
      else if (r < 0.676) { b.ws.terminate(); } // random disconnects
      else if (r < 0.68) send(b, { type: 'shoot', w: 'rocket', o: b.pos, d: [[1, -0.3, 0]] });
      else if (r < 0.69) send(b, { type: ['state', 'shoot', 'rob', 'pickup', 'rtc'][Math.floor(Math.random() * 5)], junk: true, id: 'x', h: 'bad' }); // malformed
    }
    // replace dead sockets
    for (let k = 0; k < bots.length; k++) if (bots[k].ws.readyState > 1) bots[k] = await bot(k);
    await sleep(50);
  }
  const stale = bots.filter(b => Date.now() - (b.lastSnap || 0) > 2000).length;
  console.log('done. bots still receiving snapshots:', bots.length - stale, '/', bots.length);
  process.exit(0);
})();
