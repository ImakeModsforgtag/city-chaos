// Client-side NPC visuals: pedestrians, shopkeepers and cops streamed from the server.
// Each NPC is ~5 meshes (merged body, 2 legs, 2 hands), culled beyond 50m for Quest performance.
import * as THREE from 'three';
import { GeoBatch, trs, MAT, textCanvas } from '../engine/geo.js';
import { createWeaponModel } from '../weapons/models.js';
import { raySphere, rayCapsule } from '/shared/collision.js';
import { HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS } from '/shared/constants.js';
import * as audio from '../audio/audio.js';

export const NPC_TYPE = { PED: 0, SHOP: 1, COP: 2, GUARD: 3, PRISONER: 4, SWAT: 5, CROOK: 6 };
export const NPC_STATE = { WALK: 0, PANIC: 1, HANDSUP: 2, DEAD: 3, AIM: 4, IDLE: 5 };
export const NPC_NAMES = ['Pedestrian', 'Shopkeeper', 'Cop', 'Prison guard', 'Prisoner', 'SWAT', 'Robber'];
const HEAD_H = 1.55, DELAY = 0.16;
const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21];
const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0x6c5ce7, 0x00b894, 0xfd9644, 0x74b9ff, 0xe17055];
const PANTS = [0x2d3436, 0x34495e, 0x1e3799, 0x6d4c41, 0x636e72, 0x2c3e50];
const HAIR = [0x2d1b0e, 0x5d3a1a, 0xe1b382, 0x111111, 0xa0522d, 0xff7675];

const geo = {
  sphere: new THREE.SphereGeometry(1, 8, 6), box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  half: new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), dodec: new THREE.DodecahedronGeometry(1, 0)
};
const mat = MAT.lambert({ flatShading: true });
const legGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.62, 7).translate(0, -0.31, 0);
const handGeo = new THREE.SphereGeometry(0.065, 8, 6);
const handMats = SKIN.map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const pantsMats = {};

