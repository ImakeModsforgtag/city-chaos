// CITY CHAOS - the city overhaul (client visuals only; collision lives in shared/map.js).
// Facades (windows, frames, sills, pilasters, glass curtain walls, storefronts), gable roofs, roads (markings,
// crosswalks, stop lines, manholes), traffic signals + street name signs, stop signs, street furniture, landmarks.
// Everything goes into per-block batches (see Chunker in city.js), so the whole city is a handful of draw calls.
import * as THREE from 'three';
import { trs, TexBatch } from './geo.js';
import { rng } from '/shared/cityKit.js';

const GLASS = [0x9fd4f2, 0xb5e3fa, 0x86c1e6, 0xa9d8f4, 0xc9ecfc, 0x7fb6dc];
const WARM = 0xffe6a0;
const WHITE = 0xf6f6f0, YELLOW = 0xffd54a;
const BS = [-106, -50, 6, 62];
export const STREET_X = { '-112': 'WEST END', '-56': 'OAK ST', '0': 'MAIN ST', '56': 'PIXEL BLVD', '112': 'EAST END' };     // north-south roads at x
export const STREET_Z = { '-112': 'NORTH RD', '-56': 'CHAOS AVE', '0': 'CENTRAL AVE', '56': 'DONUT DR', '112': 'SUNSET WAY' }; // east-west roads at z

const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

// ---------------------------------------------------------------- face helpers
function faces(b) {
  return [
    { k: 'n', horiz: true, f: b.z0, n: -1, a0: b.x0, a1: b.x1 }, { k: 's', horiz: true, f: b.z1, n: 1, a0: b.x0, a1: b.x1 },
    { k: 'w', horiz: false, f: b.x0, n: -1, a0: b.z0, a1: b.z1 }, { k: 'e', horiz: false, f: b.x1, n: 1, a0: b.z0, a1: b.z1 }];
}
// flat quad on a face: centered at 'a' along the face, height y, pushed 'off' meters out from the wall
function fq(bt, F, a, y, w, h, off, color) {
  if (F.horiz) bt.quad(a, y, F.f + F.n * off, w, h, 'z', F.n, color); else bt.quad(F.f + F.n * off, y, a, w, h, 'x', F.n, color);
}
// box sticking out of a face
function fb(bt, F, a0, a1, y0, y1, off, depth, color) {
  const p0 = F.f + F.n * off, p1 = F.f + F.n * (off + depth);
  if (F.horiz) bt.box(a0, y0, Math.min(p0, p1), a1, y1, Math.max(p0, p1), color); else bt.box(Math.min(p0, p1), y0, a0, Math.max(p0, p1), y1, a1, color);
}
// distance from a face to the street edge of its block (small = the face looks onto a street)
function edgeDist(F) { for (const s of BS) if (F.f >= s - 0.01 && F.f <= s + 44.01) return F.n < 0 ? F.f - s : s + 44 - F.f; return 99; }

