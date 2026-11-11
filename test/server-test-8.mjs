// Golden Sniper test (in-process, controllable clock): unlock after 5 arrests, buying at the GUN SHOP,
// one per game, secret (no public messages), lock-on headshots that land when the bullet arrives.
// Run: node test/server-test-8.mjs   (no server needed)
import { Room } from '../server/room.js';
import { GOLDEN } from '../public/shared/weapons.js';
import { NPC_TYPE } from '../server/npcs.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('GOLD1', { mode: 'ffa', crimes: false }, { tokens: new Map() });
room.now = () => T;
const msgs = (p, type) => p.client.msgs.filter(m => m.type === type);
const last = (p, type) => { const a = msgs(p, type); return a[a.length - 1]; };
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; p.lastStateAt = T; };
const counter = room.gold.counter;
const atCounter = (p) => pose(p, counter[0] + 0.5, counter[1] + 1.5, counter[2] + 0.4);
const leaks = (p) => p.client.msgs.filter(m => /^gold/.test(m.type) || (['kill', 'dmg', 'npcDie', 'feed', 'notice'].includes(m.type) && m.w === 'golden'));
function shoot(p, d, lock) {
  p.lastShot = -100; p.reloadingUntil = 0;
  const s = p.slots[p.cur]; if (s) s.mag = Math.max(s.mag, 1);
  room.handle(p, { type: 'shoot', w: s.w, o: p.pose.h.slice(0, 3), d: [d], lock });
}
const fly = (secs) => { for (let s = 0; s < secs; s += 0.05) { T += 0.05; room.gold.tick(); } };

console.log('CITY CHAOS server test 8 (Golden Sniper) - in-process');
ok(!!counter, 'the GUN SHOP counter exists');
const C = room.addPlayer(mk(1), { name: 'Officer', role: 'cop' });
const A = room.addPlayer(mk(2), { name: 'Robber' });
const D = room.addPlayer(mk(3), { name: 'Deputy', role: 'cop' });
const E = room.addPlayer(mk(4), { name: 'Bystander' });
T += 3; room.tick(0.03);
for (const p of [C, A, D, E]) { room.spawn(p); p.protectUntil = 0; }

// ---- unlock: 5 arrests, told only to that cop
for (let i = 0; i < GOLDEN.arrests; i++) {
  if (i === GOLDEN.arrests - 1) ok(!msgs(C, 'goldInfo').length, `nothing is said before the ${GOLDEN.arrests}th arrest`);
  A.wanted = 1; A.jail = null; A.holding = null; A.alive = true;
  pose(A, 10, 1.6, 10); pose(C, 11, 1.6, 10);
  room.handle(C, { type: 'arrest', id: A.id });
}
ok(C.arrests === GOLDEN.arrests, `arrests are counted (${C.arrests})`);
const info = last(C, 'goldInfo');
ok(info && info.unlocked === 1 && info.first === 1 && info.avail === 1, 'the cop gets a private unlock message');
ok(!leaks(A).length && !leaks(D).length && !leaks(E).length, 'nobody else hears anything about the Golden Sniper');
A.holding = null; A.jail = null;

// ---- buying
pose(A, 10, 1.6, 10); room.spawn(A); A.protectUntil = 0;
atCounter(A); A.cash = 5000; room.handle(A, { type: 'buyGold' });
ok(last(A, 'goldBuy').ok === 0 && room.gold.owner === null, 'a civilian can\'t buy it');
pose(C, counter[0] + 30, 1.6, counter[2]); C.cash = 5000; room.handle(C, { type: 'buyGold' });
ok(last(C, 'goldBuy').ok === 0, 'you have to be at the GUN SHOP counter');
atCounter(C); C.cash = GOLDEN.price - 1; room.handle(C, { type: 'buyGold' });
ok(last(C, 'goldBuy').ok === 0 && /\$/.test(last(C, 'goldBuy').why), 'you need enough cash');
C.cash = GOLDEN.price + 100; room.handle(C, { type: 'buyGold' });
ok(last(C, 'goldBuy').ok === 1 && room.gold.owner === C.id, 'the unlocked cop buys it');
ok(C.cash === 100, 'the price is taken from your cash');
ok(C.slots.some(s => s.w === 'golden') && C.slots[C.cur].w === 'golden', 'the Golden Sniper is in your hands');
ok(!leaks(A).filter(m => m.type !== 'goldBuy').length && !leaks(E).length, 'still a secret after buying');
// one per game
D.arrests = GOLDEN.arrests; atCounter(D); D.cash = 5000; room.handle(D, { type: 'buyGold' });
ok(last(D, 'goldBuy').ok === 0 && /sold out/i.test(last(D, 'goldBuy').why), 'only one per game: the next cop finds it sold out');
// can't be swapped away by a pickup when your hands are full
room.giveWeapon(C, 'ar', false); room.giveWeapon(C, 'shotgun', false); C.cur = C.slots.findIndex(s => s.w === 'golden');
room.giveWeapon(C, 'smg', true);
ok(C.slots.some(s => s.w === 'golden'), 'picking up a gun with full hands never throws the Golden Sniper away');
C.cur = C.slots.findIndex(s => s.w === 'golden');