// a glazed donut with pink frosting and sprinkles (donut-shop cops carry one)
let donutGeo = null;
function donutMesh() {
  if (!donutGeo) {
    const b = new GeoBatch();
    const tor = new THREE.TorusGeometry(0.075, 0.035, 6, 12);
    b.geom(tor, trs(0, 0, 0, Math.PI / 2, 0, 0), 0xc68642);
    b.geom(tor, trs(0, 0.012, 0, Math.PI / 2, 0, 0, 1.02, 1.02, 0.8), 0xff7eb6);
    const sp = [0xffffff, 0x4ecdc4, 0xffe66d, 0x6c5ce7];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.box(Math.cos(a) * 0.075 - 0.008, 0.045, Math.sin(a) * 0.075 - 0.003, Math.cos(a) * 0.075 + 0.008, 0.052, Math.sin(a) * 0.075 + 0.003, sp[i % 4]); }
    donutGeo = b.build();
  }
  return new THREE.Mesh(donutGeo, mat);
}
// a sack of stolen cash (robbers carry it while running away)
let bagGeo = null;
function lootBag() {
  if (!bagGeo) {
    const b = new GeoBatch();
    b.geom(geo.sphere, trs(0, -0.06, 0, 0, 0, 0, 0.16, 0.18, 0.15), 0xc8a165);
    b.geom(geo.cyl, trs(0, 0.1, 0, 0, 0, 0, 0.05, 0.08, 0.05), 0xa07c48);
    b.box(-0.045, -0.1, -0.155, 0.045, 0.0, -0.145, 0x2e8b57);   // green $ patch
    bagGeo = b.build();
  }
  return new THREE.Mesh(bagGeo, mat);
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// merged body geometry (feet at y=0, facing -Z) per (type, look) — cached
const bodyCache = new Map();
function bodyGeometry(type, id) {
  const r = rng(id * 7919 + type * 104729 + 1);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const uni = { [NPC_TYPE.COP]: [0x1f3a93, 0x161b33], [NPC_TYPE.GUARD]: [0x6c7a89, 0x2c3e50], [NPC_TYPE.PRISONER]: [0xff7f27, 0xff7f27], [NPC_TYPE.SWAT]: [0x1e272e, 0x111111], [NPC_TYPE.CROOK]: [0x2b2b33, 0x17171c] }[type];
  const shirt = uni ? uni[0] : SHIRTS[Math.floor(r() * SHIRTS.length)];
  const pants = uni ? uni[1] : PANTS[Math.floor(r() * PANTS.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const style = Math.floor(r() * 4), headStyle = Math.floor(r() * 3);
  const key = [type, skin, shirt, pants, hair, style, headStyle].join('|');
  if (!bodyCache.has(key)) {
    const b = new GeoBatch();
    const H = HEAD_H, fz = -0.19;
    // head
    if (headStyle === 1) b.geom(geo.box, trs(0, H, 0, 0, 0, 0, 0.34, 0.33, 0.32), skin);
    else b.geom(geo.sphere, trs(0, H, 0, 0, 0, 0, 0.2, headStyle === 2 ? 0.23 : 0.2, 0.2), skin);
    for (const sx of [-1, 1]) { b.geom(geo.sphere, trs(sx * 0.07, H + 0.04, fz, 0, 0, 0, 0.05, 0.06, 0.025), 0xffffff); b.geom(geo.sphere, trs(sx * 0.068, H + 0.035, fz - 0.02, 0, 0, 0, 0.026, 0.03, 0.012), 0x1d1442); }
    b.box(-0.045, H - 0.08, fz - 0.005, 0.045, H - 0.06, fz + 0.01, 0x7a2e2e);
    // torso
    if (style === 0 || uni) b.box(-0.22, 0.6, -0.14, 0.22, 1.25, 0.14, shirt);
    else if (style === 1) b.geom(geo.cyl, trs(0, 0.92, 0, 0, 0, 0, 0.2, 0.66, 0.16), shirt);
    else b.geom(geo.dodec, trs(0, 0.92, 0, 0, 0, 0, 0.26, 0.36, 0.2), shirt);
    b.box(-0.08, 1.25, -0.08, 0.08, 1.36, 0.08, skin); // neck
    b.box(-0.23, 0.58, -0.15, 0.23, 0.66, 0.15, pants); // belt / hips
    // shoulders (arms are hands-only, cartoony)
    for (const sx of [-1, 1]) b.geom(geo.sphere, trs(sx * 0.25, 1.17, 0, 0, 0, 0, 0.09), shirt);
    if (type === NPC_TYPE.COP) {
      b.geom(geo.cyl, trs(0, H + 0.17, 0, 0, 0, 0, 0.21, 0.12, 0.21), 0x1f3a93); // police cap
      b.box(-0.21, H + 0.1, -0.31, 0.21, H + 0.12, -0.05, 0x111111);           // visor
      b.box(-0.04, H + 0.16, -0.215, 0.04, H + 0.22, -0.205, 0xffd23f);          // cap badge
      b.box(0.08, 1.08, -0.146, 0.15, 1.15, -0.141, 0xffd23f);                  // chest badge
      b.box(-0.2, 0.62, -0.17, 0.2, 0.66, 0.17, 0x111111);                      // duty belt
      for (const sx of [-1, 1]) b.box(sx * 0.12 - 0.05, H + 0.02, fz - 0.03, sx * 0.12 + 0.05, H + 0.07, fz - 0.02, 0x111111); // shades
    } else if (type === NPC_TYPE.CROOK) {
      b.geom(geo.half, trs(0, H + 0.05, 0, 0, 0, 0, 0.215, 0.19, 0.215), 0x111111);      // black beanie
      b.box(-0.205, H + 0.0, -0.205, 0.205, H + 0.09, -0.12, 0x111111);                   // beanie rim
      b.box(-0.2, H - 0.13, -0.215, 0.2, H - 0.01, -0.06, 0xd62f4b);                       // red bandana over the face
      b.geom(geo.cyl, trs(0, H - 0.12, 0.2, -0.7, 0, 0, 0.035, 0.08, 0.035), 0xd62f4b);    // bandana knot tail (back of the head)
      b.box(-0.17, 0.95, -0.152, 0.17, 1.2, -0.142, 0x3c3c46);                            // hoodie pocket
      b.box(-0.06, 1.18, -0.148, 0.06, 1.24, -0.143, 0xbbbbbb);                           // hoodie strings
    } else if (type === NPC_TYPE.SWAT) {
      b.geom(geo.half, trs(0, H + 0.06, 0, 0, 0, 0, 0.235, 0.2, 0.235), 0x111111);   // helmet
      b.box(-0.17, H - 0.0, -0.24, 0.17, H + 0.08, -0.2, 0x2d3436);                  // goggles
      b.box(-0.24, 0.72, -0.17, 0.24, 1.22, 0.17, 0x2d3436);                         // vest
      b.box(-0.16, 0.95, -0.175, 0.16, 1.05, -0.17, 0xffffff);                       // SWAT patch
    } else if (type === NPC_TYPE.GUARD) {
      b.geom(geo.cyl, trs(0, H + 0.17, 0, 0, 0, 0, 0.21, 0.12, 0.21), 0x2c3e50);     // guard cap
      b.box(-0.21, H + 0.1, -0.31, 0.21, H + 0.12, -0.05, 0x111111);
      b.box(0.08, 1.08, -0.146, 0.15, 1.15, -0.141, 0xbdc3c7);                       // badge
      b.box(-0.2, 0.62, -0.17, 0.2, 0.66, 0.17, 0x111111);                           // belt
      b.box(0.19, 0.5, -0.04, 0.24, 0.66, 0.04, 0x111111);                           // baton
    } else if (type === NPC_TYPE.PRISONER) {
      b.box(-0.1, 1.0, -0.146, 0.1, 1.12, -0.141, 0xffffff);                         // number patch
      if (r() < 0.5) b.geom(geo.half, trs(0, H + 0.04, 0.01, 0, 0, 0, 0.215, 0.12, 0.215), hair);
      else b.box(-0.07, H - 0.06, fz - 0.015, 0.07, H - 0.035, fz, hair);             // mustache
    } else if (type === NPC_TYPE.SHOP) {
      b.box(-0.18, 0.62, -0.152, 0.18, 1.18, -0.142, 0xffffff);                 // apron
      b.geom(geo.half, trs(0, H + 0.08, 0, 0, 0, 0, 0.205, 0.14, 0.205), shirt); // cap
      b.box(-0.12, H + 0.07, -0.33, 0.12, H + 0.09, -0.12, shirt);
      b.box(-0.07, H - 0.05, fz - 0.015, 0.07, H - 0.03, fz, hair);             // mustache
    } else if (r() < 0.6) {
      b.geom(geo.half, trs(0, H + 0.04, 0.01, 0, 0, 0, 0.215, 0.17, 0.215), hair); // hair
    } else {
      b.geom(geo.half, trs(0, H + 0.08, 0, 0, 0, 0, 0.21, 0.15, 0.21), SHIRTS[Math.floor(r() * SHIRTS.length)]); // beanie
    }
    bodyCache.set(key, b.build());
  }
  return { geo: bodyCache.get(key), skin, pants };
}

// a standalone NPC body (used for car drivers)
export function npcBodyMesh(seed, type = NPC_TYPE.PED) {
  const { geo: g } = bodyGeometry(type, seed);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

export class NPCs {
  constructor(scene, effects) {
    this.scene = scene; this.effects = effects;
    this.map = new Map(); // id -> npc visual
    this.sirenT = 0;
    this.cull = 50; // set lower in VR to save draw calls
  }

  build(id, type) {
    const { geo: g, skin, pants } = bodyGeometry(type, id);
    const root = new THREE.Group();
    const body = new THREE.Mesh(g, mat); body.castShadow = true; root.add(body);
    if (!pantsMats[pants]) pantsMats[pants] = new THREE.MeshLambertMaterial({ color: pants, flatShading: true });
    const legs = [-1, 1].map(sx => { const l = new THREE.Mesh(legGeo, pantsMats[pants]); l.position.set(sx * 0.11, 0.62, 0); root.add(l); return l; });
    const hm = handMats[SKIN.indexOf(skin)] || handMats[0];
    const lh = new THREE.Mesh(handGeo, hm), rh = new THREE.Mesh(handGeo, hm);
    root.add(lh, rh);
    let gun = null;
    if (type === NPC_TYPE.COP || type === NPC_TYPE.SWAT || type === NPC_TYPE.CROOK) { gun = createWeaponModel(type === NPC_TYPE.SWAT ? 'ar' : type === NPC_TYPE.CROOK && id % 3 === 0 ? 'smg' : 'pistol'); rh.add(gun); gun.position.set(0, -0.02, 0.03); }
    let bag = null;
    if (type === NPC_TYPE.CROOK) { bag = lootBag(); lh.add(bag); bag.position.set(0, -0.2, 0); bag.visible = false; }
    root.visible = false;
    this.scene.add(root);
    return { id, type, root, body, legs, lh, rh, gun, bag, buf: [], state: 0, phase: Math.random() * 10, bubble: null, closed: 0, alive: true, x: 0, y: 0, z: 0, yaw: 0 };
  }

  sync(list, st) {
    const seen = new Set();
    for (const a of list) {
      const [id, type, x, y, z, yaw, state, closed, flags] = a;
      seen.add(id);
      let n = this.map.get(id);
      if (!n) {
        n = this.build(id, type === NPC_TYPE.COP && (flags & 2) ? NPC_TYPE.SWAT : type); n.type = type; this.map.set(id, n);
        if (type === NPC_TYPE.COP && (flags & 1)) { n.donut = donutMesh(); n.lh.add(n.donut); n.donut.position.set(0, 0.02, -0.04); this.setBubble(n, '🍩 HEY! STOP!', '#ff7eb6'); n.bubbleUntil = performance.now() + 2500; }
      }
      if (n.bubbleUntil && performance.now() > n.bubbleUntil) { n.bubbleUntil = 0; this.setBubble(n, null); }
      n.flags = flags | 0;
      n.buf.push({ t: st, x, y, z, yaw, state });
      if (n.buf.length > 20) n.buf.shift();
      if (type === NPC_TYPE.SHOP && n.closed !== closed) { n.closed = closed; this.setBubble(n, closed ? 'CLOSED' : null, '#d62f4b'); }
      if (type === NPC_TYPE.PED && state === NPC_STATE.PANIC && n.state !== NPC_STATE.PANIC && Math.random() < 0.35) audio.playScream({ x, y: y + 1.5, z });
      if (type === NPC_TYPE.SHOP && state === NPC_STATE.HANDSUP && n.state !== NPC_STATE.HANDSUP) this.setBubble(n, "DON'T SHOOT!", '#ff9f1c');
      if (type === NPC_TYPE.SHOP && state !== NPC_STATE.HANDSUP && n.state === NPC_STATE.HANDSUP) this.setBubble(n, n.closed ? 'CLOSED' : null, '#d62f4b');
      n.state = state;
    }
    // NPCs the server no longer lists (cops going off duty)
    for (const [id, n] of this.map) if (!seen.has(id) && st) { this.scene.remove(n.root); this.map.delete(id); }
  }
  clear() { for (const n of this.map.values()) this.scene.remove(n.root); this.map.clear(); }
  say(id, text, ms = 3000, bg = '#2c3e50') { const n = this.map.get(id); if (!n) return; this.setBubble(n, text, bg); n.bubbleUntil = performance.now() + ms; }

  setBubble(n, text, bg) {
    if (n.bubble) { n.root.remove(n.bubble); n.bubble.material.map.dispose(); n.bubble.material.dispose(); n.bubble = null; }
    if (!text) return;
    const tex = new THREE.CanvasTexture(textCanvas(text, { w: 320, h: 80, bg, font: 'bold 44px Trebuchet MS, sans-serif', radius: 24 }));
    tex.colorSpace = THREE.SRGBColorSpace;
    n.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    n.bubble.scale.set(0.9, 0.225, 1); n.bubble.position.set(0, 2.15, 0);
    n.root.add(n.bubble);
  }

  die(id, color) {
    const n = this.map.get(id); if (!n) return;
    const p = new THREE.Vector3(n.x, n.y + 1.3, n.z);
    this.effects.pop(p, n.type === NPC_TYPE.COP ? 0x1f3a93 : n.type === NPC_TYPE.CROOK ? 0x2b2b33 : 0xff6b6b, n.type === NPC_TYPE.CROOK ? 0xd62f4b : 0xffdbac);
    audio.playDeath(p);
    n.alive = false; n.root.visible = false;
  }
  respawn(id) { const n = this.map.get(id); if (n) { n.alive = true; n.buf = []; } }

  update(dt, serverNow, camPos) {
    const t = serverNow - DELAY;
    let nearestCop = Infinity, copPos = null;
    for (const n of this.map.values()) {
      const b = n.buf; if (!b.length) continue;
      let i = b.length - 1; while (i > 0 && b[i - 1].t > t) i--;
      const A = b[Math.max(0, i - 1)], B = b[i];
      const k = A === B || t >= B.t ? 1 : Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-4, B.t - A.t)));
      const x = A.x + (B.x - A.x) * k, y = A.y + (B.y - A.y) * k, z = A.z + (B.z - A.z) * k;
      let dyaw = B.yaw - A.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const yaw = A.yaw + dyaw * k;
      const moved = Math.hypot(x - n.x, z - n.z);
      n.x = x; n.y = y; n.z = z; n.yaw = yaw;
      const state = B.state;
      const dist = Math.hypot(x - camPos.x, z - camPos.z);
      n.root.visible = n.alive && state !== NPC_STATE.DEAD && dist < this.cull && !(n.flags & 32);   // 32 = robber driving a stolen car (drawn in the car)
      if (n.bag) n.bag.visible = !!(n.flags & 64);
      if (n.type === NPC_TYPE.COP && state !== NPC_STATE.DEAD && dist < nearestCop) { nearestCop = dist; copPos = { x, y: y + 2, z }; }
      if (!n.root.visible) continue;
      n.root.position.set(x, y, z); n.root.rotation.y = yaw;
      // animation
      const speed = moved / Math.max(dt, 1e-3);
      n.phase += dt * (2 + speed * 2.2);
      const swing = Math.min(0.7, speed * 0.22) * Math.sin(n.phase);
      n.legs[0].rotation.x = swing; n.legs[1].rotation.x = -swing;
      n.body.position.y = Math.abs(Math.sin(n.phase)) * Math.min(0.05, speed * 0.015);
      const L = n.lh.position, R = n.rh.position;
      if (state === NPC_STATE.HANDSUP) { L.set(-0.28, 1.95 + Math.sin(n.phase * 3) * 0.03, -0.05); R.set(0.28, 1.95 + Math.cos(n.phase * 3) * 0.03, -0.05); }
      else if (state === NPC_STATE.PANIC) { L.set(-0.3, 1.75 + Math.sin(n.phase * 2) * 0.15, -0.1); R.set(0.3, 1.75 + Math.cos(n.phase * 2) * 0.15, -0.1); }
      else if (n.flags & 16) { L.set(-0.18, 1.12 + Math.sin(n.phase * 4) * 0.04, -0.5); R.set(0.18, 1.12 + Math.cos(n.phase * 4) * 0.04, -0.5); } // cuffing someone
      else if (state === NPC_STATE.AIM) { R.set(0.12, 1.33, -0.48); L.set(0.0, 1.3, -0.4); n.rh.rotation.set(0, 0, 0); }
      else if (n.type === NPC_TYPE.SHOP) { L.set(-0.26, 1.05, -0.28); R.set(0.26, 1.05, -0.28); }
      else { L.set(-0.32, 0.92, -swing * 0.25); R.set(0.32, 0.92, swing * 0.25); if (n.gun) n.rh.rotation.set(0.9, 0, 0); }
      if (state !== NPC_STATE.AIM && n.gun && (n.type === NPC_TYPE.COP || n.type === NPC_TYPE.CROOK) && state !== NPC_STATE.WALK) n.rh.rotation.set(0.9, 0, 0);
      if (n.gun && n.type === NPC_TYPE.CROOK) n.gun.visible = state !== NPC_STATE.HANDSUP;
      if (n.bubble) n.bubble.position.y = 2.15 + Math.sin(n.phase) * 0.02;
    }
    // police siren from the closest cop
    this.sirenT -= dt;
    if (copPos && nearestCop < 70 && this.sirenT <= 0) { audio.playSiren(copPos); this.sirenT = 4.5; }
  }

  // ray test against visible NPCs (client-side: aiming for robbery + tracer endpoints)
  ray(o, d, maxDist, filterType = null) {
    let best = maxDist, hit = null;
    for (const n of this.map.values()) {
      if (!n.alive || n.state === NPC_STATE.DEAD || !n.buf.length) continue;
      if (filterType !== null && n.type !== filterType) continue;
      const hy = n.y + HEAD_H;
      const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, n.x, hy, n.z, HEAD_RADIUS + (filterType !== null ? 0.12 : 0));
      const tb = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, n.x, hy - BODY_BOTTOM, hy - BODY_TOP, n.z, BODY_RADIUS + (filterType !== null ? 0.1 : 0));
      const tt = Math.min(th, tb);
      if (tt < best) { best = tt; hit = n; }
    }
    return hit ? { npc: hit, t: best } : null;
  }
  pos(id) { const n = this.map.get(id); return n ? new THREE.Vector3(n.x, n.y, n.z) : null; }
  get(id) { return this.map.get(id); }
}
