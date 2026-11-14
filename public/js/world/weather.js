// CITY CHAOS - weather (client): rain streaks around you, a darker grey sky and closer fog, the sound of rain,
// and in a thunderstorm lightning flashes with thunder a moment later. Cars grip the road a bit less in the rain.
import * as THREE from 'three';
import { weatherAt } from '/shared/daynight.js';

export class Weather {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio; this.kind = 'clear'; this.w = 0; this.flash = 0; this.nextBolt = 8; this.thunderAt = -1;
    const N = 1400, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 25, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.05], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd0dcf2, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    // splashes on the ground around you
    this.splash = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3)),
      new THREE.PointsMaterial({ color: 0xdde6ff, size: 0.04, transparent: true, opacity: 0, depthWrite: false }));
    this.splash.frustumCulled = false; scene.add(this.splash);
    this.grey = new THREE.Color(0x5c6478); this.greyNight = new THREE.Color(0x0a0d18);
  }
  pick(serverMs, fixed, winter) { return fixed || (winter ? 'clear' : weatherAt(serverMs)); }
  update(dt, cam, kind, dayNight, sun, hemi) {
    if (kind !== this.kind) { this.kind = kind; if (this.onChange) this.onChange(kind); }
    const target = kind === 'storm' ? 1 : kind === 'rain' ? 0.7 : 0;
    this.w += Math.sign(target - this.w) * Math.min(Math.abs(target - this.w), dt * 0.25);   // fades in / out over a few seconds
    const w = this.w;
    this.rain.visible = w > 0.02; this.rain.material.opacity = Math.min(0.8, w * 0.9);
    this.splash.material.opacity = w * 0.8;
    if (this.audio.setRain) this.audio.setRain(w);
    if (w <= 0.02) { if (dayNight.sky && dayNight.sky.material.opacity !== 1) dayNight.sky.material.opacity = 1; return 1; }
    // falling rain follows the camera
    const a = this.rain.geometry.attributes.position.array, fall = dt * 22;
    for (let i = 0; i < a.length; i += 6) { a[i + 1] -= fall; a[i + 4] -= fall; if (a[i + 4] < 0) { a[i + 1] += 25; a[i + 4] += 25; } }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.position.set(cam.x, Math.max(0, cam.y - 6), cam.z);
    const sp = this.splash.geometry.attributes.position.array;
    for (let i = 0; i < sp.length; i += 3) { if (Math.random() < 0.15) { sp[i] = cam.x + (Math.random() - 0.5) * 24; sp[i + 1] = 0.2; sp[i + 2] = cam.z + (Math.random() - 0.5) * 24; } }
    this.splash.geometry.attributes.position.needsUpdate = true;
    // darker, greyer, closer
    const s = this.scene, night = 1 - dayNight.f, g = this.grey.clone().lerp(this.greyNight, night);
    s.background.lerp(g, w * 0.7);
    if (dayNight.sky) { const m = dayNight.sky.material; m.color.lerp(g, w * 0.75); if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = 1 - w * 0.85; }
    for (const c of dayNight.clouds) c.m.color.lerp(g.clone().multiplyScalar(1.15), w * 0.7); if (s.fog) { s.fog.color.lerp(g, w * 0.6); s.fog.near = 140 - 100 * w; s.fog.far = 520 - 330 * w; }
    sun.intensity *= 1 - 0.55 * w; hemi.intensity *= 1 - 0.25 * w;
    // lightning
    if (kind === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = 6 + Math.random() * 12; this.flash = 1; this.thunderAt = 0.4 + Math.random() * 1.8; }
    }
    if (this.thunderAt >= 0) { this.thunderAt -= dt; if (this.thunderAt < 0 && this.audio.playThunder) this.audio.playThunder(); }
    if (this.flash > 0) { const f = this.flash; s.background.lerp(new THREE.Color(0xe8ecff), f * 0.8); hemi.intensity += f * 2.5; this.flash = Math.max(0, f - dt * (f > 0.5 ? 6 : 3)); if (f > 0.7 && f - dt * 6 < 0.7 && Math.random() < 0.5) this.flash = 0.95; }
    return 1 - 0.2 * w;   // car grip multiplier
  }
}
