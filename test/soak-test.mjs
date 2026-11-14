// CITY CHAOS soak test (in-process, fake clock): 8 bot players play for 25 simulated minutes, doing everything at
// random (walking, shooting, robbing stores, hijacking cars, shopping, banking, jobs, the vault heist, arrests,
// switching roles, leaving + rejoining with their save) while NPC robbers run around. Every simulated second it checks
// that nothing is broken (no crashes, no NaN positions, cash / health / stars in range, NPC + car counts sane).
// Run: node test/soak-test.mjs [minutes]
let SIM = 0;                                     // fake clock (seconds)
const realNow = performance.now.bind(performance);
performance.now = () => SIM * 1000;
const { Room } = await import('../server/room.js');
const { SHOP_ITEMS } = await import('../public/shared/shops.js');

const MIN = Number(process.argv[2]) || 25;
const errors = [], seen = new Map();
const err = (where, e) => { const k = where + ': ' + (e && e.message || e); if (!seen.has(k)) { seen.set(k, 0); errors.push(k + '\n' + (e && e.stack ? e.stack.split('\n').slice(1, 4).join('\n') : '')); } seen.set(k, seen.get(k) + 1); };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { if (this.msgs.length > 400) this.msgs.splice(0, 200); this.msgs.push(m); }, sendRaw(d) { this.send(JSON.parse(d)); } }; };
const room = new Room('SOAK', { mode: 'ffa' }, { tokens: new Map() });
const M = room.npcs.map;
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const places = () => [...M.shops.map(s => [s.keeper[0] - Math.sin(s.yaw) * 2.8, s.keeper[2] - Math.cos(s.yaw) * 2.8, 'shop', s.name]),
  [M.jobBoard[0], M.jobBoard[2], 'jobs'], [M.bank.drill[0], M.bank.drill[2], 'drill'], ...M.bank.loot.map((l, i) => [l[0], l[2], 'loot', i]),
  ...M.spawns.slice(0, 20).map(s => [s.p[0], s.p[2], 'walk'])];
const PLACES = places().concat(places().filter(p => p[2] !== "walk"));   // (places with something to do twice as often)

const bots = [];
function addBot(token) {
  const role = Math.random() < 0.3 ? 'cop' : 'civilian';
  const p = room.addPlayer(mk(), { name: 'Bot' + nextId, role, profile: token || null, cos: { hat: Math.floor(rnd(0, 7)), back: Math.floor(rnd(0, 5)) } });
  if (role === 'cop') p.role = 'cop';
  const b = { p, target: pick(PLACES), y: 1.6, actT: rnd(0, 3) };
  bots.push(b); return b;
}
for (let i = 0; i < 8; i++) addBot();

const stats = { shots: 0, kills: 0, buys: 0, jobsDone: 0, heists: 0, robs: 0, deposits: 0, rejoins: 0, roleSwaps: 0, hijacks: 0 };
function send(p, m) { try { room.handle(p, m); } catch (e) { err('handle ' + m.type, e); } }

