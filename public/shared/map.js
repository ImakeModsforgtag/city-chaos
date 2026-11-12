// CITY CHAOS - procedural (deterministic) city map.
// The same data is used by the server (bullet occlusion, rockets) and the client
// (rendering + collision), so both always agree on where walls are.
//
// Coordinates: X = east, Z = south, Y = up. The city spans -120..120 on X and Z.
// A 4x4 grid of 44m city blocks separated by 12m roads.

const BLOCK_STARTS = [-106, -50, 6, 62];
const BLOCK = 44;
export const WORLD_HALF = 120;

const PALETTE = {
  asphalt: 0x3d4250, sidewalk: 0xc9c3b8, curb: 0xe8e2d6, grass: 0x6fcf5b, grassDark: 0x58b84a,
  line: 0xfff27a, white: 0xffffff, trunk: 0x8a5a3b, dirt: 0xb98b5e, water: 0x4fc3f7,
  concrete: 0xa8a8b3, concreteDark: 0x7d7d8c, metal: 0x8f9bb3, rust: 0xb5653a, wood: 0xc28a4e,
  court: 0xff8a3d, courtLine: 0xfff5e1, police: 0x3b6fd8, policeTrim: 0xffffff,
  shop1: 0xff6b9a, shop2: 0x5ad1ff, shop3: 0xffd23f, mart: 0x9b6bff,
  apt1: 0xff9f43, apt2: 0x2ed8a3, apt3: 0xee5a8a, tower1: 0x6c7ae0, tower2: 0x48c9b0,
  tower3: 0xf8a5c2, tower4: 0x778beb, abandoned: 0x9c8b7a, abandonedDark: 0x6e6157,
  gas: 0xe84545, gasTrim: 0xfff0f0, warehouse: 0x8ab17d, container1: 0xe74c3c,
  container2: 0x3498db, container3: 0xf1c40f, container4: 0x2ecc71, scaffold: 0xffb142,
  boundary: 0x5c6bc0, floorIn: 0xd9c9a3, garage: 0x8c8f9e, garageFloor: 0x6b6e7c, roof: 0x8e8e9e,
  crate: 0xc98a3c, rareCrate: 0xff3b6b, diner: 0x4ecdc4
};

import { buildPrison } from './prison.js';
import { BLOCK_DISTRICT, SIGNALS, rng } from './cityKit.js';

// block edges that get no mid-block street lamp (a driveway / car exit crosses the curb there)
const NO_MID_LAMP = { '0,2,s': 1, '2,1,s': 1, '3,1,n': 1, '3,1,s': 1, '1,3,s': 1, '1,3,n': 1 };

