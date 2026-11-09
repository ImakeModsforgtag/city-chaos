// Automated multiplayer test: real WebSocket clients against the real server.
// Run: node test/server-test.mjs   (server must be running on PORT or 3000)
import WebSocket from 'ws';

const URL = process.env.URL || 'ws://localhost:3000/ws';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.waiters = []; }
  connect(token) {
    return new Promise((res) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => { this.send({ type: 'hello', name: this.name, cos: { color: '#ff0000' }, token }); res(); });
      this.ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.type === 'welcome') this.token = m.token;
        if (m.type === 'joined') { this.joined = m; this.id = m.you; this.life = m.life; this.inv = m.inv; }
        if (m.type === 'inv') this.inv = m;
        if (m.type === 'respawn' && m.id === this.id) { this.life = m.life; this.spawnP = m.p; }
        this.msgs.push(m);
        this.waiters = this.waiters.filter(w => { if (w.f(m)) { w.res(m); return false; } return true; });
      });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(f, ms = 3000) {
    const found = this.msgs.find(f); if (found) { this.msgs = this.msgs.filter(x => x !== found); return Promise.resolve(found); }
    return new Promise((res, rej) => { const w = { f, res }; this.waiters.push(w); setTimeout(() => { rej(new Error('timeout waiting')); }, ms); });
  }
  clear() { this.msgs = []; }
  pose(x, y, z) {
    this.send({ type: 'state', life: this.life, h: [x, y, z, 0, 0, 0, 1], l: [x - 0.3, y - 0.5, z, 0, 0, 0, 1], r: [x + 0.3, y - 0.5, z, 0, 0, 0, 1], vr: false });
  }
}

async function walk(bot, from, to) {
  const cur = [...from];
  for (;;) {
    const dx = to[0] - cur[0], dy = to[1] - cur[1], dz = to[2] - cur[2], dd = Math.hypot(dx, dy, dz);
    if (dd < 0.01) break;
    const st = Math.min(1.2, dd); cur[0] += dx / dd * st; cur[1] += dy / dd * st; cur[2] += dz / dd * st;
    bot.pose(...cur); await sleep(55);
  }
  bot.pose(...to); await sleep(80);
}

(async () => {
  console.log('CITY CHAOS server test 2 (rockets + match flow)');
  const map = (await import('../public/shared/map.js')).buildMap();
  const A = new Bot('Rocketeer'), B = new Bot('Target');
  await A.connect(); await B.connect();
  await A.wait(m => m.type === 'welcome'); await B.wait(m => m.type === 'welcome');
  A.send({ type: 'create', mode: 'ffa', killLimit: 5, timeLimit: 600, crimes: false });
  const ja = await A.wait(m => m.type === 'joined');
  ok(ja.killLimit === 5, 'custom kill limit applied (5)');
  B.send({ type: 'join', code: ja.code });
  const jb = await B.wait(m => m.type === 'joined');
  const sp = (j) => [j.spawn.p[0], j.spawn.p[1] + 1.45, j.spawn.p[2]];
  // A goes to the rocket crate
  const rk = map.pickups.find(p => p.weapon === 'rocket');
  const rpos = [rk.p[0], rk.p[1] + 0.3, rk.p[2]];
  await Promise.all([walk(A, sp(ja), rpos), walk(B, sp(jb), [rk.p[0] + 8, 1.6, -40])]);
  A.send({ type: 'pickup', id: rk.id });
  const inv = await A.wait(m => m.type === 'inv' && m.slots.some(s => s.w === 'rocket'));
  ok(inv.slots[inv.cur].w === 'rocket' && inv.slots[inv.cur].mag === 1, 'picked up rocket launcher from the rare crate');
  // both into the open street, 10m apart
  await Promise.all([walk(A, rpos, [-20, 1.6, -56]), walk(B, [rk.p[0] + 8, 1.6, -40], [-10, 1.6, -56])]);
  await sleep(1700); A.clear(); B.clear();
  // aim at B's feet
  const d = [10, -1.5, 0]; const l = Math.hypot(...d);
  A.send({ type: 'shoot', w: 'rocket', o: [-19.6, 1.6, -56], d: [d.map(v => v / l)] });
  const rm = await B.wait(m => m.type === 'rocket');
  ok(rm.owner === A.id, 'rocket projectile broadcast to other players');
  const ex = await B.wait(m => m.type === 'explode', 2000);
  ok(Math.abs(ex.p[0] + 10) < 1.5, 'rocket explodes on impact near the target (' + ex.p.map(v => v.toFixed(1)) + ')');
  const dm = await B.wait(m => m.type === 'dmg' && m.id === B.id);
  ok(dm.amt > 40 && dm.amt < 110, 'splash damage with falloff (' + dm.amt + ')');
  // B respawns or survives; now kill B 5 times with headshots (pistol) to end the match
  A.send({ type: 'switch', slot: 0 });
  await A.wait(m => m.type === 'inv' && m.cur === 0);
  let bLife = B.life, bPos = [-10, 1.6, -56];
  let kills = 0;
  for (let round = 0; round < 8 && kills < 5; round++) {
    // make sure B is alive and standing 6m in front of A
    if (dm.hp <= 0 && round === 0) { const r = await B.wait(m => m.type === 'respawn' && m.id === B.id, 7000); bPos = [r.p[0], r.p[1] + 1.45, r.p[2]]; await walk(B, bPos, [-14, 1.6, -56]); bPos = [-14, 1.6, -56]; await sleep(1600); }
    else if (round > 0) { const r = await B.wait(m => m.type === 'respawn' && m.id === B.id, 7000); bPos = [r.p[0], r.p[1] + 1.45, r.p[2]]; await walk(B, bPos, [-14, 1.6, -56]); bPos = [-14, 1.6, -56]; await sleep(1600); }
    else { await walk(B, bPos, [-14, 1.6, -56]); bPos = [-14, 1.6, -56]; await sleep(300); }
    A.send({ type: 'reload' }); await sleep(1300);
    for (let s = 0; s < 6; s++) {
      A.send({ type: 'shoot', w: 'pistol', o: [-19.6, 1.6, -56], d: [[1, 0, 0]] });
      await sleep(260);
      const k = A.msgs.find(m => m.type === 'kill' && m.victim === B.id);
      if (k) { kills++; A.msgs = A.msgs.filter(m => m !== k); break; }
    }
  }
  ok(kills >= 4, 'repeated eliminations counted (' + kills + ')');
  const end = await A.wait(m => m.type === 'match' && m.state === 'ended', 15000).catch(() => null);
  ok(end && end.winner && end.winner.id === A.id, 'match ends when kill limit reached and names the winner');
  const reset = await A.wait(m => m.type === 'match' && m.state === 'playing', 16000).catch(() => null);
  ok(reset && reset.scores.p.every(p => p[1] === 0 && p[2] === 0), 'new match starts automatically with scores reset');
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL ROCKET + MATCH TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