function botTick(b, dt) {
  const p = b.p; if (!p.connected) return;
  if (!p.alive || !p.pose) { return; }
  const h = p.pose.h;
  // in a car: drive it around a bit, sometimes get out
  if (p.inCar) {
    const car = room.vehicles.cars.find(c => c.id === p.inCar);
    if (car) {
      car.speed = Math.min(14, (car.speed || 0) + dt * 6); car.yaw += rnd(-0.05, 0.05);
      const nx = car.x - Math.sin(car.yaw) * car.speed * dt, nz = car.z - Math.cos(car.yaw) * car.speed * dt;
      if (Math.abs(nx) < 115 && Math.abs(nz) < 115) send(p, { type: 'state', life: p.life, h: [nx, 1.2, nz, 0, 0, 0, 1], l: [nx, 1, nz, 0, 0, 0, 1], r: [nx, 1, nz, 0, 0, 0, 1], car: { x: nx, y: 0, z: nz, yaw: car.yaw, speed: car.speed } });
      else car.yaw += Math.PI;
    }
    if (Math.random() < 0.004) send(p, { type: 'exitCar' });
    return;
  }
  // walk toward the target (11 m/s, a sprint + a bit)
  const [tx, tz] = b.target, dx = tx - h[0], dz = tz - h[2], d = Math.hypot(dx, dz);
  let x = h[0], z = h[2];
  if (d > 1.2) { const s = Math.min(d, 11 * dt); x += dx / d * s; z += dz / d * s; }
  else b.arrived = true;
  const y = b.target[2] === 'drill' || b.target[2] === 'loot' || b.target[2] === 'shop' || b.target[2] === 'jobs' ? 0.15 + 1.6 : 1.6;
  send(p, { type: 'state', life: p.life, h: [x, y, z, 0, 0, 0, 1], l: [x - 0.25, y - 0.4, z - 0.3, 0, 0, 0, 1], r: [x + 0.25, y - 0.4, z - 0.3, 0, 0, 0, 1], vr: Math.random() < 0.5 });
  // job targets take priority
  if (p.job && p.job.target && Math.random() < 0.02) b.target = [p.job.target[0], p.job.target[2], 'job'];
  if (p.heistLoot && b.target[2] !== 'run') b.target = [M.bank.center[0] + 130, M.bank.center[2], 'run'];

  // at the vault: keep drilling (like holding E), then go for the cash
  if (b.arrived && b.target[2] === 'drill' && p.role !== 'cop') {
    if (room.bank.state === 'open') { b.target = pick(PLACES.filter(q => q[2] === 'loot')); b.arrived = false; }
    else if (room.bank.state === 'lockdown' || (b.drillT = (b.drillT || 0) + dt) > 25) { b.drillT = 0; b.target = pick(PLACES); b.arrived = false; }
    else send(p, { type: 'heist', a: 'drill' });
  }
  if (b.arrived && b.target[2] === 'loot' && Math.random() < 0.3) send(p, { type: 'heist', a: 'grab', i: b.target[3] });
  b.actT -= dt; if (b.actT > 0) return;
  b.actT = rnd(0.3, 2.5);
  const r = Math.random();
  const slot = p.slots[p.cur];
  if (r < 0.35 && slot) {
    // shoot at something nearby (a player or an NPC)
    const targets = [...room.players.values()].filter(q => q !== p && q.alive && q.pose).map(q => q.pose.h).concat(room.npcs.list.filter(n => n.state !== 3).map(n => [n.x, n.y + 1.4, n.z]));
    const t = targets.sort((a, c) => Math.hypot(a[0] - x, a[2] - z) - Math.hypot(c[0] - x, c[2] - z))[0];
    if (t) { const v = [t[0] - x, t[1] - y, t[2] - z], l = Math.hypot(...v) || 1; send(p, { type: 'shoot', w: slot.w, o: [x, y - 0.2, z], d: [[v[0] / l + rnd(-0.05, 0.05), v[1] / l, v[2] / l + rnd(-0.05, 0.05)]], ct: room.now() - 0.1 }); stats.shots++; }
    if (slot.mag <= 0) send(p, { type: 'reload' });
  } else if (r < 0.45) send(p, { type: 'switch', slot: Math.floor(rnd(0, 3)) });
  else if (r < 0.55 && b.arrived) {
    // do the thing at this place
    const kind = b.target[2];
    if (kind === 'shop') { const items = SHOP_ITEMS[b.target[3]] || []; if (items.length) { send(p, { type: 'shopBuy', shop: b.target[3], item: pick(items).id }); stats.buys++; }
      const clerk = room.npcs.list.find(n => n.type === 1 && n.shop === b.target[3]); if (clerk && p.role !== 'cop' && Math.random() < 0.4) { for (let i = 0; i < 3; i++) send(p, { type: 'rob', id: clerk.id }); stats.robs++; } }
    if (kind === 'jobs') send(p, { type: 'shopBuy', shop: 'JOB BOARD', item: pick(['delivery', 'taxi', 'quit']) });
    if (kind === 'drill') for (let i = 0; i < 4; i++) send(p, { type: 'heist', a: 'drill' });
    if (kind === 'loot') send(p, { type: 'heist', a: 'grab', i: b.target[3] });
    if (Math.random() < 0.6) { b.target = pick(PLACES); b.arrived = false; }
  } else if (r < 0.62) {
    const car = room.vehicles.cars.filter(c => Math.hypot(c.x - x, c.z - z) < 6)[0];
    if (car) { send(p, { type: 'hijack', id: car.id }); stats.hijacks++; }
  } else if (r < 0.68) {
    if (p.role === 'cop') {
      const q = [...room.players.values()].find(q => q !== p && q.wanted && q.pose && Math.hypot(q.pose.h[0] - x, q.pose.h[2] - z) < 3);
      if (q) send(p, { type: 'arrest', id: q.id });
      const c = room.npcs.list.find(n => n.type === 6 && Math.hypot(n.x - x, n.z - z) < 3);
      if (c) send(p, { type: 'arrestCrook', id: c.id });
    }
  } else if (r < 0.7) { send(p, { type: 'shopBuy', shop: 'CITY BANK', item: pick(['dep100', 'depall', 'wd100', 'wdall']) }); stats.deposits++; }
  else if (r < 0.703) { send(p, { type: 'setRole', role: p.role === 'cop' ? 'civilian' : 'cop' }); stats.roleSwaps++; }
  else if (r < 0.705) {
    // leave and come back later with the save
    const tok = p.client.msgs.filter(m => m.type === 'save').pop();
    try { room.removePlayer(p.id); } catch (e) { err('removePlayer', e); }
    bots.splice(bots.indexOf(b), 1);
    try { addBot(tok && tok.token); stats.rejoins++; } catch (e) { err('addPlayer', e); }
  } else if (r < 0.8) { b.target = pick(PLACES); b.arrived = false; }
  else if (r < 0.81) send(p, { type: 'pAct', a: 'nothing' });
  else if (r < 0.82) send(p, { type: 'shopBuy', shop: { bad: 1 }, item: [1] });   // junk
}

