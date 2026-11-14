// Holiday event (in-process): the dates, 12 gifts a day in reachable spots, opening one (cash / XP / the Santa Suit),
// once per player per day, too far = no, off season = no gifts, a new day = new gifts, saved.
import { Room } from '../server/room.js';
import { seasonActive, giftsFor, GIFTS_PER_DAY, SANTA_OUTFIT, rollGift } from '../public/shared/season.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('SNOW', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
console.log('CITY CHAOS server test 26 (holiday event) - in-process');
const at = (s) => Date.parse(s + 'T20:00:00Z');
ok(seasonActive(at('2026-12-01')) && seasonActive(at('2026-12-25')) && seasonActive(at('2027-01-05')), 'on from Dec 1 to Jan 5');
ok(!seasonActive(at('2026-11-30')) && !seasonActive(at('2027-01-06')) && !seasonActive(at('2026-07-04')), 'off the rest of the year');
const S = room.season;
S.set(false);
const A = room.addPlayer(mk(), { name: 'Elf' }), B = room.addPlayer(mk(), { name: 'Grinch' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B);
ok(last(A, 'season').on === 0, 'off season: no event');
S.set(true);
const sm = last(A, 'season');
ok(sm.on === 1 && sm.gifts.length === GIFTS_PER_DAY, `turning it on: ${GIFTS_PER_DAY} gifts`);
ok(S.spots.length > 40, `plenty of hiding spots around the city (${S.spots.length})`);
ok(sm.gifts.every(g => g[3] < 250), 'none in the prison');
ok(JSON.stringify(giftsFor('2026-12-24', S.spots)) !== JSON.stringify(giftsFor('2026-12-25', S.spots)), 'different spots every day');
const [id, x, y, z] = sm.gifts[0];
pose(A, x + 8, y + 1.6, z); room.handle(A, { type: 'gift', id });
ok(!last(A, 'gift'), 'too far away: nothing');
pose(A, x + 1, y + 1.6, z);
const c0 = A.cash, x0 = A.prof.xp;
const realR = Math.random; Math.random = () => 0.6;
room.handle(A, { type: 'gift', id });
const g1 = last(A, 'gift');
ok(g1 && g1.prize.kind === 'cash' && A.cash === c0 + g1.prize.cash && g1.left === GIFTS_PER_DAY - 1, `opened a gift: +$${g1 && g1.prize.cash}`);
room.handle(A, { type: 'gift', id });
ok(A.client.msgs.filter(m => m.type === 'gift').length === 1 && /already/.test(last(A, 'pMsg').text), 'each gift only once a day');
pose(B, x + 1, y + 1.6, z); room.handle(B, { type: 'gift', id });
ok(!!last(B, 'gift'), 'but every player can open it');
// XP gift
const [id2, x2, y2, z2] = sm.gifts[1]; Math.random = () => 0.2; pose(A, x2, y2 + 1.6, z2); room.handle(A, { type: 'gift', id: id2 });
ok(last(A, 'gift').prize.kind === 'xp' && A.prof.xp > x0, 'some gifts are XP');
// the Santa Suit
const [id3, x3, y3, z3] = sm.gifts[2]; Math.random = () => 0.01; pose(A, x3, y3 + 1.6, z3); room.handle(A, { type: 'gift', id: id3 });
ok(last(A, 'gift').prize.kind === 'santa' && A.prof.wardrobe.includes(SANTA_OUTFIT) && last(A, 'wardrobe').owned.includes(SANTA_OUTFIT), 'a rare gift: the SANTA SUIT (yours to wear)');
const [id4, x4, y4, z4] = sm.gifts[3]; pose(A, x4, y4 + 1.6, z4); room.handle(A, { type: 'gift', id: id4 });
ok(last(A, 'gift').prize.kind === 'cash' && last(A, 'gift').prize.cash === 500, 'already have the suit: $500 instead');
Math.random = realR;
room.handle(A, { type: 'cosmetics', cos: { outfit: SANTA_OUTFIT } }); ok(A.cos.outfit === SANTA_OUTFIT, 'wear it');
room.handle(B, { type: 'cosmetics', cos: { outfit: SANTA_OUTFIT } }); ok(B.cos.outfit === 0, 'someone without it can\'t');
let r = 0; const kinds = {}; for (let i = 0; i < 1000; i++) { const k = rollGift(i / 1000).kind; kinds[k] = (kinds[k] || 0) + 1; }
ok(kinds.santa === 50 && kinds.xp === 300 && kinds.cash === 650, `odds: 5% Santa Suit, 30% XP, 65% cash`);
// new day
A.prof.gifts.day = '2000-01-01'; ok(S.got(A).length === 0, 'a new day: new gifts to find');
room.saves.save(A, true);
ok(peekToken(last(A, 'save').token).wardrobe.includes(SANTA_OUTFIT), 'the Santa Suit is saved');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
