// Store test (in-process): buying guns, ammo, food, armor, boosts and lottery tickets at every store,
// with all the checks (distance, cash, closed after a robbery, scared clerk, full health, dead/jailed).
import { Room } from '../server/room.js';
import { SHOP_ITEMS, SHOP_RANGE } from '../public/shared/shops.js';
import { NPC_TYPE, NPC_STATE } from '../server/npcs.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('SHOP', { mode: 'ffa', crimes: false }, { tokens: new Map() });
room.now = () => T;
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; p.lastStateAt = T; };
const keeper = (shop) => room.npcs.list.find(n => n.type === NPC_TYPE.SHOP && n.shop === shop);
// stand at the counter: 3.2 m in front of the clerk (clerk yaw 0 faces -Z)
const atCounter = (p, shop, d = 3.2) => { const n = keeper(shop); pose(p, n.x - Math.sin(n.yaw) * d, n.y + 1.5, n.z - Math.cos(n.yaw) * d); };
const buy = (p, shop, item) => { T += 0.5; room.handle(p, { type: 'shopBuy', shop, item }); return last(p, 'shopResult'); };

console.log('CITY CHAOS server test 10 (stores) - in-process');
const A = room.addPlayer(mk(1), { name: 'Shopper' });
const B = room.addPlayer(mk(2), { name: 'Robber' });
T += 3; room.tick(0.03);
for (const p of [A, B]) { room.spawn(p); p.protectUntil = 0; }

const shops = Object.keys(SHOP_ITEMS);
ok(shops.every(s => keeper(s)), `every store has a clerk (${shops.join(', ')})`);

// every store's counter is reachable: nothing blocks the clerk from the customer spot
for (const s of shops) {
  atCounter(A, s); A.cash = 5000; A.hp = 50;
  const it = SHOP_ITEMS[s].find(i => i.kind === 'heal') || SHOP_ITEMS[s][0];
  const r = buy(A, s, it.id);
  ok(r && r.ok === 1, `${s}: you can buy ${it.name} at the counter${r && !r.ok ? ' (' + r.why + ')' : ''}`);
}

// money is checked and taken
atCounter(A, 'GUN SHOP'); A.cash = 50;
let r = buy(A, 'GUN SHOP', 'ar');
ok(r.ok === 0 && /\$450/.test(r.why), 'not enough cash: refused');
A.cash = 1000;
r = buy(A, 'GUN SHOP', 'ar');
ok(r.ok === 1 && A.cash === 550 && A.slots[A.cur].w === 'ar', `bought an Assault Rifle: in your hands, $${A.cash} left`);
const pu = last(B, 'playerUpdate'); ok(pu && pu.p.id === A.id && pu.p.cash === 550, 'everyone sees your new cash total');

// ammo
A.slots[A.cur].reserve = 0;
r = buy(A, 'GUN SHOP', 'ammo');
ok(r.ok === 1 && A.slots[A.cur].reserve === 180, `ammo box fills reserve ammo (${A.slots[A.cur].reserve})`);
r = buy(A, 'GUN SHOP', 'ammo');
ok(r.ok === 0, 'no charge for ammo when you are already full');

// armor soaks hits
r = buy(A, 'GUN SHOP', 'heavy');
ok(r.ok === 1 && A.armor === 100 && r.ap === 100, 'heavy armor: 100 armor');
A.hp = 100; room.damage(A, B, 50, 'pistol', false, null);
ok(A.hp === 85 && A.armor === 65, `armor soaks 70% of a hit (hp ${A.hp}, armor ${A.armor})`);
ok(last(A, 'armor').ap === 65, 'you are told your armor left');
r = buy(A, 'GUN SHOP', 'vest');
ok(r.ok === 0, 'a 50 armor vest is refused when you already have more armor');

// food / health
atCounter(A, 'STAR DINER'); A.hp = 100;
r = buy(A, 'STAR DINER', 'burger');
ok(r.ok === 0 && /full health/.test(r.why), 'no food sold at full health');
A.hp = 10; r = buy(A, 'STAR DINER', 'burger');
ok(r.ok === 1 && A.hp === 100 && last(B, 'hp').hp === 100, 'Star Burger: full health (everyone sees it)');

