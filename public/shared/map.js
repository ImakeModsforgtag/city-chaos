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

export function buildMap() {
  const boxes = [];      // { min:[x,y,z], max:[x,y,z], c:color, s:solid }
  const ladders = [];    // climb zones for desktop / joystick players
  const windows = [];    // decorative window grids on solid buildings
  const props = [];      // special-shaped visuals (trees, lamps, cars, hoops...)
  const pickups = [];    // weapon / ammo / health spawns
  const spawns = [];     // player spawn points  { p:[x,y,z], team:-1|0|1 }
  const labels = [];     // signs { text, p:[x,y,z], rotY, color }
  const policeLot = [], copSpawns = [], policeExit = [];
  const shops = [];      // robbable stores { name, keeper:[x,y,z], yaw } (yaw 0 = facing -Z)

  const box = (x0, y0, z0, x1, y1, z1, c, solid = true) => {
    boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
                 max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], c, s: solid });
  };
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
  const solidBuilding = (x0, z0, w, d, h, c, roofAccess = false) => {
    box(x0, 0, z0, x0 + w, h, z0 + d, c);
    box(x0, h, z0, x0 + w, h + 0.8, z0 + 0.3, c); box(x0, h, z0 + d - 0.3, x0 + w, h + 0.8, z0 + d, c);
    box(x0, h, z0, x0 + 0.3, h + 0.8, z0 + d, c); box(x0 + w - 0.3, h, z0, x0 + w, h + 0.8, z0 + d, c);
    box(x0 + 0.3, h, z0 + 0.3, x0 + w - 0.3, h + 0.05, z0 + d - 0.3, PALETTE.roof, false);
    windows.push({ x0, z0, x1: x0 + w, z1: z0 + d, y0: 2.2, y1: h - 1 });
    if (roofAccess) props.push({ type: 'ac', x: x0 + w * 0.5, y: h, z: z0 + d * 0.5 });
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
        if (f === 0) for (const dr of doors) if (dr.side === key) ops.push({ a: dr.at, b: dr.at + dr.width, lo: 0, hi: Math.min(2.7, fh - 0.3) });
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
    if (o.sign) labels.push({ text: o.sign, p: o.signPos, rotY: o.signRot || 0, color: o.signColor || '#ffffff', bg: o.signBg || '#222244' });
    return { H, fh, floor: (f) => f * fh };
  };

  // ------------------------------------------------------------------ ground, roads, garage
  const G = { x0: 10, z0: -46, x1: 46, z1: -10 };            // garage footprint (block 1,2)
  const rampHole = { x0: 10.3, z0: -19.6, x1: 13.8, z1: -10 };
  const stairHole = { x0: 42.4, z0: -30, x1: 44.4, z1: -24 };
  slab(-WORLD_HALF, -WORLD_HALF, WORLD_HALF, WORLD_HALF, -0.5, 0, PALETTE.asphalt, [rampHole, stairHole]);

  // road markings (visual)
  for (const rc of [-112, -56, 0, 56, 112]) {
    for (let a = -118; a < 118; a += 6) {
      box(rc - 0.12, 0.005, a, rc + 0.12, 0.02, a + 3, PALETTE.line, false);
      box(a, 0.005, rc - 0.12, a + 3, 0.02, rc + 0.12, PALETTE.line, false);
    }
  }
  // crosswalks at intersections
  for (const ix of [-56, 0, 56]) for (const iz of [-56, 0, 56]) {
    for (let k = -4; k <= 4; k += 1.6) {
      box(ix + k - 0.4, 0.006, iz - 7.6, ix + k + 0.4, 0.025, iz - 6.2, PALETTE.white, false);
      box(ix + k - 0.4, 0.006, iz + 6.2, ix + k + 0.4, 0.025, iz + 7.6, PALETTE.white, false);
      box(ix - 7.6, 0.006, iz + k - 0.4, ix - 6.2, 0.025, iz + k + 0.4, PALETTE.white, false);
      box(ix + 6.2, 0.006, iz + k - 0.4, ix + 7.6, 0.025, iz + k + 0.4, PALETTE.white, false);
    }
  }

  // boundary walls (big colorful "edge of the city" walls)
  const BH = 30;
  box(-WORLD_HALF - 2, -0.5, -WORLD_HALF - 2, WORLD_HALF + 2, BH, -WORLD_HALF, PALETTE.boundary);
  box(-WORLD_HALF - 2, -0.5, WORLD_HALF, WORLD_HALF + 2, BH, WORLD_HALF + 2, PALETTE.boundary);
  box(-WORLD_HALF - 2, -0.5, -WORLD_HALF, -WORLD_HALF, BH, WORLD_HALF, PALETTE.boundary);
  box(WORLD_HALF, -0.5, -WORLD_HALF, WORLD_HALF + 2, BH, WORLD_HALF, PALETTE.boundary);
  windows.push({ x0: -WORLD_HALF - 2, z0: -WORLD_HALF - 2, x1: WORLD_HALF + 2, z1: WORLD_HALF + 2, y0: 3, y1: BH - 2, inward: true });

  // sidewalks (raised 0.15) for every block
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x0 = BLOCK_STARTS[c], z0 = BLOCK_STARTS[r];
    const holes = (r === 1 && c === 2) ? [rampHole, stairHole] : [];
    slab(x0, z0, x0 + BLOCK, z0 + BLOCK, 0, 0.15, PALETTE.sidewalk, holes);
    // curb edge (visual)
    box(x0 - 0.05, 0, z0 - 0.05, x0 + BLOCK + 0.05, 0.16, z0 + 0.25, PALETTE.curb, false);
    box(x0 - 0.05, 0, z0 + BLOCK - 0.25, x0 + BLOCK + 0.05, 0.16, z0 + BLOCK + 0.05, PALETTE.curb, false);
    // street lamps on each block corner
    for (const [lx, lz] of [[1, 1], [BLOCK - 1, 1], [1, BLOCK - 1], [BLOCK - 1, BLOCK - 1]]) {
      props.push({ type: 'lamp', x: x0 + lx, y: 0.15, z: z0 + lz });
      box(x0 + lx - 0.12, 0.15, z0 + lz - 0.12, x0 + lx + 0.12, 5.5, z0 + lz + 0.12, PALETTE.metal, true);
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
    solidBuilding(x + 28, z + 4, 12, 14, 34, PALETTE.tower1);
    solidBuilding(x + 4, z + 4, 12, 13, 10, PALETTE.tower3);
    ladder(x + 16.0, z + 9, x + 16.3, z + 10, Y, 10.8);
    solidBuilding(x + 28, z + 24, 12, 14, 16, PALETTE.tower2);
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
      const s = hollow(sx, z + 28, 12, 13, { floors: 1, fh: 4.2, color: shopCol[i], groundWindows: true, roofAccess: false, stairs: false,
        doors: [{ side: 's', at: 4.5, width: 3 }, { side: 'n', at: 7.5, width: 2 }], sign: names[i], signPos: [sx + 6, 3.4, z + 41.05], signBg: '#222' });
      ladder(sx + 11.5, z + 27.4, sx + 12.0, z + 27.7, Y, s.H + 1.2);
      shops.push({ name: names[i], keeper: [sx + 6, Y, z + 29.8], yaw: Math.PI });
      if (i === 0) { pickup('weapon', 'pistol', sx + 3, 1.0, z + 33); pickup('weapon', 'revolver', sx + 9, 1.0, z + 33); box(sx + 1, Y, z + 31, sx + 11, 1.0, z + 32, PALETTE.wood); }
      if (i === 1) pickup('ammo', null, sx + 6, 0.9, z + 34);
      if (i === 2) pickup('health', null, sx + 6, 0.9, z + 34);
    }
    const m = hollow(x + 4, z + 3, 34, 16, { floors: 2, fh: 4, color: PALETTE.mart, roofAccess: true,
      doors: [{ side: 's', at: 15, width: 4 }, { side: 'w', at: 6, width: 2.4 }, { side: 'e', at: 6, width: 2.4 }],
      sign: 'MEGA MART', signPos: [x + 21, 3.3, z + 19.05], signBg: '#4a148c' });
    for (let k = 0; k < 4; k++) box(x + 10 + k * 6, Y, z + 8, x + 11.2 + k * 6, 2.0, z + 15, 0xeeeeee); // shelves
    pickup('weapon', 'pistol', x + 32, 1.0, z + 10);
    pickup('weapon', 'smg', x + 20, 4 + 1.0, z + 12);
    shops.push({ name: 'MEGA MART', keeper: [x + 28, Y, z + 17], yaw: Math.PI });
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
    pickup('weapon', 'shotgun', x + 20, 1.0, z + 10);
    pickup('weapon', 'shotgun', x + 30, 4 + 1.0, z + 18);
    pickup('ammo', null, x + 12, 1.0, z + 20);
    pickup('weapon', 'ar', x + 33, p.H + 1.3, z + 8);
    // parking lot with police cars
    // police lot: drivable police cars (spawned by the server) + cop player spawns
    policeLot.push([x + 12, Y, z + 33, Math.PI / 2], [x + 22, Y, z + 33, Math.PI / 2], [x + 32, Y, z + 37, Math.PI / 2]);
    for (const [cx, cz] of [[x + 9, z + 28], [x + 17, z + 28], [x + 25, z + 28], [x + 33, z + 28], [x + 41, z + 30]]) copSpawns.push([cx, Y, cz]);
    policeExit.push(x + 22, 0, z + 50); // road in front of the station (z = -56)
    spawns.push({ p: [x + 6, Y, z + 30], team: 0 });
  }

  // (0,3) Towers + dead-end alley with hidden weapon crate
  {
    const { x, z } = B(0, 3);
    solidBuilding(x + 2, z + 2, 16, 18, 42, PALETTE.tower4);
    solidBuilding(x + 22, z + 2, 20, 14, 28, PALETTE.tower2);
    solidBuilding(x + 22, z + 20, 20, 10, 12, PALETTE.apt3, true);
    ladder(x + 30, z + 30.0, x + 31, z + 30.3, Y, 13);
    solidBuilding(x + 2, z + 26, 16, 16, 20, PALETTE.tower3);
    box(x + 18, Y, z + 2, x + 22, 4, z + 2.4, PALETTE.concreteDark); // alley back wall
    const cy = crate(x + 20, Y, z + 4);
    pickup('weapon', 'ar', x + 20, cy + 0.5, z + 4);
    box(x + 18.4, Y, z + 9, x + 21, Y + 1.5, z + 11, 0x2e7d32);
    pickup('weapon', 'sniper', x + 32, 12 + 1.3, z + 25);
    spawns.push({ p: [x + 34, Y, z + 38], team: 0 });
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
    const tps = [[5, 5], [12, 8], [6, 14], [32, 6], [38, 12], [30, 15], [6, 32], [14, 38], [8, 40], [36, 34], [40, 40], [30, 38], [16, 14], [28, 30]];
    for (const [tx, tz] of tps) { props.push({ type: 'tree', x: x + tx, y: gy, z: z + tz, s: 0.9 + ((tx * 7 + tz * 3) % 5) * 0.12 }); box(x + tx - 0.3, gy, z + tz - 0.3, x + tx + 0.3, gy + 2.6, z + tz + 0.3, PALETTE.trunk); }
    // benches
    for (const [bx, bz] of [[17, 10], [26, 33], [10, 26], [33, 19]]) box(x + bx - 1, gy, z + bz - 0.3, x + bx + 1, gy + 0.5, z + bz + 0.3, PALETTE.wood);
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
    solidBuilding(x + 4, z + 30, 16, 12, 9, PALETTE.apt3, true);
    ladder(x + 20.0, z + 34, x + 20.3, z + 35, Y, 9.8);
    solidBuilding(x + 24, z + 30, 18, 12, 18, PALETTE.tower1);
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
    solidBuilding(x + 28, z + 4, 14, 16, 12, PALETTE.shop2, true);
    ladder(x + 27.7, z + 10, x + 28.0, z + 11, Y, 12.8);
    pickup('weapon', 'sniper', x + 35, 12 + 1.3, z + 12);
    solidBuilding(x + 4, z + 24, 14, 18, 16, PALETTE.shop3);
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
    spawns.push({ p: [x + 22, Y, z + 38], team: 1 });
  }

  // (3,1) Towers & alleys
  {
    const { x, z } = B(3, 1);
    solidBuilding(x + 2, z + 2, 14, 14, 30, PALETTE.tower3);
    solidBuilding(x + 20, z + 2, 10, 20, 22, PALETTE.tower4);
    solidBuilding(x + 34, z + 2, 8, 12, 14, PALETTE.apt1);
    solidBuilding(x + 2, z + 20, 14, 10, 7, PALETTE.shop2, true);
    ladder(x + 16.0, z + 24, x + 16.3, z + 25, Y, 7.8);
    solidBuilding(x + 2, z + 34, 18, 8, 18, PALETTE.tower2);
    solidBuilding(x + 26, z + 28, 16, 14, 10, PALETTE.mart, true);
    ladder(x + 25.7, z + 34, x + 26.0, z + 35, Y, 10.8);
    pickup('weapon', 'sniper', x + 34, 10 + 1.3, z + 35);
    pickup('weapon', 'pistol', x + 9, 7 + 1.0, z + 25);
    pickup('ammo', null, x + 18, Y + 0.8, z + 10);
    box(x + 17, Y, z + 14, x + 19, Y + 1.4, z + 16, 0x2e7d32);
    spawns.push({ p: [x + 22, Y, z + 25], team: 1 });
  }

  // (3,2) Apartments C
  {
    const { x, z } = B(3, 2);
    const a = hollow(x + 4, z + 4, 22, 16, { floors: 3, fh: 3.2, color: PALETTE.apt3, trim: 0xfff0f5, roofAccess: true,
      doors: [{ side: 'n', at: 9, width: 3 }, { side: 'e', at: 6, width: 2.4 }], sign: 'PINK PALMS', signPos: [x + 15, 3.0, z + 3.95], signRot: Math.PI, signBg: '#880e4f' });
    pickup('weapon', 'pistol', x + 20, 1.0, z + 10);
    pickup('weapon', 'smg', x + 12, 3.2 + 1.0, z + 14);
    pickup('ammo', null, x + 20, a.H + 1.2, z + 16);
    solidBuilding(x + 30, z + 4, 12, 22, 20, PALETTE.tower1);
    solidBuilding(x + 4, z + 26, 20, 16, 13, PALETTE.apt2, true);
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
    // crane (visual mast collidable)
    box(x + 38, Y, z + 8, x + 40, 26, z + 10, 0xffc107);
    box(x + 18, 25, z + 8.5, x + 42, 26, z + 9.5, 0xffc107, false);
    // sand piles & barriers
    for (const [bx, bz] of [[10, 30], [16, 36], [24, 28]]) box(x + bx, Y, z + bz, x + bx + 3, Y + 1.0, z + bz + 0.6, 0xff7043);
    spawns.push({ p: [x + 20, Y, z + 38], team: 1 });
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
  return { boxes, ladders, windows, props, pickups, spawns, labels, shops, trafficLoops, policeLot, copSpawns, policeExit, donutDoor, worldHalf: WORLD_HALF, blockStarts: BLOCK_STARTS, block: BLOCK };
}
