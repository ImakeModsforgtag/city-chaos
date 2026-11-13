// Other players: snapshot buffering + smooth interpolation (rendered ~100ms in the past).
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { WEAPON_IDS, WEAPONS } from '/shared/weapons.js';

export const INTERP_DELAY = 0.1;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

// role / prison clothing on top of the player's own cosmetics (jail: 1 cutscene, 2 prisoner, 3 guard disguise)
const uniformCos = (info) => ({ ...info.cos, cop: info.role === 'cop', prisoner: info.jail === 2, guard: info.jail === 3 });

// name tag over a player's head: level + name
const tagName = (i) => `Lv${i.lvl || 1} ${i.name}`;

export class RemotePlayers {
  constructor(scene, effects) {
    this.scene = scene; this.effects = effects;
    this.players = new Map(); // id -> { info, avatar, buf: [{t, a}], alive }
    this.myId = null;
  }

  upsert(info) {
    if (info.id === this.myId) return null;
    let p = this.players.get(info.id);
    if (!p) {
      const avatar = new Avatar(uniformCos(info), { name: tagName(info), team: info.team });
      avatar.setRole(info.role); avatar.setWanted(info.wanted);
      this.scene.add(avatar.root);
      avatar.root.visible = false;
      p = { info, avatar, buf: [], alive: info.alive, voice: null };
      this.players.set(info.id, p);
    } else {
      const cosChanged = JSON.stringify(p.info.cos) !== JSON.stringify(info.cos) || (p.info.role === 'cop') !== (info.role === 'cop') || (p.info.jail || 0) !== (info.jail || 0);
      if (cosChanged) p.avatar.setCosmetics(uniformCos(info));
      p.avatar.setRole(info.role); if (info.wanted !== undefined) p.avatar.setWanted(info.wanted);
      if (p.info.name !== info.name || p.info.team !== info.team || (info.lvl && p.info.lvl !== info.lvl)) { p.avatar.team = info.team; p.avatar.setName(tagName({ ...p.info, ...info }), info.team); p.avatar.setTeam(info.team); }
      p.info = { ...p.info, ...info };
    }
    if (!info.connected) p.avatar.root.visible = false;
    return p;
  }
  setWanted(id, n) { const p = this.players.get(id); if (p) { p.info.wanted = n; p.avatar.setWanted(n); } }
  remove(id) {
    const p = this.players.get(id); if (!p) return;
    this.scene.remove(p.avatar.root); p.avatar.dispose(); this.players.delete(id);
  }
  clear() { for (const id of [...this.players.keys()]) this.remove(id); }

  onSnapshot(st, arr) {
    for (const a of arr) {
      const p = this.players.get(a[0]); if (!p) continue;
      p.buf.push({ t: st, a });
      if (p.buf.length > 30) p.buf.shift();
    }
  }

  // sample interpolated head position at server time t (for local hit prediction / tracers)
  sample(p, t) {
    const b = p.buf;
    if (!b.length) return null;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const A = b[Math.max(0, i - 1)], B = b[i];
    if (!A || A === B || t >= B.t) return { a: B.a, b: B.a, k: 0 };
    const k = Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-4, B.t - A.t)));
    return { a: A.a, b: B.a, k };
  }

  update(dt, serverNow) {
    const t = serverNow - INTERP_DELAY;
    for (const p of this.players.values()) {
      const s = this.sample(p, t);
      const av = p.avatar;
      if (!s || !p.info.connected) { av.root.visible = false; continue; }
      const { a, b, k } = s;
      const alive = b[1] === 1;
      if (p.alive && !alive) { /* death handled by kill event */ }
      p.alive = alive;
      av.root.visible = alive && p.info.jail !== 1;   // hidden while their arrest cutscene plays
      if (!av.root.visible) continue;
      const lerp = (i) => a[i] + (b[i] - a[i]) * k;
      const pose = (o) => {
        _qa.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); _qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
        _qa.slerp(_qb, k);
        return [lerp(o), lerp(o + 1), lerp(o + 2), _qa.x, _qa.y, _qa.z, _qa.w];
      };
      const h = pose(2), l = pose(9), r = pose(16);
      const wi = b[23];
      av.setWeapon(wi >= 0 ? WEAPON_IDS[wi] : null);
      av.setVR(!!b[25]);
      av.setPose(h, l, r, dt);
      p.head = h;
    }
  }

  onShot(id, w) { const p = this.players.get(id); if (p) p.avatar.kick(WEAPONS[w].kick); }
  onReload(id, w) { const p = this.players.get(id); if (p) p.avatar.startReload(WEAPONS[w].reloadTime); }

  // muzzle position of a remote player's gun (for tracers)
  muzzleOf(id, out) {
    const p = this.players.get(id);
    if (!p || !p.avatar.weapon) return null;
    p.avatar.weapon.userData.muzzle.getWorldPosition(out);
    return out;
  }
  headOf(id) { const p = this.players.get(id); return p && p.head ? p.head : null; }
}