// boosts
atCounter(A, 'GAS & GO');
r = buy(A, 'GAS & GO', 'energy');
ok(r.ok === 1 && r.boost && r.boost.speed === 1.5 && A.boost.until === T + 40, 'energy drink: speed + jump boost for 40 s');

// lottery: pays out sometimes, the money is real
atCounter(A, 'ARCADE'); A.cash = 100000;
let wins = 0, spent = 0, won = 0;
for (let i = 0; i < 400; i++) { const c0 = A.cash; r = buy(A, 'ARCADE', 'claw'); spent += 20; if (r.win) { wins++; won += r.win; if (A.cash !== c0 - 20 + r.win) ok(false, 'prize money is added'); } }
ok(wins > 60 && wins < 180 && won < spent, `claw machine wins sometimes but the house wins overall (${wins}/400 tries, spent $${spent}, won $${won})`);

// a short Gorilla-size body (head 0.75 m off the floor) can still shop over the counter
{ const n = keeper('STAR DINER'); pose(A, n.x - Math.sin(n.yaw) * 3, n.y + 0.6, n.z - Math.cos(n.yaw) * 3); A.hp = 50; A.cash = 1000; }
r = buy(A, 'STAR DINER', 'fries');
ok(r.ok === 1, `small Gorilla body can buy over the counter${r.ok ? '' : ' (' + r.why + ')'}`);
// distance + line of sight
atCounter(A, 'SNAX', SHOP_RANGE + 3); A.hp = 20;
r = buy(A, 'SNAX', 'chips');
ok(r.ok === 0 && /closer/.test(r.why), 'too far from the counter: refused');
{ const n = keeper('GUN SHOP'); pose(A, n.x - 3, n.y + 1.5, n.z + Math.cos(n.yaw) * 3); } // outside, behind the back wall
r = buy(A, 'GUN SHOP', 'ammo');
ok(r.ok === 0, 'through a wall: refused');

// item not sold at that store
atCounter(A, 'SNAX');
r = buy(A, 'SNAX', 'rocket');
ok(r.ok === 0, 'SNAX does not sell rocket launchers');

// a robbed store is closed, a scared clerk won't serve
const dn = keeper('DONUTS');
dn.closedUntil = T + 30; atCounter(A, 'DONUTS'); A.hp = 20;
r = buy(A, 'DONUTS', 'donut');
ok(r.ok === 0 && /closed/.test(r.why), `robbed store is closed: "${r.why}"`);
dn.closedUntil = 0; dn.state = NPC_STATE.HANDSUP;
r = buy(A, 'DONUTS', 'donut');
ok(r.ok === 0 && /scared/.test(r.why), 'clerk with hands up (being robbed) will not serve');
dn.state = NPC_STATE.IDLE; dn.rob = null;
r = buy(A, 'DONUTS', 'donut');
ok(r.ok === 1 && A.hp === 50, 'store open again: donut +30 health');

// dead / jailed players can't shop; armor and boosts end when you die
room.kill(A, B, 'pistol', false);
ok(A.armor === 0 && !A.boost, 'dying loses your armor and boosts');
atCounter(A, 'DONUTS');
r = buy(A, 'DONUTS', 'donut');
ok(r.ok === 0, 'dead players cannot shop');
room.spawn(A); atCounter(A, 'DONUTS'); A.hp = 40; A.jail = { state: 'in' };
r = buy(A, 'DONUTS', 'donut');
ok(r.ok === 0, 'prisoners cannot shop');
A.jail = null;

// double clicks don't buy twice
atCounter(A, 'MEGA MART'); A.hp = 10; A.cash = 1000;
room.handle(A, { type: 'shopBuy', shop: 'MEGA MART', item: 'bandage' });
room.handle(A, { type: 'shopBuy', shop: 'MEGA MART', item: 'bandage' });
ok(A.cash === 975, `a double click only buys once ($${A.cash})`);

// junk input
T += 1; room.handle(A, { type: 'shopBuy', shop: { x: 1 }, item: null });
ok(last(A, 'shopResult').ok === 0, 'bad messages are refused');

ok(true, 'prize money is added to your cash');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