// ---- lock-on headshot (high above the city: nothing in the way)
pose(C, 0, 60, 0); pose(A, 0, 60, -80); A.alive = true; A.hp = 100; A.protectUntil = 0;
const off = [Math.sin(0.08), 0, -Math.cos(0.08)]; // ~4.6 degrees off target
shoot(C, off, ['p', A.id]);
const gs = last(C, 'goldShot');
ok(gs && gs.kind === 'p' && gs.id === A.id && gs.fly > 0.5, `locked onto the player (bullet flies ${gs && gs.fly}s)`);
ok(A.alive, 'damage waits until the bullet arrives');
const pub = last(E, 'shot');
ok(pub && pub.w === 'golden' && pub.e.length === 1, 'other players see the shot');
fly(gs.fly + 0.1);
ok(!A.alive, 'automatic headshot kills when the bullet lands');
const kC = last(C, 'kill'), kE = last(E, 'kill');
ok(kC && kC.w === 'golden' && kC.head, 'the shooter\'s kill feed shows the Golden Sniper headshot');
ok(kE && kE.w === 'sniper', 'everyone else sees a normal sniper kill (secret)');
// a lock aimed way off is rejected and the shot just goes straight
room.spawn(A); A.protectUntil = 0; pose(A, 0, 60, -80);
shoot(C, [Math.sin(0.4), 0, -Math.cos(0.4)], ['p', A.id]);
ok(last(C, 'goldShot').kind === 'w', 'a lock aimed far from the target is refused by the server');
fly(3); ok(A.alive, 'and the target is not hit');
// no lock, dead-on body shot still hits
shoot(C, [0, -0.0075, -1], null);
ok(last(C, 'goldShot').kind === 'p', 'a straight shot hits normally without a lock');
fly(3); ok(!A.alive || A.hp < 100, 'straight hit does damage');

// ---- NPC lock
const ped = room.npcs.list.find(n => n.type === NPC_TYPE.PED && !n.prison && n.state !== 5);
if (ped) {
  ped.x = 0; ped.y = 58; ped.z = -50; ped.hist = []; ped.hp = 100;
  shoot(C, [0, 0, -1], ['n', ped.id]);
  ok(last(C, 'goldShot').kind === 'n', 'locks onto NPCs too');
  fly(3);
  const dC = last(C, 'npcDie'), dE = last(E, 'npcDie');
  ok(dC && dC.id === ped.id && dC.w === 'golden' && dC.head, 'NPC headshot');
  ok(dE && dE.w === 'sniper', 'NPC kill shows as a normal sniper to others');
} else ok(false, 'found a pedestrian NPC to test');

// ---- the owner keeps it for the game, it frees up when they leave
room.kill(C, null, 'fall', false); room.spawn(C);
ok(C.slots.some(s => s.w === 'golden') && C.slots.some(s => s.w === 'pistol'), 'the owner gets it back every respawn');
D.client.msgs.length = 0;
room.removePlayer(C.id);
ok(room.gold.owner === null && last(D, 'goldInfo') && last(D, 'goldInfo').avail === 1, 'when the owner leaves, it\'s for sale again (told privately)');
ok(!msgs(E, 'goldInfo').length, 'players who never unlocked it are not told');
room.handle(D, { type: 'buyGold' });
ok(last(D, 'goldBuy').ok === 1, 'the next unlocked cop can buy it');

console.log(failures ? `\n${failures} FAILED` : '\nALL GOLDEN SNIPER TESTS PASSED');
process.exit(failures ? 1 : 0);
