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
  console.log('CITY CHAOS server test 3 (NPCs, robbery, wanted, cops)');
  const map = (await import('../public/shared/map.js')).buildMap();
  const A = new Bot('Robber'), B = new Bot('Hunter');
  await A.connect(); await B.connect();
  await A.wait(m => m.type === 'welcome'); await B.wait(m => m.type === 'welcome');
  A.send({ type: 'create', mode: 'ffa', crimes: false });
  const ja = await A.wait(m => m.type === 'joined');
  const shops = ja.npcs.filter(n => n[1] === 1), peds = ja.npcs.filter(n => n[1] === 0);
  ok(shops.length === 7 && peds.length === 18, `NPCs exist on join (${shops.length} shopkeepers, ${peds.length} pedestrians)`);
  A.clear();
  const sn = await A.wait(m => m.type === 'npcs');
  const p0 = peds[0], p1 = sn.n.find(n => n[0] === p0[0]);
  await sleep(1200); A.clear();
  const sn2 = await A.wait(m => m.type === 'npcs');
  const p2 = sn2.n.find(n => n[0] === p0[0]);
  ok(Math.hypot(p2[2] - p1[2], p2[4] - p1[4]) > 0.5, 'pedestrians walk around (NPC positions stream to everyone)');
  B.send({ type: 'join', code: ja.code });
  const jb = await B.wait(m => m.type === 'joined');
  const sp = (j) => [j.spawn.p[0], j.spawn.p[1] + 1.45, j.spawn.p[2]];
  // --- rob the GUN SHOP
  const gs = map.shops.find(s => s.name === 'GUN SHOP');
  const keeper = shops.find(n => Math.abs(n[2] - gs.keeper[0]) < 0.1 && Math.abs(n[4] - gs.keeper[2]) < 0.1);
  const stand = [gs.keeper[0], 1.6, gs.keeper[2] + 3.2];
  await Promise.all([walk(A, sp(ja), stand), walk(B, sp(jb), [gs.keeper[0] + 6, 1.6, gs.keeper[2] + 16])]);
  A.clear();
  let robbed = null, lastProg = 0;
  for (let i = 0; i < 25 && !robbed; i++) {
    A.send({ type: 'rob', id: keeper[0] }); await sleep(300);
    const st = A.msgs.filter(m => m.type === 'robStatus').pop(); if (st && st.progress) lastProg = st.progress;
    robbed = A.msgs.find(m => m.type === 'robbed');
  }
  ok(lastProg > 0.5, 'aiming at the clerk builds robbery progress (' + lastProg + ')');
  ok(robbed && robbed.cash >= 150 && robbed.shop === 'GUN SHOP', 'robbing the GUN SHOP pays out cash ($' + (robbed && robbed.cash) + ')');
  const w = await A.wait(m => m.type === 'wanted' && m.id === A.id);
  ok(w.wanted === 2, 'robbery gives 2 wanted stars');
  const withCops = await A.wait(m => (m.type === 'npcs' && m.n.some(n => n[1] === 2)) || (m.type === 'dispatch' && m.target === A.id), 3000).catch(() => null);
  ok(!!withCops, 'cops are dispatched (' + (withCops ? (withCops.type === 'dispatch' ? 'police car on the way' : withCops.n.filter(n => n[1] === 2).length + ' cops') : 'none') + ')');
  A.clear();
  A.send({ type: 'rob', id: keeper[0] });
  const closed = await A.wait(m => m.type === 'robStatus' && m.closed, 2000).catch(() => null);
  ok(!!closed, 'a robbed store is closed for a while (' + (closed && closed.closed) + 's)');
  // --- shoot the SNAX clerk (stationary) -> NPC damage + death + wanted
  const sx = map.shops.find(s => s.name === 'SNAX');
  const clerk = shops.find(n => Math.abs(n[2] - sx.keeper[0]) < 0.1);
  const st2 = [sx.keeper[0], 1.6, sx.keeper[2] + 3];
  await walk(A, stand, st2);
  A.clear();
  const hy = sx.keeper[1] + 1.55, dv = [0, hy - 1.6, -3]; const dl = Math.hypot(...dv);
  for (let i = 0; i < 3; i++) { A.send({ type: 'shoot', w: 'pistol', o: st2, d: [dv.map(v => v / dl)] }); await sleep(260); }
  const hit = A.msgs.find(m => m.type === 'npcHit' && m.id === clerk[0]);
  ok(hit && hit.head, 'bullets hit NPCs (server hit detection, headshot)');
  const die = await A.wait(m => m.type === 'npcDie' && m.id === clerk[0], 2000).catch(() => null);
  ok(die && die.by === A.id, 'NPCs can be eliminated');
  const w3 = await A.wait(m => m.type === 'wanted' && m.id === A.id && m.wanted === 3, 2000).catch(() => null);
  ok(!!w3, 'killing a civilian raises wanted level to 3');
  // --- cops respond: at 3 stars they shoot from a distance and try to cuff you up close
  const copAct = await A.wait(m => m.type === 'npcShot' || m.type === 'arrestAttempt', 25000).catch(() => null);
  ok(!!copAct, 'cops chase you and ' + (copAct ? (copAct.type === 'npcShot' ? 'open fire' : 'try to arrest you') : 'do nothing'));
  if (copAct && copAct.type === 'npcShot') {
    const copDmg = await A.wait(m => (m.type === 'dmg' && m.id === A.id && m.w === 'cop') || m.type === 'arrestCut', 25000).catch(() => null);
    if (copDmg && copDmg.type === 'arrestCut') console.log('  SKIP cop damage check (cuffed before a bullet landed)');
    else ok(!!copDmg, 'cop bullets damage the wanted player (' + (copDmg ? copDmg.amt : 0) + ')');
  }
  const jailed = () => A.msgs.some(m => m.type === 'arrestCut');
  // --- bounty: B eliminates wanted A
  B.clear();
  await walk(B, [gs.keeper[0] + 6, 1.6, gs.keeper[2] + 16], [st2[0], 1.6, st2[2] + 4]);
  await sleep(300);
  let killed = null;
  for (let i = 0; i < 12 && !killed; i++) {
    const a = A.msgs.filter(m => m.type === 'respawn' && m.id === A.id).length;
    B.send({ type: 'shoot', w: 'pistol', o: [st2[0], 1.6, st2[2] + 3.6], d: [[0, 0, -1]] });
    await sleep(260);
    killed = B.msgs.find(m => m.type === 'kill' && m.victim === A.id);
  }
  if (jailed()) { console.log('  SKIP bounty checks (an NPC cop arrested the robber and sent them to prison first)'); console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL NPC TESTS PASSED'); process.exit(failures ? 1 : 0); }
  ok(killed, 'wanted player can be taken down by another player');
  const bScore = killed && killed.scores.p.find(p => p[0] === B.id);
  // if the cops took the robber down first, their stars were cleared and there is no bounty to pay
  const copsFirst = A.msgs.some(m => m.type === 'kill' && m.victim === A.id && m.w === 'cop') || B.msgs.some(m => m.type === 'kill' && m.victim === A.id && m.w === 'cop');
  if (copsFirst && !(bScore && bScore[3] > 0)) console.log('  SKIP bounty check (the cops got the robber first this run)');
  else ok(bScore && bScore[3] >= 300, 'bounty cash paid for eliminating a wanted player ($' + (bScore && bScore[3]) + ')');
  const cleared = await A.wait(m => m.type === 'wanted' && m.id === A.id && m.wanted === 0, 2000).catch(() => null);
  ok(!!cleared, 'dying clears your wanted stars');
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL NPC TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
