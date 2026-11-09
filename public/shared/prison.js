// CITY CHAOS - County Prison. Shared by the server (collision, guards, escape logic) and the client
// (rendering, doors, interactions), so both always agree on where everything is.
// The prison sits south of the city in its own fenced valley (z 290..480). Nobody can walk there:
// you arrive in the back of a police car, and you leave by escaping.

export const PRISON = { x0: -92, x1: 92, z0: 288, z1: 482 };           // whole prison valley (render + bounds)
export const PERIM = { x0: -60.5, x1: 60.5, z0: 344.5, z1: 455.5 };   // outer wall centerline box: outside it = escaped
export const inPrisonArea = (x, z) => x > PRISON.x0 && x < PRISON.x1 && z > PRISON.z0 && z < PRISON.z1;

// Daily schedule (seconds). Doors, guard rules and prisoner NPCs follow it.
export const PHASES = [
  { name: 'FREE TIME', dur: 50, hint: 'Explore the yard, talk to other prisoners' },
  { name: 'BREAKFAST', dur: 45, hint: 'Head to the cafeteria for a food tray' },
  { name: 'YARD TIME', dur: 50, hint: 'Shoot some hoops on the basketball court' },
  { name: 'WORK DUTY', dur: 55, hint: 'The laundry and workshop are open' },
  { name: 'FREE TIME', dur: 45, hint: 'Explore the yard, talk to other prisoners' },
  { name: 'LOCKDOWN', dur: 30, hint: 'Get back in your cell!', lock: true }
];
export const PHASE = { FREE: 0, BREAKFAST: 1, YARD: 2, WORK: 3, FREE2: 4, LOCKDOWN: 5 };

export const ITEMS = {
  SPOON: { name: 'Spoon', icon: '🥄' },
  TRAY: { name: 'Food tray', icon: '🍱' },
  SCREWDRIVER: { name: 'Screwdriver', icon: '🪛', unique: true },
  CUTTERS: { name: 'Bolt cutters', icon: '✂️', unique: true },
  KEYCARD: { name: 'Keycard', icon: '💳', unique: true },
  ROPE: { name: 'Bedsheet rope', icon: '🪢' },
  VANKEYS: { name: 'Van keys', icon: '🔑', unique: true },
  UNIFORM: { name: 'Guard uniform', icon: '🦺' }
};

const C = {
  concrete: 0xc9c4b8, wall: 0xd9d3c4, wallB: 0xb8c2c9, trim: 0x7f8c8d, floor: 0xb3ab9c, bars: 0x4f5b66, roof: 0x8f8f8f,
  grass: 0x6ab04c, court: 0xd3742b, line: 0xffffff, steel: 0x5d6d7e, fence: 0x9aa5ab, red: 0xc0392b, yellow: 0xf1c40f,
  blue: 0x2c3e50, orange: 0xe67e22, white: 0xecf0f1, dark: 0x34495e, tile: 0x9fc3d6, water: 0x2f86b8, wood: 0x8e6e53,
  metal: 0x7f8c8d, green: 0x27ae60, asphalt: 0x3d3d46, hill: 0x5b7f3a, dirt: 0x8d6e4f, sewer: 0x6b6e5a, tunnel: 0x8a8d91,
  bed: 0xdfe6e9, blanket: 0x7f8fa6, desk: 0x95775a, screen: 0x2ecc71
};