function check() {
  const bad = (what) => err('invariant', new Error(what));
  for (const p of room.players.values()) {
    if (!Number.isFinite(p.cash) || p.cash < 0) bad(`cash ${p.cash}`);
    if (!(p.hp >= 0 && p.hp <= 100)) bad(`hp ${p.hp}`);
    if (!(p.wanted >= 0 && p.wanted <= 5)) bad(`wanted ${p.wanted}`);
    if (p.prof && (!Number.isFinite(p.prof.xp) || !Number.isFinite(p.prof.bank) || p.prof.bank < 0)) bad('profile numbers');
    if (p.pose && p.pose.h.some(v => !Number.isFinite(v))) bad('player pose NaN');
    if (p.armor && !(p.armor >= 0 && p.armor <= 100)) bad(`armor ${p.armor}`);
    if (p.slots.length > 3) bad(`more than 3 guns (${p.slots.length})`);
    if (p.slots.some(s => !(s.mag >= 0) || !(s.reserve >= 0))) bad('negative ammo');
  }
  for (const n of room.npcs.list) if (![n.x, n.y, n.z].every(Number.isFinite)) bad(`npc NaN type ${n.type}`);
  if (room.npcs.list.length > 160) bad(`too many NPCs (${room.npcs.list.length})`);
  if (room.npcs.list.filter(n => n.type === 6 && !n.boss && !n.guard).length > 3) bad('more than 3 normal robbers (3 at night)');
  if (room.npcs.list.filter(n => n.type === 6 && (n.boss || n.guard)).length > 3) bad('more than one boss crew');
  for (const c of room.vehicles.cars) if (![c.x, c.z, c.yaw, c.speed].every(Number.isFinite)) bad('car NaN');
  if (room.vehicles.cars.length > 60) bad(`too many cars (${room.vehicles.cars.length})`);
  if (!['closed', 'drilling', 'open', 'lockdown'].includes(room.bank.state)) bad('bank state');
  if (room.npcs.list.filter(n => n.fare).length > room.players.size) bad('orphan taxi passengers');
}

const t0 = realNow();
const DT = 0.1, steps = MIN * 60 / DT;
let maxNpc = 0, maxCars = 0;
for (let i = 0; i < steps; i++) {
  SIM += DT;
  for (const b of bots.slice()) { try { botTick(b, DT); } catch (e) { err('bot', e); } }
  try { room.tick(DT); } catch (e) { err('room.tick', e); }
  for (const p of room.players.values()) p.client.msgs.length > 300 && p.client.msgs.splice(0, 150);
  if (i % 10 === 0) { check(); maxNpc = Math.max(maxNpc, room.npcs.list.length); maxCars = Math.max(maxCars, room.vehicles.cars.length); }
}
for (const p of room.players.values()) { stats.kills += p.prof ? p.prof.stats.kills : 0; stats.jobsDone += p.prof ? p.prof.stats.jobs : 0; stats.heists += p.prof ? p.prof.stats.heists : 0; }
console.log(`CITY CHAOS soak test: ${MIN} simulated minutes, 8 bots, in ${((realNow() - t0) / 1000).toFixed(1)} s real time`);
console.log('  activity:', JSON.stringify(stats), `| max NPCs ${maxNpc}, max cars ${maxCars} | robbers seen ${room.npcs.crooks ? 'on' : 'off'} | vault ${room.bank.state}`);
if (errors.length) { console.log(`\n${errors.length} PROBLEM(S):`); for (const e of errors) console.log('  - ' + e.replace(/\n/g, '\n      ') + `  (x${seen.get(e.split('\n')[0])})`); process.exit(1); }
console.log('  no crashes, no broken numbers\nSOAK PASSED');
