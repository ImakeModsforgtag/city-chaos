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
  console.log('CITY CHAOS server test against', URL);
  const A = new Bot('Alice'), B = new Bot('Bob');
  await A.connect(); await B.connect();
  await A.wait(m => m.type === 'welcome'); await B.wait(m => m.type === 'welcome');
  ok(!!A.token, 'hello/welcome handshake gives reconnect token');

  // ---- create room
  A.send({ type: 'create', mode: 'ffa', crimes: false });
  const ja = await A.wait(m => m.type === 'joined');
  ok(/^[A-Z2-9]{6}$/.test(ja.code), 'CREATE ROOM gives 6 character code: ' + ja.code);
  ok(ja.inv.slots[0].w === 'pistol', 'player spawns holding a pistol');

  // ---- join with code
  B.send({ type: 'join', code: ja.code.toLowerCase() });
  const jb = await B.wait(m => m.type === 'joined');
  ok(jb.code === ja.code && jb.players.length === 2, 'JOIN FRIEND with code joins the same room (2 players listed)');
  const pj = await A.wait(m => m.type === 'playerJoined');
  ok(pj.p.name === 'Bob', 'host is told when a friend joins');
  B.send({ type: 'join', code: 'ZZZZZZ' });
  const er = await B.wait(m => m.type === 'error');
  ok(er.code === 'NO_ROOM', 'wrong room code gives a clear error');
  // B is still in room? join attempt with bad code should not remove B
  // (server only leaves the current room after it finds the new one)

  // ---- position sync
  await sleep(1700); // wait for spawn protection to end
  // put both players in the open street (intersection at 0,0), A facing B along +x
  const sp = (j) => [j.spawn.p[0], j.spawn.p[1] + 1.45, j.spawn.p[2]];
  await Promise.all([walk(A, sp(ja), [-5, 1.6, 0]), walk(B, sp(jb), [5, 1.6, 0])]);
  for (let i = 0; i < 3; i++) { A.pose(-5, 1.6, 0); B.pose(5, 1.6, 0); await sleep(60); }
  const snap = await A.wait(m => m.type === 'snap' && m.p.some(p => p[0] === B.id && Math.abs(p[2] - 5) < 0.01));
  ok(!!snap, 'snapshots broadcast other player positions');

  // ---- shooting + server hit detection (headshot)
  A.clear(); B.clear();
  A.send({ type: 'shoot', w: 'pistol', o: [-4.6, 1.6, 0], d: [[1, 0, 0]], ct: null });
  const d1 = await B.wait(m => m.type === 'dmg' && m.id === B.id);
  ok(d1.head && d1.amt === 40 && d1.hp === 60, `pistol headshot does 40 (got ${d1.amt}, head=${d1.head}, hp=${d1.hp})`);
  const inv1 = await A.wait(m => m.type === 'inv');
  ok(inv1.slots[0].mag === 11, 'server tracks ammo (12 -> 11)');

  // fire-rate cheat: two shots instantly -> second must be ignored
  await sleep(300);
  A.clear(); B.clear();
  A.send({ type: 'shoot', w: 'pistol', o: [-4.6, 1.6, 0], d: [[1, 0, 0]] });
  A.send({ type: 'shoot', w: 'pistol', o: [-4.6, 1.6, 0], d: [[1, 0, 0]] });
  await sleep(250);
  const dm = B.msgs.filter(m => m.type === 'dmg' && m.id === B.id);
  ok(dm.length === 1 && dm[0].hp === 20, `fire-rate limit enforced (hits=${dm.length}, hp=${dm[0] && dm[0].hp})`);

  // cheat: shooting from far away origin rejected
  await sleep(300); B.clear();
  A.send({ type: 'shoot', w: 'pistol', o: [4.5, 1.6, 0], d: [[1, 0, 0]] });
  await sleep(200);
  ok(!B.msgs.some(m => m.type === 'dmg'), 'shot from a fake origin (teleport cheat) is rejected');
  // cheat: wrong weapon
  A.send({ type: 'shoot', w: 'sniper', o: [-4.6, 1.6, 0], d: [[1, 0, 0]] });
  await sleep(200);
  ok(!B.msgs.some(m => m.type === 'dmg'), 'shot with a weapon you do not own is rejected');

  // body shot (aim at chest)
  await sleep(300); A.clear(); B.clear();
  const dir = [10, -0.6, 0]; const l = Math.hypot(...dir);
  A.send({ type: 'shoot', w: 'pistol', o: [-4.6, 1.6, 0], d: [dir.map(v => v / l)] });
  const d2 = await B.wait(m => m.type === 'dmg');
  ok(!d2.head && d2.amt === 20 && d2.hp === 0, `body shot does 20 and eliminates (amt=${d2.amt} hp=${d2.hp})`);
  const k = await A.wait(m => m.type === 'kill');
  ok(k.killer === A.id && k.victim === B.id, 'kill event names killer and victim (kill feed)');
  const sa = k.scores.p.find(p => p[0] === A.id), sb = k.scores.p.find(p => p[0] === B.id);
  ok(sa[1] === 1 && sb[2] === 1, 'scoreboard: killer +1 elimination, victim +1 death');

  // ---- dead players cannot shoot
  A.clear();
  B.send({ type: 'shoot', w: 'pistol', o: [5, 1.6, 0], d: [[-1, 0, 0]] });
  await sleep(150);
  ok(!A.msgs.some(m => m.type === 'dmg'), 'eliminated player cannot shoot');

  // ---- respawn after 5s
  const t0 = Date.now();
  const rs = await B.wait(m => m.type === 'respawn' && m.id === B.id, 7000);
  const el = (Date.now() - t0) / 1000;
  ok(el > 4.3 && el < 5.6, `respawn after ~5 seconds (${el.toFixed(2)}s) at ${rs.p.map(v => v.toFixed(1))}`);

  // ---- wall occlusion: shooting through a building does no damage
  await sleep(1700);
  // A stands on the road, B stands inside Green Towers (solid ground-floor wall between them)
  const aPos = [-5, 1.6, 0];
  await Promise.all([walk(A, aPos, [-35, 1.6, 3]), walk(B, [rs.p[0], 1.6, rs.p[2]], [-35, 1.6, 20])]);
  B.clear(); A.clear();
  await sleep(300);
  A.send({ type: 'shoot', w: 'pistol', o: [-35, 1.6, 3.3], d: [[0, 0, 1]] });
  await sleep(250);
  ok(A.msgs.some(m => m.type === 'inv') && !B.msgs.some(m => m.type === 'dmg'), 'bullets are blocked by walls (server raycast)');
  // and without the wall (B steps out onto the sidewalk) the same shot hits
  await walk(B, [-35, 1.6, 20], [-35, 1.6, 10]);
  await sleep(300); B.clear();
  A.send({ type: 'shoot', w: 'pistol', o: [-35, 1.6, 3.3], d: [[0, 0, 1]] });
  const dw = await B.wait(m => m.type === 'dmg').catch(() => null);
  ok(!!dw, 'the same shot hits once the wall is no longer in the way');
  aPos.splice(0, 3, -35, 1.6, 3);

  // ---- pickup (pickup 0 is ammo in the garage, find a weapon pickup id)
  const map = (await import('../public/shared/map.js')).buildMap();
  const wp = map.pickups.find(p => p.kind === 'weapon' && p.weapon === 'shotgun');
  // far away pickup attempt must fail
  A.clear();
  A.send({ type: 'pickup', id: wp.id });
  await sleep(150);
  ok(!A.msgs.some(m => m.type === 'pickup'), 'cannot pick up a weapon from across the map');
  // walk there (in steps to satisfy the anti-teleport speed check)
  const target = [wp.p[0], wp.p[1] + 0.5, wp.p[2]];
  await walk(A, aPos, target);
  A.send({ type: 'pickup', id: wp.id });
  const pk = await A.wait(m => m.type === 'pickup' && m.id === wp.id);
  const inv = await A.wait(m => m.type === 'inv' && m.slots.some(s => s.w === 'shotgun'));
  ok(pk.avail === 0 && inv.slots[inv.cur].w === 'shotgun', 'picking up a shotgun equips it and the pickup disappears for everyone');
  ok(B.msgs.some(m => m.type === 'pickup' && m.id === wp.id) || (await B.wait(m => m.type === 'pickup' && m.id === wp.id).then(() => true).catch(() => false)), 'other players see the pickup vanish');

  // ---- reload
  A.send({ type: 'shoot', w: 'shotgun', o: target, d: Array(8).fill([0, -1, 0]) });
  await sleep(100);
  A.clear();
  A.send({ type: 'reload' });
  const r1 = await A.wait(m => m.type === 'inv' && m.reloading > 0);
  ok(r1.reloading > 2, 'reload starts with server-side reload time (' + r1.reloading.toFixed(2) + 's)');
  const r2 = await A.wait(m => m.type === 'inv' && m.reloading === 0 && m.slots[m.cur].mag === 6, 3500);
  ok(!!r2, 'reload completes and refills the magazine');

  // ---- weapon switching
  A.send({ type: 'switch', slot: 0 });
  const sw = await A.wait(m => m.type === 'inv' && m.cur === 0);
  ok(sw.slots[0].w === 'pistol', 'weapon switching works');

  // ---- reconnect after disconnection
  const oldId = B.id, oldToken = B.token;
  B.ws.terminate();
  await sleep(400);
  const pu = await A.wait(m => m.type === 'playerUpdate' && m.p.id === oldId && m.p.connected === false);
  ok(!!pu, 'others see a dropped player as disconnected');
  const B2 = new Bot('Bob');
  await B2.connect(oldToken);
  const jr = await B2.wait(m => m.type === 'joined');
  const meB = jr.players.find(p => p.id === oldId);
  ok(jr.reconnected && jr.you === oldId && meB.deaths === 1, 'reconnecting with token restores the same player with their score');

  // ---- quick play
  const C = new Bot('Cara'); await C.connect(); await C.wait(m => m.type === 'welcome');
  C.send({ type: 'quick' });
  const jc = await C.wait(m => m.type === 'joined');
  ok(jc.isPublic && jc.code !== ja.code, 'PLAY (quick match) puts you in a public room, not a private one');

  // ---- rocket launcher splash (give via direct room manipulation is not possible; check rocket pickup id exists)
  ok(map.pickups.some(p => p.weapon === 'rocket'), 'rocket launchers exist in rare crates');

  // ---- 8 players in one room
  const bots = [];
  for (let i = 0; i < 6; i++) { const b = new Bot('Bot' + i); await b.connect(); await b.wait(m => m.type === 'welcome'); b.send({ type: 'join', code: ja.code }); bots.push(b); }
  const lastJoin = await bots[5].wait(m => m.type === 'joined');
  ok(lastJoin.players.filter(p => p.connected).length === 8, '8 players can be in one room');
  const extra = new Bot('Extra'); await extra.connect(); await extra.wait(m => m.type === 'welcome');
  extra.send({ type: 'join', code: ja.code });
  const full = await extra.wait(m => m.type === 'error');
  ok(full.code === 'FULL', '9th player gets a "room is full" message');

  // ---- TDM: host changes mode, teams assigned, no friendly fire
  A.send({ type: 'settings', mode: 'tdm', killLimit: 30 });
  const rsx = await A.wait(m => m.type === 'roomSettings');
  const teams = rsx.players.map(p => p.team);
  ok(rsx.mode === 'tdm' && teams.filter(t => t === 0).length === 4 && teams.filter(t => t === 1).length === 4, 'Team Deathmatch splits 8 players 4 v 4');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SERVER TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
