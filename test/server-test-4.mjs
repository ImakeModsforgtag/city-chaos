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
    this.send({ type: 'state', life: this.life, h: [x, y, z, 0, 0, 0, 1], l: [x - 0.3, y - 0.5, z, 0, 0, 0, 1], r: [x + 0.3, y - 0.5, z, 0, 0, 0, 1], vr: false, ...(this.carState ? { car: this.carState } : {}) });
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
  console.log('CITY CHAOS server test 4 (traffic, hijacking, driving, run-overs)');
  const A = new Bot('Jacker'), B = new Bot('Walker');
  await A.connect(); await B.connect();
  await A.wait(m => m.type === 'welcome'); await B.wait(m => m.type === 'welcome');
  A.send({ type: 'create', mode: 'ffa' });
  const ja = await A.wait(m => m.type === 'joined');
  ok(ja.cars && ja.cars.filter(c => !c[9]).length === 10 && ja.cars.filter(c => !c[9]).every(c => c[6] === 0), 'NPC traffic exists on join (10 cars with NPC drivers)');
  A.clear(); const s1 = (await A.wait(m => m.type === 'npcs')).c; await sleep(1500); A.clear(); const s2 = (await A.wait(m => m.type === 'npcs')).c;
  const moved = s1.map((c, i) => Math.hypot(s2[i][1] - c[1], s2[i][3] - c[3]));
  ok(moved.filter(d => d > 5).length >= 8, 'cars drive along the roads (' + moved.filter(d => d > 5).length + ' of 10 moved >5m)');
  B.send({ type: 'join', code: ja.code });
  const jb = await B.wait(m => m.type === 'joined');
  const sp = (j) => [j.spawn.p[0], j.spawn.p[1] + 1.45, j.spawn.p[2]];
  // A waits by the road, then steps into the lane ~20m in front of an approaching NPC car
  const map = (await import('../public/shared/map.js')).buildMap();
  const curb = [0, 1.6, -47];
  await Promise.all([walk(A, sp(ja), curb), walk(B, sp(jb), [6, 1.6, -45])]);
  let lane = null;
  for (let tries = 0; tries < 400 && !lane; tries++) {
    A.pose(...curb); await sleep(100);
    const snap = A.msgs.filter(m => m.type === 'npcs').pop(); A.msgs = A.msgs.filter(m => m.type !== 'npcs');
    if (!snap) continue;
    for (const c of snap.c) {
      if (c[6] !== 0) continue;
      const fx = -Math.sin(c[4]), fz = -Math.cos(c[4]);
      const p = [c[1] + fx * 20, 1.6, c[3] + fz * 20];
      if (Math.hypot(p[0] - curb[0], p[2] - curb[2]) < 9) { lane = p; break; }
    }
  }
  ok(!!lane, 'an NPC car approaches along the road');
  await walk(A, curb, lane);
  let stopped = null;
  for (let i = 0; i < 100 && !stopped; i++) {
    A.pose(...lane); await sleep(100);
    const snap = A.msgs.filter(m => m.type === 'npcs').pop();
    if (snap) { const c = snap.c.find(c => c[6] === 0 && Math.hypot(c[1] - lane[0], c[3] - lane[2]) < 11 && Math.abs(c[5]) < 0.5); if (c) stopped = c; }
    A.msgs = A.msgs.filter(m => m.type !== 'npcs');
  }
  ok(!!stopped, 'an NPC car brakes and stops for a player standing in the road' + (stopped ? ' (' + Math.hypot(lane[0] - stopped[1], lane[2] - stopped[3]).toFixed(1) + 'm away)' : ''));
  const honk = A.msgs.find(m => m.type === 'honk') || await A.wait(m => m.type === 'honk', 4000).catch(() => null);
  ok(!!honk, 'the blocked driver honks');
  // walk to the driver's door and hijack
  const fwd = [-Math.sin(stopped[4]), -Math.cos(stopped[4])], left = [-fwd[1] * -1, fwd[0] * -1];
  const door = [stopped[1] + Math.cos(stopped[4]) * -1.9, 1.6, stopped[3] - Math.sin(stopped[4]) * -1.9];
  await walk(A, lane, door);
  A.clear();
  A.send({ type: 'hijack', id: stopped[0] });
  const enter = await A.wait(m => m.type === 'carEnter' && m.pid === A.id, 2000).catch(() => null);
  ok(!!enter, 'hijacking the car puts you in the driver seat');
  const w = await A.wait(m => m.type === 'wanted' && m.id === A.id, 2000).catch(() => null);
  ok(w && w.wanted >= 1, 'carjacking gives a wanted star');
  const runner = await A.wait(m => m.type === 'npcs' && m.n.length > ja.npcs.length, 2000).catch(() => null);
  ok(!!runner, 'the NPC driver jumps out and runs');
  // B can't hijack a car someone is driving
  B.clear(); B.send({ type: 'hijack', id: stopped[0] }); await sleep(300);
  ok(!B.msgs.some(m => m.type === 'carEnter' && m.pid === B.id), "you can't steal a car another player is driving");
  // drive forward at 14 m/s toward B, who steps into the lane 12m ahead
  const bSpot = [stopped[1] + fwd[0] * 12, 1.6, stopped[3] + fwd[1] * 12];
  await walk(B, [6, 1.6, -45], bSpot);
  let cx = stopped[1], cz = stopped[3];
  B.clear();
  let hitMsg = null;
  for (let i = 0; i < 60 && !hitMsg; i++) {
    cx += fwd[0] * 14 * 0.05; cz += fwd[1] * 14 * 0.05;
    A.carState = [stopped[0], cx, 0, cz, stopped[4], 14];
    A.pose(cx, 1.2, cz); B.pose(...bSpot);
    await sleep(50);
    hitMsg = B.msgs.find(m => m.type === 'dmg' && m.id === B.id && m.w === 'car');
  }
  ok(hitMsg && hitMsg.amt >= 60, 'running someone over hurts them (' + (hitMsg ? hitMsg.amt : 0) + ' damage at 14 m/s)');
  const seen = B.msgs.filter(m => m.type === 'npcs').pop();
  const myCar = seen && seen.c.find(c => c[0] === stopped[0]);
  ok(myCar && myCar[6] === 1 && myCar[7] === A.id, 'other players see the hijacked car being driven by the player');
  // teleport cheat with the car is ignored
  A.carState = [stopped[0], cx + 80, 0, cz, stopped[4], 14]; A.pose(cx, 1.2, cz); await sleep(150);
  B.clear(); const chk = await B.wait(m => m.type === 'npcs');
  const cc = chk.c.find(c => c[0] === stopped[0]);
  ok(cc && Math.abs(cc[1] - cx) < 3, 'impossible car teleports are rejected');
  // exit
  A.carState = null; A.clear();
  A.send({ type: 'exitCar' });
  const ex = await A.wait(m => m.type === 'carExit' && m.pid === A.id, 2000).catch(() => null);
  ok(!!ex, 'you can get out of the car');
  B.clear(); const after = await B.wait(m => m.type === 'npcs'); const parked = after.c.find(c => c[0] === stopped[0]);
  ok(parked && parked[6] === 2 && parked[5] === 0, 'the abandoned car stays parked where you left it');
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL VEHICLE TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