export function buildPrison() {
  const boxes = [], ladders = [], props = [], labels = [], doors = {}, fences = [];
  const box = (x0, y0, z0, x1, y1, z1, c, solid = true, extra) => {
    const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], c, s: solid };
    if (extra) Object.assign(b, extra);
    boxes.push(b); return b;
  };
  // horizontal slab with rectangular holes
  const slab = (x0, z0, x1, z1, y0, y1, c, holes = []) => {
    const xs = new Set([x0, x1]);
    for (const h of holes) { if (h.x0 > x0 && h.x0 < x1) xs.add(h.x0); if (h.x1 > x0 && h.x1 < x1) xs.add(h.x1); }
    const xa = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < xa.length - 1; i++) {
      const sa = xa[i], sb = xa[i + 1];
      const cover = holes.filter(h => h.x0 <= sa + 1e-6 && h.x1 >= sb - 1e-6).map(h => [Math.max(h.z0, z0), Math.min(h.z1, z1)]).filter(v => v[1] > v[0]).sort((a, b) => a[0] - b[0]);
      let z = z0;
      for (const [ha, hb] of cover) { if (ha > z) box(sa, y0, z, sb, y1, ha, c); z = Math.max(z, hb); }
      if (z < z1) box(sa, y0, z, sb, y1, z1, c);
    }
  };
  // wall running along X (fixed z range), gaps [{a,b,h}] = doorway from x=a..b, h tall (lintel above)
  const wallX = (za, zb, xa, xb, y0, y1, c, gaps = []) => {
    let x = xa;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      if (g.a > x) box(x, y0, za, g.a, y1, zb, c);
      if (g.h !== undefined && g.h < y1) box(g.a, y0 + g.h, za, g.b, y1, zb, c);
      x = g.b;
    }
    if (x < xb) box(x, y0, za, xb, y1, zb, c);
  };
  const wallZ = (xa, xb, za, zb, y0, y1, c, gaps = []) => {
    let z = za;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      if (g.a > z) box(xa, y0, z, xb, y1, g.a, c);
      if (g.h !== undefined && g.h < y1) box(xa, y0 + g.h, g.a, xb, y1, g.b, c);
      z = g.b;
    }
    if (z < zb) box(xa, y0, z, xb, y1, zb, c);
  };
  const door = (id, kind, label, x0, y0, z0, x1, y1, z1, opts = {}) => {
    const col = kind === 'bars' ? C.bars : kind === 'fence' ? C.fence : kind === 'panel' ? C.metal : kind === 'tile' ? C.tile : kind === 'gate' ? C.steel : C.steel;
    const b = box(x0, y0, z0, x1, y1, z1, col, true, { door: id });
    doors[id] = { id, kind, label, min: b.min, max: b.max, ...opts };
    return b;
  };
  const ladder = (x0, z0, x1, z1, y0, y1) => {
    box(x0, y0, z0, x1, y1, z1, C.metal, false);
    ladders.push({ min: [Math.min(x0, x1) - 0.35, y0, Math.min(z0, z1) - 0.35], max: [Math.max(x0, x1) + 0.35, y1 + 0.6, Math.max(z0, z1) + 0.35] });
  };
  const lamp = (x, y, z) => box(x - 0.25, y - 0.08, z - 0.25, x + 0.25, y, z + 0.25, 0xfff3b0, false);
  const table = (x, z) => {
    box(x - 1.2, 0.72, z - 0.5, x + 1.2, 0.8, z + 0.5, C.metal);
    box(x - 0.08, 0, z - 0.08, x + 0.08, 0.72, z + 0.08, C.dark);
    for (const s of [-1, 1]) box(x - 1.2, 0.42, z + s * 0.75 - 0.18, x + 1.2, 0.48, z + s * 0.75 + 0.18, C.metal);
  };

  // ------------------------------------------------------------------ ground (with holes to the tunnels and sewer)
  const H1 = { x0: 22, z0: 441.5, x1: 24, z1: 443.5 };       // maintenance closet shaft
  const H2 = { x0: 22, z0: 465, x1: 24, z1: 467 };           // tunnel exit manhole (outside the wall)
  const H3 = { x0: -43, z0: 436.3, x1: -41.6, z1: 437.7 };   // loose shower tile -> sewer
  const H4 = { x0: -68, z0: 436.2, x1: -66, z1: 438.5 };     // sewer outflow manhole (outside the wall)
  slab(PRISON.x0, PRISON.z0, PRISON.x1, PRISON.z1, -0.7, 0, C.concrete, [H1, H2, H3, H4]);
  // visual ground paint (non-solid)
  box(PRISON.x0, 0.002, PRISON.z0, PRISON.x1, 0.006, PERIM.z0 - 0.5, C.grass, false);
  box(PRISON.x0, 0.002, PERIM.z1 + 0.5, PRISON.x1, 0.006, PRISON.z1, C.grass, false);
  box(PRISON.x0, 0.002, PERIM.z0 - 0.5, PERIM.x0 - 0.5, 0.006, PERIM.z1 + 0.5, C.grass, false);
  box(PERIM.x1 + 0.5, 0.002, PERIM.z0 - 0.5, PRISON.x1, 0.006, PERIM.z1 + 0.5, C.grass, false);
  box(-4.5, 0.008, PRISON.z0, 4.5, 0.012, 344, C.asphalt, false);                  // approach road
  for (let z = 292; z < 342; z += 6) box(-0.12, 0.013, z, 0.12, 0.016, z + 3, C.yellow, false);
  box(-12, 0.008, 324, -4.5, 0.012, 340, C.asphalt, false);                        // visitor parking
  box(-12, 0.008, 410, 12, 0.012, 440, C.dirt, false);                              // yard
  box(-10, 0.013, 414, 10, 0.017, 436, C.court, false);                             // basketball court
  for (const [a, b, c2, d] of [[-10, 414, 10, 414.12], [-10, 435.88, 10, 436], [-10, 414, -9.88, 436], [9.88, 414, 10, 436], [-10, 424.94, 10, 425.06]]) box(a, 0.018, b, c2, 0.02, d, C.line, false);
  props.push({ type: 'courtRing', x: 0, y: 0, z: 425 });
  // valley walls (hills) - the edge of the prison area
  const BH = 26;
  box(PRISON.x0 - 2, -0.7, PRISON.z0 - 2, PRISON.x1 + 2, BH, PRISON.z0, C.hill);
  box(PRISON.x0 - 2, -0.7, PRISON.z1, PRISON.x1 + 2, BH, PRISON.z1 + 2, C.hill);
  box(PRISON.x0 - 2, -0.7, PRISON.z0, PRISON.x0, BH, PRISON.z1, C.hill);
  box(PRISON.x1, -0.7, PRISON.z0, PRISON.x1 + 2, BH, PRISON.z1, C.hill);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, x = Math.cos(a) * (70 + (i % 4) * 4), z = 400 + Math.sin(a) * (66 + (i % 3) * 5);
    if (Math.abs(x) < 8 && z < 345) continue;
    if (x > PERIM.x0 - 4 && x < PERIM.x1 + 4 && z > PERIM.z0 - 4 && z < PERIM.z1 + 4) continue;
    props.push({ type: 'tree', x, y: 0, z, s: 1.1 });
  }

  // ------------------------------------------------------------------ perimeter wall + electric fence + main gate
  const WH = 8;
  wallX(PERIM.z0 - 0.5, PERIM.z0 + 0.5, PERIM.x0 - 0.5, PERIM.x1 + 0.5, 0, WH, C.wallB, [{ a: -5, b: 5, h: WH }, { a: 7, b: 9, h: 2.8 }]);
  wallX(PERIM.z1 - 0.5, PERIM.z1 + 0.5, PERIM.x0 - 0.5, PERIM.x1 + 0.5, 0, WH, C.wallB);
  wallZ(PERIM.x0 - 0.5, PERIM.x0 + 0.5, PERIM.z0 + 0.5, PERIM.z1 - 0.5, 0, WH, C.wallB);
  wallZ(PERIM.x1 - 0.5, PERIM.x1 + 0.5, PERIM.z0 + 0.5, PERIM.z1 - 0.5, 0, WH, C.wallB);
  // fence band on top of the wall (solid, shocks you while powered). Rendered separately so it can glow / go dark.
  for (const f of [[PERIM.x0 - 0.1, PERIM.z0 - 0.1, PERIM.x1 + 0.1, PERIM.z0 + 0.1], [PERIM.x0 - 0.1, PERIM.z1 - 0.1, PERIM.x1 + 0.1, PERIM.z1 + 0.1],
                   [PERIM.x0 - 0.1, PERIM.z0, PERIM.x0 + 0.1, PERIM.z1], [PERIM.x1 - 0.1, PERIM.z0, PERIM.x1 + 0.1, PERIM.z1]]) {
    fences.push(box(f[0], WH, f[1], f[2], WH + 1.8, f[3], C.fence, true, { fence: true }));
  }
  for (const x of [-40, -16, 20, 44]) labels.push({ text: '⚡ HIGH VOLTAGE', p: [x, 5.6, PERIM.z0 + 0.53], rotY: 0, color: '#111111', bg: '#f1c40f' });
  for (const z of [380, 430]) { labels.push({ text: '⚡ HIGH VOLTAGE', p: [PERIM.x0 + 0.53, 5.6, z], rotY: Math.PI / 2, color: '#111111', bg: '#f1c40f' }); labels.push({ text: '⚡ HIGH VOLTAGE', p: [PERIM.x1 - 0.53, 5.6, z], rotY: -Math.PI / 2, color: '#111111', bg: '#f1c40f' }); }
  door('gate', 'gate', 'Main gate', -5, 0, PERIM.z0 - 0.4, 5, WH, PERIM.z0 + 0.4);
  door('pedgate', 'steel', 'Staff gate', 7, 0, PERIM.z0 - 0.35, 9, 2.8, PERIM.z0 + 0.35, { keycard: true });
  labels.push({ text: 'COUNTY PRISON', p: [0, 9.6, PERIM.z0 - 0.55], rotY: Math.PI, color: '#ffffff', bg: '#2c3e50' });
  labels.push({ text: 'STAFF ONLY', p: [8, 3.4, PERIM.z0 - 0.55], rotY: Math.PI, color: '#ffffff', bg: '#c0392b' });
  // guard booth + gate guards outside
  box(9.5, 0, 335, 13, 2.6, 338.5, C.wall); box(9.3, 2.6, 334.8, 13.2, 2.9, 338.7, C.red);
  box(9.48, 1.2, 335.6, 9.5, 2.2, 337.9, 0x9be7ff, false);
  box(-3, 0, 330.5, 3, 1.1, 331, C.red, false); box(-3, 1.1, 330.5, 3, 1.3, 331, C.white, false); // barrier arm (visual)
  // guard towers (4 corners): legs, platform, railing, roof, ladder on the inside
  const towers = [];
  for (const [tx, tz] of [[-56, 349], [56, 349], [-56, 451], [56, 451]]) {
    const inZ = tz < 400 ? 1 : -1;
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(tx + lx - 0.2, 0, tz + lz - 0.2, tx + lx + 0.2, 9, tz + lz + 0.2, C.steel);
    box(tx - 2, 9, tz - 2, tx + 2, 9.3, tz + 2, C.dark);
    for (const s of [-1, 1]) { box(tx - 2, 9.3, tz + s * 2 - 0.08, tx + 2, 10.4, tz + s * 2 + 0.08, C.trim); box(tx + s * 2 - 0.08, 9.3, tz - 2, tx + s * 2 + 0.08, 10.4, tz + 2, C.trim); }
    for (const [lx, lz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) box(tx + lx - 0.07, 10.4, tz + lz - 0.07, tx + lx + 0.07, 11.8, tz + lz + 0.07, C.trim, false);
    box(tx - 2.3, 11.8, tz - 2.3, tx + 2.3, 12.05, tz + 2.3, C.red);
    ladder(tx - 0.4, tz + inZ * 2.1, tx + 0.4, tz + inZ * 2.2, 0, 9.3);
    props.push({ type: 'searchlight', x: tx, y: 10.4, z: tz, dir: inZ });
    towers.push({ x: tx, y: 9.3, z: tz, yaw: inZ > 0 ? Math.PI : 0 });
  }

  // ------------------------------------------------------------------ sally port (vehicle yard behind the gate)
  wallZ(-28.15, -27.85, PERIM.z0 + 0.5, 366, 0, 4.5, C.fence);
  wallZ(27.85, 28.15, PERIM.z0 + 0.5, 366, 0, 4.5, C.fence);
  box(-28, 0, 365.85, -24, 4.5, 366.15, C.fence); box(24, 0, 365.85, 28, 4.5, 366.15, C.fence);
  box(-25, 0.008, 346, 25, 0.012, 365, C.asphalt, false);
  for (let x = -22; x <= -8; x += 7) box(x - 0.06, 0.013, 349, x + 0.06, 0.016, 361, C.line, false);
  labels.push({ text: 'SALLY PORT', p: [-20, 3.6, 365.8], rotY: Math.PI, color: '#ffffff', bg: '#c0392b' });

  // ------------------------------------------------------------------ admin building (checkpoint, guard offices, control room, armory, lockers)
  const AY = 4.5;
  wallX(366, 366.3, -24, 24, 0, AY, C.wallB, [{ a: -1, b: 1, h: 2.6 }]);
  wallX(389.7, 390, -24, 24, 0, AY, C.wallB, [{ a: -1, b: 1, h: 2.6 }]);
  wallZ(-24, -23.7, 366.3, 389.7, 0, AY, C.wallB);
  wallZ(23.7, 24, 366.3, 389.7, 0, AY, C.wallB);
  wallX(377.85, 378.15, -23.7, 23.7, 0, AY, C.wall, [{ a: -1.1, b: 1.1, h: 2.6 }]);
  wallZ(-8.15, -7.85, 366.3, 389.7, 0, AY, C.wall, [{ a: 371, b: 373, h: 2.6 }, { a: 383, b: 385, h: 2.6 }]);
  wallZ(7.85, 8.15, 366.3, 389.7, 0, AY, C.wall, [{ a: 371, b: 373, h: 2.6 }, { a: 383, b: 385, h: 2.6 }]);
  slab(-24, 366, 24, 390, AY, AY + 0.3, C.roof);
  for (const [a, b, c2, d] of [[-24, 366, 24, 366.2], [-24, 389.8, 24, 390], [-24, 366, -23.8, 390], [23.8, 366, 24, 390]]) box(a, AY + 0.3, b, c2, AY + 0.9, d, C.trim);
  door('adminN', 'steel', 'Admin door (north)', -1, 0, 366.02, 1, 2.6, 366.28, { keycard: true });
  door('adminS', 'steel', 'Admin door (south)', -1, 0, 389.72, 1, 2.6, 389.98, { keycard: true });
  door('locker', 'steel', 'Locker room door', -8.13, 0, 383, -7.87, 2.6, 385, { keycard: true });
  door('control', 'steel', 'Control room door', 7.87, 0, 371, 8.13, 2.6, 373, { keycard: true });
  door('armory', 'bars', 'Armory door', 7.87, 0, 383, 8.13, 2.6, 385, { keycard: true });
  // checkpoint: metal detector arch + desk
  box(-1.45, 0, 377.7, -1.15, 2.7, 378.3, C.dark); box(1.15, 0, 377.7, 1.45, 2.7, 378.3, C.dark); box(-1.45, 2.6, 377.7, 1.45, 2.85, 378.3, C.dark);
  box(-6, 0, 369, -3, 1.05, 370.2, C.desk); box(3, 0, 374.5, 6.5, 1.05, 375.7, C.desk);
  labels.push({ text: 'SECURITY CHECKPOINT', p: [0, 3.4, 377.83], rotY: Math.PI, color: '#ffffff', bg: '#2c3e50' });
  labels.push({ text: 'VISITORS & STAFF', p: [0, 3.5, 366.0 - 0.01], rotY: Math.PI, color: '#ffffff', bg: '#2c3e50' });
  // guard offices
  for (const [x, z] of [[-20, 370], [-14, 370], [-20, 375], [-14, 375]]) { box(x - 1, 0, z - 0.5, x + 1, 0.8, z + 0.5, C.desk); box(x - 0.3, 0.8, z - 0.2, x + 0.3, 1.2, z - 0.15, 0x222831); }
  labels.push({ text: 'GUARD OFFICE', p: [-16, 3.4, 377.83], rotY: Math.PI, color: '#ffffff', bg: '#34495e' });
  // locker room
  for (let x = -23.4; x < -9; x += 1.1) box(x, 0, 388.9, x + 1.0, 2.1, 389.6, 0x2980b9);
  box(-20, 0, 382, -12, 0.45, 382.6, C.wood);
  labels.push({ text: 'STAFF LOCKERS', p: [-16, 3.4, 378.17], rotY: 0, color: '#ffffff', bg: '#2980b9' });
  // control room: consoles with screens
  box(10, 0, 366.4, 23.5, 1.0, 367.6, C.dark);
  for (let x = 10.5; x < 23; x += 2.2) box(x, 1.3, 366.35, x + 1.8, 2.5, 366.45, C.screen, false);
  labels.push({ text: 'CONTROL ROOM', p: [16, 3.4, 377.83], rotY: Math.PI, color: '#ffffff', bg: '#16a085' });
  // armory: weapon racks behind bars
  for (let x = 9; x < 23; x += 2.5) { box(x, 0, 388.8, x + 2, 2.2, 389.6, C.dark); for (let k = 0; k < 4; k++) box(x + 0.25 + k * 0.45, 0.6, 388.7, x + 0.35 + k * 0.45, 1.9, 388.8, 0x111111, false); }
  labels.push({ text: 'ARMORY', p: [16, 3.4, 378.17], rotY: 0, color: '#ffffff', bg: '#c0392b' });
  // corridor
  labels.push({ text: 'CELL BLOCK A ▼', p: [0, 3.4, 389.68], rotY: Math.PI, color: '#ffffff', bg: '#2c3e50' });
  for (const z of [370, 376, 382, 388]) for (const x of [-16, 0, 16]) lamp(x, AY - 0.02, z);

  // ------------------------------------------------------------------ cell block A
  const CY = 6.5, CX0 = -56, CX1 = -16, CZ0 = 394, CZ1 = 442;
  wallX(CZ0, CZ0 + 0.3, CX0, CX1, 0, CY, C.wall, [{ a: -37, b: -35, h: 3 }]);
  wallX(CZ1 - 0.3, CZ1, CX0, CX1, 0, CY, C.wall);
  wallZ(CX0, CX0 + 0.3, CZ0 + 0.3, CZ1 - 0.3, 0, CY, C.wall);
  wallZ(CX1 - 0.3, CX1, CZ0 + 0.3, CZ1 - 0.3, 0, CY, C.wall, [{ a: 417, b: 419, h: 3 }]);
  slab(CX0, CZ0, CX1, CZ1, CY, CY + 0.3, C.roof);
  for (const [a, b, c2, d] of [[CX0, CZ0, CX1, CZ0 + 0.2], [CX0, CZ1 - 0.2, CX1, CZ1], [CX0, CZ0, CX0 + 0.2, CZ1], [CX1 - 0.2, CZ0, CX1, CZ1]]) box(a, CY + 0.3, b, c2, CY + 0.9, d, C.trim);
  labels.push({ text: 'CELL BLOCK A', p: [-36, 4.4, CZ0 - 0.01], rotY: Math.PI, color: '#ffffff', bg: '#2c3e50' });
  const cells = [];
  const CH = 3.2;
  for (const side of [0, 1]) {
    const fx = side === 0 ? -51 : -21;               // front wall x
    const bx0 = side === 0 ? CX0 + 0.3 : -21, bx1 = side === 0 ? -51 : CX1 - 0.3;
    const gaps = [];
    for (let k = 0; k < 5; k++) gaps.push({ a: 396 + k * 6 + 2, b: 396 + k * 6 + 4, h: 2.6 });
    wallZ(fx - 0.15, fx + 0.15, 396, 426, 0, CH, C.bars, gaps);
    for (let k = 0; k <= 5; k++) { const zp = 396 + k * 6; box(bx0, 0, zp - 0.15, bx1, CH, zp + 0.15, C.wall); }
    box(bx0, CH, 395.85, bx1, CH + 0.2, 426.15, C.concrete);  // cell ceilings
    for (let k = 0; k < 5; k++) {
      const z0 = 396 + k * 6, idx = side * 5 + k;
      door('cell' + idx, 'bars', 'Cell ' + (idx + 1), fx - 0.1, 0, z0 + 2, fx + 0.1, 2.6, z0 + 4, { cell: idx });
      const bedX0 = side === 0 ? CX0 + 0.4 : CX1 - 1.6, bedX1 = bedX0 + 1.2;
      box(bedX0, 0, z0 + 0.4, bedX1, 0.5, z0 + 2.6, C.bed);
      box(bedX0 + 0.05, 0.5, z0 + 0.9, bedX1 - 0.05, 0.56, z0 + 2.55, C.blanket, false);
      box(bedX0 + 0.15, 0.5, z0 + 0.45, bedX1 - 0.15, 0.64, z0 + 0.85, C.white, false);
      const tx = side === 0 ? CX0 + 0.75 : CX1 - 0.75;
      box(tx - 0.3, 0, z0 + 4.8, tx + 0.3, 0.5, z0 + 5.6, C.white);      // toilet
      lamp((bx0 + bx1) / 2, CH - 0.02, z0 + 3);
      cells.push({ idx, door: 'cell' + idx, bed: [(bedX0 + bedX1) / 2, 0.5, z0 + 1.6], yaw: side === 0 ? -Math.PI / 2 : Math.PI / 2,
                   min: [Math.min(bx0, bx1), z0 + 0.15], max: [Math.max(bx0, bx1), z0 + 5.85], front: [fx + (side === 0 ? 1.2 : -1.2), 0, z0 + 3] });
      labels.push({ text: String(idx + 1), p: [fx + (side === 0 ? 0.17 : -0.17), 2.95, z0 + 3], rotY: side === 0 ? Math.PI / 2 : -Math.PI / 2, color: '#ffffff', bg: '#2c3e50' });
    }
  }
  // common area: tables, TV, upper lights
  for (const [x, z] of [[-42, 402], [-30, 402], [-42, 412], [-30, 412], [-42, 421], [-30, 421]]) table(x, z);
  box(-37.5, 3.6, 394.35, -34.5, 5.2, 394.5, 0x111111); box(-37.3, 3.75, 394.5, -34.7, 5.05, 394.52, 0x3fa7d6, false);
  for (const z of [400, 410, 420, 430]) for (const x of [-46, -36, -26]) lamp(x, CY - 0.02, z);
  // shower room with the loose tile
  wallX(430, 430.3, CX0 + 0.3, -40, 0, CY, C.tile, [{ a: -46, b: -44, h: 2.6 }]);
  wallZ(-40.3, -40, 430.3, CZ1 - 0.3, 0, CY, C.tile);
  box(CX0 + 0.3, 0.003, 430.3, -40.3, 0.008, CZ1 - 0.3, C.tile, false);
  for (let x = -54; x < -41; x += 2.5) { box(x - 0.05, 2.0, 441.4, x + 0.05, 2.6, 441.7, C.metal, false); box(x - 0.15, 2.0, 441.2, x + 0.15, 2.08, 441.5, C.metal, false); }
  door('tile', 'tile', 'Loose tile', H3.x0, -0.7, H3.z0, H3.x1, 0, H3.z1);
  labels.push({ text: 'SHOWERS', p: [-45, 3.2, 429.98], rotY: Math.PI, color: '#ffffff', bg: '#2980b9' });

  // ------------------------------------------------------------------ medical room
  wallX(394, 394.3, -10, 10, 0, 4, C.wall);
  wallX(405.7, 406, -10, 10, 0, 4, C.wall, [{ a: -1, b: 1, h: 2.6 }]);
  wallZ(-10, -9.7, 394.3, 405.7, 0, 4, C.wall); wallZ(9.7, 10, 394.3, 405.7, 0, 4, C.wall);
  slab(-10, 394, 10, 406, 4, 4.3, C.roof);
  for (const x of [-7, -3]) { box(x - 0.6, 0, 395, x + 0.6, 0.7, 397.4, C.white); box(x - 0.55, 0.7, 395.05, x + 0.55, 0.75, 397.35, 0x81ecec, false); }
  box(6, 0, 394.3, 8.4, 1.1, 395.3, 0xdfe6e9); box(6.1, 0.85, 395.3, 8.3, 0.95, 395.35, C.dark, false);   // drawer cabinet
  box(-0.5, 2.9, 394.31, 0.5, 3.5, 394.35, C.red, false); box(-0.15, 2.95, 394.35, 0.15, 3.45, 394.37, C.white, false);
  labels.push({ text: '✚ MEDICAL', p: [0, 3.2, 406.02], rotY: 0, color: '#ffffff', bg: '#c0392b' });
  lamp(0, 3.98, 400);

  // ------------------------------------------------------------------ cafeteria
  wallX(394, 394.3, 16, 52, 0, 5, C.wall);
  wallX(419.7, 420, 16, 52, 0, 5, C.wall);
  wallZ(16, 16.3, 394.3, 419.7, 0, 5, C.wall, [{ a: 405, b: 409, h: 3 }]);
  wallZ(51.7, 52, 394.3, 419.7, 0, 5, C.wall);
  slab(16, 394, 52, 420, 5, 5.3, C.roof);
  box(20, 0, 395, 44, 1.05, 396.4, C.metal);                       // serving counter
  for (let x = 21; x < 43; x += 3) box(x, 1.05, 395.2, x + 2.4, 1.12, 396.2, 0xe17055, false);
  box(41.4, 1.05, 395.6, 42.6, 1.45, 396.2, C.dark);               // cutlery bin
  for (const [x, z] of [[24, 402], [33, 402], [42, 402], [24, 410], [33, 410], [42, 410], [24, 416], [33, 416], [42, 416]]) table(x, z);
  labels.push({ text: 'CAFETERIA', p: [16 - 0.02, 3.8, 407], rotY: -Math.PI / 2, color: '#ffffff', bg: '#e67e22' });
  for (const z of [400, 408, 416]) for (const x of [22, 34, 46]) lamp(x, 4.98, z);

  // ------------------------------------------------------------------ laundry + maintenance closet
  wallX(424, 424.3, 16, 32, 0, 4.5, C.wall);
  wallZ(16, 16.3, 424.3, 446, 0, 4.5, C.wall, [{ a: 430, b: 432, h: 2.6 }]);
  wallZ(31.7, 32, 424.3, 446, 0, 4.5, C.wall);
  wallX(439.7, 440, 16.3, 31.7, 0, 4.5, C.wall, [{ a: 23.2, b: 24.8, h: 1.9 }]);
  wallX(445.7, 446, 16.3, 31.7, 0, 4.5, C.wall);
  slab(16, 424, 32, 446, 4.5, 4.8, C.roof);
  door('laundry', 'steel', 'Laundry door', 16.02, 0, 430, 16.28, 2.6, 432, { phase: 3 });
  door('vent', 'panel', 'Maintenance panel', 23.2, 0, 439.72, 24.8, 1.9, 439.98);
  for (let x = 18; x < 31; x += 2.2) { box(x, 0, 424.4, x + 1.8, 1.4, 425.6, C.white); box(x + 0.5, 0.5, 425.6, x + 1.3, 1.1, 425.62, 0x74b9ff, false); }
  box(18.5, 0, 436, 21.5, 0.8, 438, 0xdfe6e9);                        // pile of bedsheets
  box(18.6, 0.8, 436.1, 21.4, 1.0, 437.9, 0xf5f6fa, false);
  labels.push({ text: 'LAUNDRY', p: [16 - 0.02, 3.2, 431], rotY: -Math.PI / 2, color: '#ffffff', bg: '#8e44ad' });
  labels.push({ text: 'MAINTENANCE', p: [24, 2.3, 439.68], rotY: Math.PI, color: '#111111', bg: '#f1c40f' });
  lamp(24, 4.48, 432); lamp(24, 4.48, 443);
  // shaft down to the maintenance tunnel
  for (const [a, b, c2, d] of [[21.8, 441.3, 24.2, 441.5], [21.8, 443.5, 24.2, 443.7], [21.8, 441.5, 22, 443.5], [24, 441.5, 24.2, 443.5]]) box(a, 0, b, c2, 0.9, d, C.yellow);
  ladder(22.5, 443.25, 23.5, 443.45, -4.5, 1.0);

  // ------------------------------------------------------------------ workshop (+ roof hatch, fuse box, rope anchor)
  wallX(424, 424.3, 34, 54, 0, 4.5, C.wall, [{ a: 40, b: 42, h: 2.6 }]);
  wallX(445.7, 446, 34, 54, 0, 4.5, C.wall);
  wallZ(34, 34.3, 424.3, 445.7, 0, 4.5, C.wall); wallZ(53.7, 54, 424.3, 445.7, 0, 4.5, C.wall);
  slab(34, 424, 54, 446, 4.5, 4.8, C.roof, [{ x0: 52, z0: 443.5, x1: 54, z1: 445.5 }]);
  for (const [a, b, c2, d] of [[34, 445.8, 54, 446], [34, 424, 54, 424.2], [34, 424, 34.2, 446], [53.8, 424, 54, 446]]) box(a, 4.8, b, c2, 5.5, d, C.trim);
  door('workshop', 'steel', 'Workshop door', 40, 0, 424.02, 42, 2.6, 424.28, { phase: 3 });
  door('hatch', 'panel', 'Roof hatch', 52, 4.5, 443.5, 53.7, 4.8, 445.5);
  box(44, 0, 424.4, 52, 0.95, 425.6, C.wood);                           // workbenches
  box(36, 0, 432, 38, 0.95, 440, C.wood); box(46, 0, 436, 50, 0.95, 438, C.wood);
  box(40, 0, 444.4, 44, 2.4, 445.6, C.dark);                            // tool wall
  ladder(52.6, 445.3, 53.4, 445.6, 0, 4.8);
  box(43.4, 4.8, 445.0, 44.6, 6.0, 445.7, C.dark);                      // fuse box on the roof
  box(43.6, 5.6, 444.98, 44.4, 5.9, 445.0, C.yellow, false);
  box(45.8, 4.8, 445.5, 46.2, 5.6, 445.75, C.metal);                    // rope anchor pipe
  labels.push({ text: 'WORKSHOP', p: [41, 3.2, 423.98], rotY: Math.PI, color: '#ffffff', bg: '#d35400' });
  lamp(44, 4.48, 430); lamp(44, 4.48, 440);

  // ------------------------------------------------------------------ yard: basketball court + gym corner
  for (const [z, dir] of [[415.0, 1], [435.0, -1]]) {
    box(-0.12, 0, z - dir * 0.6 - 0.12, 0.12, 3.9, z - dir * 0.6 + 0.12, C.steel);
    box(-0.12, 3.6, Math.min(z, z - dir * 0.6), 0.12, 3.8, Math.max(z, z - dir * 0.6), C.steel);
    box(-0.9, 2.85, Math.min(z, z + dir * 0.12), 0.9, 3.95, Math.max(z, z + dir * 0.12), C.white);
    props.push({ type: 'hoop', x: 0, y: 3.05, z: z + dir * 0.12, dir });
  }
  for (const [x, z] of [[-11, 445], [-7, 445]]) { box(x - 1, 0.4, z - 0.3, x + 1, 0.5, z + 0.3, C.dark); box(x - 1.2, 0.9, z - 0.04, x + 1.2, 0.98, z + 0.04, C.metal); }
  for (const x of [-13.2, 13.2]) for (const z of [410, 440]) box(x - 0.1, 0, z - 0.1, x + 0.1, 5, z + 0.1, C.metal);
  labels.push({ text: 'YARD', p: [0, 4.2, 405.95], rotY: Math.PI, color: '#ffffff', bg: '#27ae60' });

  // ------------------------------------------------------------------ maintenance tunnel (underground, east)
  const TY = -4.5;
  box(20.7, TY - 0.5, 440.2, 25.3, TY, 468.3, C.tunnel);
  wallZ(20.7, 21, 440.5, 468, TY, -0.7, C.tunnel);
  wallZ(25, 25.3, 440.5, 468, TY, -0.7, C.tunnel, [{ a: 448, b: 450 }]);
  box(20.7, TY, 440.2, 25.3, -0.7, 440.5, C.tunnel); box(20.7, TY, 468, 25.3, -0.7, 468.3, C.tunnel);
  box(25, TY - 0.5, 445.7, 31.3, TY, 452.3, C.tunnel);                 // storage room
  box(25.3, TY, 445.7, 31.3, -0.7, 446, C.tunnel); box(25.3, TY, 452, 31.3, -0.7, 452.3, C.tunnel); box(31, TY, 446, 31.3, -0.7, 452, C.tunnel);
  for (const z of [444, 452, 460, 466]) { box(21, -1.4, z, 25, -1.2, z + 0.3, C.metal, false); lamp(23, -0.72, z + 1); }
  box(21.05, -2.2, 440.5, 21.3, -1.9, 468, 0x7f6a4f, false); box(24.7, -1.6, 440.5, 24.95, -1.3, 468, 0x95a5a6, false); // pipes
  box(28, TY, 450.6, 30.5, TY + 0.9, 451.8, C.wood);                     // tool shelf
  door('tgate', 'fence', 'Tunnel gate', 21, TY, 456.4, 25, -0.7, 456.6);
  ladder(22.5, 466.8, 23.5, 467.0, TY, 0.8);
  for (const [a, b, c2, d] of [[21.8, 464.8, 24.2, 465], [21.8, 467, 24.2, 467.2], [21.8, 465, 22, 467], [24, 465, 24.2, 467]]) box(a, 0, b, c2, 0.25, d, C.metal);
  lamp(28, -0.72, 449);

  // ------------------------------------------------------------------ sewer (underground, west, deeper)
  const SY = -6;
  box(-70.3, SY - 0.5, 435.2, -40.2, SY, 438.8, C.sewer);
  box(-50.3, SY - 0.5, 419.7, -46.7, SY, 435.2, C.sewer);
  box(-57.3, SY - 0.5, 438.8, -53.7, SY, 450.3, C.sewer);
  wallX(435.2, 435.5, -70.3, -40.2, SY, -0.7, C.sewer, [{ a: -50, b: -47 }]);
  wallX(438.5, 438.8, -70.3, -40.2, SY, -0.7, C.sewer, [{ a: -57, b: -54 }]);
  box(-40.5, SY, 435.5, -40.2, -0.7, 438.5, C.sewer); box(-70.3, SY, 435.5, -70, -0.7, 438.5, C.sewer);
  wallZ(-50.3, -50, 419.7, 435.2, SY, -0.7, C.sewer); wallZ(-47, -46.7, 419.7, 435.2, SY, -0.7, C.sewer); box(-50, SY, 419.7, -47, -0.7, 420, C.sewer);
  wallZ(-57.3, -57, 438.8, 450.3, SY, -0.7, C.sewer); wallZ(-54, -53.7, 438.8, 450.3, SY, -0.7, C.sewer); box(-57, SY, 450, -54, -0.7, 450.3, C.sewer);
  box(-70, SY + 0.02, 435.5, -40.5, SY + 0.08, 438.5, C.water, false);   // dirty water
  box(-50, SY + 0.02, 420, -47, SY + 0.08, 435.5, C.water, false);
  box(-57, SY + 0.02, 438.5, -54, SY + 0.08, 450, C.water, false);
  box(-49.2, SY + 0.7, 420.0, -47.8, SY + 1.5, 420.25, 0xb33939);      // valve A housing
  box(-56.2, SY + 0.7, 449.75, -54.8, SY + 1.5, 450.0, 0xb33939);      // valve B housing
  door('grate', 'bars', 'Sewer grate', -64.2, SY, 435.5, -63.8, -0.7, 438.5);
  ladder(-67.5, 438.3, -66.5, 438.5, SY, 0.8);
  for (const [a, b, c2, d] of [[-68.2, 436, -65.8, 436.2], [-68.2, 438.5, -65.8, 438.7], [-68.2, 436.2, -68, 438.5], [-66, 436.2, -65.8, 438.5]]) box(a, 0, b, c2, 0.25, d, C.metal);
  for (const x of [-44, -52, -60, -67]) lamp(x, -0.72, 437);
  lamp(-48.5, -0.72, 427); lamp(-55.5, -0.72, 445);

  // ------------------------------------------------------------------ data for gameplay
  const R = (x0, y0, z0, x1, y1, z1) => [x0, y0, z0, x1, y1, z1];
  const zones = [
    { name: 'Sally port', b: R(-28, -1, 345, 28, 12, 365.8) },
    { name: 'Admin building', b: R(-24, -1, 366, 24, 7, 390) },
    { name: 'Laundry', b: R(16, -1, 424, 32, 6, 440), open: [PHASE.WORK] },
    { name: 'Workshop', b: R(34, -1, 424, 54, 4.4, 446), open: [PHASE.WORK] },
    { name: 'Maintenance', b: R(16.3, -1, 440, 31.7, 6, 446) },
    { name: 'Underground', b: R(-80, -9, 410, 40, -1.2, 470) },
    { name: 'Rooftops', b: R(PERIM.x0, 4.3, PERIM.z0, PERIM.x1, 30, PERIM.z1), headY: true },
    { name: 'Perimeter', b: R(PERIM.x0, -1, PERIM.z0, PERIM.x0 + 3, 30, PERIM.z1) }, { name: 'Perimeter', b: R(PERIM.x1 - 3, -1, PERIM.z0, PERIM.x1, 30, PERIM.z1) },
    { name: 'Perimeter', b: R(PERIM.x0, -1, PERIM.z1 - 3, PERIM.x1, 30, PERIM.z1) }
  ];
  const cameras = [
    { id: 0, p: [0, 3.8, 365.4], yaw: 0, name: 'Sally port' },
    { id: 1, p: [0, 3.9, 389.4], yaw: 0, name: 'Admin corridor' },
    { id: 2, p: [13.8, 3.6, 433], yaw: -Math.PI / 2, name: 'Laundry door' },
    { id: 3, p: [23, -1.0, 441], yaw: Math.PI, name: 'Tunnel' },
    { id: 4, p: [-36, 5.6, 394.6], yaw: Math.PI, name: 'Cell block' },
    { id: 5, p: [33, 4.3, 446.5], yaw: Math.PI, name: 'Workshop roof' },
    { id: 6, p: [-58.6, 6.5, 400], yaw: -Math.PI / 2, name: 'West wall' }
  ];
  const routes = [
    [[-12, 411], [12, 411], [12, 439], [-12, 439]],                   // yard
    [[-46, 398.5], [-26, 398.5], [-26, 427.5], [-46, 427.5]],         // cell block hall
    [[14, 398], [14, 422], [57, 422], [57, 398], [57, 422], [14, 422]], // cafeteria / laundry outside
    [[-14, 392], [-14, 448], [-50, 448], [-14, 448]],                 // west strip behind the cell block
    [[-4, 380], [4, 380], [4, 388], [-4, 388]],                       // admin corridor
    [[-40, 369], [-40, 391.5], [40, 391.5], [40, 369], [40, 391.5], [-40, 391.5]], // north strip
    [[14, 448], [52, 448], [57, 445], [57, 426], [57, 445], [52, 448]] // south-east strip
  ];
  const statics = [
    { p: [0, 0, 376.8], yaw: Math.PI, role: 'checkpoint' },
    { p: [-6, 0, 340], yaw: Math.PI, role: 'gate' }, { p: [6, 0, 340], yaw: Math.PI, role: 'gate' }
  ];
  const interacts = [
    { id: 'tray', label: 'Grab a food tray', p: [30, 1.25, 397.0], hold: 1, give: 'TRAY', phase: [PHASE.BREAKFAST], phaseMsg: 'Food is only served at BREAKFAST' },
    { id: 'spoon', label: 'Swipe a spoon', p: [42, 1.3, 397.0], hold: 1.5, give: 'SPOON', risky: 9 },
    { id: 'screwdriver', label: 'Take the screwdriver', p: [50, 1.1, 426.0], hold: 1, give: 'SCREWDRIVER' },
    { id: 'rope', label: 'Tie bedsheets into a rope', p: [20, 1.1, 435.6], hold: 6, give: 'ROPE', noise: 5 },
    { id: 'vent', label: 'Unscrew the maintenance panel', p: [24, 1.0, 439.2], hold: 5, need: ['SCREWDRIVER'], door: 'vent', noise: 7 },
    { id: 'cutters', label: 'Take the bolt cutters', p: [29.2, TY + 1.2, 451.0], hold: 1, give: 'CUTTERS' },
    { id: 'tgate', label: 'Cut through the tunnel gate', p: [23, TY + 1.2, 455.8], hold: 6, need: ['CUTTERS'], door: 'tgate', noise: 16 },
    { id: 'tile', label: 'Dig out the loose tile', p: [-42.3, 0.4, 437], hold: 10, need: ['SPOON'], pflag: 'tileKnown', pflagMsg: 'Just a normal floor tile... (someone might know more)', door: 'tile', noise: 11 },
    { id: 'valveA', label: 'Turn the rusty valve', p: [-48.5, SY + 1.1, 420.7], hold: 3, flag: 'valveA', noise: 4 },
    { id: 'valveB', label: 'Turn the rusty valve', p: [-55.5, SY + 1.1, 449.3], hold: 3, flag: 'valveB', noise: 4 },
    { id: 'drawer', label: 'Open the locked drawer', p: [7.2, 1.0, 396.0], hold: 4, give: 'KEYCARD', pflag: 'code', pflagMsg: 'It has a code lock. Someone must know the code...' },
    { id: 'uniform', label: 'Put on a guard uniform', p: [-20, 1.1, 388.3], hold: 3, give: 'UNIFORM' },
    { id: 'vankeys', label: 'Take the van keys', p: [21.5, 1.15, 367.9], hold: 1, give: 'VANKEYS' },
    { id: 'gatebtn', label: 'Press OPEN MAIN GATE', p: [14.5, 1.15, 367.9], hold: 3, act: 'gate' },
    { id: 'camloop', label: 'Loop the camera feeds', p: [11, 1.15, 367.9], hold: 4, act: 'cams' },
    { id: 'hatch', label: 'Unscrew the roof hatch', p: [53, 3.9, 444.6], hold: 4, need: ['SCREWDRIVER'], door: 'hatch', noise: 6 },
    { id: 'fuse', label: 'Cut the fence power', p: [44, 5.5, 444.6], hold: 6, act: 'fence', noise: 12 },
    { id: 'anchor', label: 'Throw the rope over the wall', p: [46, 5.4, 445.2], hold: 4, need: ['ROPE'], act: 'rope' }
  ];
  // keycard readers next to every keycard door
  for (const d of Object.values(doors)) if (d.keycard) {
    const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2;
    interacts.push({ id: 'card_' + d.id, label: 'Swipe keycard: ' + d.label, p: [cx, 1.2, cz], hold: 0.6, need: ['KEYCARD'], door: d.id, doorFor: 6, r: 2.0, both: true });
  }
  const NPCS = ['BIG MIKE', 'DOC', 'LEFTY', 'RICO', 'OLD PETE', 'SPARKS', 'TINY', 'MOUSE'];
  const spots = {
    yard: [[-6, 418], [5, 420], [-8, 430], [7, 432], [0, 428], [-3, 437], [9, 413], [-10, 442]],
    cafeteria: [[24, 406], [33, 406], [42, 406], [28, 406], [37, 406], [24, 413], [33, 413], [42, 413]],
    hall: [[-44, 400], [-28, 404], [-44, 414], [-28, 414], [-38, 424], [-32, 424], [-44, 424], [-28, 400]],
    work: [[19, 427], [24, 427], [28, 427], [38, 430], [45, 434], [48, 427], [5, 425], [-5, 425]]
  };
  return {
    boxes, ladders, props, labels, windows: [], doors, fences, cells, zones, cameras, routes, statics, towers, interacts, npcNames: NPCS, spots,
    arrival: [0, 0, 356], van: [-15, 0, 354, 0], ball: [0, 0.5, 425], rims: [[0, 3.05, 415.47], [0, 3.05, 434.53]],
    approach: [[0, 296], [0, 330], [0, 343], [0, 352], [0, 356]], ropeLand: [46, 0, 459.5], holes: { H1, H2, H3, H4 }
  };
}
