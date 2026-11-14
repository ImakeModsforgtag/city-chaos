// CITY CHAOS - street races (client): the 🏁 start / finish arch over the avenue by the gas station,
// the next checkpoint (big beam + ring), the countdown and the race line at the top of the screen.
import * as THREE from 'three';
import { textCanvas } from '../engine/geo.js';
import { RACE, ROUTES, RACE_START, fmtRace } from '/shared/races.js';

export class RaceView {
  constructor(scene) {
    this.scene = scene; this.state = 'idle'; this.me = 0; this.racers = []; this.cp = 0; this.stand = [];
    const g = new THREE.Group(); g.position.set(RACE_START[0], 0.15, RACE_START[1]); scene.add(g);
    // checkered start line across the road
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const c = cv.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 16, j * 16, 16, 16); }
    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.02; g.add(line);
    // arch: two poles + banner high above the traffic
    const pm = new THREE.MeshLambertMaterial({ color: 0x263238 });
    for (const sx of [-6.6, 6.6]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), pm); pole.position.set(sx, 3.5, 0); g.add(pole); }
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 1.6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide,
      map: new THREE.CanvasTexture(textCanvas('🏁 STREET RACE · drive in to start 🏁', { w: 1024, h: 120, bg: '#d62f4b', fg: '#ffffff', font: 'bold 64px Trebuchet MS, sans-serif', radius: 10 })) }));
    ban.position.set(0, 7.0, 0); g.add(ban);
    // glowing join zone
    this.zoneMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.zone = new THREE.Mesh(new THREE.RingGeometry(RACE.joinRadius - 0.6, RACE.joinRadius, 40), this.zoneMat);
    this.zone.rotation.x = -Math.PI / 2; this.zone.position.y = 0.05; g.add(this.zone);
    this.arch = g;
  }
  get racing() { return this.racers.includes(this.me) && (this.state === 'lobby' || this.state === 'running') && !this.finished; }
  route() { return ROUTES.find(r => r.id === this.routeId) || ROUTES[0]; }
  // returns a message for the HUD feed / notices, or null
  on(m, me) {
    this.me = me;
    switch (m.ev) {
      case 'idle': this.state = 'idle'; this.racers = []; return null;
      case 'state': Object.assign(this, { state: m.state, routeId: m.route, startAt: m.startAt, racers: m.racers }); return null;
      case 'join':
        this.state = 'lobby'; this.routeId = m.route; this.startAt = m.startAt; this.racers = m.racers;
        if (m.pid === me) { this.cp = 0; this.finished = null; return { big: `🏁 ${this.route().name}`, text: `You're in! The race starts in ${Math.max(1, Math.round(m.startAt - this.now()))}s. Wait at the line`, vr: 'Race joined! Wait at the line' }; }
        return null;
      case 'go': this.state = 'running'; this.racers = m.racers; this.startAt = m.startAt; this.cp = 0; return this.racers.includes(me) ? { big: 'GO! GO! GO!', text: 'Hit every checkpoint!', vr: 'GO!' } : null;
      case 'cp': this.cp = m.i; return { cp: true };
      case 'stand': this.stand = m.list; return null;
      case 'finish':
        if (m.pid === me) {
          this.finished = m;
          const place = m.solo ? (m.beat ? 'BEAT THE TARGET!' : 'FINISHED') : ['1ST PLACE!', '2ND PLACE', '3RD PLACE'][m.place - 1] || `${m.place}TH`;
          return { big: `🏁 ${place}`, text: `${fmtRace(m.time)}${m.pb ? ' · NEW BEST TIME' : ''}${m.prize ? ` · +$${m.prize}` : m.solo ? ` · target ${fmtRace(m.par)}` : ''}`, vr: `${place} ${fmtRace(m.time)}${m.prize ? ' +$' + m.prize : ''}`, cash: m.total };
        }
        return null;
      case 'dnf': this.racers = this.racers.filter(id => id !== m.pid); return m.pid === me ? { text: `🏁 Out of the race: you ${m.why}`, vr: `Out of the race: ${m.why}` } : null;
      case 'end': this.state = 'idle'; this.racers = []; this.finished = null; return null;
    }
    return null;
  }
  now() { return this.serverNow ? this.serverNow() : performance.now() / 1000; }
  // where the beam should point (next checkpoint), or the start line while waiting
  target() {
    if (!this.racing) return null;
    if (this.state === 'lobby') return null;   // you're on the line already
    const p = this.route().cps[this.cp]; return p ? [p[0], 0.15, p[1]] : null;
  }
  place() {
    if (!this.stand.length) return 0;
    const mine = this.stand.find(s => s[0] === this.me); if (!mine) return 0;
    const sorted = this.stand.slice().sort((a, b) => (a[2] && b[2]) ? a[2] - b[2] : a[2] ? -1 : b[2] ? 1 : b[1] - a[1]);
    return sorted.findIndex(s => s[0] === this.me) + 1;
  }
  line(short) {
    if (!this.racing) return null;
    const t = this.now();
    if (this.state === 'lobby') { const s = Math.ceil(this.startAt - t); return s > RACE.countdown ? `🏁 ${this.route().name} starts in ${s}s · ${this.racers.length} racer${this.racers.length > 1 ? 's' : ''} at the line` : `🏁 ${s > 0 ? s : 'GO'}...`; }
    const n = this.route().cps.length, pl = this.place(), tot = this.stand.length;
    const pos = tot > 1 && pl ? ` · ${['1st', '2nd', '3rd'][pl - 1] || pl + 'th'} of ${tot}` : ` · target ${fmtRace(this.route().par)}`;
    return `🏁 ${short ? '' : 'Checkpoint '}${Math.min(this.cp + 1, n)}/${n} · ⏱ ${fmtRace(t - this.startAt)}${pos}`;
  }
  update(t) { const s = 1 + Math.sin(t * 3) * 0.04; this.zone.scale.set(s, s, s); this.zoneMat.opacity = this.state === 'running' ? 0.12 : 0.35; }
}
