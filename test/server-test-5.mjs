// Roles test: Cop vs Civilian, police cars, dispatch routes, donut cops, arrests.
// Run: node test/server-test-5.mjs   (server must be running on PORT or 3000)
import WebSocket from 'ws';
import { buildMap } from '../public/shared/map.js';
import { CollisionWorld } from '../public/shared/collision.js';
import { VehicleManager } from '../server/vehicles.js';

const URL = process.env.URL || 'ws://localhost:3000/ws';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const map = buildMap();
const world = new CollisionWorld(map.boxes);

class Bot {
  constructor(name, role) { this.name = name; this.role = role; this.msgs = []; this.waiters = []; }
  connect() {
    return new Promise((res) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => { this.send({ type: 'hello', name: this.name, cos: { color: '#0000ff' } }); res(); });
      this.ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.type === 'joined') { this.joined = m; this.id = m.you; this.life = m.life; this.spawnP = m.spawn.p; }
        if (m.type === 'respawn' && m.id === this.id) { this.life = m.life; this.spawnP = m.p; }
        this.msgs.push(m);
        this.waiters = this.waiters.filter(w => { if (w.f(m)) { w.res(m); return false; } return true; });
      });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(f, ms = 3000) {
    const found = this.msgs.find(f); if (found) { this.msgs = this.msgs.filter(x => x !== found); return Promise.resolve(found); }
    return new Promise((res, rej) => { this.waiters.push({ f, res }); setTimeout(() => rej(new Error('timeout')), ms); });
  }
  clear() { this.msgs = []; }
  pose(x, y, z) {
    this.at = [x, y, z];
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
const sp = (b) => [b.spawnP[0], b.spawnP[1] + 1.45, b.spawnP[2]];

(async () => {
  console.log('CITY CHAOS server test 5 (Cop vs Civilian roles, police cars, dispatch, arrests)');

  // ---- offline: dispatch routes stay on the roads and never pass through buildings
  const vm = new VehicleManager({ now: () => 0, players: new Map() }, map, world);
  const [ex, , ez] = map.policeExit;
  let bad = 0, total = 0;
  for (let i = 0; i < 60; i++) {
    const tx = (Math.random() - 0.5) * 220, tz = (Math.random() - 0.5) * 220;
    const r = vm.route(ex, ez, tx, tz); total++;
    for (let k = 1; k < r.length; k++) {
      const [ax, az] = r[k - 1], [bx, bz] = r[k], d = Math.hypot(bx - ax, bz - az);
      if (d < 0.1) continue;
      const hit = world.raycast(ax, 1.0, az, (bx - ax) / d, 0, (bz - az) / d, d);
      if (hit < d - 0.2) { bad++; break; }
    }
  }
  ok(bad === 0, `police dispatch routes follow the roads with no building in the way (${total - bad}/${total} clear)`);

  const C = new Bot('Officer', 'cop'), R = new Bot('Robber', 'civilian');
  await C.connect(); await R.connect();
  await C.wait(m => m.type === 'welcome'); await R.wait(m => m.type === 'welcome');
  C.send({ type: 'create', mode: 'ffa', role: 'cop' });
  const jc = await C.wait(m => m.type === 'joined');
  ok(jc.players.find(p => p.id === C.id).role === 'cop', 'joining as a Cop sets your role');
  ok(map.copSpawns.some(s => Math.hypot(s[0] - jc.spawn.p[0], s[2] - jc.spawn.p[2]) < 0.5), 'cops spawn at the police station');
  const pcars = jc.cars.filter(c => c[9] === 1);
  ok(pcars.length === 3 && pcars.every(c => c[8] === 8 && c[6] === 2), 'three empty police cars wait in the station lot');
  R.send({ type: 'join', code: jc.code, role: 'civilian' });
  const jr = await R.wait(m => m.type === 'joined');
  ok(jr.players.find(p => p.id === R.id).role === 'civilian', 'joining as a Civilian sets your role');
  C.pose(...sp(C)); R.pose(...sp(R));

  // ---- cops can't rob
  const shops = jc.npcs.filter(n => n[1] === 1);
  const keeperOf = (name) => { const s = map.shops.find(q => q.name === name); return [s, shops.find(n => Math.abs(n[2] - s.keeper[0]) < 0.1 && Math.abs(n[4] - s.keeper[2]) < 0.1)]; };
  const [gs, gk] = keeperOf('GUN SHOP');
  const gStand = [gs.keeper[0], 1.6, gs.keeper[2] + 3.2];

  // ---- cop drives a police car, no wanted stars
  const pc = pcars[0];
  const door = [pc[1] + Math.cos(pc[4]) * -1.9, 1.6, pc[3] - Math.sin(pc[4]) * -1.9];
  await walk(C, sp(C), door);
  C.clear(); C.send({ type: 'hijack', id: pc[0] });
  const enter = await C.wait(m => m.type === 'carEnter' && m.pid === C.id, 2000).catch(() => null);
  ok(!!enter, 'a cop can get in a police car');
  const cw = await C.wait(m => m.type === 'wanted' && m.id === C.id, 800).catch(() => null);
  ok(!cw || !cw.wanted, 'cops never get wanted stars for using police cars');
  C.send({ type: 'siren', on: true });
  const sir = await C.wait(m => m.type === 'siren' && m.id === pc[0], 1500).catch(() => null);
  ok(sir && sir.on, 'cops can turn the siren on');
  C.clear(); const snapS = await C.wait(m => m.type === 'npcs' && m.c.some(c => c[0] === pc[0] && c[10] === 1), 1500).catch(() => null);
  ok(!!snapS, 'siren state streams to everyone in the car snapshot');
  C.send({ type: 'exitCar' }); await sleep(300);
  C.pose(...door);

  // ---- a cop nearby stops a robbery; cops get an alert when it starts
  await Promise.all([walk(R, sp(R), gStand), walk(C, door, [gs.keeper[0] + 4, 1.6, gs.keeper[2] + 5])]);
  C.send({ type: 'rob', id: gk[0] });
  const copRob = await C.wait(m => m.type === 'robStatus' && m.cop, 1500).catch(() => null);
  ok(!!copRob, 'cops are not allowed to rob stores');
  R.clear(); R.send({ type: 'rob', id: gk[0] });
  const near = await R.wait(m => m.type === 'robStatus' && m.copNear, 1500).catch(() => null);
  ok(!!near, 'a store can\'t be robbed while a cop player is close by');
  await walk(C, C.at, [gs.keeper[0] + 4, 1.6, gs.keeper[2] + 24]);
  C.clear(); R.clear();
  let robbed = null;
  for (let i = 0; i < 25 && !robbed; i++) { R.send({ type: 'rob', id: gk[0] }); R.pose(...gStand); C.pose(...C.at); await sleep(300); robbed = R.msgs.find(m => m.type === 'robbed'); }
  ok(!!robbed, 'with the cop gone the store can be robbed');
  ok(C.msgs.some(m => m.type === 'robAlert' && m.shop === 'GUN SHOP' && m.by === R.id), 'cop players get an alert when a robbery starts');

  // ---- police respond: dispatch car or donut cops
  let sawDispatch = false, sawDonut = false;
  for (let i = 0; i < 40 && !(sawDispatch && sawDonut); i++) {
    R.pose(...gStand); C.pose(...C.at); await sleep(150);
    if (C.msgs.some(m => m.type === 'dispatch' && m.target === R.id)) sawDispatch = true;
    if (C.msgs.some(m => m.type === 'npcs' && m.n.some(n => n[1] === 2 && n[8] === 1))) sawDonut = true;
    C.msgs = C.msgs.filter(m => m.type === 'dispatch' || m.type === 'copsOut');
  }
  ok(sawDispatch || sawDonut, `cops respond to the robbery (${sawDispatch ? 'police car dispatched' : ''}${sawDispatch && sawDonut ? ' + ' : ''}${sawDonut ? 'donut-shop cop' : ''})`);
  if (sawDispatch) {
    const d = C.msgs.find(m => m.type === 'copsOut') || await C.wait(m => (m.type === 'npcs' && m.c.some(c => c[9] === 1 && c[10] === 1 && c[6] === 0)) || m.type === 'copsOut', 4000).catch(() => null);
    ok(!!d, 'the dispatched police car drives with its siren on' + (d && d.type === 'copsOut' ? ' (already arrived, cops jumped out)' : ''));
  }

  // ---- arrest
  const rAlive = !R.msgs.some(m => m.type === 'kill' && m.victim === R.id) && !C.msgs.some(m => m.type === 'kill' && m.victim === R.id);
  if (!rAlive) console.log('  SKIP arrest check (the NPC cops got the robber first this run)');
  else {
    await walk(C, C.at, [gStand[0] + 1.2, 1.6, gStand[2] + 0.5]);
    C.clear(); R.clear(); C.send({ type: 'arrest', id: R.id });
    const k = await C.wait(m => m.type === 'arrested' && m.id === R.id, 1500).catch(() => null);
    ok(k && k.by === C.id && k.prison === false, 'a cop can arrest a wanted player up close (under 3 stars: holding cell)');
    const sc = k && k.scores.p.find(q => q[0] === C.id);
    ok(sc && sc[3] >= 400, 'arresting pays a double bounty ($' + (sc && sc[3]) + ')');
    const short = await R.wait(m => m.type === 'arrestShort', 1500).catch(() => null);
    const tp = await R.wait(m => m.type === 'tp', 1500).catch(() => null);
    ok(short && tp && map.holding.cells.some(c => Math.hypot(c[0] - tp.p[0], c[2] - tp.p[2]) < 0.5), 'short arrest puts you in the police station holding cell');
    if (tp) R.life = tp.life;
    const inv = await R.wait(m => m.type === 'inv', 1500).catch(() => null);
    ok(inv && inv.slots.length === 0, 'weapons are taken away while arrested');
    const rel = await R.wait(m => m.type === 'released', 16000).catch(() => null);
    const tp2 = rel && await R.wait(m => m.type === 'tp', 1500).catch(() => null);
    if (tp2) R.life = tp2.life;
    const inv2 = rel && await R.wait(m => m.type === 'inv' && m.slots.length > 0, 1500).catch(() => null);
    ok(rel && tp2 && inv2, 'released from the holding cell after a short time, weapons returned');
    if (tp2) { R.pose(tp2.p[0], tp2.p[1] + 1.45, tp2.p[2]); C.at = [tp2.p[0] + 1.5, 1.6, tp2.p[2]]; C.pose(...C.at); }
  }
  // can't arrest someone who isn't wanted
  await sleep(500); R.clear();
  R.pose(C.at[0] + 1, 1.6, C.at[2]); await sleep(150);
  C.clear(); C.send({ type: 'arrest', id: R.id });
  const k2 = await C.wait(m => m.type === 'arrested' && m.id === R.id, 800).catch(() => null);
  ok(!k2, 'innocent (not wanted) players can\'t be arrested');

  // ---- switching role
  R.clear(); R.send({ type: 'setRole', role: 'cop' });
  const up = await R.wait(m => m.type === 'playerUpdate' && m.p.id === R.id && m.p.role === 'cop', 2000).catch(() => null);
  ok(!!up, 'players can switch role mid-match');
  const rs = await R.wait(m => m.type === 'respawn' && m.id === R.id, 3000).catch(() => null);
  ok(rs && map.copSpawns.some(s => Math.hypot(s[0] - rs.p[0], s[2] - rs.p[2]) < 0.5), 'switching to Cop respawns you at the station');

  C.ws.close(); R.ws.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