export function buildMap() {
  const boxes = [];      // { min:[x,y,z], max:[x,y,z], c:color, s:solid }
  const ladders = [];    // climb zones for desktop / joystick players
  const windows = [];    // decorative window grids on solid buildings
  const props = [];      // special-shaped visuals (trees, lamps, cars, hoops...)
  const pickups = [];    // weapon / ammo / health spawns
  const spawns = [];     // player spawn points  { p:[x,y,z], team:-1|0|1 }
  const labels = [];     // signs { text, p:[x,y,z], rotY, color }
  const policeLot = [], copSpawns = [], policeExit = [];
  let holding = null;   // police station holding cells (short arrests, under 3 stars)
  const shops = [];      // robbable stores { name, keeper:[x,y,z], yaw } (yaw 0 = facing -Z)
  const buildings = [];  // every building, so the client can add facades (windows, frames, storefronts, roofs)
  const openings = [];   // door/window holes in enterable buildings (client adds frames + sills)
  const trafficLights = [], stopSigns = [], furniture = [];

  const box = (x0, y0, z0, x1, y1, z1, c, solid = true) => {
    boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
                 max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], c, s: solid });
  };
  const hbox = (x0, y0, z0, x1, y1, z1) => { box(x0, y0, z0, x1, y1, z1, 0, true); boxes[boxes.length - 1].h = 1; };
  // horizontal slab with rectangular holes {x0,z0,x1,z1}
  const slab = (x0, z0, x1, z1, y0, y1, c, holes = [], solid = true) => {
    const xs = new Set([x0, x1]);
    for (const h of holes) { if (h.x0 > x0 && h.x0 < x1) xs.add(h.x0); if (h.x1 > x0 && h.x1 < x1) xs.add(h.x1); }
    const xa = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < xa.length - 1; i++) {
      const sa = xa[i], sb = xa[i + 1];
      const cover = holes.filter(h => h.x0 <= sa + 1e-6 && h.x1 >= sb - 1e-6)
        .map(h => [Math.max(h.z0, z0), Math.min(h.z1, z1)]).filter(v => v[1] > v[0])
        .sort((a, b) => a[0] - b[0]);
      let z = z0;
      for (const [ha, hb] of cover) { if (ha > z) box(sa, y0, z, sb, y1, ha, c, solid); z = Math.max(z, hb); }
      if (z < z1) box(sa, y0, z, sb, y1, z1, c, solid);
    }
  };
  const ladder = (x0, z0, x1, z1, y0, y1, c = PALETTE.metal) => {
    // visual rails (thin, non-solid) + desktop climb zone
    box(x0, y0, z0, x1, y1, z1, c, false);
    ladders.push({ min: [Math.min(x0, x1) - 0.35, y0, Math.min(z0, z1) - 0.35],
                   max: [Math.max(x0, x1) + 0.35, y1 + 0.6, Math.max(z0, z1) + 0.35] });
  };
  const pickup = (kind, weapon, x, y, z, respawn) => {
    pickups.push({ id: pickups.length, kind, weapon: weapon || null, p: [x, y, z],
      respawn: respawn || (kind === 'weapon' ? (weapon === 'rocket' ? 90 : weapon === 'sniper' ? 45 : 25) : 20) });
  };
  const crate = (x, y, z, rare = false) => {
    box(x - 0.5, y, z - 0.5, x + 0.5, y + 0.8, z + 0.5, rare ? PALETTE.rareCrate : PALETTE.crate);
    props.push({ type: 'crateTrim', x, y, z, rare });
    return y + 0.8;
  };
  const solidBuilding = (x0, z0, w, d, h, c, roofAccess = false, o = {}) => {
    box(x0, 0, z0, x0 + w, h, z0 + d, c);
    box(x0, h, z0, x0 + w, h + 0.8, z0 + 0.3, c); box(x0, h, z0 + d - 0.3, x0 + w, h + 0.8, z0 + d, c);
    box(x0, h, z0, x0 + 0.3, h + 0.8, z0 + d, c); box(x0 + w - 0.3, h, z0, x0 + w, h + 0.8, z0 + d, c);
    box(x0 + 0.3, h, z0 + 0.3, x0 + w - 0.3, h + 0.05, z0 + d - 0.3, o.roofColor || PALETTE.roof, false);
    const b = { kind: 'solid', x0, z0, x1: x0 + w, z1: z0 + d, h, top: h + 0.05, c, trim: o.trim || 0xf4efe6, seed: buildings.length * 7 + 3,
      style: o.style || (h >= 24 ? 'office' : h >= 11 ? 'apartment' : 'shop'), front: o.front, sign: o.sign, roofKit: o.roofKit !== false, y0: o.y0 || 0 };
    buildings.push(b);
    if (o.sign) labels.push({ text: o.sign, p: o.signPos, rotY: o.signRot || 0, color: o.signColor || '#ffffff', bg: o.signBg || '#222244', neon: o.neon });
    if (o.awning) for (const a of o.awning) awningOn(b, a.side, a.c, a.stripe, a.y, a.from, a.to);
    return b;
  };
  // striped awning over a storefront. Solid, so it's a good handhold for gorilla climbers.
  // side n/s/e/w = which face of building b; from/to = part of that face (0..1)
  const awningOn = (b, side, c, stripe, y = 2.7, from = 0.08, to = 0.92) => {
    const dep = 1.3, ax = side === 'n' || side === 's';
    const a0 = (ax ? b.x0 + (b.x1 - b.x0) * from : b.z0 + (b.z1 - b.z0) * from), a1 = (ax ? b.x0 + (b.x1 - b.x0) * to : b.z0 + (b.z1 - b.z0) * to);
    const base = side === 'n' ? b.z0 : side === 's' ? b.z1 : side === 'w' ? b.x0 : b.x1;
    if (side === 'n') box(a0, y, base - dep, a1, y + 0.16, base, c);
    if (side === 's') box(a0, y, base, a1, y + 0.16, base + dep, c);
    if (side === 'w') box(base - dep, y, a0, base, y + 0.16, a1, c);
    if (side === 'e') box(base, y, a0, base + dep, y + 0.16, a1, c);
    boxes[boxes.length - 1].v = 0; // drawn as a sloped striped canvas by the client
    props.push({ type: 'awning', side, a0, a1, base, y, dep, c, stripe: stripe || 0xffffff });
  };

  // ------------------------------------------------------------------ hollow buildings
  // Enterable building with floors, door + window openings, stairwells and roof access.
  // doors: [{ side:'n'|'s'|'e'|'w', at, width }] (ground floor). Stair runs +Z along inner west wall.
  const hollow = (x0, z0, w, d, o) => {
    const floors = o.floors || 1, fh = o.fh || 3.4, c = o.color, t = 0.3;
    const trim = o.trim || PALETTE.white;
    const doors = o.doors || [];
    const winEvery = o.winEvery || 3.6;
    const sides = {
      n: { len: w, place: (a, b, y0, y1) => box(x0 + a, y0, z0, x0 + b, y1, z0 + t, c) },
      s: { len: w, place: (a, b, y0, y1) => box(x0 + a, y0, z0 + d - t, x0 + b, y1, z0 + d, c) },
      w: { len: d, place: (a, b, y0, y1) => box(x0, y0, z0 + a, x0 + t, y1, z0 + b, c) },
      e: { len: d, place: (a, b, y0, y1) => box(x0 + w - t, y0, z0 + a, x0 + w, y1, z0 + b, c) }
    };
    const stairX0 = x0 + t, stairX1 = x0 + t + 1.5;
    const steps = Math.ceil(fh / 0.3), rise = fh / steps, dep = 0.34, run = steps * dep;
    const stairZ0 = z0 + (o.stairOffset || 1.5);
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh, y1 = (f + 1) * fh;
      for (const key of Object.keys(sides)) {
        const s = sides[key];
        const ops = [];
        if (f === 0) for (const dr of doors) if (dr.side === key) ops.push({ a: dr.at, b: dr.at + dr.width, lo: 0, hi: dr.h || Math.min(2.7, fh - 0.3), door: 1 });
        if (f > 0 || o.groundWindows) {
          if (o.windows !== false) {
            for (let a = 1.6; a + 1.4 < s.len - 1.2; a += winEvery) {
              if (ops.some(op => a < op.b + 0.5 && a + 1.4 > op.a - 0.5)) continue;
              const broken = o.broken && ((f + Math.floor(a)) % 3 === 0);
              ops.push({ a, b: a + (broken ? 2.2 : 1.4), lo: broken ? 0.3 : 1.0, hi: Math.min(2.4, fh - 0.4) });
            }
          }
        }
        ops.sort((p, q) => p.a - q.a);
        for (const op of ops) openings.push({ side: key, x0, z0, w, d, a: op.a, b: op.b, y0: y0 + op.lo, y1: y0 + op.hi, door: !!op.door, trim, glass: !!o.glass && !op.door });
        let cur = 0;
        for (const op of ops) {
          if (op.a > cur) s.place(cur, op.a, y0, y1);
          if (op.lo > 0) s.place(op.a, op.b, y0, y0 + op.lo);
          s.place(op.a, op.b, y0 + op.hi, y1);
          cur = op.b;
        }
        if (cur < s.len) s.place(cur, s.len, y0, y1);
      }
      // floor slab (upper floors) with stairwell hole
      if (f > 0) slab(x0 + t, z0 + t, x0 + w - t, z0 + d - t, y0 - 0.25, y0, PALETTE.floorIn,
        o.stairs === false ? [] : [{ x0: stairX0, z0: stairZ0, x1: stairX1, z1: stairZ0 + run }]);
      else box(x0 + t, 0.0, z0 + t, x0 + w - t, 0.03, z0 + d - t, PALETTE.floorIn, false);
      // stairs from floor f to f+1 (last flight goes to roof if roofAccess)
      if (o.stairs !== false && (f < floors - 1 || o.roofAccess)) {
        for (let k = 1; k <= steps; k++) {
          const top = y0 + k * rise;
          box(stairX0, top - 0.22, stairZ0 + (k - 1) * dep, stairX1, top, stairZ0 + k * dep, o.stairColor || PALETTE.concreteDark);
        }
        // handrail wall on the open side, only for the upper half so people can walk around it
        box(stairX1, y0 + fh * 0.5, stairZ0, stairX1 + 0.1, y0 + fh * 0.5 + 0.9, stairZ0 + run * 0.55, trim, false);
      }
    }
    const H = floors * fh;
    // roof
    const roofHoles = o.roofAccess && o.stairs !== false ? [{ x0: stairX0, z0: stairZ0, x1: stairX1, z1: stairZ0 + run }] : [];
    slab(x0, z0, x0 + w, z0 + d, H, H + 0.3, o.roofColor || PALETTE.roof, roofHoles);
    box(x0, H + 0.3, z0, x0 + w, H + 1.2, z0 + 0.3, trim); box(x0, H + 0.3, z0 + d - 0.3, x0 + w, H + 1.2, z0 + d, trim);
    box(x0, H + 0.3, z0, x0 + 0.3, H + 1.2, z0 + d, trim); box(x0 + w - 0.3, H + 0.3, z0, x0 + w, H + 1.2, z0 + d, trim);
    // trim band between floors (purely visual)
    for (let f = 1; f < floors; f++) {
      const y = f * fh;
      box(x0 - 0.08, y - 0.12, z0 - 0.08, x0 + w + 0.08, y + 0.05, z0 + d + 0.08, trim, false);
    }
    if (o.sign) labels.push({ text: o.sign, p: o.signPos, rotY: o.signRot || 0, color: o.signColor || '#ffffff', bg: o.signBg || '#222244', neon: o.neon });
    const b = { kind: 'hollow', x0, z0, x1: x0 + w, z1: z0 + d, h: H, top: H + 0.3, c, trim, floors, fh, seed: buildings.length * 7 + 3, style: o.style || 'hollow',
      roofKit: o.roofKit !== false, hole: roofHoles[0] || null };
    buildings.push(b);
    if (o.awning) for (const a of o.awning) awningOn(b, a.side, a.c, a.stripe, a.y, a.from, a.to);
    return { H, fh, floor: (f) => f * fh, b };
  };

  // ------------------------------------------------------------------ ground, roads, garage
  const G = { x0: 10, z0: -46, x1: 46, z1: -10 };            // garage footprint (block 1,2)
  const rampHole = { x0: 10.3, z0: -19.6, x1: 13.8, z1: -10 };
  const stairHole = { x0: 42.4, z0: -30, x1: 44.4, z1: -24 };
  slab(-WORLD_HALF, -WORLD_HALF, WORLD_HALF, WORLD_HALF, -0.5, 0, PALETTE.asphalt, [rampHole, stairHole]);

  // (road markings, crosswalks, stop lines and manholes are drawn by the client: see js/engine/cityDecor.js)

  // City edge: a skyline of tall solid buildings instead of a flat wall (never lower than BH, so it still holds players in)
  const BH = 30;
  const skyR = rng(77), skyCols = [0x7e8ce0, 0x6fb7d9, 0xf29e7d, 0xb48ee0, 0x5fc9a8, 0xf2c46d, 0x8aa3c8, 0xe68aa8];
  const skyline = (horiz, fixed0, fixed1, from, to, face) => {
    let a = from;
    while (a < to - 0.01) {
      const wseg = Math.min(to - a, 10 + Math.floor(skyR() * 4) * 4), h = BH + Math.floor(skyR() * 6) * 4;
      const c = skyCols[Math.floor(skyR() * skyCols.length)];
      if (horiz) box(a, -0.5, fixed0, a + wseg, h, fixed1, c); else box(fixed0, -0.5, a, fixed1, h, a + wseg, c);
      buildings.push({ kind: 'skyline', horiz, a0: a, a1: a + wseg, f0: fixed0, f1: fixed1, face, h, c, trim: 0xf4efe6, seed: buildings.length * 7 + 3, style: skyR() < 0.5 ? 'office' : 'apartment' });
      a += wseg;
    }
  };
  skyline(true, -WORLD_HALF - 2, -WORLD_HALF, -WORLD_HALF - 2, WORLD_HALF + 2, 's');
  skyline(true, WORLD_HALF, WORLD_HALF + 2, -WORLD_HALF - 2, WORLD_HALF + 2, 'n');
  skyline(false, -WORLD_HALF - 2, -WORLD_HALF, -WORLD_HALF, WORLD_HALF, 'e');
  skyline(false, WORLD_HALF, WORLD_HALF + 2, -WORLD_HALF, WORLD_HALF, 'w');

  // traffic signals: one pole per approach, on the far right corner of each of the 9 inner intersections
  for (const [ix, iz] of SIGNALS) {
    for (const [px, pz, axis, yaw, ax, az] of [
      [ix - 6.6, iz + 6.6, 'z', Math.PI, ix - 3, iz + 6.6],      // southbound traffic (lane x = ix-3)
      [ix + 6.6, iz - 6.6, 'z', 0, ix + 3, iz - 6.6],            // northbound
      [ix - 6.6, iz - 6.6, 'x', Math.PI / 2, ix - 6.6, iz - 3],  // westbound
      [ix + 6.6, iz + 6.6, 'x', -Math.PI / 2, ix + 6.6, iz + 3]  // eastbound
    ]) {
      trafficLights.push({ x: px, z: pz, axis, yaw, ax, az, ix, iz });
      box(px - 0.13, 0.15, pz - 0.13, px + 0.13, 6.4, pz + 0.13, 0x3a3f4b);
    }
  }
  // stop signs where the inner roads meet the outer ring road
  for (const c of [-56, 0, 56]) {
    for (const [x, z, yaw] of [[c + 6.6, -105.4, Math.PI], [c - 6.6, 105.4, 0], [-105.4, c - 6.6, -Math.PI / 2], [105.4, c + 6.6, Math.PI / 2]]) {
      stopSigns.push({ x, z, yaw }); box(x - 0.06, 0.15, z - 0.06, x + 0.06, 2.6, z + 0.06, 0x9aa3b5);
    }
  }
  const nearSignal = (x, z) => trafficLights.some(t => Math.hypot(t.x - x, t.z - z) < 2.5) || stopSigns.some(t => Math.hypot(t.x - x, t.z - z) < 2);

  // sidewalks (raised 0.15) for every block
  const lampAt = (x, z, dir, style) => { props.push({ type: 'lamp', x, y: 0.15, z, dir, style }); box(x - 0.12, 0.15, z - 0.12, x + 0.12, 5.5, z + 0.12, PALETTE.metal, true); };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x0 = BLOCK_STARTS[c], z0 = BLOCK_STARTS[r], dist = BLOCK_DISTRICT[r][c];
    const holes = (r === 1 && c === 2) ? [rampHole, stairHole] : [];
    slab(x0, z0, x0 + BLOCK, z0 + BLOCK, 0, 0.15, PALETTE.sidewalk, holes);
    const style = dist === 'downtown' || dist === 'shopping' ? 'deco' : dist === 'park' || dist === 'residential' ? 'lantern' : 'cobra';
    // corner lamps (skipped where a traffic signal stands) + one in the middle of each side
    for (const [lx, lz, dir] of [[1, 1, 'n'], [BLOCK - 1, 1, 'e'], [1, BLOCK - 1, 'w'], [BLOCK - 1, BLOCK - 1, 's']]) if (!nearSignal(x0 + lx, z0 + lz)) lampAt(x0 + lx, z0 + lz, dir, style);
    for (const [lx, lz, dir, side] of [[BLOCK / 2, 0.6, 'n', 'n'], [BLOCK / 2, BLOCK - 0.6, 's', 's'], [0.6, BLOCK / 2, 'w', 'w'], [BLOCK - 0.6, BLOCK / 2, 'e', 'e']]) {
      if (NO_MID_LAMP[`${r},${c},${side}`]) continue;
      lampAt(x0 + lx, z0 + lz, dir, style);
    }
  }
  const Y = 0.15; // sidewalk top

  // Underground parking garage
  box(G.x0, -5, G.z0, G.x1, -4.5, G.z1, PALETTE.garageFloor);
  box(G.x0, -4.5, G.z0, G.x1, -0.5, G.z0 + 0.3, PALETTE.garage);
  box(G.x0, -4.5, G.z1 - 0.3, G.x1, -0.5, G.z1, PALETTE.garage);
  box(G.x0, -4.5, G.z0, G.x0 + 0.3, -0.5, G.z1, PALETTE.garage);
  box(G.x1 - 0.3, -4.5, G.z0, G.x1, -0.5, G.z1, PALETTE.garage);
  // ramp (stepped so desktop players can walk; VR players can push down it)
  for (let k = 1; k <= 15; k++) {
    const top = -0.3 * k;
    box(rampHole.x0, top - 0.3, -10 - 0.64 * k, rampHole.x1, top, -10 - 0.64 * (k - 1), PALETTE.concrete);
  }
  box(13.8, -4.5, -19.6, 14.1, -0.5, -10, PALETTE.garage);
  box(13.8, 0.15, -19.6, 14.0, 1.1, -10, PALETTE.line, true); // plaza railing beside ramp
  box(10.3, 0.15, -19.8, 13.8, 1.1, -19.6, PALETTE.line, true);
  // pedestrian stairs into garage
  for (let k = 1; k <= 15; k++) {
    const top = -0.3 * k;
    box(stairHole.x0, top - 0.25, -24 - 0.4 * k, stairHole.x1, top, -24 - 0.4 * (k - 1), PALETTE.concreteDark);
  }
  box(42.1, -4.5, -30, 42.4, -0.5, -24, PALETTE.garage);
  box(42.1, 0.15, -30.2, 42.3, 1.1, -24, PALETTE.line); box(44.4, 0.15, -30.2, 44.6, 1.1, -24, PALETTE.line);
  box(42.1, 0.15, -30.3, 44.6, 1.1, -30.1, PALETTE.line);
  // pillars + parked cars
  for (let px = 18; px < 46; px += 8) for (let pz = -40; pz < -12; pz += 9) {
    if (px < 15) continue;
    box(px - 0.4, -4.5, pz - 0.4, px + 0.4, -0.5, pz + 0.4, PALETTE.concrete);
  }
  const carColors = [0xff5252, 0x40c4ff, 0xffd740, 0x69f0ae, 0xe040fb, 0xffffff, 0xff9100];
  let ci = 0;
  const car = (x, y, z, rot) => {
    const cc = carColors[ci++ % carColors.length];
    props.push({ type: 'car', x, y, z, rot, color: cc });
    const hx = rot ? 2.1 : 1.0, hz = rot ? 1.0 : 2.1;
    box(x - hx, y + 0.25, z - hz, x + hx, y + 1.15, z + hz, cc, true);
    box(x - hx * (rot ? 0.55 : 0.9), y + 1.15, z - hz * (rot ? 0.9 : 0.55), x + hx * (rot ? 0.55 : 0.9), y + 1.85, z + hz * (rot ? 0.9 : 0.55), cc, true);
  };
  for (const [x, z] of [[22, -36], [30, -36], [38, -18], [22, -18], [30, -27], [38, -42]]) car(x, -4.5, z, 0);
  const gcY = crate(44.5, -4.5, -44.5);
  pickup('weapon', 'ar', 44.5, gcY + 0.5, -44.5);
  pickup('ammo', null, 16, -3.8, -44);
  pickup('weapon', 'smg', 26, -3.8, -27);
  labels.push({ text: 'P  PARKING', p: [12, 2.6, -9.6], rotY: 0, color: '#ffffff', bg: '#1e63d6' });

  // ------------------------------------------------------------------ suburban houses
  // front 'n' | 's' = which street it faces. The gable roof (ridge along x) has stepped collision underneath
  // so gorilla players can climb it. Garage: { x0, x1 } beside the house.
  const house = (x0, z0, w, d, o) => {
    const fl = o.floors || 1, wallH = fl * 3.1, top = Y + wallH, zc = z0 + d / 2, north = o.front === 'n';
    box(x0, Y, z0, x0 + w, top, z0 + d, o.color);
    const rh = d * 0.42, ov = 0.45, L = 5;
    for (let k = 0; k < L - 1; k++) { const half = (d / 2 + ov) * (1 - (k + 1) / L); hbox(x0 - ov + 0.06, top + k * rh / L, zc - half, x0 + w + ov - 0.06, top + (k + 1) * rh / L, zc + half); }
    props.push({ type: 'gable', x0: x0 - ov, x1: x0 + w + ov, z0: z0 - ov, z1: z0 + d + ov, y: top, h: rh, c: o.roof, wall: o.color });
    box(x0 + w * 0.72 - 0.4, top + rh * 0.3, zc + 0.5, x0 + w * 0.72 + 0.4, top + rh + 0.7, zc + 1.3, 0xa1614a); // chimney
    const fz = north ? z0 : z0 + d, sg = north ? -1 : 1, doorX = x0 + w * 0.3;
    box(doorX - 1.3, Y + 2.55, Math.min(fz, fz + sg * 1.5), doorX + 1.3, Y + 2.72, Math.max(fz, fz + sg * 1.5), o.trim);  // porch roof
    box(doorX - 1.0, Y, Math.min(fz, fz + sg * 1.1), doorX + 1.0, Y + 0.18, Math.max(fz, fz + sg * 1.1), 0xd7ccc8);      // porch step
    buildings.push({ kind: 'house', x0, z0, x1: x0 + w, z1: z0 + d, h: top, top, c: o.color, trim: o.trim, floors: fl, front: o.front, doorX, shutter: o.shutter, seed: buildings.length * 7 + 3, style: 'house', roofKit: false });
    const edge = north ? o.edge : o.edge; // block edge z (the street side)
    // stone path from the porch to the sidewalk
    box(doorX - 0.6, Y, Math.min(edge + sg * -2.7, fz + sg * 1.1), doorX + 0.6, Y + 0.02, Math.max(edge + sg * -2.7, fz + sg * 1.1), 0xcfc6b8, false);
    if (o.garage) {
      const g = o.garage, gz0 = north ? z0 + 0.6 : z0 + d - 6.0, gz1 = gz0 + 5.4;
      box(g.x0, Y, gz0, g.x1, Y + 2.9, gz1, o.garageColor || o.color);
      box(g.x0 - 0.15, Y + 2.9, gz0 - 0.15, g.x1 + 0.15, Y + 3.1, gz1 + 0.15, o.trim);
      props.push({ type: 'garageDoor', x0: g.x0 + 0.4, x1: g.x1 - 0.4, z: north ? gz0 : gz1, side: o.front, y: Y });
      box(g.x0 + 0.2, Y, Math.min(edge, north ? gz0 : gz1), g.x1 - 0.2, Y + 0.02, Math.max(edge, north ? gz0 : gz1), 0xbdb6aa, false); // driveway
      const mx = g.x0 - 0.5, mz = edge - sg * 0.55;
      box(mx - 0.1, Y, mz - 0.1, mx + 0.1, Y + 1.15, mz + 0.1, 0x6d4c41); props.push({ type: 'mailbox', x: mx, y: Y, z: mz, yaw: north ? 0 : Math.PI, c: o.mail || 0x1565c0 });
    }
    // front lawn + flower bed under the windows
    const lz0 = Math.min(edge - sg * 2.75, fz), lz1 = Math.max(edge - sg * 2.75, fz);
    box(o.lot0, Y, lz0, o.lot1, Y + 0.015, lz1, 0x7ed957, false);
    props.push({ type: 'flowerStrip', x0: doorX + 1.3, x1: x0 + w - 0.3, z: fz + sg * 0.5, y: Y });
    return { top, doorX };
  };
  const picket = (x0, z0, x1, z1, gaps = []) => { // low white fence, solid (and climbable), with gaps [a0,a1] along its length
    const horiz = Math.abs(z1 - z0) < 0.01, A0 = horiz ? x0 : z0, A1 = horiz ? x1 : z1;
    let a = A0;
    for (const [g0, g1] of [...gaps, [A1, A1]].sort((p, q) => p[0] - q[0])) {
      if (g0 > a + 0.05) { if (horiz) box(a, Y, z0 - 0.06, g0, Y + 0.95, z0 + 0.06, 0xfafafa); else box(x0 - 0.06, Y, a, x0 + 0.06, Y + 0.95, g0, 0xfafafa); boxes[boxes.length - 1].v = 0; props.push({ type: 'picket', horiz, a0: a, a1: g0, f: horiz ? z0 : x0, y: Y }); }
      a = Math.max(a, g1);
    }
  };
  // water tower: four legs, a catwalk ring, tank on top (round tank drawn by the client)
  const waterTower = (cx, cz, legH) => {
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) box(cx + dx - 0.2, Y, cz + dz - 0.2, cx + dx + 0.2, legH, cz + dz + 0.2, 0x8d6e63);
    box(cx - 3, legH, cz - 3, cx + 3, legH + 0.2, cz + 3, 0x6d7b8a);                 // catwalk
    hbox(cx - 2.3, legH + 0.2, cz - 2.3, cx + 2.3, legH + 5.4, cz + 2.3);            // tank
    ladder(cx - 0.5, cz + 3.0, cx + 0.5, cz + 3.2, Y, legH + 0.2);
    props.push({ type: 'waterTower', x: cx, y: legH, z: cz });
  };

  // ------------------------------------------------------------------ blocks
  const B = (r, c) => ({ x: BLOCK_STARTS[c], z: BLOCK_STARTS[r] });

  // (0,0) Apartments A + tower + alley
  {
    const { x, z } = B(0, 0);
    const a = hollow(x + 4, z + 22, 20, 16, { floors: 4, fh: 3.2, color: PALETTE.apt1, trim: 0xfff3e0, roofAccess: true,
      doors: [{ side: 's', at: 8, width: 3 }, { side: 'e', at: 6, width: 2.4 }], sign: 'SUNNY APTS', signPos: [x + 14, 3.1, z + 38.05], signBg: '#e65100' });
    // fire escape ladder on the west face
    ladder(x + 3.6, z + 30, x + 3.9, z + 31, Y, a.H + 1.2);
    for (let f = 1; f < 4; f++) box(x + 2.4, f * 3.2 - 0.15, z + 28.5, x + 4, f * 3.2, z + 32.5, PALETTE.metal);
    pickup('weapon', 'sniper', x + 14, a.H + 1.3, z + 30);
    pickup('weapon', 'pistol', x + 18, 1.0, z + 26);
    pickup('ammo', null, x + 8, 3.2 + 0.8, z + 34);
    pickup('health', null, x + 20, 6.4 + 0.8, z + 34);
    solidBuilding(x + 28, z + 4, 12, 14, 9, 0xf7a1c4, false, { style: 'shop', front: 'n', trim: 0xffffff, sign: 'STYLE STREET', signPos: [x + 34, 6.2, z + 3.95], signRot: Math.PI, signBg: '#c2185b',
      awning: [{ side: 'n', c: 0xe91e63, stripe: 0xffffff }, { side: 'e', c: 0xe91e63, stripe: 0xffffff, from: 0.15, to: 0.6 }] });
    solidBuilding(x + 4, z + 4, 12, 13, 10, 0x4f6bed, false, { style: 'shop', front: 'n', trim: 0xdfe6ff, sign: 'ELECTRO', signPos: [x + 10, 6.6, z + 3.95], signRot: Math.PI, signBg: '#0d1b6b', signColor: '#7cf9ff', neon: 1,
      awning: [{ side: 'n', c: 0x263c9e, stripe: 0x7cf9ff }] });
    props.push({ type: 'billboard', x: x + 10, y: 10.05, z: z + 10.5, yaw: Math.PI, w: 9, h: 3.4, kind: 'tv' });
    ladder(x + 16.0, z + 9, x + 16.3, z + 10, Y, 10.8);
    solidBuilding(x + 28, z + 24, 12, 14, 16, PALETTE.tower2, false, { style: 'apartment' });
    // alley between (x+16..x+28): dumpsters + ammo
    box(x + 20, Y, z + 6, x + 22.5, Y + 1.5, z + 8, 0x2e7d32); box(x + 23, Y, z + 13, x + 25.5, Y + 1.5, z + 15, 0x1565c0);
    pickup('ammo', null, x + 22, Y + 0.9, z + 11);
    spawns.push({ p: [x + 22, Y, z + 20], team: 0 });
  }

  // (0,1) Shops row + Mega Mart
  {
    const { x, z } = B(0, 1);
    const shopCol = [PALETTE.shop1, PALETTE.shop2, PALETTE.shop3];
    const names = ['GUN SHOP', 'SNAX', 'DONUTS'];
    for (let i = 0; i < 3; i++) {
      const sx = x + 2 + i * 14;
      const s = hollow(sx, z + 28, 12, 13, { floors: 1, fh: 4.2, color: shopCol[i], groundWindows: true, roofAccess: false, stairs: false, glass: true, style: 'shop',
        doors: [{ side: 's', at: 4.5, width: 3 }, { side: 'n', at: 7.5, width: 2 }], sign: names[i], signPos: [sx + 6, 3.4, z + 41.05], signBg: ['#3e2723', '#00695c', '#e65100'][i],
        awning: [{ side: 's', c: [0x8d1c1c, 0x00a19a, 0xff6f91][i], stripe: [0xf2d36b, 0xffffff, 0xffffff][i], y: 2.85, from: 0.05, to: 0.32 }, { side: 's', c: [0x8d1c1c, 0x00a19a, 0xff6f91][i], stripe: [0xf2d36b, 0xffffff, 0xffffff][i], y: 2.85, from: 0.68, to: 0.95 }] });
      if (i === 2) props.push({ type: 'donut', x: sx + 6, y: s.H + 0.3, z: z + 34.5 });
      ladder(sx + 11.5, z + 27.4, sx + 12.0, z + 27.7, Y, s.H + 1.2);
      shops.push({ name: names[i], keeper: [sx + 6, Y, z + 29.8], yaw: Math.PI });
      if (i === 0) { pickup('weapon', 'pistol', sx + 3, 1.0, z + 33); pickup('weapon', 'revolver', sx + 9, 1.0, z + 33); box(sx + 1, Y, z + 31, sx + 11, 1.0, z + 32, PALETTE.wood); }
      if (i === 1) pickup('ammo', null, sx + 6, 0.9, z + 34);
      if (i === 2) pickup('health', null, sx + 6, 0.9, z + 34);
    }
    const m = hollow(x + 4, z + 3, 34, 16, { floors: 2, fh: 4, color: PALETTE.mart, roofAccess: true,
      doors: [{ side: 's', at: 15, width: 4 }, { side: 'w', at: 6, width: 2.4 }, { side: 'e', at: 6, width: 2.4 }],
      sign: 'MEGA MART', signPos: [x + 21, 3.3, z + 19.05], signBg: '#4a148c', style: 'shop',
      awning: [{ side: 's', c: 0x6a1b9a, stripe: 0xffd54f, y: 3.0, from: 0.05, to: 0.4 }, { side: 's', c: 0x6a1b9a, stripe: 0xffd54f, y: 3.0, from: 0.6, to: 0.95 }] });
    props.push({ type: 'roofSign', text: 'MEGA MART', x: x + 21, y: m.H + 0.3, z: z + 17.5, w: 14, h: 2.6, bg: '#ffd54f', fg: '#4a148c' });
    for (let k = 0; k < 4; k++) box(x + 10 + k * 6, Y, z + 8, x + 11.2 + k * 6, 2.0, z + 15, 0xeeeeee); // shelves
    pickup('weapon', 'pistol', x + 32, 1.0, z + 10);
    pickup('weapon', 'smg', x + 20, 4 + 1.0, z + 12);
    shops.push({ name: 'MEGA MART', keeper: [x + 31, Y, z + 17], yaw: 0 });   // faces into the store, behind the checkout
    box(x + 29.6, Y, z + 15.3, x + 32.4, 1.0, z + 16.1, PALETTE.wood);         // checkout counter
    pickup('ammo', null, x + 34, m.H + 1.1, z + 15);
    spawns.push({ p: [x + 22, Y, z + 24], team: 0 });
  }

  // (0,2) Police station
  {
    const { x, z } = B(0, 2);
    const p = hollow(x + 6, z + 4, 30, 20, { floors: 2, fh: 4, color: PALETTE.police, trim: PALETTE.policeTrim, roofAccess: true,
      doors: [{ side: 's', at: 13, width: 4 }, { side: 'e', at: 8, width: 2.4 }],
      sign: 'POLICE', signPos: [x + 21, 3.3, z + 24.05], signBg: '#0d47a1' });
    // interior: front desk + cells
    box(x + 14, Y, z + 15, x + 28, 1.1, z + 16, PALETTE.wood);
    for (let k = 0; k < 3; k++) box(x + 26 + k * 3, Y, z + 4.3, x + 26.15 + k * 3, 3.9, z + 9, PALETTE.metal, true);
    box(x + 26, Y, z + 9, x + 32.15, 3.9, z + 9.15, PALETTE.metal, true); // holding cell bars (front)
    labels.push({ text: 'HOLDING', p: [x + 29, 3.4, z + 9.17], rotY: 0, color: '#ffffff', bg: '#0d47a1' });
    holding = { cells: [[x + 27.6, Y, z + 6.6], [x + 30.6, Y, z + 6.6]], release: [x + 21, Y, z + 27.5] };
    pickup('weapon', 'shotgun', x + 20, 1.0, z + 10);
    pickup('weapon', 'shotgun', x + 30, 4 + 1.0, z + 18);
    pickup('ammo', null, x + 12, 1.0, z + 20);
    pickup('weapon', 'ar', x + 33, p.H + 1.3, z + 8);
    // parking lot with police cars
    // police lot: drivable police cars (spawned by the server) + cop player spawns
    policeLot.push([x + 12, Y, z + 33, Math.PI / 2], [x + 22, Y, z + 33, Math.PI / 2], [x + 32, Y, z + 37, Math.PI / 2]);
    for (const [cx, cz] of [[x + 9, z + 28], [x + 17, z + 28], [x + 25, z + 28], [x + 33, z + 28], [x + 41, z + 30]]) copSpawns.push([cx, Y, cz]);
    policeExit.push(x + 22, 0, z + 50); // road in front of the station (z = -56)
    for (const fx of [x + 9, x + 33]) { box(fx - 0.07, Y, z + 25.6 - 0.07, fx + 0.07, 9.5, z + 25.6 + 0.07, 0xdfe3ea); props.push({ type: 'flag', x: fx, y: 9.3, z: z + 25.6, c1: 0x0d47a1, c2: 0xffffff }); }
    props.push({ type: 'policeBadge', x: x + 21, y: 6.2, z: z + 24.05 });
    spawns.push({ p: [x + 6, Y, z + 30], team: 0 });
  }

  // (0,3) DOWNTOWN: Chaos Tower (the city's landmark), glass offices, cafe + plaza, dead-end alley with hidden crate
  {
    const { x, z } = B(0, 3);
    // Chaos Tower: three setbacks, a glowing crown and a spire with a blinking beacon
    const tiers = [[2, 2, 16, 18, 0, 30], [4, 4, 12, 14, 30, 44], [6, 6, 8, 10, 44, 54]];
    for (const [ox, oz, w, d, y0, y1] of tiers) {
      box(x + ox, y0, z + oz, x + ox + w, y1, z + oz + d, 0x3d5bd9);
      buildings.push({ kind: 'solid', x0: x + ox, z0: z + oz, x1: x + ox + w, z1: z + oz + d, h: y1, y0, top: y1, c: 0x3d5bd9, trim: 0xd6e4ff, seed: 900 + y0, style: 'glass', roofKit: false, tower: 1 });
      box(x + ox - 0.25, y1 - 0.6, z + oz - 0.25, x + ox + w + 0.25, y1, z + oz + d + 0.25, 0xd6e4ff); // setback ledge
    }
    box(x + 7, 54, z + 7, x + 13, 57.5, z + 15, 0x1a237e);   // crown
    box(x + 9.6, 57.5, z + 10.6, x + 10.4, 72, z + 11.4, 0xd6e4ff, false); // spire (visual)
    props.push({ type: 'chaosCrown', x: x + 10, y: 54, z: z + 11, w: 6, d: 8 });
    props.push({ type: 'beacon', x: x + 10, y: 72.3, z: z + 11 });
    labels.push({ text: 'CHAOS TOWER', p: [x + 10, 6.1, z + 20.27], rotY: 0, color: '#ffffff', bg: '#1a237e', neon: 1 });
    props.push({ type: 'lobby', x0: x + 2, x1: x + 18, z: z + 20, side: 's' });
    // glass office
    solidBuilding(x + 22, z + 2, 20, 14, 28, 0x37b5c4, false, { style: 'glass', trim: 0xe0f7fa });
    // cafe + offices above (sniper still on the roof, ladder on the south face)
    solidBuilding(x + 22, z + 20, 20, 10, 12, 0xf6b26b, true, { style: 'office', front: 's', trim: 0xfff3e0, sign: 'CAFE CHAOS', signPos: [x + 32, 3.6, z + 30.06], signBg: '#6d4c41',
      awning: [{ side: 's', c: 0x2e7d32, stripe: 0xfff3e0, y: 2.8, from: 0.08, to: 0.45 }, { side: 'w', c: 0x2e7d32, stripe: 0xfff3e0, y: 2.8, from: 0.2, to: 0.8 }] });
    ladder(x + 30, z + 30.0, x + 31, z + 30.3, Y, 13);
    // brick office with a helipad
    solidBuilding(x + 2, z + 26, 16, 16, 20, 0xc8674a, false, { style: 'office', trim: 0xf7e3d4, roofKit: false });
    props.push({ type: 'helipad', x: x + 10, y: 20.05, z: z + 34, r: 5.5 });
    box(x + 18, Y, z + 2, x + 22, 4, z + 2.4, PALETTE.concreteDark); // alley back wall
    props.push({ type: 'graffiti', x: x + 20, y: 1.8, z: z + 2.42, side: 's', text: 'CC' });
    const cy = crate(x + 20, Y, z + 4);
    pickup('weapon', 'ar', x + 20, cy + 0.5, z + 4);
    box(x + 18.4, Y, z + 9, x + 21, Y + 1.5, z + 11, 0x2e7d32);
    pickup('weapon', 'sniper', x + 32, 12 + 1.3, z + 25);
    // little plaza: planters + benches around a sculpture
    for (const [px, pz] of [[24, 34], [40, 34], [24, 41], [40, 41]]) { box(x + px - 1.1, Y, z + pz - 1.1, x + px + 1.1, Y + 0.6, z + pz + 1.1, 0xb0a99f); props.push({ type: 'planter', x: x + px, y: Y + 0.6, z: z + pz, tree: true }); }
    box(x + 31, Y, z + 36.5, x + 33, Y + 0.6, z + 38.5, 0xdcd6cc);
    props.push({ type: 'sculpture', x: x + 32, y: Y + 0.6, z: z + 37.5 });
    props.push({ type: 'plazaTiles', x0: x + 20, z0: z + 31, x1: x + 43, z1: z + 43 });
    spawns.push({ p: [x + 34, Y, z + 41], team: 0 });
  }

  // (1,0) Big park
  {
    const { x, z } = B(1, 0);
    box(x + 1, Y, z + 1, x + 43, Y + 0.1, z + 43, PALETTE.grass);
    const gy = Y + 0.1;
    // paths
    box(x + 20, gy, z + 1, x + 24, gy + 0.02, z + 43, PALETTE.dirt, false);
    box(x + 1, gy, z + 20, x + 43, gy + 0.02, z + 24, PALETTE.dirt, false);
    // fountain
    props.push({ type: 'fountain', x: x + 22, y: gy, z: z + 22 });
    box(x + 18.5, gy, z + 18.5, x + 25.5, gy + 0.7, z + 25.5, PALETTE.concrete);
    box(x + 21.4, gy + 0.7, z + 21.4, x + 22.6, gy + 2.6, z + 22.6, PALETTE.concrete);
    pickup('weapon', 'smg', x + 22, gy + 3.4, z + 22);
    // trees
    const tps = [[5, 5], [12, 8], [6, 14], [25.6, 4], [41.5, 17.5], [30, 17.5], [6, 32], [14, 38], [8, 40], [36, 34], [40, 40], [30, 38], [16, 14], [28, 30], [3, 22.5], [41.5, 23]];
    for (const [tx, tz] of tps) { props.push({ type: 'tree', x: x + tx, y: gy, z: z + tz, s: 0.9 + ((tx * 7 + tz * 3) % 5) * 0.12 }); box(x + tx - 0.3, gy, z + tz - 0.3, x + tx + 0.3, gy + 2.6, z + tz + 0.3, PALETTE.trunk); }
    // benches (seat + backrest)
    for (const [bx, bz] of [[17, 10], [26, 33], [10, 26], [33, 19]]) { box(x + bx - 1, gy, z + bz - 0.3, x + bx + 1, gy + 0.5, z + bz + 0.3, PALETTE.wood); props.push({ type: 'parkBench', x: x + bx, y: gy, z: z + bz }); }
    // pond with a low stone rim, lily pads and (shh) a rubber duck
    const P0x = x + 28, P0z = z + 4, P1x = x + 41, P1z = z + 14.5;
    props.push({ type: 'pond', x0: P0x, z0: P0z, x1: P1x, z1: P1z, y: gy });
    for (const [a, b2, c2, d2] of [[P0x - 0.5, P0z - 0.5, P1x + 0.5, P0z], [P0x - 0.5, P1z, P1x + 0.5, P1z + 0.5], [P0x - 0.5, P0z, P0x, P1z], [P1x, P0z, P1x + 0.5, P1z]]) box(a, gy, b2, c2, gy + 0.35, d2, 0xb9b2a8);
    // flower beds around the fountain + picnic tables + park lanterns along the paths
    for (const [fx, fz] of [[16, 16], [28, 16], [16, 28], [28, 28]]) props.push({ type: 'flowerBed', x: x + fx, y: gy, z: z + fz, r: 1.6 });
    for (const [tx, tz] of [[8, 20.6], [36, 23.4]]) { box(x + tx - 1, gy, z + tz - 0.5, x + tx + 1, gy + 0.8, z + tz + 0.5, PALETTE.wood); props.push({ type: 'picnic', x: x + tx, y: gy, z: z + tz }); }
    for (const [lx, lz] of [[19.4, 6], [24.6, 14], [19.4, 32], [24.6, 40], [6, 19.4], [14, 24.6], [29.2, 19.4], [40, 24.6]]) { props.push({ type: 'lamp', x: x + lx, y: gy, z: z + lz, dir: 'n', style: 'lantern', short: 1 }); box(x + lx - 0.1, gy, z + lz - 0.1, x + lx + 0.1, gy + 3.2, z + lz + 0.1, 0x37474f); }
    props.push({ type: 'parkSign', x: x + 22, y: gy, z: z + 42.6 });
    // playground climbing frame (great for Gorilla movement)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) box(x + 33 + i * 2, gy, z + 26 + j * 4, x + 33.2 + i * 2, gy + 3.2, z + 26.2 + j * 4, 0xff4081);
    for (let i = 0; i < 4; i++) box(x + 33, gy + 3.0, z + 26 + i * 1.35, x + 39.2, gy + 3.2, z + 26.2 + i * 1.35, 0x40c4ff);
    box(x + 33, gy + 1.5, z + 26, x + 39.2, gy + 1.7, z + 30.2, 0xffeb3b);
    // small hill (stepped)
    for (let k = 0; k < 4; k++) box(x + 4 + k, gy, z + 26 + k, x + 16 - k, gy + 0.5 * (k + 1), z + 36 - k, k % 2 ? PALETTE.grass : PALETTE.grassDark);
    pickup('health', null, x + 10, gy + 2.6, z + 31);
    pickup('ammo', null, x + 36, gy + 3.9, z + 28);
    spawns.push({ p: [x + 22, gy, z + 8], team: 0 }); spawns.push({ p: [x + 22, gy, z + 38], team: 1 });
  }

  // (1,1) Abandoned building
  {
    const { x, z } = B(1, 1);
    box(x + 1, Y, z + 1, x + 43, Y + 0.05, z + 43, PALETTE.dirt, false);
    const a = hollow(x + 9, z + 10, 26, 22, { floors: 3, fh: 3.6, color: PALETTE.abandoned, trim: PALETTE.abandonedDark, roofAccess: true, broken: true,
      doors: [{ side: 's', at: 4, width: 3 }, { side: 'n', at: 18, width: 3 }, { side: 'e', at: 12, width: 4 }, { side: 'w', at: 14, width: 2.5 }],
      sign: 'CONDEMNED', signPos: [x + 22, 3.0, z + 32.05], signBg: '#5d4037', signColor: '#ffeb3b' });
    // rubble + crates
    for (const [rx, rz, h] of [[14, 16, 0.8], [26, 24, 1.2], [30, 14, 0.6], [12, 28, 1.0]]) box(x + rx, Y, z + rz, x + rx + 1.6, Y + h, z + rz + 1.2, PALETTE.abandonedDark);
    const cy = crate(x + 28, Y, z + 20);
    pickup('weapon', 'ar', x + 28, cy + 0.5, z + 20);
    const ry = crate(x + 30, 7.2, z + 28, true);
    pickup('weapon', 'rocket', x + 30, ry + 0.6, z + 28);
    pickup('weapon', 'shotgun', x + 16, 3.6 + 1.0, z + 22);
    pickup('ammo', null, x + 22, a.H + 1.2, z + 20);
    props.push({ type: 'graffiti', x: x + 15, y: 1.6, z: z + 32.04, side: 's', text: 'NO RULES' }, { type: 'graffiti', x: x + 35.04, y: 1.7, z: z + 26, side: 'e', text: 'CHAOS' });
    props.push({ type: 'weeds', x0: x + 2, z0: z + 2, x1: x + 42, z1: z + 42, n: 70 });
    // broken fence
    for (let k = 0; k < 44; k += 4) if (k % 12) box(x + k, Y, z + 1, x + k + 3, Y + 2, z + 1.2, PALETTE.wood);
    spawns.push({ p: [x + 22, Y, z + 38], team: -1 });
  }

  // (1,2) Plaza above the parking garage
  {
    const { x, z } = B(1, 2);
    box(x + 22, Y, z + 4, x + 26, Y + 3, z + 7, 0xff7043); // kiosk
    box(x + 21.5, Y + 3, z + 3.5, x + 26.5, Y + 3.3, z + 7.5, 0xffffff);
    for (const [px, pz] of [[18, 16], [30, 16], [18, 30], [30, 30]]) { box(x + px - 1.5, Y, z + pz - 1.5, x + px + 1.5, Y + 0.8, z + pz + 1.5, PALETTE.concrete); props.push({ type: 'tree', x: x + px, y: Y + 0.8, z: z + pz, s: 0.8 }); }
    box(x + 24, Y, z + 22, x + 27, Y + 4, z + 25, 0x7e57c2); // art cube
    props.push({ type: 'artCube', x: x + 25.5, y: Y, z: z + 23.5 });
    props.push({ type: 'plazaTiles', x0: x + 15, z0: z + 1, x1: x + 43, z1: z + 43 });
    for (const [bx, bz, yaw] of [[18, 22, Math.PI / 2], [33, 22, -Math.PI / 2], [25.5, 28.5, 0]]) { const hx = Math.abs(Math.sin(yaw)) > 0.5 ? 0.3 : 1, hz = Math.abs(Math.sin(yaw)) > 0.5 ? 1 : 0.3; box(x + bx - hx, Y, z + bz - hz, x + bx + hx, Y + 0.5, z + bz + hz, PALETTE.wood); props.push({ type: 'parkBench', x: x + bx, y: Y, z: z + bz, yaw }); }
    box(x + 37.5, Y, z + 36.5, x + 40.5, Y + 1.1, z + 39.5, 0xd7d0c4);
    props.push({ type: 'statue', x: x + 39, y: Y + 1.1, z: z + 38 });
    pickup('ammo', null, x + 24, Y + 0.9, z + 10);
    pickup('weapon', 'revolver', x + 25.5, Y + 4.8, z + 23.5);
    spawns.push({ p: [x + 34, Y, z + 6], team: -1 });
  }

  // (1,3) Gas station
  {
    const { x, z } = B(1, 3);
    for (const [px, pz] of [[8, 10], [24, 10], [8, 22], [24, 22]]) box(x + px - 0.35, Y, z + pz - 0.35, x + px + 0.35, 5.2, z + pz + 0.35, PALETTE.gasTrim);
    box(x + 4, 5.2, z + 7, x + 28, 5.8, z + 25, PALETTE.gas);
    box(x + 4, 5.8, z + 7, x + 28, 6.0, z + 7.3, PALETTE.gasTrim); box(x + 4, 5.8, z + 24.7, x + 28, 6.0, z + 25, PALETTE.gasTrim);
    ladder(x + 28.0, z + 15, x + 28.3, z + 16, Y, 6.2);
    for (const [px, pz] of [[12, 13], [20, 13], [12, 19], [20, 19]]) { box(x + px - 0.6, Y, z + pz - 0.4, x + px + 0.6, Y + 1.7, z + pz + 0.4, 0xffffff); props.push({ type: 'pump', x: x + px, y: Y, z: z + pz }); }
    hollow(x + 30, z + 28, 12, 12, { floors: 1, fh: 4, color: PALETTE.gasTrim, trim: PALETTE.gas, stairs: false, groundWindows: true,
      doors: [{ side: 'w', at: 4.5, width: 3 }], sign: 'GAS & GO', signPos: [x + 36, 3.3, z + 40.05], signBg: '#c62828' });
    props.push({ type: 'gasSign', x: x + 2, y: Y, z: z + 40 });
    props.push({ type: 'gasCanopy', x0: x + 4, z0: z + 7, x1: x + 28, z1: z + 25, y: 5.2 });
    box(x + 30.6, Y, z + 26.2, x + 32.2, Y + 1.6, z + 27.4, 0x1e88e5); props.push({ type: 'iceBox', x: x + 31.4, y: Y, z: z + 26.8 });
    box(x + 1.8, Y, z + 39.8, x + 2.2, 7, z + 40.2, PALETTE.metal);
    pickup('weapon', 'pistol', x + 36, 1.0, z + 34);
    shops.push({ name: 'GAS & GO', keeper: [x + 39.5, Y, z + 32], yaw: Math.PI / 2 });
    pickup('weapon', 'revolver', x + 16, 6.6, z + 16);
    pickup('health', null, x + 34, 1.0, z + 37);
    car(x + 12, Y, z + 30, 1);
    spawns.push({ p: [x + 16, Y, z + 36], team: -1 });
  }

  // (2,0) Basketball court
  {
    const { x, z } = B(2, 0);
    box(x + 6, Y, z + 6, x + 38, Y + 0.05, z + 38, PALETTE.court);
    const cy = Y + 0.05;
    box(x + 21.9, cy, z + 6, x + 22.1, cy + 0.01, z + 38, PALETTE.courtLine, false);
    box(x + 6, cy, z + 21.9, x + 38, cy + 0.01, z + 22.1, PALETTE.courtLine, false);
    props.push({ type: 'courtRing', x: x + 22, y: cy, z: z + 22 });
    for (const hz of [8, 36]) {
      box(x + 21.8, cy, z + hz - 0.2, x + 22.2, cy + 3.6, z + hz + 0.2, PALETTE.metal);
      props.push({ type: 'hoop', x: x + 22, y: cy + 3.05, z: z + hz + (hz < 20 ? 1.0 : -1.0), dir: hz < 20 ? 1 : -1 });
      box(x + 21, cy + 3.0, z + hz + (hz < 20 ? 0.2 : -0.3), x + 23, cy + 4.2, z + hz + (hz < 20 ? 0.3 : -0.2), 0xffffff);
    }
    // fence with gates
    const fh = 3.5, fc = 0x90a4ae;
    for (const [a, b] of [[4, 18], [26, 40]]) {
      box(x + a, Y, z + 4, x + b, Y + fh, z + 4.1, fc); box(x + a, Y, z + 39.9, x + b, Y + fh, z + 40, fc);
      box(x + 4, Y, z + a, x + 4.1, Y + fh, z + b, fc); box(x + 39.9, Y, z + a, x + 40, Y + fh, z + b, fc);
    }
    // bleachers (climbable steps)
    for (let k = 0; k < 4; k++) box(x + 40.2 + k * 0.0, Y, z + 12, x + 43 - k * 0.7, Y + 0.5 * (k + 1), z + 32, k % 2 ? 0x42a5f5 : 0x90caf9);
    pickup('weapon', 'smg', x + 22, cy + 1.0, z + 22);
    pickup('ammo', null, x + 42.5, Y + 2.6, z + 22);
    spawns.push({ p: [x + 14, cy, z + 22], team: 1 }); spawns.push({ p: [x + 30, cy, z + 22], team: 0 });
  }

  // (2,1) Apartments B with a hidden passage through the ground floor
  {
    const { x, z } = B(2, 1);
    const a = hollow(x + 6, z + 8, 30, 18, { floors: 5, fh: 3.2, color: PALETTE.apt2, trim: 0xe0fff5, roofAccess: true,
      doors: [{ side: 'n', at: 22, width: 2.4 }, { side: 's', at: 22, width: 2.4 }, { side: 'w', at: 10, width: 2.4 }],
      sign: 'GREEN TOWERS', signPos: [x + 21, 3.0, z + 26.05], signBg: '#00695c' });
    // ground floor partition creating the secret corridor
    box(x + 20, Y, z + 8.3, x + 20.3, 3.2, z + 25.7, PALETTE.apt2);
    box(x + 26, Y, z + 8.3, x + 26.3, 3.2, z + 25.7, 0xd0f0e8);
    pickup('weapon', 'sniper', x + 30, a.H + 1.3, z + 20);
    pickup('weapon', 'shotgun', x + 24, 1.0, z + 17);
    pickup('health', null, x + 12, 3.2 * 2 + 0.8, z + 20);
    pickup('ammo', null, x + 30, 3.2 * 3 + 0.8, z + 12);
    // JOE'S AUTO REPAIR: two open repair bays, a car up on the lift, tire stacks
    hollow(x + 4, z + 30, 16, 12, { floors: 1, fh: 5, color: 0x55657a, trim: 0xf1c40f, stairs: false, windows: false, style: 'garage',
      doors: [{ side: 's', at: 1.4, width: 5.6, h: 3.8 }, { side: 's', at: 9, width: 5.6, h: 3.8 }, { side: 'n', at: 7, width: 2 }],
      sign: "JOE'S AUTO REPAIR", signPos: [x + 12, 4.35, z + 42.06], signBg: '#f1c40f', signColor: '#212121' });
    ladder(x + 20.0, z + 34, x + 20.3, z + 35, Y, 6.2);
    props.push({ type: 'carLift', x: x + 8.2, y: Y, z: z + 36.5 }); car(x + 8.2, Y + 1.45, z + 36.5, 0);
    for (const [tx, tz] of [[x + 17.5, z + 32], [x + 17.5, z + 33.4]]) { box(tx - 0.45, Y, tz - 0.45, tx + 0.45, Y + 1.1, tz + 0.45, 0x212121); props.push({ type: 'tires', x: tx, y: Y, z: tz }); }
    box(x + 12.6, Y, z + 30.4, x + 15.4, Y + 1.0, z + 31.0, 0xc0392b); props.push({ type: 'toolbox', x: x + 14, y: Y, z: z + 30.7 });
    // CHAOS MOTORS car dealership: big showroom windows, two cars on display, bunting on the roof
    hollow(x + 24, z + 30, 18, 12, { floors: 1, fh: 6, color: 0xf7f9fc, trim: 0xe53935, stairs: false, groundWindows: true, winEvery: 2.7, style: 'showroom',
      doors: [{ side: 's', at: 6.5, width: 5, h: 3.6 }, { side: 'n', at: 8, width: 2.4 }], sign: 'CHAOS MOTORS', signPos: [x + 33, 4.7, z + 42.06], signBg: '#e53935', neon: 1 });
    car(x + 28.8, Y, z + 36, 1); car(x + 37.2, Y, z + 36, 1);
    props.push({ type: 'bunting', x0: x + 24, x1: x + 42, z0: z + 30, z1: z + 42, y: 6.6 });
    spawns.push({ p: [x + 22, Y, z + 4], team: -1 });
  }

  // (2,2) Container yard / small park
  {
    const { x, z } = B(2, 2);
    box(x + 1, Y, z + 24, x + 20, Y + 0.1, z + 43, PALETTE.grass);
    for (const [tx, tz] of [[5, 28], [14, 30], [8, 38], [16, 40]]) { props.push({ type: 'tree', x: x + tx, y: Y + 0.1, z: z + tz, s: 1 }); box(x + tx - 0.3, Y, z + tz - 0.3, x + tx + 0.3, Y + 2.6, z + tz + 0.3, PALETTE.trunk); }
    const cc = [PALETTE.container1, PALETTE.container2, PALETTE.container3, PALETTE.container4];
    const cont = (cx, cy, cz, rot, k) => {
      const hx = rot ? 1.25 : 3.05, hz = rot ? 3.05 : 1.25;
      box(cx - hx, cy, cz - hz, cx + hx, cy + 2.6, cz + hz, cc[k % 4]);
      props.push({ type: 'container', x: cx, y: cy, z: cz, rot, color: cc[k % 4] });
    };
    cont(x + 8, Y, z + 6, 0, 0); cont(x + 8, Y + 2.6, z + 6, 0, 1); cont(x + 8, Y, z + 12, 0, 2);
    cont(x + 18, Y, z + 8, 1, 3); cont(x + 24, Y, z + 6, 1, 0); cont(x + 24, Y + 2.6, z + 6, 1, 2);
    cont(x + 34, Y, z + 10, 0, 1); cont(x + 34, Y, z + 16, 0, 3); cont(x + 34, Y + 2.6, z + 13, 0, 0);
    cont(x + 30, Y, z + 30, 1, 2); cont(x + 37, Y, z + 30, 1, 1); cont(x + 33.5, Y + 2.6, z + 30, 0, 3);
    box(x + 26.2, Y, z + 12.6, x + 27.8, Y + 2.1, z + 15.2, 0xffb300); boxes[boxes.length - 1].v = 0; props.push({ type: 'forklift', x: x + 27, y: Y, z: z + 13.9 });
    props.push({ type: 'yardLines', x0: x + 2, z0: z + 2, x1: x + 42, z1: z + 22 });
    pickup('weapon', 'shotgun', x + 14, Y + 0.9, z + 10);
    pickup('weapon', 'ar', x + 24, Y + 5.2 + 0.6, z + 6);
    pickup('ammo', null, x + 33.5, Y + 5.2 + 0.6, z + 30);
    spawns.push({ p: [x + 26, Y, z + 20], team: 1 });
  }

  // (2,3) Diner + shops
  {
    const { x, z } = B(2, 3);
    hollow(x + 4, z + 4, 20, 13, { floors: 1, fh: 4, color: PALETTE.diner, trim: 0xff4081, groundWindows: true, stairs: false,
      doors: [{ side: 's', at: 8, width: 3 }, { side: 'e', at: 4, width: 2 }], sign: 'STAR DINER', signPos: [x + 14, 3.3, z + 17.05], signBg: '#ad1457' });
    box(x + 6, Y, z + 7, x + 22, 1.1, z + 8, 0xff80ab);
    pickup('weapon', 'revolver', x + 14, 1.6, z + 7.5);
    shops.push({ name: 'STAR DINER', keeper: [x + 12, Y, z + 5.6], yaw: Math.PI });
    // FIRE STATION 7: two drive-in bays with fire trucks, stairs to the roof, siren + flag up top
    hollow(x + 28, z + 4, 14, 16, { floors: 2, fh: 6, color: 0xd32f2f, trim: 0xfff3e0, roofAccess: true, style: 'fire', stairOffset: 8.6,
      doors: [{ side: 'n', at: 1.2, width: 5.2, h: 4.2 }, { side: 'n', at: 7.6, width: 5.2, h: 4.2 }, { side: 'w', at: 3, width: 2 }],
      sign: 'FIRE STATION 7', signPos: [x + 35, 5.0, z + 3.86], signRot: Math.PI, signBg: '#7f0000' });
    ladder(x + 27.7, z + 10, x + 28.0, z + 11, Y, 12.8);
    pickup('weapon', 'sniper', x + 35, 12.3 + 1.3, z + 12);
    for (const tx of [x + 31.8, x + 38.2]) { box(tx - 1.2, Y + 0.3, z + 5.2, tx + 1.2, Y + 3.1, z + 12.4, 0xe53935); boxes[boxes.length - 1].v = 0; props.push({ type: 'firetruck', x: tx, y: Y, z: z + 8.8 }); }
    box(x + 40.6, 12.3, z + 17.6, x + 41.4, 15.6, z + 18.4, 0xe0e0e0); props.push({ type: 'flag', x: x + 41, y: 15.4, z: z + 18, c1: 0xd32f2f, c2: 0xffffff });
    props.push({ type: 'siren', x: x + 31, y: 12.3, z: z + 17 });
    // hotel
    solidBuilding(x + 4, z + 24, 14, 18, 16, 0x9575cd, false, { style: 'office', front: 'w', trim: 0xf3e5f5, sign: 'HOTEL ROYAL', signPos: [x + 3.94, 13.6, z + 33], signRot: -Math.PI / 2, signBg: '#4a148c', neon: 1,
      awning: [{ side: 'w', c: 0x4a148c, stripe: 0xffd54f, y: 3.0, from: 0.3, to: 0.7 }] });
    hollow(x + 22, z + 26, 20, 14, { floors: 2, fh: 3.6, color: PALETTE.shop1, roofAccess: true,
      doors: [{ side: 'n', at: 8, width: 3 }, { side: 'w', at: 5, width: 2.4 }], sign: 'ARCADE', signPos: [x + 32, 3.1, z + 25.95], signRot: Math.PI, signBg: '#311b92' });
    pickup('weapon', 'smg', x + 34, 3.6 + 1.0, z + 33);
    shops.push({ name: 'ARCADE', keeper: [x + 36, Y, z + 36], yaw: 0 });
    pickup('ammo', null, x + 38, 1.0, z + 36);
    spawns.push({ p: [x + 22, Y, z + 21], team: 1 });
  }

  // (3,0) Warehouse with catwalks
  {
    const { x, z } = B(3, 0);
    const wx = x + 4, wz = z + 8, ww = 34, wd = 26;
    hollow(wx, wz, ww, wd, { floors: 1, fh: 8, color: PALETTE.warehouse, trim: 0xf1f8e9, stairs: false, windows: false,
      doors: [{ side: 'n', at: 12, width: 6 }, { side: 'e', at: 10, width: 3 }, { side: 'w', at: 4, width: 2.4 }],
      sign: 'WAREHOUSE 9', signPos: [x + 21, 6.5, z + 7.95], signRot: Math.PI, signBg: '#33691e' });
    // high windows openings would complicate - instead catwalks + ladders inside
    box(wx + 0.3, 3.8, wz + 0.3, wx + 2.3, 4.0, wz + wd - 0.3, PALETTE.metal);
    box(wx + ww - 2.3, 3.8, wz + 0.3, wx + ww - 0.3, 4.0, wz + wd - 0.3, PALETTE.metal);
    box(wx + 2.3, 3.8, wz + wd - 2.3, wx + ww - 2.3, 4.0, wz + wd - 0.3, PALETTE.metal);
    ladder(wx + 2.3, wz + 6, wx + 2.6, wz + 7, Y, 4.6);
    ladder(wx + ww - 2.6, wz + 18, wx + ww - 2.3, wz + 19, Y, 4.6);
    for (const [cx, cz, h] of [[10, 8, 1.6], [12, 8, 3.2], [20, 16, 1.6], [22, 12, 1.6], [28, 8, 2.4], [16, 22, 1.6]]) box(wx + cx - 1, Y, wz + cz - 1, wx + cx + 1, Y + h, wz + cz + 1, PALETTE.crate);
    pickup('weapon', 'ar', wx + 12, Y + 3.2 + 0.6, wz + 8);
    pickup('ammo', null, wx + 17, 4.6, wz + wd - 1.3);
    pickup('weapon', 'shotgun', wx + ww - 1.3, 4.6, wz + 4);
    pickup('health', null, wx + 22, Y + 2.2, wz + 12);
    props.push({ type: 'dockDoors', x0: wx + 2, x1: wx + 10, z: wz, n: 2 }, { type: 'dockDoors', x0: wx + 21, x1: wx + 31, z: wz, n: 2 });
    box(x + 30, Y, z + 3.2, x + 40, Y + 3.4, z + 5.6, 0xeceff1); boxes[boxes.length - 1].v = 0; props.push({ type: 'semi', x: x + 35, y: Y, z: z + 4.4 });
    spawns.push({ p: [x + 22, Y, z + 38], team: 1 });
  }

  // (3,1) RESIDENTIAL: six suburban houses (porches, garages, driveways, mailboxes, picket fences),
  // a backyard pool and a community green with the water tower landmark
  {
    const { x, z } = B(3, 1);
    const look = [
      { color: 0xa5d6a7, roof: 0x8d3b2f, trim: 0xffffff, shutter: 0x2e7d32, floors: 2 }, { color: 0xffcc80, roof: 0x4e5d6c, trim: 0xfff8e1, shutter: 0x6d4c41, floors: 1 },
      { color: 0xb39ddb, roof: 0x5d4037, trim: 0xffffff, shutter: 0x4527a0, floors: 2 }, { color: 0x90caf9, roof: 0x37474f, trim: 0xffffff, shutter: 0x1565c0, floors: 1 },
      { color: 0xfff59d, roof: 0x6d4c41, trim: 0xffffff, shutter: 0xef6c00, floors: 2 }, { color: 0xf48fb1, roof: 0x455a64, trim: 0xfff0f5, shutter: 0xad1457, floors: 1 }];
    for (let i = 0; i < 3; i++) {
      const lx = x + 1.4 + i * 13.9;
      // north row faces the street at z
      house(lx + 0.9, z + 5.5, 8, 7.5, { ...look[i], front: 'n', edge: z, lot0: lx, lot1: lx + 13, garage: { x0: lx + 9.0, x1: lx + 12.6 }, mail: [0x1565c0, 0xc62828, 0x2e7d32][i] });
      picket(Math.max(lx, x + 2.1), z + 2.85, Math.min(lx + 13, x + 41.9), z + 2.85, [[lx + 2.5, lx + 4.1], [lx + 8.9, lx + 12.8]]);
      // south row faces the street at z + 44
      house(lx + 0.9, z + 31, 8, 7.5, { ...look[i + 3], front: 's', edge: z + 44, lot0: lx, lot1: lx + 13, garage: { x0: lx + 9.0, x1: lx + 12.6 }, mail: [0x6a1b9a, 0x1565c0, 0xef6c00][i] });
      picket(Math.max(lx, x + 2.1), z + 41.15, Math.min(lx + 13, x + 41.9), z + 41.15, [[lx + 2.5, lx + 4.1], [lx + 8.9, lx + 12.8]]);
    }
    // back fences around the outer lots; the middle opens onto the green
    picket(x + 2.1, z + 20.5, x + 15.5, z + 20.5); picket(x + 29.5, z + 20.5, x + 41.9, z + 20.5);
    picket(x + 2.1, z + 23.5, x + 15.5, z + 23.5); picket(x + 29.5, z + 23.5, x + 41.9, z + 23.5);
    for (const fx of [x + 15.5, x + 29.5]) { picket(fx, z + 13.6, fx, z + 20.5); picket(fx, z + 23.5, fx, z + 30.4); }
    // backyard pool (lot 1 north) with a diving board
    props.push({ type: 'pool', x0: x + 3.2, z0: z + 14.6, x1: x + 11.6, z1: z + 19.4, y: Y });
    for (const [a, b2, c2, d2] of [[x + 2.8, z + 14.2, x + 12, z + 14.6], [x + 2.8, z + 19.4, x + 12, z + 19.8], [x + 2.8, z + 14.6, x + 3.2, z + 19.4], [x + 11.6, z + 14.6, x + 12, z + 19.4]]) box(a, Y, b2, c2, Y + 0.2, d2, 0xeceff1);
    box(x + 11.6, Y + 0.2, z + 16.6, x + 13.4, Y + 0.32, z + 17.4, 0x29b6f6);
    // community green: water tower (sniper on the catwalk), swing set, trees
    box(x + 15.6, Y, z + 13, x + 29.4, Y + 0.015, z + 31, 0x7ed957, false);
    waterTower(x + 22, z + 22, 11.6);
    pickup('weapon', 'sniper', x + 22, 11.8 + 1.3, z + 19.35);
    props.push({ type: 'swingSet', x: x + 18, y: Y, z: z + 28.4 });
    box(x + 16.2, Y + 2.3, z + 28.3, x + 19.8, Y + 2.45, z + 28.5, 0xef5350);
    for (const [tx, tz] of [[x + 27.5, z + 15.5], [x + 17, z + 15], [x + 27.5, z + 29], [x + 37, z + 17], [x + 8, z + 27], [x + 36, z + 27.5]]) { props.push({ type: 'tree', x: tx, y: Y, z: tz, s: 0.85 }); box(tx - 0.3, Y, tz - 0.3, tx + 0.3, Y + 2.4, tz + 0.3, PALETTE.trunk); }
    props.push({ type: 'gnome', x: x + 6.2, y: Y, z: z + 4.1 });
    pickup('weapon', 'pistol', x + 12.2, Y + 3.1 + 0.9, z + 8.8);
    pickup('ammo', null, x + 18.2, Y + 0.8, z + 22);
    spawns.push({ p: [x + 22, Y, z + 29], team: 1 });
  }

  // (3,2) Apartments C
  {
    const { x, z } = B(3, 2);
    const a = hollow(x + 4, z + 4, 22, 16, { floors: 3, fh: 3.2, color: PALETTE.apt3, trim: 0xfff0f5, roofAccess: true,
      doors: [{ side: 'n', at: 9, width: 3 }, { side: 'e', at: 6, width: 2.4 }], sign: 'PINK PALMS', signPos: [x + 15, 3.0, z + 3.95], signRot: Math.PI, signBg: '#880e4f' });
    pickup('weapon', 'pistol', x + 20, 1.0, z + 10);
    pickup('weapon', 'smg', x + 12, 3.2 + 1.0, z + 14);
    pickup('ammo', null, x + 20, a.H + 1.2, z + 16);
    // HOSPITAL: white tower, red crosses, helipad, entrance canopy over the sidewalk + ambulance
    solidBuilding(x + 30, z + 4, 12, 22, 20, 0xf5f7fa, false, { style: 'hospital', trim: 0x4fc3f7, roofKit: false, front: 'e' });
    props.push({ type: 'helipad', x: x + 36, y: 20.05, z: z + 15, r: 4.8 });
    box(x + 42, 3.3, z + 10, x + 43.5, 3.55, z + 18, 0x29b6f6);
    labels.push({ text: 'HOSPITAL', p: [x + 42.06, 5.2, z + 14], rotY: Math.PI / 2, color: '#ffffff', bg: '#d32f2f' });
    box(x + 26.9, Y + 0.3, z + 6, x + 29.1, Y + 2.7, z + 11.6, 0xffffff); boxes[boxes.length - 1].v = 0; props.push({ type: 'ambulance', x: x + 28, y: Y, z: z + 8.8 });
    solidBuilding(x + 4, z + 26, 20, 16, 13, 0x4db6ac, true, { style: 'apartment', trim: 0xe0f2f1 });
    ladder(x + 24.0, z + 30, x + 24.3, z + 31, Y, 13.8);
    pickup('health', null, x + 14, 13 + 0.9, z + 34);
    spawns.push({ p: [x + 34, Y, z + 34], team: 1 });
  }

  // (3,3) Construction site with scaffolding (rare rocket on top)
  {
    const { x, z } = B(3, 3);
    box(x + 1, Y, z + 1, x + 43, Y + 0.05, z + 43, PALETTE.dirt, false);
    // half built frame: pillars + 3 open floors
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(x + 6 + i * 7, Y, z + 6 + j * 7, x + 6.6 + i * 7, 12, z + 6.6 + j * 7, PALETTE.concrete);
    for (let f = 1; f <= 3; f++) slab(x + 6, z + 6, x + 27.6, z + 20.6, f * 4 - 0.3, f * 4, PALETTE.concrete, [{ x0: x + 7, z0: z + 7, x1: x + 9.5, z1: z + 11 }]);
    for (let f = 0; f < 3; f++) ladder(x + 8, z + 9, x + 8.5, z + 9.3, f === 0 ? Y : f * 4, f * 4 + 4.6);
    // scaffolding tower
    for (let f = 1; f <= 5; f++) box(x + 32, f * 3 - 0.15, z + 30, x + 40, f * 3, z + 34, PALETTE.scaffold);
    for (const [px, pz] of [[32, 30], [40, 30], [32, 34], [40, 34]]) box(x + px - 0.08, Y, z + pz - 0.08, x + px + 0.08, 15.8, z + pz + 0.08, PALETTE.scaffold);
    ladder(x + 36, z + 34.0, x + 37, z + 34.3, Y, 15.6);
    const ry = crate(x + 36, 15, z + 32, true);
    pickup('weapon', 'rocket', x + 36, ry + 0.6, z + 32);
    pickup('weapon', 'ar', x + 16, 8 + 1.0, z + 14);
    pickup('ammo', null, x + 24, 12 + 1.0, z + 18);
    for (const [cx2, cz2] of [[4, 24], [6, 26], [4, 28], [26, 24], [28, 26], [2.5, 40]]) props.push({ type: 'cone', x: x + cx2, y: Y, z: z + cz2 });
    props.push({ type: 'hardhat', x: x + 36.4, y: 15.85, z: z + 31.2 });
    // crane (visual mast collidable)
    box(x + 38, Y, z + 8, x + 40, 26, z + 10, 0xffc107);
    box(x + 18, 25, z + 8.5, x + 42, 26, z + 9.5, 0xffc107, false);
    // sand piles & barriers
    for (const [bx, bz] of [[10, 30], [16, 36], [24, 28]]) box(x + bx, Y, z + bz, x + bx + 3, Y + 1.0, z + bz + 0.6, 0xff7043);
    spawns.push({ p: [x + 20, Y, z + 38], team: 1 });
  }

  // ------------------------------------------------------------------ roof kits (AC units with fans, penthouses, water tanks, antennas)
  const roofR = rng(4242);
  const roofBusy = props.filter(p => ['donut', 'roofSign', 'helipad', 'billboard', 'siren'].includes(p.type));
  const clearSpot = (x, z, y, r) => !pickups.some(p => Math.abs(p.p[1] - y) < 3 && Math.hypot(p.p[0] - x, p.p[2] - z) < r)
    && !ladders.some(l => x > l.min[0] - r && x < l.max[0] + r && z > l.min[2] - r && z < l.max[2] + r && y < l.max[1] + 1)
    && !roofBusy.some(p => Math.abs((p.y || 0) - y) < 2 && Math.hypot(p.x - x, p.z - z) < r + (p.r || p.w / 2 || 2.6));
  for (const b of buildings) {
    if (!b.roofKit || (b.kind !== 'solid' && b.kind !== 'hollow')) continue;
    const w = b.x1 - b.x0, d = b.z1 - b.z0, y = b.top, spots = [];
    const put = (fx, fz, hw, hd) => {
      const cx = b.x0 + w * fx, cz = b.z0 + d * fz;
      if (cx - hw < b.x0 + 0.7 || cx + hw > b.x1 - 0.7 || cz - hd < b.z0 + 0.7 || cz + hd > b.z1 - 0.7) return null;
      if (!clearSpot(cx, cz, y, Math.max(hw, hd) + 1.6)) return null;
      if (b.hole && cx + hw > b.hole.x0 - 0.8 && cx - hw < b.hole.x1 + 0.8 && cz + hd > b.hole.z0 - 0.8 && cz - hd < b.hole.z1 + 0.8) return null;
      if (spots.some(q => Math.abs(q[0] - cx) < q[2] + hw + 0.9 && Math.abs(q[1] - cz) < q[3] + hd + 0.9)) return null;
      spots.push([cx, cz, hw, hd]); return [cx, cz];
    };
    if (b.style === 'office' || b.style === 'glass') {
      const hw = Math.min(2.4, w * 0.2), hd = Math.min(2.0, d * 0.18);
      const p = put(0.3, 0.62, hw, hd) || put(0.7, 0.4, hw, hd);
      if (p) { box(p[0] - hw, y, p[1] - hd, p[0] + hw, y + 2.6, p[1] + hd, 0xcfd3dc); props.push({ type: 'penthouse', x: p[0], y, z: p[1], hw, hd }); }
      if (b.h > 20) { const q = put(0.78, 0.8, 0.35, 0.35); if (q) props.push({ type: 'antenna', x: q[0], y, z: q[1], h: 6 + roofR() * 4 }); }
    }
    if (b.style === 'apartment' && w > 9 && d > 9) {
      const p = put(0.68, 0.32, 1.6, 1.6);
      if (p) { hbox(p[0] - 1.3, y + 2.2, p[1] - 1.3, p[0] + 1.3, y + 5.0, p[1] + 1.3); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(p[0] + dx - 0.08, y, p[1] + dz - 0.08, p[0] + dx + 0.08, y + 2.2, p[1] + dz + 0.08, 0x6d4c41); props.push({ type: 'roofTank', x: p[0], y, z: p[1] }); }
      const q = put(0.25, 0.7, 1.2, 1.2);
      if (q) { box(q[0] - 1.2, y, q[1] - 1.2, q[0] + 1.2, y + 2.5, q[1] + 1.2, 0xbcaaa4); props.push({ type: 'stairHut', x: q[0], y, z: q[1] }); }
    }
    const nAC = w * d > 150 ? 3 : w * d > 60 ? 2 : 1;
    let n = 0;
    for (const [fx, fz] of [[0.2, 0.25], [0.8, 0.75], [0.78, 0.22], [0.22, 0.78], [0.5, 0.2], [0.5, 0.82]]) {
      if (n >= nAC) break;
      const p = put(fx, fz, 0.75, 0.55); if (!p) continue;
      box(p[0] - 0.75, y, p[1] - 0.55, p[0] + 0.75, y + 1.0, p[1] + 0.55, 0xc7ccd9); props.push({ type: 'acFan', x: p[0], y: y + 1.0, z: p[1] }); n++;
    }
    if (w * d > 120) { const p = put(0.5, 0.5, 1.0, 0.7); if (p) props.push({ type: 'vent', x: p[0], y, z: p[1] }); }
  }

  // ------------------------------------------------------------------ balconies on apartment towers (solid ledges: great for climbing)
  for (const b of buildings) {
    if (b.kind !== 'solid' || b.style !== 'apartment') continue;
    const floors = Math.floor((b.h - 1) / 3.2);
    for (const side of ['n', 's', 'e', 'w']) {
      const horiz = side === 'n' || side === 's', len = horiz ? b.x1 - b.x0 : b.z1 - b.z0, a0 = horiz ? b.x0 : b.z0;
      const face = side === 'n' ? b.z0 : side === 's' ? b.z1 : side === 'w' ? b.x0 : b.x1, out = side === 'n' || side === 'w' ? -1 : 1;
      const cols = Math.max(1, Math.floor((len - 2) / 5));
      for (let i = 0; i < cols; i++) {
        const ca = a0 + (len - (cols - 1) * 5) / 2 + i * 5;
        if (ladders.some(l => (horiz ? (ca > l.min[0] - 2 && ca < l.max[0] + 2) : (ca > l.min[2] - 2 && ca < l.max[2] + 2)) && Math.abs((horiz ? (l.min[2] + l.max[2]) / 2 : (l.min[0] + l.max[0]) / 2) - face) < 1.5)) continue;
        for (let f = 1; f < floors; f++) {
          if ((f + i) % 2) continue;
          const y = f * 3.2, f0 = Math.min(face, face + out * 1.0), f1 = Math.max(face, face + out * 1.0);
          if (horiz) box(ca - 1.1, y - 0.15, f0, ca + 1.1, y, f1, b.trim); else box(f0, y - 0.15, ca - 1.1, f1, y, ca + 1.1, b.trim);
          props.push({ type: 'balcony', x: horiz ? ca : face + out * 0.5, z: horiz ? face + out * 0.5 : ca, y, side, c: b.trim });
        }
      }
    }
  }

  // ------------------------------------------------------------------ street furniture along the curbs
  // Everything sits in the outer 0.9 m of the sidewalk so it never blocks the pedestrians' walking loop (1.7 m in).
  const EDGE_SKIP = { '0,2,s': [0, 44], '1,1,n': [0, 44], '1,2,s': [0, 12], '1,3,n': [0, 44], '1,3,s': [0, 44], '1,3,w': [0, 44], '1,3,e': [0, 44], '2,1,s': [0, 44], '2,3,n': [24, 44], '3,1,n': [0, 44], '3,1,s': [0, 44] };
  const KIT = { downtown: ['bench', 'trash', 'planter', 'tree', 'newsbox', 'planter', 'hydrant'], shopping: ['trash', 'bench', 'meter', 'bikerack', 'planter', 'meter', 'hydrant'],
    services: ['hydrant', 'bench', 'trash', 'tree', 'planter'], park: ['tree', 'bench', 'tree', 'trash', 'tree'], residential: ['tree', 'hydrant', 'tree', 'tree'], industrial: ['hydrant', 'trash', 'tree', 'barrel'] };
  const BUS = { '0,1,s': 31, '1,2,w': 31, '2,1,n': 12, '0,3,w': 33, '2,3,w': 14, '3,2,n': 31 };
  const SIZE = { bench: [1.8, 0.55, 0.5], trash: [0.5, 0.5, 0.95], hydrant: [0.36, 0.36, 0.75], planter: [1.6, 0.7, 0.55], tree: [0.32, 0.32, 2.6], newsbox: [0.5, 0.45, 1.05],
    meter: [0.16, 0.16, 1.25], bikerack: [1.6, 0.12, 0.8], barrel: [0.6, 0.6, 0.9], busstop: [3.4, 1.2, 2.6] };
  const blocked = (x0, z0, x1, z1) => boxes.some(b => b.s && !b.h && b.max[1] > 0.2 && b.min[1] < 2.6 && b.min[0] < x1 && b.max[0] > x0 && b.min[2] < z1 && b.max[2] > z0 && (b.max[0] - b.min[0]) < 200);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x0 = BLOCK_STARTS[c], z0 = BLOCK_STARTS[r], dist = BLOCK_DISTRICT[r][c], kit = KIT[dist];
    ['n', 's', 'w', 'e'].forEach((side, si) => {
      const key = `${r},${c},${side}`, skip = EDGE_SKIP[key];
      let k = (r * 4 + c + si) % kit.length, busDone = false;
      for (let t = 6.5; t <= 37.6; t += 6.2) {
        if (Math.abs(t - 22) < 2.6) continue;
        if (skip && t > skip[0] - 1.5 && t < skip[1] + 1.5) continue;
        let type = kit[k++ % kit.length], tt = t;
        if (BUS[key] && !busDone && Math.abs(BUS[key] - t) < 3.2) { type = 'busstop'; tt = BUS[key]; busDone = true; }
        const [L, D, H] = SIZE[type], dep = type === 'busstop' ? 0.65 : 0.55;
        const [x, z, yaw] = side === 'n' ? [x0 + tt, z0 + dep, 0] : side === 's' ? [x0 + tt, z0 + BLOCK - dep, Math.PI] : side === 'w' ? [x0 + dep, z0 + tt, Math.PI / 2] : [x0 + BLOCK - dep, z0 + tt, -Math.PI / 2];
        const hx = side === 'n' || side === 's' ? L / 2 : D / 2, hz = side === 'n' || side === 's' ? D / 2 : L / 2;
        if (blocked(x - hx - 0.2, z - hz - 0.2, x + hx + 0.2, z + hz + 0.2)) continue;
        if (type === 'busstop') {
          // roof + back panel are solid (climbable); glass sides are just looks
          const inX = side === 'w' ? 1 : side === 'e' ? -1 : 0, inZ = side === 'n' ? 1 : side === 's' ? -1 : 0;
          box(x - hx, 2.45, z - hz, x + hx, 2.6, z + hz, 0x37474f);
          const bx = x + inX * (D / 2 - 0.03), bz = z + inZ * (D / 2 - 0.03);
          if (inX) box(bx - 0.03, Y, z - hz, bx + 0.03, 2.45, z + hz, 0x90a4ae); else box(x - hx, Y, bz - 0.03, x + hx, 2.45, bz + 0.03, 0x90a4ae);
        } else box(x - hx, Y, z - hz, x + hx, Y + H, z + hz, 0x777777);
        boxes[boxes.length - 1].v = 0;
        if (type === 'busstop') boxes[boxes.length - 2].v = 0;
        furniture.push({ type, x, z, yaw, dist, y: Y });
      }
    });
  }

  // Street spawns at intersections & mid-roads
  for (const ix of [-84, -28, 28, 84]) for (const iz of [-112, -56, 0, 56, 112]) {
    spawns.push({ p: [ix, 0, iz], team: iz < 0 ? 0 : (iz > 0 ? 1 : -1) });
  }
  // ammo on the streets
  for (const [ax, az] of [[0, -84], [0, 84], [-84, 0], [84, 0], [-56, -28], [56, 28]]) pickup('ammo', null, ax, 0.8, az);
  // (streets are kept clear for NPC traffic; see server/vehicles.js)

  // Traffic lanes (right-hand traffic, 3m from each road's center line). Rectangle loops of road center lines.
  const trafficLoops = [];
  const rect = (x0, z0, x1, z1, cw) => {
    let c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    if (!cw) c = c.reverse();
    // offset every corner to the right of travel (incoming + outgoing edge) => lane centers
    const pts = c.map((p, i) => {
      const a = c[(i + 3) % 4], b = c[(i + 1) % 4];
      const din = norm(p[0] - a[0], p[1] - a[1]), dout = norm(b[0] - p[0], b[1] - p[1]);
      return [p[0] + (-din[1] - dout[1]) * 3, p[1] + (din[0] + dout[0]) * 3];
    });
    trafficLoops.push(pts);
  };
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  rect(-56, -56, 56, 56, true); rect(-56, -56, 56, 56, false);
  rect(-112, -112, 112, 112, true); rect(-112, -112, 112, 112, false);
  rect(0, -112, 112, 0, true); rect(-112, 0, 0, 112, true);

  const dn = shops.find(sh => sh.name === 'DONUTS');
  const donutDoor = dn ? [dn.keeper[0], 0.15, dn.keeper[2] + 12.2] : [0, 0, 0]; // just outside the donut shop's front door
  const prison = buildPrison();
  return { boxes, ladders, windows, props, pickups, spawns, labels, shops, trafficLoops, policeLot, copSpawns, policeExit, donutDoor, holding, prison, worldHalf: WORLD_HALF, blockStarts: BLOCK_STARTS, block: BLOCK,
           buildings, openings, trafficLights, stopSigns, furniture, districts: BLOCK_DISTRICT };
}