// ---------------------------------------------------------------- texture atlas for every sign / decal (one draw call)
const CELL = {};
const CELL_LIST = ['STOP', 'STOPBACK', 'STOPTXT', 'BUS', 'H', 'CROSS', 'P', 'PARK', 'AD1', 'AD2', 'AD3', 'G1', 'G2', 'G3', 'FIRE', 'POLICE', 'TANK', 'HOSP'];
for (const n of [...Object.values(STREET_X), ...Object.values(STREET_Z)]) CELL_LIST.push('ST:' + n);
CELL_LIST.forEach((n, i) => CELL[n] = i);
const AT_COLS = 4, AT_ROWS = Math.ceil(CELL_LIST.length / 4), CW = 256, CH = 128;
function makeAtlas() {
  const c = document.createElement('canvas'); c.width = AT_COLS * CW; c.height = AT_ROWS * CH;
  const x = c.getContext('2d');
  const at = (name, fn) => { const i = CELL[name]; x.save(); x.translate((i % AT_COLS) * CW, Math.floor(i / AT_COLS) * CH); x.beginPath(); x.rect(0, 0, CW, CH); x.clip(); fn(x); x.restore(); };
  const oct = (g, r, fill, stroke) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(128 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fillStyle = stroke; g.fill(); g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(128 + Math.cos(a) * (r - 6), 64 + Math.sin(a) * (r - 6)); } g.closePath(); g.fillStyle = fill; g.fill(); };
  const txt = (g, t, size, color, y = 66, font = 'Trebuchet MS') => { g.font = `bold ${size}px ${font}, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(t, 128, y); };
  const plate = (g, bg, fg, t, border = '#ffffff') => { g.fillStyle = border; g.fillRect(4, 34, 248, 60); g.fillStyle = bg; g.fillRect(8, 38, 240, 52); txt(g, t, t.length > 9 ? 30 : 36, fg); };
  at('STOP', g => { oct(g, 62, '#d32f2f', '#ffffff'); txt(g, 'STOP', 34, '#ffffff'); });
  at('STOPBACK', g => oct(g, 62, '#9aa3b5', '#7f8899'));
  at('STOPTXT', g => txt(g, 'STOP', 92, '#f6f6f0', 70, 'Arial Black'));
  at('BUS', g => { g.fillStyle = '#ffffff'; g.fillRect(70, 6, 116, 116); g.fillStyle = '#1565c0'; g.fillRect(76, 12, 104, 104); txt(g, 'BUS', 40, '#ffffff', 50); g.fillStyle = '#ffffff'; g.fillRect(96, 80, 64, 18); });
  at('H', g => { g.beginPath(); g.arc(128, 64, 60, 0, 7); g.fillStyle = '#ffffff'; g.fill(); g.beginPath(); g.arc(128, 64, 52, 0, 7); g.fillStyle = '#2e7d32'; g.fill(); txt(g, 'H', 80, '#ffffff', 68, 'Arial Black'); });
  at('CROSS', g => { g.fillStyle = '#e53935'; g.fillRect(108, 8, 40, 112); g.fillRect(72, 44, 112, 40); });
  at('P', g => { g.fillStyle = '#1565c0'; g.fillRect(74, 10, 108, 108); txt(g, 'P', 84, '#ffffff', 68, 'Arial Black'); });
  at('PARK', g => { g.fillStyle = '#5d4037'; g.fillRect(0, 22, 256, 84); g.fillStyle = '#2e7d32'; g.fillRect(8, 30, 240, 68); txt(g, 'CITY PARK', 40, '#fff8e1'); });
  at('AD1', g => { const gr = g.createLinearGradient(0, 0, 256, 128); gr.addColorStop(0, '#ff6b9a'); gr.addColorStop(1, '#ffd23f'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); txt(g, 'MEGA SALE', 44, '#ffffff', 52); txt(g, 'at MEGA MART', 24, '#4a148c', 96); });
  at('AD2', g => { g.fillStyle = '#1a237e'; g.fillRect(0, 0, 256, 128); txt(g, 'PLAY IN VR', 40, '#7cf9ff', 50); txt(g, 'CITY CHAOS', 26, '#ffffff', 94); });
  at('AD3', g => { g.fillStyle = '#ffcc80'; g.fillRect(0, 0, 256, 128); g.beginPath(); g.arc(70, 64, 40, 0, 7); g.fillStyle = '#ff6f91'; g.fill(); g.beginPath(); g.arc(70, 64, 15, 0, 7); g.fillStyle = '#ffcc80'; g.fill(); txt(g, 'DONUTS', 34, '#6d4c41', 52); g.save(); g.translate(60, 0); txt(g, 'fresh!', 24, '#c2185b', 92); g.restore(); });
  const graf = (t, c1, c2) => g => { g.font = 'italic bold 58px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = c2; g.strokeText(t, 128, 66); g.fillStyle = c1; g.fillText(t, 128, 66); };
  at('G1', graf('CC', '#ff4081', '#1a1a1a')); at('G2', graf('NO RULES', '#76ff03', '#311b92')); at('G3', graf('CHAOS', '#ffea00', '#d50000'));
  at('FIRE', g => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 64, 58, 0, 7); g.fill(); g.fillStyle = '#c62828'; g.beginPath(); g.arc(128, 64, 52, 0, 7); g.fill(); txt(g, '7', 64, '#ffd54f', 68, 'Arial Black'); });
  at('POLICE', g => { g.fillStyle = '#ffd54f'; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 26 : 58, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(128 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fill(); txt(g, 'CC', 22, '#0d47a1', 68); });
  at('TANK', g => { g.fillStyle = '#4fc3f7'; g.fillRect(0, 0, 256, 128); txt(g, 'CITY', 40, '#ffffff', 40, 'Arial Black'); txt(g, 'CHAOS', 46, '#ffffff', 90, 'Arial Black'); });
  at('HOSP', g => { g.fillStyle = '#ffffff'; g.fillRect(64, 0, 128, 128); g.fillStyle = '#1e88e5'; g.fillRect(70, 6, 116, 116); txt(g, 'H', 84, '#ffffff', 68, 'Arial Black'); });
  for (const n of [...Object.values(STREET_X), ...Object.values(STREET_Z)]) at('ST:' + n, g => plate(g, '#1b7a3d', '#ffffff', n));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ================================================================ main entry
export function decorateCity(ch, map, rest, anim, G) {
  const tex = new TexBatch(AT_COLS, AT_ROWS);
  for (const b of map.buildings) {
    if (b.kind === 'solid') solidFacade(ch, b);
    else if (b.kind === 'hollow') hollowTrim(ch, b);
    else if (b.kind === 'skyline') skylineFacade(ch, b, G);
    else if (b.kind === 'house') houseFacade(ch, b, G);
  }
  for (const o of map.openings) openingFrame(ch, o);
  roads(ch, map, tex, G);
  signals(ch, map, tex, anim);
  for (const f of map.furniture) furniture(ch, f, tex, G, anim);
  for (const p of rest) prop(ch, p, tex, G, anim);
  const mesh = new THREE.Mesh(tex.build(), new THREE.MeshLambertMaterial({ map: makeAtlas(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = 'city-decals'; mesh.receiveShadow = true;
  anim.root.add(mesh);
}

// ---------------------------------------------------------------- solid buildings
function solidFacade(ch, b) {
  const R = rng(b.seed), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const flat = ch.get('flat', cx, cz), glass = ch.get('glass', cx, cz), det = ch.get('detail', cx, cz), solid = ch.get('solid', cx, cz), glow = ch.get('glow', cx, cz);
  const y0 = b.y0 || 0, H = b.h, FH = 3.2, trim = b.trim, style = b.style, dark = shade(b.c, 0.72);
  for (const F of faces(b)) {
    const len = F.a1 - F.a0; if (len < 1.5) continue;
    const street = edgeDist(F) < 7.5, front = b.front ? b.front === F.k : street, mid = (F.a0 + F.a1) / 2;
    const firstFloor = y0 > 0 ? y0 + 0.4 : FH;
    if (style === 'glass') {
      // glass curtain wall: one tinted pane per floor, slim mullions and floor lines
      const gy0 = firstFloor, gy1 = H - 0.45;
      for (let y = gy0; y < gy1 - 0.2; y += FH) {
        const top = Math.min(y + FH, gy1), tint = R() < 0.08 ? WARM : GLASS[Math.floor(R() * GLASS.length)];
        fq(glass, F, mid, (y + top) / 2, len - 0.4, top - y - 0.1, 0.025, tint);
        fq(flat, F, mid, top - 0.03, len - 0.3, 0.12, 0.04, trim);
      }
      for (let a = F.a0 + 0.2; a <= F.a1 - 0.15; a += Math.max(1.4, len / Math.round(len / 1.7))) fq(flat, F, a, (gy0 + gy1) / 2, 0.09, gy1 - gy0, 0.045, trim);
    } else if (style === 'office' || style === 'hospital') {
      const bays = Math.max(1, Math.round(len / 3.3)), bw = len / bays;
      if (style === 'office') for (let i = 0; i <= bays; i++) { const a = F.a0 + i * bw; fb(det, F, a - 0.16, a + 0.16, 0.6, H, 0, 0.14, trim); }
      for (let y = firstFloor; y + 2 < H - 0.4; y += FH) {
        if (style === 'hospital') { fq(glass, F, mid, y + 1.55, len - 1.2, 1.5, 0.025, GLASS[2]); fq(flat, F, mid, y + 0.62, len - 1.0, 0.16, 0.03, trim); continue; }
        for (let i = 0; i < bays; i++) fq(glass, F, F.a0 + (i + 0.5) * bw, y + 1.6, bw - 0.75, 1.75, 0.025, R() < 0.1 ? WARM : GLASS[Math.floor(R() * GLASS.length)]);
      }
      if (style === 'hospital' && len > 8) { fq(glow, F, mid, H - 2.4, 0.9, 2.7, 0.06, 0xe53935); fq(glow, F, mid, H - 2.4, 2.7, 0.9, 0.06, 0xe53935); }
    } else {
      // punched windows (apartments, shops above the storefront)
      const n = Math.max(1, Math.floor((len - 1.2) / 3.0)), sp = len / n;
      for (let y = firstFloor; y + 1.9 < H - 0.6; y += FH) for (let i = 0; i < n; i++) {
        const a = F.a0 + (i + 0.5) * sp, wy = y + 1.55, lit = R() < 0.12;
        fq(flat, F, a, wy, 1.5, 1.8, 0.02, trim);
        fq(glass, F, a, wy, 1.22, 1.52, 0.03, lit ? WARM : GLASS[Math.floor(R() * GLASS.length)]);
        fq(flat, F, a, wy, 0.07, 1.52, 0.04, trim);
        fb(det, F, a - 0.8, a + 0.8, wy - 0.98, wy - 0.88, 0, 0.16, trim);
        const r = R();
        if (style === 'apartment' && r < 0.14) { fb(det, F, a - 0.65, a + 0.65, wy - 1.2, wy - 0.95, 0.02, 0.28, 0x8d6e63); for (let k = -2; k <= 2; k++) fb(det, F, a + k * 0.24 - 0.08, a + k * 0.24 + 0.08, wy - 0.95, wy - 0.78, 0.07, 0.16, [0xff4081, 0xffd54f, 0xba68c8, 0xff7043][(k + 4) % 4]); }
        else if (style === 'apartment' && r < 0.2) fb(det, F, a - 0.38, a + 0.38, wy - 1.45, wy - 1.0, 0, 0.42, 0xd5d9e0);
      }
    }
    // ground floor
    if (y0 === 0) {
      if ((style === 'shop' || style === 'office' || style === 'apartment') && front) {
        const s0 = F.a0 + 0.6, s1 = F.a1 - 0.6;
        fq(glass, F, (s0 + s1) / 2, 1.55, s1 - s0, 2.3, 0.025, GLASS[1]);
        for (let a = s0; a <= s1 + 0.01; a += (s1 - s0) / Math.max(1, Math.round((s1 - s0) / 2.2))) fq(flat, F, a, 1.55, 0.1, 2.3, 0.04, trim);
        fb(det, F, s0 - 0.1, s1 + 0.1, 2.7, 2.92, 0, 0.14, trim);
        fq(flat, F, (s0 + s1) / 2, 0.32, s1 - s0, 0.36, 0.035, dark);
        fq(flat, F, mid, 1.25, 1.25, 2.25, 0.05, 0x37474f);       // door
        fq(glow, F, mid + 0.42, 1.2, 0.06, 0.3, 0.06, 0xffe082);   // handle
        if (style !== 'shop') fb(det, F, mid - 1.3, mid + 1.3, 2.95, 3.1, 0, 1.0, trim); // entrance canopy
      } else if (style === 'glass' || style === 'hospital') {
        fq(glass, F, mid, 1.5, len - 1.6, 2.4, 0.025, GLASS[4]);
        if (front || street) fq(flat, F, mid, 1.25, 1.6, 2.3, 0.04, 0x263238);
      } else if (street) {
        fq(flat, F, mid, 1.2, 1.1, 2.2, 0.03, 0x5d4037);
        fq(flat, F, mid, 1.2, 1.35, 2.4, 0.02, trim);
      }
      fb(det, F, F.a0, F.a1, 0, 0.55, 0, 0.06, dark);   // plinth
    }
  }
  // cornice on the parapet + a band under it
  if (!b.tower) {
    const t = H + 0.8;
    solid.box(b.x0 - 0.14, t - 0.04, b.z0 - 0.14, b.x1 + 0.14, t + 0.14, b.z0 + 0.32, trim); solid.box(b.x0 - 0.14, t - 0.04, b.z1 - 0.32, b.x1 + 0.14, t + 0.14, b.z1 + 0.14, trim);
    solid.box(b.x0 - 0.14, t - 0.04, b.z0, b.x0 + 0.32, t + 0.14, b.z1, trim); solid.box(b.x1 - 0.32, t - 0.04, b.z0, b.x1 + 0.14, t + 0.14, b.z1, trim);
    if (style !== 'glass') for (const F of faces(b)) fb(det, F, F.a0, F.a1, H - 0.55, H - 0.35, 0, 0.1, trim);
  }
}

// ---------------------------------------------------------------- enterable (hollow) buildings: cornice + plinth
function hollowTrim(ch, b) {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, solid = ch.get('solid', cx, cz), det = ch.get('detail', cx, cz);
  const t = b.h + 1.2, tr = b.trim, dark = shade(b.c, 0.72);
  solid.box(b.x0 - 0.12, t - 0.04, b.z0 - 0.12, b.x1 + 0.12, t + 0.12, b.z0 + 0.32, tr); solid.box(b.x0 - 0.12, t - 0.04, b.z1 - 0.32, b.x1 + 0.12, t + 0.12, b.z1 + 0.12, tr);
  solid.box(b.x0 - 0.12, t - 0.04, b.z0, b.x0 + 0.32, t + 0.12, b.z1, tr); solid.box(b.x1 - 0.32, t - 0.04, b.z0, b.x1 + 0.12, t + 0.12, b.z1, tr);
  for (const F of faces(b)) fb(det, F, F.a0, F.a1, 0, 0.45, 0, 0.05, dark);
  if (b.style === 'fire') for (const F of faces(b)) if (F.k !== 'n') fb(det, F, F.a0, F.a1, 5.7, 6.0, 0, 0.08, 0xfff3e0);
}
// door / window holes: frames + sills (detail)
function openingFrame(ch, o) {
  const F = o.side === 'n' ? { horiz: true, f: o.z0, n: -1 } : o.side === 's' ? { horiz: true, f: o.z0 + o.d, n: 1 } : o.side === 'w' ? { horiz: false, f: o.x0, n: -1 } : { horiz: false, f: o.x0 + o.w, n: 1 };
  const base = F.horiz ? o.x0 : o.z0, A0 = base + o.a, A1 = base + o.b;
  const det = ch.get('detail', F.horiz ? (A0 + A1) / 2 : F.f, F.horiz ? F.f : (A0 + A1) / 2), c = o.trim;
  fb(det, F, A0 - 0.12, A0, o.y0, o.y1, 0, 0.06, c); fb(det, F, A1, A1 + 0.12, o.y0, o.y1, 0, 0.06, c);
  fb(det, F, A0 - 0.12, A1 + 0.12, o.y1, o.y1 + 0.14, 0, 0.06, c);
  if (!o.door) fb(det, F, A0 - 0.16, A1 + 0.16, o.y0 - 0.1, o.y0, 0, 0.16, c);
}

// ---------------------------------------------------------------- city edge skyline (inner face only) + depth behind it
function skylineFacade(ch, b, G) {
  const R = rng(b.seed);
  const F = b.horiz ? { horiz: true, f: b.face === 's' ? b.f1 : b.f0, n: b.face === 's' ? 1 : -1, a0: b.a0, a1: b.a1 } : { horiz: false, f: b.face === 'e' ? b.f1 : b.f0, n: b.face === 'e' ? 1 : -1, a0: b.a0, a1: b.a1 };
  const mid = (F.a0 + F.a1) / 2, len = F.a1 - F.a0;
  const flat = ch.get('flat', F.horiz ? mid : F.f, F.horiz ? F.f : mid), glass = ch.get('glass', F.horiz ? mid : F.f, F.horiz ? F.f : mid), solid = ch.get('solid', F.horiz ? mid : F.f, F.horiz ? F.f : mid);
  // depth: the building continues back out of reach (looks like a real skyline from rooftops)
  const back = 8 + Math.floor(R() * 4) * 4, p0 = F.f - F.n * 2, p1 = F.f - F.n * (2 + back);
  if (F.horiz) solid.box(F.a0, 0, Math.min(p0, p1), F.a1, b.h - 2, Math.max(p0, p1), shade(b.c, 0.9)); else solid.box(Math.min(p0, p1), 0, F.a0, Math.max(p0, p1), b.h - 2, F.a1, shade(b.c, 0.9));
  const office = b.style === 'office';
  if (office) { for (let y = 3.4; y < b.h - 2; y += 3.4) fq(glass, F, mid, y + 1.4, len - 1, 1.9, 0.02, R() < 0.1 ? WARM : GLASS[Math.floor(R() * GLASS.length)]); }
  else {
    const n = Math.max(1, Math.floor((len - 1) / 3)), sp = len / n;
    for (let y = 3.4; y < b.h - 2.4; y += 3.4) for (let i = 0; i < n; i++) { const a = F.a0 + (i + 0.5) * sp; fq(flat, F, a, y + 1.4, 1.45, 1.75, 0.015, b.trim); fq(glass, F, a, y + 1.4, 1.2, 1.5, 0.025, R() < 0.12 ? WARM : GLASS[Math.floor(R() * GLASS.length)]); }
  }
  // ground: shop windows + a colored sign band, cornice on top
  fq(glass, F, mid, 1.5, len - 1.2, 2.2, 0.025, GLASS[1]);
  fq(flat, F, mid, 2.95, len - 0.8, 0.6, 0.03, [0xe91e63, 0x00897b, 0xff7043, 0x5e35b1, 0xfbc02d][Math.floor(R() * 5)]);
  fb(solid, F, F.a0, F.a1, b.h - 0.2, b.h + 0.15, 0, 0.25, b.trim);
  // roof silhouette
  const tc = (k) => F.a0 + len * k, inset = F.f - F.n * (2 + back * 0.5);
  if (R() < 0.45) { const a = tc(0.3 + R() * 0.4); const [x, z] = F.horiz ? [a, inset] : [inset, a]; solid.geom(G.cyl12, trs(x, b.h - 2 + 3.6, z, 0, 0, 0, 1.6, 2.6, 1.6), 0x8d6e63); solid.geom(G.cone, trs(x, b.h - 2 + 5.4, z, 0, 0, 0, 1.75, 1.0, 1.75), 0x6d4c41); for (const [dx, dz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) solid.box(x + dx - 0.1, b.h - 2, z + dz - 0.1, x + dx + 0.1, b.h - 2 + 2.3, z + dz + 0.1, 0x5d4037); }
  else if (office && R() < 0.6) { const a = tc(0.5); const [x, z] = F.horiz ? [a, inset] : [inset, a]; solid.box(x - 0.15, b.h - 2, z - 0.15, x + 0.15, b.h + 6, z + 0.15, 0xb0bec5); }
}

// ---------------------------------------------------------------- suburban houses
function houseFacade(ch, b, G) {
  const R = rng(b.seed), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const flat = ch.get('flat', cx, cz), glass = ch.get('glass', cx, cz), det = ch.get('detail', cx, cz);
  const Y = 0.15, tr = b.trim, sh = b.shutter || 0x37474f, accent = [0xc62828, 0x1565c0, 0x2e7d32, 0x6a1b9a, 0xef6c00][Math.floor(R() * 5)];
  const win = (F, a, y, big) => {
    const w = big ? 2.0 : 1.2;
    fq(flat, F, a, y, w + 0.28, 1.6, 0.02, tr); fq(glass, F, a, y, w, 1.3, 0.03, R() < 0.15 ? WARM : GLASS[Math.floor(R() * GLASS.length)]);
    fq(flat, F, a, y, 0.06, 1.3, 0.04, tr); fq(flat, F, a, y, w, 0.06, 0.04, tr);
    fq(flat, F, a - w / 2 - 0.36, y, 0.42, 1.45, 0.035, sh); fq(flat, F, a + w / 2 + 0.36, y, 0.42, 1.45, 0.035, sh);
    fb(det, F, a - w / 2 - 0.12, a + w / 2 + 0.12, y - 0.82, y - 0.72, 0, 0.14, tr);
  };
  for (const F of faces(b)) {
    const len = F.a1 - F.a0, isFront = F.k === b.front, isBack = F.k === (b.front === 'n' ? 's' : 'n');
    for (let f = 0; f < b.floors; f++) {
      const y = Y + f * 3.1 + 1.65;
      if (isFront) {
        const slots = f === 0 ? [F.a0 + len * 0.74] : [F.a0 + len * 0.18, F.a0 + len * 0.5, F.a0 + len * 0.82];
        for (const a of slots) win(F, a, y, f === 0);
      } else if (isBack) { for (const a of [F.a0 + len * 0.28, F.a0 + len * 0.72]) win(F, a, y, false); }
      else win(F, F.a0 + len * 0.5, y, false);
    }
    if (isFront) {
      const d = b.doorX;
      fq(flat, F, d, Y + 1.2, 1.4, 2.45, 0.02, tr); fq(flat, F, d, Y + 1.12, 1.05, 2.2, 0.035, accent);
      fq(flat, F, d, Y + 1.7, 0.6, 0.5, 0.045, GLASS[1]); fq(ch.get('glow', cx, cz), F, d + 0.36, Y + 1.1, 0.08, 0.08, 0.05, 0xffd54f);
      for (const s of [-1.2, 1.2]) fb(det, F, d + s - 0.09, d + s + 0.09, Y, Y + 2.55, 1.3, 0.18, tr);           // porch posts
      fq(ch.get('glow', cx, cz), F, d - 0.95, Y + 2.0, 0.16, 0.26, 0.06, 0xffe9a8);                          // porch light
    }
    // corner boards + foundation
    fb(det, F, F.a0 - 0.02, F.a0 + 0.18, Y, b.top, 0, 0.05, tr); fb(det, F, F.a1 - 0.18, F.a1 + 0.02, Y, b.top, 0, 0.05, tr);
    fb(det, F, F.a0, F.a1, Y, Y + 0.4, 0, 0.06, 0xbcaaa4);
    if (b.floors > 1) fb(det, F, F.a0, F.a1, Y + 3.0, Y + 3.15, 0, 0.06, tr);
  }
}

// ---------------------------------------------------------------- roads: double yellow lines, edge lines, crosswalks, stop lines, manholes, sidewalk seams
const RC = [-112, -56, 0, 56, 112];
function roads(ch, map, tex, G) {
  const mark = (x0, z0, x1, z1, c, y = 0.006) => ch.get('flat', (x0 + x1) / 2, (z0 + z1) / 2).floor(x0, z0, x1, z1, y, c);
  const R = rng(5150);
  for (const rc of RC) for (let i = 0; i < RC.length - 1; i++) {
    const s0 = RC[i] + 7.9, s1 = RC[i + 1] - 7.9;
    mark(s0, rc - 0.25, s1, rc - 0.1, YELLOW); mark(s0, rc + 0.1, s1, rc + 0.25, YELLOW);         // road along x at z = rc
    mark(s0, rc - 5.42, s1, rc - 5.28, WHITE); mark(s0, rc + 5.28, s1, rc + 5.42, WHITE);
    mark(rc - 0.25, s0, rc - 0.1, s1, YELLOW); mark(rc + 0.1, s0, rc + 0.25, s1, YELLOW);         // road along z at x = rc
    mark(rc - 5.42, s0, rc - 5.28, s1, WHITE); mark(rc + 5.28, s0, rc + 5.42, s1, WHITE);
    // manholes + patched asphalt
    for (const [mx, mz] of [[s0 + (s1 - s0) * (0.3 + R() * 0.4), rc + (R() < 0.5 ? -3 : 3)], [rc + (R() < 0.5 ? -3 : 3), s0 + (s1 - s0) * (0.3 + R() * 0.4)]]) {
      const b = ch.get('flat', mx, mz); b.geom(G.cyl12, trs(mx, 0.004, mz, 0, 0, 0, 0.5, 0.004, 0.5), 0x2a2e38); b.geom(G.cyl12, trs(mx, 0.006, mz, 0, 0, 0, 0.38, 0.004, 0.38), 0x4a4f5c);
    }
    if (R() < 0.6) { const a = s0 + (s1 - s0) * R(), w = 2 + R() * 3; mark(a, rc + 0.6, a + w, rc + 2.6 + R() * 2, 0x353a46, 0.003); }
  }
  // crosswalks on every arm of every intersection
  const zebra = (cx, cz, alongX) => { for (let k = -4.8; k <= 4.81; k += 1.2) alongX ? mark(cx - 0.65, cz + k - 0.3, cx + 0.65, cz + k + 0.3, WHITE) : mark(cx + k - 0.3, cz - 0.65, cx + k + 0.3, cz + 0.65, WHITE); };
  for (const ix of RC) for (const iz of RC) {
    if (iz > -112) zebra(ix, iz - 6.95, false); if (iz < 112) zebra(ix, iz + 6.95, false);
    if (ix > -112) zebra(ix - 6.95, iz, true); if (ix < 112) zebra(ix + 6.95, iz, true);
  }
  // stop lines at the traffic lights
  for (const t of map.trafficLights) {
    const { ix, iz } = t, y = t.yaw;
    if (Math.abs(y - Math.PI) < 0.1) mark(ix - 5.6, iz - 8.45, ix - 0.4, iz - 8.05, WHITE);
    else if (Math.abs(y) < 0.1) mark(ix + 0.4, iz + 8.05, ix + 5.6, iz + 8.45, WHITE);
    else if (y > 0) mark(ix + 8.05, iz - 5.6, ix + 8.45, iz - 0.4, WHITE);
    else mark(ix - 8.45, iz + 0.4, ix - 8.05, iz + 5.6, WHITE);
  }
  // stop signs (face the cars coming toward the ring road) + stop line + painted STOP
  for (const s of map.stopSigns) {
    let nx = 0, nz = 0, line, word;
    if (Math.abs(s.yaw - Math.PI) < 0.1) { const c = s.x - 6.6; nz = 1; line = [c + 0.4, -104.05, c + 5.6, -103.65]; word = [c + 3, -102.6, Math.PI]; }
    else if (Math.abs(s.yaw) < 0.1) { const c = s.x + 6.6; nz = -1; line = [c - 5.6, 103.65, c - 0.4, 104.05]; word = [c - 3, 102.6, 0]; }
    else if (s.yaw < 0) { const c = s.z + 6.6; nx = 1; line = [-104.05, c - 5.6, -103.65, c - 0.4]; word = [-102.6, c - 3, -Math.PI / 2]; }
    else { const c = s.z - 6.6; nx = -1; line = [103.65, c + 0.4, 104.05, c + 5.6]; word = [102.6, c + 3, Math.PI / 2]; }
    mark(...line, WHITE);
    tex.flat(word[0], 0.012, word[1], 3.2, 1.6, word[2], CELL.STOPTXT);
    tex.wall(s.x + nx * 0.07, 2.25, s.z + nz * 0.07, nx, nz, 1.52, 0.76, CELL.STOP);
    tex.wall(s.x - nx * 0.07, 2.25, s.z - nz * 0.07, -nx, -nz, 1.52, 0.76, CELL.STOPBACK);
  }
  // sidewalks: light curb edge + expansion seams in the outer walking band
  for (const z0 of BS) for (const x0 of BS) {
    const y = 0.156, c = 0xe9e4da, seam = 0xb8b1a5;
    mark(x0, z0, x0 + 44, z0 + 0.22, c, y); mark(x0, z0 + 43.78, x0 + 44, z0 + 44, c, y); mark(x0, z0, x0 + 0.22, z0 + 44, c, y); mark(x0 + 43.78, z0, x0 + 44, z0 + 44, c, y);
    for (let a = 2.4; a < 44; a += 2.4) {
      mark(x0 + a - 0.025, z0 + 0.22, x0 + a + 0.025, z0 + 2.7, seam, y); mark(x0 + a - 0.025, z0 + 41.3, x0 + a + 0.025, z0 + 43.78, seam, y);
      mark(x0 + 0.22, z0 + a - 0.025, x0 + 2.7, z0 + a + 0.025, seam, y); mark(x0 + 41.3, z0 + a - 0.025, x0 + 43.78, z0 + a + 0.025, seam, y);
    }
  }
  // police lot stalls + parking sign
  const pl = map.policeLot[0];
  if (pl) { const x0 = pl[0] - 12, z0 = pl[2] - 33; for (const k of [7, 17, 27, 37]) mark(x0 + k - 0.06, z0 + 30, x0 + k + 0.06, z0 + 40, WHITE, 0.157); mark(x0 + 7, z0 + 39.9, x0 + 37, z0 + 40.02, WHITE, 0.157); }
}

// ---------------------------------------------------------------- traffic signals (heads are animated in cityAnim)
function signals(ch, map, tex, anim) {
  for (const t of map.trafficLights) {
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);   // the face looks back at the approaching cars
    const S = ch.get('solid', t.x, t.z), D = ch.get('detail', t.x, t.z);
    S.box(Math.min(t.x, t.ax) - 0.07, 6.12, Math.min(t.z, t.az) - 0.07, Math.max(t.x, t.ax) + 0.07, 6.28, Math.max(t.z, t.az) + 0.07, 0x3a3f4b);
    for (const [hx, hy, hz] of [[t.ax, 5.5, t.az], [t.x + fx * 0.3, 3.0, t.z + fz * 0.3]]) {
      S.box(hx - 0.21, hy - 0.6, hz - 0.21, hx + 0.21, hy + 0.6, hz + 0.21, 0x263238);
      // yellow backplate behind the head + a visor over each lamp
      const along = (c0, c1, l0, l1, y0, y1, col) => { // c = offset along the face normal, l = lateral offset
        if (fz) D.box(hx + l0, y0, Math.min(hz + fz * c0, hz + fz * c1), hx + l1, y1, Math.max(hz + fz * c0, hz + fz * c1), col);
        else D.box(Math.min(hx + fx * c0, hx + fx * c1), y0, hz + l0, Math.max(hx + fx * c0, hx + fx * c1), y1, hz + l1, col);
      };
      along(-0.27, -0.21, -0.34, 0.34, hy - 0.74, hy + 0.74, 0xf9a825);
      for (const dy of [0.37, 0, -0.37]) along(0.21, 0.38, -0.16, 0.16, hy + dy + 0.14, hy + dy + 0.17, 0x1c2226);
      anim.addSignal(hx + fx * 0.22, hy, hz + fz * 0.22, t.axis, t.ix, t.iz);
    }
    // street name of the road you're about to cross, on the mast arm (both sides)
    const name = t.axis === 'z' ? STREET_Z[t.iz] : STREET_X[t.ix], cell = CELL['ST:' + name];
    const mx = t.x + (t.ax - t.x) * 0.45, mz = t.z + (t.az - t.z) * 0.45;
    if (cell !== undefined) { tex.wall(mx + fx * 0.04, 6.72, mz + fz * 0.04, fx, fz, 2.2, 1.1, cell); tex.wall(mx - fx * 0.04, 6.72, mz - fz * 0.04, -fx, -fz, 2.2, 1.1, cell); }
    D.box(mx - 0.03, 6.28, mz - 0.03, mx + 0.03, 6.5, mz + 0.03, 0x3a3f4b);
    D.box(t.x - 0.1, 1.1, t.z - 0.1, t.x + 0.1, 1.35, t.z + 0.1, 0xffd54f);   // crosswalk button
  }
}

// ---------------------------------------------------------------- street furniture
function furniture(ch, f, tex, G, anim) {
  const D = ch.get('detail', f.x, f.z), Y = f.y;
  const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);   // forward = toward the street
  // local box: u along the curb, v toward the street
  const lb = (u0, u1, y0, y1, v0, v1, c, bt = D) => {
    const xs = [f.x + u0 * rx + v0 * fx, f.x + u1 * rx + v1 * fx], zs = [f.z + u0 * rz + v0 * fz, f.z + u1 * rz + v1 * fz];
    bt.box(Math.min(...xs), Y + y0, Math.min(...zs), Math.max(...xs), Y + y1, Math.max(...zs), c);
  };
  const P = (u, v) => [f.x + u * rx + v * fx, f.z + u * rz + v * fz];
  switch (f.type) {
    case 'bench':
      lb(-0.9, 0.9, 0.42, 0.5, -0.26, 0.24, 0xa1673f); lb(-0.9, 0.9, 0.58, 0.95, -0.3, -0.22, 0xa1673f);
      for (const u of [-0.78, 0.78]) { lb(u - 0.05, u + 0.05, 0, 0.95, -0.3, 0.2, 0x263238); lb(u - 0.05, u + 0.05, 0.62, 0.68, -0.3, 0.26, 0x263238); }
      break;
    case 'trash': D.geom(G.cyl12, trs(f.x, Y + 0.45, f.z, 0, 0, 0, 0.25, 0.9, 0.25), f.dist === 'park' ? 0x2e7d32 : 0x37474f); D.geom(G.sphere, trs(f.x, Y + 0.92, f.z, 0, 0, 0, 0.26, 0.12, 0.26), 0x546e7a); break;
    case 'hydrant':
      D.geom(G.cyl12, trs(f.x, Y + 0.32, f.z, 0, 0, 0, 0.14, 0.6, 0.14), 0xe53935); D.geom(G.sphere, trs(f.x, Y + 0.64, f.z, 0, 0, 0, 0.15, 0.12, 0.15), 0xffc107);
      { const [a, b] = P(0, 0); D.geom(G.cyl12, trs(a, Y + 0.42, b, f.yaw === 0 || Math.abs(f.yaw) > 3 ? 0 : 0, f.yaw, Math.PI / 2, 0.06, 0.42, 0.06), 0xe53935); }
      D.geom(G.cyl12, trs(f.x, Y + 0.04, f.z, 0, 0, 0, 0.2, 0.08, 0.2), 0xc62828);
      break;
    case 'planter':
      lb(-0.8, 0.8, 0, 0.55, -0.35, 0.35, 0xb0a99f); lb(-0.72, 0.72, 0.55, 0.58, -0.27, 0.27, 0x5d4037);
      for (let k = 0; k < 6; k++) { const [a, b] = P(-0.6 + k * 0.24, (k % 2 ? 0.12 : -0.12)); D.geom(G.ico, trs(a, Y + 0.7, b, k, k, 0, 0.13), [0xff4081, 0xffd54f, 0xba68c8, 0xff7043, 0xffffff, 0xf06292][k]); }
      { const [a, b] = P(0, 0); D.geom(G.ico, trs(a, Y + 0.85, b, 1, 2, 0, 0.32, 0.28, 0.32), 0x43a047); }
      break;
    case 'tree':
      G.drawTree(D, f.x, Y, f.z, 0.72, Math.floor(Math.abs(f.x * 3 + f.z * 7)) % 3 === 1 ? 0 : 2 * (Math.floor(Math.abs(f.x + f.z)) % 2));
      lb(-0.55, 0.55, 0.003, 0.012, -0.55, 0.55, 0x3e4148);
      break;
    case 'newsbox': lb(-0.25, 0.25, 0.35, 1.05, -0.22, 0.22, [0x1565c0, 0xc62828, 0xffb300][Math.abs(Math.round(f.x + f.z)) % 3]); lb(-0.18, 0.18, 0.7, 0.95, 0.22, 0.24, 0xe3f2fd); lb(-0.2, -0.15, 0, 0.35, -0.18, 0.18, 0x37474f); lb(0.15, 0.2, 0, 0.35, -0.18, 0.18, 0x37474f); break;
    case 'meter': D.geom(G.cyl6, trs(f.x, Y + 0.55, f.z, 0, 0, 0, 0.04, 1.1, 0.04), 0x546e7a); lb(-0.12, 0.12, 1.05, 1.4, -0.08, 0.08, 0x90a4ae); lb(-0.08, 0.08, 1.2, 1.32, 0.08, 0.09, 0x263238); break;
    case 'bikerack': for (const u of [-0.6, 0, 0.6]) { lb(u - 0.22, u - 0.17, 0, 0.8, -0.03, 0.03, 0xb0bec5); lb(u + 0.17, u + 0.22, 0, 0.8, -0.03, 0.03, 0xb0bec5); lb(u - 0.22, u + 0.22, 0.75, 0.8, -0.03, 0.03, 0xb0bec5); } break;
    case 'barrel': D.geom(G.cyl12, trs(f.x, Y + 0.45, f.z, 0, 0, 0, 0.3, 0.9, 0.3), 0x1e88e5); D.geom(G.cyl12, trs(f.x, Y + 0.3, f.z, 0, 0, 0, 0.31, 0.06, 0.31), 0x1565c0); D.geom(G.cyl12, trs(f.x, Y + 0.62, f.z, 0, 0, 0, 0.31, 0.06, 0.31), 0x1565c0); break;
    case 'busstop': {
      lb(-1.7, 1.7, 2.45, 2.6, -0.6, 0.6, 0x37474f);
      lb(-1.7, 1.7, 0.15, 2.45, -0.6, -0.55, 0x9ec9df, ch.get('glass', f.x, f.z));
      for (const u of [-1.7, 1.7]) { lb(u - 0.04, u + 0.04, 0, 2.45, -0.6, 0.55, 0x546e7a); lb(u - 0.02, u + 0.02, 0.15, 2.4, -0.55, 0.3, 0xb8dcef, ch.get('glass', f.x, f.z)); }
      lb(-1.2, 1.2, 0.45, 0.52, -0.55, -0.2, 0xa1673f);
      const [ax, az] = P(-0.4, -0.5); tex.wall(ax, 1.45, az, fx, fz, 2.2, 1.1, CELL.AD1 + (Math.abs(Math.round(f.x * 7 + f.z)) % 3));
      const [sx, sz] = P(2.05, 0); D.geom(G.cyl6, trs(sx, Y + 1.3, sz, 0, 0, 0, 0.05, 2.6, 0.05), 0x90a4ae);
      tex.wall(sx + fx * 0.06, Y + 2.35, sz + fz * 0.06, fx, fz, 1.1, 0.55, CELL.BUS); tex.wall(sx - fx * 0.06, Y + 2.35, sz - fz * 0.06, -fx, -fz, 1.1, 0.55, CELL.BUS);
      break;
    }
  }
}

// ---------------------------------------------------------------- everything else (landmarks, lamps, yards, roofs...)
function prop(ch, p, tex, G, anim) {
  const cxp = p.x ?? (p.x0 + p.x1) / 2, czp = p.z ?? (p.z0 + p.z1) / 2;
  const S = ch.get('solid', cxp, czp), D = ch.get('detail', cxp, czp), L = ch.get('glow', cxp, czp), F = ch.get('flat', cxp, czp), W = ch.get('water', cxp, czp), Gl = ch.get('glass', cxp, czp);
  const dirv = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  switch (p.type) {
    case 'lamp': {
      const [dx, dz] = dirv[p.dir] || [0, -1], top = p.y + (p.short ? 3.2 : 5.5);
      if (p.style === 'deco') {
        D.geom(G.cyl12, trs(p.x, p.y + 0.35, p.z, 0, 0, 0, 0.26, 0.7, 0.26), 0x263238);
        for (const s of [-1, 1]) { const ax = p.x + dz * s * 0.55, az = p.z - dx * s * 0.55; D.box(Math.min(p.x, ax) - 0.04, top - 0.55, Math.min(p.z, az) - 0.04, Math.max(p.x, ax) + 0.04, top - 0.47, Math.max(p.z, az) + 0.04, 0x263238); L.geom(G.sphere, trs(ax, top - 0.25, az, 0, 0, 0, 0.24), 0xfff3c4); }
        L.geom(G.sphere, trs(p.x, top + 0.15, p.z, 0, 0, 0, 0.2), 0xfff3c4); D.geom(G.cone, trs(p.x, top + 0.45, p.z, 0, 0, 0, 0.1, 0.3, 0.1), 0x263238);
      } else if (p.style === 'lantern') {
        D.geom(G.cyl12, trs(p.x, p.y + 0.3, p.z, 0, 0, 0, 0.2, 0.6, 0.2), 0x263238);
        D.box(p.x - 0.24, top - 0.05, p.z - 0.24, p.x + 0.24, top + 0.05, p.z + 0.24, 0x263238);
        L.box(p.x - 0.18, top + 0.05, p.z - 0.18, p.x + 0.18, top + 0.55, p.z + 0.18, 0xffe9a8);
        D.geom(G.cone, trs(p.x, top + 0.75, p.z, 0, Math.PI / 4, 0, 0.38, 0.4, 0.38), 0x263238);
      } else {
        const ex = p.x + dx * 1.5, ez = p.z + dz * 1.5;
        S.box(Math.min(p.x, ex) - 0.06, top - 0.2, Math.min(p.z, ez) - 0.06, Math.max(p.x, ex) + 0.06, top - 0.08, Math.max(p.z, ez) + 0.06, 0x8f9bb3);
        S.box(ex - 0.35, top - 0.3, ez - 0.35, ex + 0.35, top - 0.12, ez + 0.35, 0x78849c);
        L.box(ex - 0.26, top - 0.33, ez - 0.26, ex + 0.26, top - 0.3, ez + 0.26, 0xfff3b0);
      }
      break;
    }
    case 'awning': {
      // sloped striped canvas with a little valance
      const out = p.side === 'n' || p.side === 'w' ? -1 : 1, hz = p.side === 'n' || p.side === 's', n = Math.max(2, Math.round((p.a1 - p.a0) / 0.7));
      for (let i = 0; i < n; i++) {
        const a0 = p.a0 + (p.a1 - p.a0) * i / n, a1 = p.a0 + (p.a1 - p.a0) * (i + 1) / n, c = i % 2 ? p.stripe : p.c;
        const yIn = p.y + 0.55, yOut = p.y + 0.1, bIn = p.base, bOut = p.base + out * p.dep;
        const P4 = hz ? [[a0, yIn, bIn], [a1, yIn, bIn], [a1, yOut, bOut], [a0, yOut, bOut]] : [[bIn, yIn, a0], [bIn, yIn, a1], [bOut, yOut, a1], [bOut, yOut, a0]];
        D.poly(P4, c);
        if (hz) D.box(a0, p.y - 0.15, Math.min(bOut, bOut + out * 0.02), a1, yOut, Math.max(bOut, bOut + out * 0.02), c); else D.box(Math.min(bOut, bOut + out * 0.02), p.y - 0.15, a0, Math.max(bOut, bOut + out * 0.02), yOut, a1, c);
      }
      break;
    }
    case 'gable': {
      const { x0, x1, z0, z1, y, h, c, wall } = p, zc = (z0 + z1) / 2, ov = 0.45, e = h * ov / (zc - z0), xw0 = x0 + ov, xw1 = x1 - ov, zw0 = z0 + ov, zw1 = z1 - ov;
      S.poly([[x0, y, z0], [x0, y + h, zc], [x1, y + h, zc], [x1, y, z0]], c); S.poly([[x1, y, z1], [x1, y + h, zc], [x0, y + h, zc], [x0, y, z1]], c);
      S.poly([[x1, y - 0.1, z0], [x1, y + h - 0.1, zc], [x0, y + h - 0.1, zc], [x0, y - 0.1, z0]], shade(c, 0.7)); S.poly([[x0, y - 0.1, z1], [x0, y + h - 0.1, zc], [x1, y + h - 0.1, zc], [x1, y - 0.1, z1]], shade(c, 0.7));
      S.poly([[xw0, y, zw0], [xw0, y, zw1], [xw0, y + e, zw1], [xw0, y + h - 0.05, zc], [xw0, y + e, zw0]], wall);
      S.poly([[xw1, y, zw1], [xw1, y, zw0], [xw1, y + e, zw0], [xw1, y + h - 0.05, zc], [xw1, y + e, zw1]], wall);
      S.box(x0 - 0.05, y + h - 0.08, zc - 0.2, x1 + 0.05, y + h + 0.1, zc + 0.2, shade(c, 0.8));
      D.box(x0, y - 0.18, z0 - 0.02, x1, y + 0.02, z0 + 0.1, 0xffffff); D.box(x0, y - 0.18, z1 - 0.1, x1, y + 0.02, z1 + 0.02, 0xffffff);
      // attic window on the gable end
      const gF = { horiz: false, f: xw0, n: -1 }; fq(F, gF, zc, y + h * 0.45, 0.9, 0.7, 0.02, 0xffffff); fq(Gl, gF, zc, y + h * 0.45, 0.7, 0.5, 0.03, GLASS[0]);
      break;
    }
    case 'garageDoor': {
      const out = p.side === 'n' ? -1 : 1, z = p.z + out * 0.02;
      for (let k = 0; k < 4; k++) F.quad((p.x0 + p.x1) / 2, p.y + 0.35 + k * 0.62, z, p.x1 - p.x0, 0.55, 'z', out, k % 2 ? 0xf5f5f5 : 0xe8e8e8);
      F.quad((p.x0 + p.x1) / 2, p.y + 1.3, z - out * 0.005, p.x1 - p.x0 + 0.3, 2.7, 'z', out, 0xffffff);
      break;
    }
    case 'mailbox': D.box(p.x - 0.16, p.y + 1.0, p.z - 0.24, p.x + 0.16, p.y + 1.3, p.z + 0.24, p.c); D.box(p.x + 0.16, p.y + 1.18, p.z - 0.05, p.x + 0.19, p.y + 1.45, p.z + 0.03, 0xe53935); break;
    case 'flowerStrip': { const n = Math.max(2, Math.round((p.x1 - p.x0) / 0.35)); for (let i = 0; i < n; i++) D.geom(G.ico, trs(p.x0 + (p.x1 - p.x0) * (i + 0.5) / n, p.y + 0.25, p.z + Math.sin(i * 2.3) * 0.15, i, i, 0, 0.22), [0xff4081, 0xffd54f, 0xba68c8, 0x66bb6a, 0xff7043][i % 5]); break; }
    case 'picket': {
      const n = Math.max(1, Math.round((p.a1 - p.a0) / 0.32));
      for (let i = 0; i <= n; i++) { const a = p.a0 + (p.a1 - p.a0) * i / n; if (p.horiz) D.box(a - 0.05, p.y, p.f - 0.04, a + 0.05, p.y + 1.0, p.f + 0.04, 0xffffff); else D.box(p.f - 0.04, p.y, a - 0.05, p.f + 0.04, p.y + 1.0, a + 0.05, 0xffffff); }
      if (p.horiz) { D.box(p.a0, p.y + 0.3, p.f - 0.07, p.a1, p.y + 0.38, p.f + 0.07, 0xf0f0f0); D.box(p.a0, p.y + 0.72, p.f - 0.07, p.a1, p.y + 0.8, p.f + 0.07, 0xf0f0f0); }
      else { D.box(p.f - 0.07, p.y + 0.3, p.a0, p.f + 0.07, p.y + 0.38, p.a1, 0xf0f0f0); D.box(p.f - 0.07, p.y + 0.72, p.a0, p.f + 0.07, p.y + 0.8, p.a1, 0xf0f0f0); }
      break;
    }
    case 'waterTower': {
      const { x, y, z } = p;
      anim.addTank(x, y + 0.2, z);
      for (const [dx, dz] of [[-1.8, 0], [1.8, 0]]) D.box(x + dx - 0.05, y * 0.5, z - 1.8, x + dx + 0.05, y * 0.5 + 0.12, z + 1.8, 0x8d6e63);
      for (const [dx, dz] of [[0, -1.8], [0, 1.8]]) D.box(x - 1.8, y * 0.5, z + dz - 0.05, x + 1.8, y * 0.5 + 0.12, z + dz + 0.05, 0x8d6e63);
      for (const [a, b2, c2, d2] of [[x - 3, z - 3, x + 3, z - 2.95], [x - 3, z + 2.95, x + 3, z + 3], [x - 3, z - 3, x - 2.95, z + 3], [x + 2.95, z - 3, x + 3, z + 3]]) D.box(a, y + 1.05, b2, c2, y + 1.12, d2, 0x6d7b8a);
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3], [-3, 0], [3, 0]]) D.box(x + dx - 0.04, y + 0.2, z + dz - 0.04, x + dx + 0.04, y + 1.1, z + dz + 0.04, 0x6d7b8a);
      break;
    }
    case 'pool': {
      W.floor(p.x0, p.z0, p.x1, p.z1, p.y + 0.03, 0x29b6f6); F.floor(p.x0 + 0.2, p.z0 + 0.2, p.x1 - 0.2, p.z1 - 0.2, p.y + 0.012, 0x4fc3f7);
      for (let k = 1; k < 4; k++) F.floor(p.x0 + (p.x1 - p.x0) * k / 4 - 0.04, p.z0 + 0.3, p.x0 + (p.x1 - p.x0) * k / 4 + 0.04, p.z1 - 0.3, p.y + 0.016, 0x0288d1);
      D.geom(G.torus, trs(p.x0 + 2.4, p.y + 0.07, p.z0 + 2.2, Math.PI / 2, 0, 0, 0.45, 0.45, 1.6), 0xff5252);
      break;
    }
    case 'swingSet': anim.addSwings(p); for (const dx of [-1.8, 1.8]) for (const dz of [-0.7, 0.7]) D.geom(G.cyl6, trs(p.x + dx, p.y + 1.15, p.z + dz * 0.5, dz * 0.5, 0, 0, 0.06, 2.4, 0.06), 0xef5350); break;
    case 'gnome': D.geom(G.cyl12, trs(p.x, p.y + 0.15, p.z, 0, 0, 0, 0.12, 0.3, 0.12), 0x1565c0); D.geom(G.sphere, trs(p.x, p.y + 0.38, p.z, 0, 0, 0, 0.1), 0xffcc80); D.geom(G.cone, trs(p.x, p.y + 0.6, p.z, 0, 0, 0, 0.11, 0.3, 0.11), 0xe53935); D.geom(G.sphere, trs(p.x, p.y + 0.3, p.z - 0.07, 0, 0, 0, 0.09, 0.12, 0.06), 0xffffff); break;
    case 'donut': anim.addDonut(p); D.geom(G.cyl6, trs(p.x, p.y + 0.8, p.z, 0, 0, 0, 0.18, 1.6, 0.18), 0x90a4ae); break;
    case 'billboard': anim.addBillboard(p); for (const s of [-1, 1]) D.geom(G.cyl6, trs(p.x + s * p.w * 0.35, p.y + 0.9, p.z + 0.4, 0, 0, 0, 0.1, 1.8, 0.1), 0x546e7a); break;
    case 'roofSign': anim.addRoofSign(p); for (const s of [-1, 0, 1]) D.box(p.x + s * p.w * 0.4 - 0.06, p.y, p.z - 0.06, p.x + s * p.w * 0.4 + 0.06, p.y + 0.6, p.z + 0.06, 0x546e7a); break;
    case 'flag': anim.addFlag(p); D.geom(G.sphere, trs(p.x, p.y + 0.28, p.z, 0, 0, 0, 0.1), 0xffd54f); break;
    case 'policeBadge': tex.wall(p.x, p.y, p.z + 0.01, 0, 1, 3.0, 1.5, CELL.POLICE); break;
    case 'chaosCrown': anim.addCrown(p); break;
    case 'beacon': anim.addBeacon(p); anim.addUfo(p); break;
    case 'lobby': { const z = p.z; for (let a = p.x0 + 1.5; a < p.x1 - 1; a += 3.3) D.geom(G.cyl12, trs(a, 2.2, z + 0.9, 0, 0, 0, 0.18, 4.4, 0.18), 0xd6e4ff); D.box(p.x0, 4.4, z, p.x1, 4.65, z + 1.6, 0xd6e4ff); L.box(p.x0 + 0.4, 4.38, z + 0.2, p.x1 - 0.4, 4.4, z + 1.4, 0xfff3c4); break; }
    case 'helipad': { F.geom(G.cyl12, trs(p.x, p.y + 0.01, p.z, 0, 0, 0, p.r, 0.01, p.r), 0x546e7a); F.geom(new THREE.RingGeometry(p.r * 0.78, p.r * 0.86, 24), trs(p.x, p.y + 0.025, p.z, -Math.PI / 2, 0, 0), 0xffeb3b); tex.flat(p.x, p.y + 0.04, p.z, p.r * 1.4, p.r * 0.7, 0, CELL.H); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; L.geom(G.sphere, trs(p.x + Math.cos(a) * p.r, p.y + 0.08, p.z + Math.sin(a) * p.r, 0, 0, 0, 0.12), 0x76ff03); } break; }
    case 'graffiti': { const [nx, nz] = dirv[p.side]; tex.wall(p.x, p.y, p.z, nx, nz, p.text.length > 4 ? 4.4 : 3, p.text.length > 4 ? 2.2 : 1.5, p.text === 'CC' ? CELL.G1 : p.text === 'NO RULES' ? CELL.G2 : CELL.G3); break; }
    case 'planter': if (p.tree) G.drawTree(D, p.x, p.y, p.z, 0.7, 2); F.floor(p.x - 1.0, p.z - 1.0, p.x + 1.0, p.z + 1.0, p.y + 0.005, 0x5d4037); break;
    case 'sculpture': D.geom(G.torus, trs(p.x, p.y + 1.6, p.z, 0, 0.5, 0, 1.1, 1.1, 6), 0xff4081); D.geom(G.ico, trs(p.x, p.y + 1.6, p.z, 0.4, 0.4, 0, 0.45), 0xffd54f); D.geom(G.cyl6, trs(p.x, p.y + 0.3, p.z, 0, 0, 0, 0.12, 0.6, 0.12), 0x90a4ae); break;
    case 'plazaTiles': { const c = 0xd9d2c5; for (let x = p.x0 + 2; x < p.x1; x += 2) F.floor(x - 0.03, p.z0, x + 0.03, p.z1, 0.156, c); for (let z = p.z0 + 2; z < p.z1; z += 2) F.floor(p.x0, z - 0.03, p.x1, z + 0.03, 0.156, c); break; }
    case 'parkBench': {
      const yaw = p.yaw || 0, side = Math.abs(Math.sin(yaw)) > 0.5;
      if (!side) { D.box(p.x - 1, p.y + 0.5, p.z - 0.32, p.x + 1, p.y + 0.95, p.z - 0.24, 0xa1673f); for (const u of [-0.85, 0.85]) D.box(p.x + u - 0.05, p.y, p.z - 0.3, p.x + u + 0.05, p.y + 0.95, p.z + 0.28, 0x263238); }
      else { D.box(p.x - 0.32, p.y + 0.5, p.z - 1, p.x - 0.24, p.y + 0.95, p.z + 1, 0xa1673f); for (const u of [-0.85, 0.85]) D.box(p.x - 0.3, p.y, p.z + u - 0.05, p.x + 0.28, p.y + 0.95, p.z + u + 0.05, 0x263238); }
      break;
    }
    case 'pond': { W.floor(p.x0, p.z0, p.x1, p.z1, p.y + 0.06, 0x3fa9e0); F.floor(p.x0 + 0.4, p.z0 + 0.4, p.x1 - 0.4, p.z1 - 0.4, p.y + 0.02, 0x1f6f9a);
      for (const [lx, lz, r] of [[0.2, 0.3, 0.45], [0.35, 0.7, 0.35], [0.75, 0.25, 0.5], [0.6, 0.6, 0.3], [0.85, 0.8, 0.4]]) D.geom(G.cyl12, trs(p.x0 + (p.x1 - p.x0) * lx, p.y + 0.08, p.z0 + (p.z1 - p.z0) * lz, 0, lx * 5, 0, r, 0.02, r), 0x43a047);
      anim.addDuck(p.x0 + (p.x1 - p.x0) * 0.5, p.y + 0.08, p.z0 + (p.z1 - p.z0) * 0.5);
      for (const [rx, rz] of [[-0.3, 0.2], [1.04, 0.5], [0.4, -0.06], [0.7, 1.05]]) D.geom(G.ico, trs(p.x0 + (p.x1 - p.x0) * rx, p.y + 0.2, p.z0 + (p.z1 - p.z0) * rz, rx, rz, 0, 0.5, 0.3, 0.5), 0x9e9e9e);
      break; }
    case 'flowerBed': { F.geom(G.cyl12, trs(p.x, p.y + 0.01, p.z, 0, 0, 0, p.r + 0.2, 0.01, p.r + 0.2), 0x6d4c41); for (let k = 0; k < 14; k++) { const a = k * 2.4, r = p.r * (0.3 + (k % 4) * 0.2); D.geom(G.ico, trs(p.x + Math.cos(a) * r, p.y + 0.2, p.z + Math.sin(a) * r, k, k, 0, 0.2), [0xff4081, 0xffd54f, 0xba68c8, 0xff7043, 0xffffff][k % 5]); } break; }
    case 'picnic': D.box(p.x - 1, p.y + 0.72, p.z - 0.5, p.x + 1, p.y + 0.8, p.z + 0.5, 0xa1673f); for (const s of [-0.75, 0.75]) D.box(p.x - 1, p.y + 0.42, p.z + s - 0.15, p.x + 1, p.y + 0.48, p.z + s + 0.15, 0x8d5a34); break;
    case 'parkSign': for (const s of [-2.6, 2.6]) D.box(p.x + s - 0.12, p.y, p.z - 0.12, p.x + s + 0.12, p.y + 3.4, p.z + 0.12, 0x5d4037); tex.wall(p.x, p.y + 3.1, p.z + 0.13, 0, 1, 5.4, 2.7, CELL.PARK); tex.wall(p.x, p.y + 3.1, p.z - 0.13, 0, -1, 5.4, 2.7, CELL.PARK); break;
    case 'artCube': for (let k = 0; k < 4; k++) L.box(p.x - 1.52, p.y + 0.6 + k * 0.9, p.z - 1.52, p.x + 1.52, p.y + 0.66 + k * 0.9, p.z + 1.52, [0xff4081, 0xffd54f, 0x7cf9ff, 0x76ff03][k]); break;
    case 'statue': D.geom(G.cyl12, trs(p.x, p.y + 0.5, p.z, 0, 0, 0, 0.5, 1.0, 0.5), 0xa1887f); D.geom(G.sphere, trs(p.x, p.y + 1.25, p.z, 0, 0, 0, 0.35), 0x8d6e63); D.box(p.x - 0.12, p.y + 1.3, p.z - 0.06, p.x + 0.12, p.y + 2.3, p.z + 0.06, 0x8d6e63); D.geom(G.cone, trs(p.x, p.y + 2.55, p.z, 0, 0, 0, 0.22, 0.5, 0.22), 0xffd54f); break;
    case 'carLift': for (const s of [-1.4, 1.4]) D.box(p.x + s - 0.15, p.y, p.z - 0.15, p.x + s + 0.15, p.y + 2.2, p.z + 0.15, 0xf1c40f); D.box(p.x - 1.45, p.y + 1.35, p.z - 2, p.x + 1.45, p.y + 1.45, p.z + 2, 0x546e7a); break;
    case 'tires': for (let k = 0; k < 4; k++) D.geom(G.torus, trs(p.x, p.y + 0.14 + k * 0.27, p.z, Math.PI / 2, 0, 0, 0.36, 0.36, 2.6), 0x212121); break;
    case 'toolbox': for (let k = 0; k < 3; k++) D.box(p.x - 1.35, p.y + 0.15 + k * 0.28, p.z + 0.31, p.x + 1.35, p.y + 0.18 + k * 0.28, p.z + 0.32, 0x37474f); break;
    case 'bunting': { const n = 18; for (let i = 0; i < n; i++) { const a = p.x0 + (p.x1 - p.x0) * (i + 0.5) / n, z = p.z1 + 0.05; D.tri([a - 0.4, p.y, z], [a + 0.4, p.y, z], [a, p.y - 0.6, z], [0xe53935, 0xffd54f, 0x1e88e5, 0x43a047][i % 4]); } D.box(p.x0, p.y - 0.02, p.z1, p.x1, p.y + 0.02, p.z1 + 0.06, 0x546e7a); break; }
    case 'firetruck': vehicleShape(S, D, L, F, p.x, p.y, p.z, 2.4, 7.2, 0xe53935, 'fire', G); break;
    case 'ambulance': vehicleShape(S, D, L, F, p.x, p.y, p.z, 2.2, 5.6, 0xffffff, 'amb', G); break;
    case 'forklift': S.box(p.x - 0.7, p.y + 0.3, p.z - 1.0, p.x + 0.7, p.y + 1.3, p.z + 1.2, 0xffb300); S.box(p.x - 0.65, p.y + 1.3, p.z + 0.1, p.x + 0.65, p.y + 2.1, p.z + 1.1, 0x37474f); for (const s of [-0.35, 0.35]) S.box(p.x + s - 0.05, p.y, p.z - 2.0, p.x + s + 0.05, p.y + 2.2, p.z - 1.9, 0x455a64); for (const s of [-0.35, 0.35]) S.box(p.x + s - 0.06, p.y + 0.1, p.z - 2.8, p.x + s + 0.06, p.y + 0.16, p.z - 1.9, 0x90a4ae); for (const [dx, dz] of [[-0.75, -0.6], [0.75, -0.6], [-0.75, 0.8], [0.75, 0.8]]) S.geom(G.cyl12, trs(p.x + dx, p.y + 0.3, p.z + dz, 0, 0, Math.PI / 2, 0.3, 0.2, 0.3), 0x212121); break;
    case 'yardLines': for (let x = p.x0 + 4; x < p.x1; x += 8) F.floor(x - 0.08, p.z0, x + 0.08, p.z1, 0.157, 0xfdd835); F.floor(p.x0, p.z1 - 0.1, p.x1, p.z1 + 0.06, 0.157, 0xfdd835); break;
    case 'cone': D.geom(G.cone, trs(p.x, p.y + 0.36, p.z, 0, 0, 0, 0.22, 0.72, 0.22), 0xff6d00); D.geom(G.cyl12, trs(p.x, p.y + 0.38, p.z, 0, 0, 0, 0.15, 0.1, 0.15), 0xffffff); D.box(p.x - 0.28, p.y, p.z - 0.28, p.x + 0.28, p.y + 0.04, p.z + 0.28, 0xff6d00); break;
    case 'hardhat': D.geom(G.sphere, trs(p.x, p.y + 0.08, p.z, 0, 0, 0, 0.2, 0.14, 0.2), 0xffeb3b); D.geom(G.cyl12, trs(p.x, p.y + 0.02, p.z, 0, 0, 0, 0.26, 0.03, 0.26), 0xfdd835); break;
    case 'dockDoors': { const w = (p.x1 - p.x0) / p.n; for (let i = 0; i < p.n; i++) { const a = p.x0 + w * (i + 0.5); F.quad(a, 2.2, p.z - 0.02, w - 0.8, 3.4, 'z', -1, 0x90a4ae); for (let k = 0; k < 6; k++) F.quad(a, 0.8 + k * 0.55, p.z - 0.03, w - 0.85, 0.05, 'z', -1, 0x607d8b); D.box(a - w / 2 + 0.3, 0, p.z - 1.2, a + w / 2 - 0.3, 1.1, p.z, 0x9e9e9e); D.box(a - w / 2 + 0.25, 1.1, p.z - 0.25, a - w / 2 + 0.4, 4.2, p.z, 0xfdd835); D.box(a + w / 2 - 0.4, 1.1, p.z - 0.25, a + w / 2 - 0.25, 4.2, p.z, 0xfdd835); } break; }
    case 'semi': { S.box(p.x - 5, p.y + 0.9, p.z - 1.2, p.x + 2.4, p.y + 3.4, p.z + 1.2, 0xeceff1); S.box(p.x + 2.6, p.y + 0.6, p.z - 1.15, p.x + 5, p.y + 3.0, p.z + 1.15, 0x1e88e5); Gl.box(p.x + 4.95, p.y + 1.9, p.z - 1.0, p.x + 5.02, p.y + 2.7, p.z + 1.0, GLASS[0]); for (const dx of [-4, -2.8, 1.2, 4]) for (const s of [-1, 1]) S.geom(G.cyl12, trs(p.x + dx, p.y + 0.5, p.z + s * 1.05, Math.PI / 2, 0, 0, 0.5, 0.3, 0.5), 0x212121); F.quad(p.x - 1.3, p.y + 2.2, p.z + 1.21, 6, 1.4, 'z', 1, 0xff7043); F.quad(p.x - 1.3, p.y + 2.2, p.z - 1.21, 6, 1.4, 'z', -1, 0xff7043); break; }
    case 'gasCanopy': { L.box(p.x0 - 0.02, p.y + 0.15, p.z0 - 0.04, p.x1 + 0.02, p.y + 0.4, p.z0, 0xfff0f0); L.box(p.x0 - 0.02, p.y + 0.15, p.z1, p.x1 + 0.02, p.y + 0.4, p.z1 + 0.04, 0xfff0f0); for (let x = p.x0 + 3; x < p.x1; x += 6) for (let z = p.z0 + 3; z < p.z1; z += 6) L.box(x - 0.6, p.y - 0.03, z - 0.3, x + 0.6, p.y, z + 0.3, 0xffffff); F.floor(p.x0, p.z0, p.x1, p.z1, 0.157, 0xd7d2c8); break; }
    case 'iceBox': F.quad(p.x, p.y + 1.0, p.z + 0.62, 1.4, 0.4, 'z', 1, 0xffffff); break;
    case 'weeds': { const r = rng(31); for (let i = 0; i < p.n; i++) { const x = p.x0 + (p.x1 - p.x0) * r(), z = p.z0 + (p.z1 - p.z0) * r(); D.geom(G.ico, trs(x, (p.y || 0.2) + 0.08, z, r() * 3, r() * 3, 0, 0.22 + r() * 0.15, 0.14 + r() * 0.12, 0.22 + r() * 0.15), [0x7cb342, 0x8bc34a, 0x9e9d24, 0x689f38][Math.floor(r() * 4)]); } break; }
    case 'penthouse': { const { x, y, z, hw, hd } = p; D.box(x - hw - 0.08, y + 2.6, z - hd - 0.08, x + hw + 0.08, y + 2.75, z + hd + 0.08, 0xb0b6c2); F.quad(x, y + 1.2, z + hd + 0.01, 0.9, 2.1, 'z', 1, 0x546e7a); for (let k = 0; k < 3; k++) F.quad(x - hw - 0.01, y + 1.4, z - hd * 0.5 + k * hd * 0.5, 0.5, 1.2, 'x', -1, 0x78909c); break; }
    case 'antenna': D.geom(G.cyl6, trs(p.x, p.y + p.h / 2, p.z, 0, 0, 0, 0.06, p.h, 0.06), 0xb0bec5); for (let k = 1; k < 4; k++) D.box(p.x - 0.5 / k, p.y + p.h * k / 4, p.z - 0.03, p.x + 0.5 / k, p.y + p.h * k / 4 + 0.05, p.z + 0.03, 0xb0bec5); anim.addBlink(p.x, p.y + p.h + 0.1, p.z, 0xff1744); break;
    case 'roofTank': D.geom(G.cyl12, trs(p.x, p.y + 3.6, p.z, 0, 0, 0, 1.4, 2.8, 1.4), 0xa1887f); D.geom(G.cone, trs(p.x, p.y + 5.4, p.z, 0, 0, 0, 1.5, 0.8, 1.5), 0x6d4c41); for (let k = 0; k < 3; k++) D.geom(G.cyl12, trs(p.x, p.y + 2.6 + k * 0.9, p.z, 0, 0, 0, 1.42, 0.06, 1.42), 0x5d4037); break;
    case 'stairHut': F.quad(p.x, p.y + 1.05, p.z + 1.21, 0.9, 2.0, 'z', 1, 0x6d4c41); D.box(p.x - 1.3, p.y + 2.5, p.z - 1.3, p.x + 1.3, p.y + 2.62, p.z + 1.3, 0x8d6e63); break;
    case 'acFan': anim.addFan(p.x, p.y + 0.03, p.z); D.geom(G.cyl12, trs(p.x, p.y + 0.01, p.z, 0, 0, 0, 0.42, 0.02, 0.42), 0x37474f); for (let k = 0; k < 3; k++) F.quad(p.x - 0.76, p.y - 0.75 + k * 0.22, p.z, 1.0, 0.06, 'x', -1, 0x8a92a3); break;
    case 'vent': D.geom(G.cyl12, trs(p.x, p.y + 0.5, p.z, 0, 0, 0, 0.35, 1.0, 0.35), 0xb0bec5); D.geom(G.cone, trs(p.x, p.y + 1.15, p.z, 0, 0, 0, 0.5, 0.3, 0.5), 0x90a4ae); Gl.box(p.x + 1.0, p.y, p.z - 0.6, p.x + 2.4, p.y + 0.5, p.z + 0.6, GLASS[3]); break;
    case 'balcony': {
      const hz = p.side === 'n' || p.side === 's', out = p.side === 'n' || p.side === 'w' ? -1 : 1;
      const ox = hz ? 0 : out * 0.5, oz = hz ? out * 0.5 : 0;
      if (hz) { D.box(p.x - 1.1, p.y, p.z + oz - 0.03, p.x + 1.1, p.y + 0.95, p.z + oz + 0.03, 0x37474f); for (const s of [-1.1, 1.1]) D.box(p.x + s - 0.03, p.y, Math.min(p.z - oz, p.z + oz), p.x + s + 0.03, p.y + 0.95, Math.max(p.z - oz, p.z + oz), 0x37474f); }
      else { D.box(p.x + ox - 0.03, p.y, p.z - 1.1, p.x + ox + 0.03, p.y + 0.95, p.z + 1.1, 0x37474f); for (const s of [-1.1, 1.1]) D.box(Math.min(p.x - ox, p.x + ox), p.y, p.z + s - 0.03, Math.max(p.x - ox, p.x + ox), p.y + 0.95, p.z + s + 0.03, 0x37474f); }
      break;
    }
    case 'siren': anim.addSiren(p); break;
    case 'fountain': anim.addFountain(p); break;
  }
}

// fire truck / ambulance body (collision box is separate)
function vehicleShape(S, D, L, F, x, y, z, w, l, c, kind, G) {
  const hw = w / 2, hl = l / 2;
  S.box(x - hw, y + 0.5, z - hl, x + hw, y + 2.6, z + hl - 1.6, c);
  S.box(x - hw, y + 0.5, z + hl - 1.6, x + hw, y + 2.2, z + hl, c);
  F.quad(x, y + 1.75, z + hl + 0.02, w - 0.4, 0.7, 'z', 1, 0x9be7ff);
  for (const s of [-1, 1]) F.quad(x + s * (hw + 0.02), y + 1.75, z + hl - 0.8, 1.0, 0.6, 'x', s, 0x9be7ff);
  for (const dz of [-hl + 1.1, hl - 1.1]) for (const s of [-1, 1]) S.geom(G.cyl12, trs(x + s * (hw - 0.1), y + 0.45, z + dz, 0, 0, Math.PI / 2, 0.45, 0.3, 0.45), 0x212121);
  if (kind === 'fire') { D.box(x - 0.5, y + 2.6, z - hl + 0.4, x + 0.5, y + 2.8, z + hl - 1.8, 0xcfd8dc); for (let k = 0; k < 6; k++) D.box(x - 0.5, y + 2.62, z - hl + 0.6 + k * 0.8, x + 0.5, y + 2.85, z - hl + 0.7 + k * 0.8, 0xb0bec5); for (const s of [-1, 1]) F.quad(x + s * (hw + 0.02), y + 1.1, z - 0.6, l - 2.2, 0.18, 'x', s, 0xffffff); }
  else { for (const s of [-1, 1]) { F.quad(x + s * (hw + 0.02), y + 1.6, z - 0.6, 0.5, 1.4, 'x', s, 0xe53935); F.quad(x + s * (hw + 0.02), y + 1.6, z - 0.6, 1.4, 0.5, 'x', s, 0xe53935); F.quad(x + s * (hw + 0.02), y + 0.95, z - 0.4, l - 1.4, 0.16, 'x', s, 0xe53935); } }
  L.box(x - hw + 0.1, y + (kind === 'fire' ? 2.6 : 2.6), z + hl - 1.75, x - 0.15, y + 2.78, z + hl - 1.6, 0xff1744);
  L.box(x + 0.15, y + 2.6, z + hl - 1.75, x + hw - 0.1, y + 2.78, z + hl - 1.6, kind === 'fire' ? 0xff1744 : 0x2979ff);
}
