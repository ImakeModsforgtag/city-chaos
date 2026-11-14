// CITY CHAOS audio: every sound is synthesized with the Web Audio API (no files to download).
// Works in Meta Quest Browser once the user has tapped/clicked anything (unlock()).
import { settings, onSettings } from '../ui/settings.js';

let ctx = null, master, sfx, music, voiceBus, noiseBuf, ambience = null, musicTimer = null, echo = null, radioBus = null, carRadio = null;
const listenerPos = { x: 0, y: 0, z: 0 };

export function audioCtx() { return ctx; }
export function voiceOutput() { return voiceBus; }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
    sfx = ctx.createGain(); sfx.connect(comp); comp.connect(master);
    music = ctx.createGain(); music.connect(master);
    voiceBus = ctx.createGain(); voiceBus.connect(master);
    // a short city "slap back" echo for gunshots and explosions (buildings bouncing the sound back)
    echo = ctx.createDelay(1); echo.delayTime.value = 0.14;
    const fb = ctx.createGain(); fb.gain.value = 0.28; const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 1400;
    echo.connect(ef); ef.connect(fb); fb.connect(echo); ef.connect(sfx);
    // the car radio: through a small "car speaker" filter
    radioBus = ctx.createGain(); const rf = ctx.createBiquadFilter(); rf.type = 'peaking'; rf.frequency.value = 900; rf.gain.value = 4; radioBus.connect(rf); rf.connect(music);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
  }
  if (ctx.state !== 'running') ctx.resume();
}
function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.volMaster; sfx.gain.value = settings.volSfx;
  music.gain.value = settings.volMusic * 0.5; voiceBus.gain.value = settings.volVoice;
}
onSettings(applyVolumes);

export function setListener(pos, fwd, up) {
  if (!ctx) return;
  const L = ctx.listener;
  listenerPos.x = pos.x; listenerPos.y = pos.y; listenerPos.z = pos.z;
  if (L.positionX) {
    const t = ctx.currentTime;
    L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
    L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
    L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
  } else {
    L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

// output node: either straight to sfx bus (own sounds) or through a 3D panner
function out(pos, maxDist = 120) {
  if (!pos) return sfx;
  const d = Math.hypot(pos.x - listenerPos.x, pos.y - listenerPos.y, pos.z - listenerPos.z);
  if (d > maxDist) return null;
  const p = ctx.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.2; p.maxDistance = maxDist;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  // far away sounds lose their highs (like real gunfire across a city)
  if (d > 25) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(700, 9000 - d * 70); p.connect(f); f.connect(sfx); }
  else p.connect(sfx);
  return p;
}
export function makePanner() {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.4; p.maxDistance = 60;
  return p;
}

function noise(dest, t, dur, { type = 'lowpass', freq = 2000, q = 0.7, gain = 0.5, attack = 0.002, sweepTo = null } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone(dest, t, dur, { type = 'sine', freq = 200, to = null, gain = 0.4, attack = 0.003 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

// Each weapon gets its own recipe so they all sound different.
const GUN = {
  pistol:   { n: [0.12, 2600, 0.7], th: [150, 60, 0.12, 0.6], crack: 0.25 },
  revolver: { n: [0.28, 1800, 0.9], th: [110, 40, 0.25, 0.9], crack: 0.45, ring: 900 },
  ar:       { n: [0.1, 3200, 0.6], th: [170, 70, 0.09, 0.5], crack: 0.2 },
  smg:      { n: [0.07, 4200, 0.45], th: [220, 100, 0.06, 0.35], crack: 0.15 },
  shotgun:  { n: [0.38, 1300, 1.0], th: [90, 35, 0.3, 1.0], crack: 0.5 },
  sniper:   { n: [0.5, 2200, 1.0], th: [80, 30, 0.4, 1.0], crack: 0.7, ring: 1400 },
  golden:   { n: [0.65, 2000, 1.1], th: [70, 26, 0.5, 1.1], crack: 0.85, ring: 1760 },
  rocket:   { n: [0.6, 700, 0.8], th: [60, 25, 0.5, 0.8], crack: 0, whoosh: true }
};
export function playShot(w, pos) {
  if (!ctx) return; const d = out(pos, 200); if (!d) return;
  const t = ctx.currentTime, r = GUN[w] || GUN.pistol;
  // body thump you feel up close + a mechanical click, then the city echo
  if (!pos) { tone(sfx, t, 0.09, { type: 'sine', freq: 70, to: 38, gain: (r.th[3] || 0.5) * 0.9 }); noise(sfx, t + 0.015, 0.025, { type: 'bandpass', freq: 6000, q: 3, gain: 0.12 }); }
  const es = ctx.createGain(); es.gain.value = pos ? 0.35 : 0.45;
  noise(es, t, r.n[0] * 0.8, { freq: r.n[1] * 0.6, gain: r.n[2] * 0.6, sweepTo: 250 }); es.connect(echo);
  noise(d, t, r.n[0], { freq: r.n[1], gain: r.n[2], sweepTo: 300 });
  tone(d, t, r.th[2], { type: 'triangle', freq: r.th[0], to: r.th[1], gain: r.th[3] });
  if (r.crack) noise(d, t, 0.03, { type: 'highpass', freq: 5000, gain: r.crack });
  if (r.ring) tone(d, t + 0.01, 0.35, { type: 'sine', freq: r.ring, to: r.ring * 0.7, gain: 0.08 });
  if (r.whoosh) noise(d, t, 0.9, { type: 'bandpass', freq: 400, q: 2, gain: 0.5, sweepTo: 2500, attack: 0.05 });
}
export function playReload(w, phase = 0) {
  if (!ctx) return; const t = ctx.currentTime;
  if (phase === 0) { tone(sfx, t, 0.05, { type: 'square', freq: 700, to: 300, gain: 0.12 }); noise(sfx, t + 0.02, 0.06, { type: 'bandpass', freq: 2500, q: 3, gain: 0.25 }); }
  else { tone(sfx, t, 0.04, { type: 'square', freq: 400, to: 900, gain: 0.12 }); noise(sfx, t, 0.08, { type: 'bandpass', freq: 3500, q: 4, gain: 0.35 });
    if (w === 'shotgun') { noise(sfx, t + 0.12, 0.08, { type: 'bandpass', freq: 1800, q: 3, gain: 0.4 }); } }
}
// Golden Sniper: bullet cam whoosh (rising, then the impact thump) and the bolt being cycled
export function playBulletCam(dur = 1) {
  if (!ctx) return; const t = ctx.currentTime;
  noise(sfx, t, dur, { type: 'bandpass', freq: 500, q: 1.5, gain: 0.35, sweepTo: 1800, attack: 0.1 });
  tone(sfx, t, dur, { type: 'sine', freq: 90, to: 140, gain: 0.12 });
}
export function playBulletImpact() {
  if (!ctx) return; const t = ctx.currentTime;
  tone(sfx, t, 0.35, { type: 'triangle', freq: 120, to: 40, gain: 0.5 }); noise(sfx, t, 0.2, { freq: 1400, gain: 0.5, sweepTo: 200 });
}
export function playBolt() {
  if (!ctx) return; const t = ctx.currentTime;
  noise(sfx, t, 0.07, { type: 'bandpass', freq: 2200, q: 5, gain: 0.35 }); noise(sfx, t + 0.22, 0.08, { type: 'bandpass', freq: 3200, q: 5, gain: 0.4 });
  tone(sfx, t + 0.24, 0.04, { type: 'square', freq: 900, to: 1400, gain: 0.08 });
}
export function playEmpty() { if (!ctx) return; tone(sfx, ctx.currentTime, 0.04, { type: 'square', freq: 1200, to: 800, gain: 0.1 }); }
export function playHit(head) {
  if (!ctx) return; const t = ctx.currentTime;
  tone(sfx, t, 0.08, { type: 'square', freq: head ? 1500 : 1000, to: head ? 2200 : 1300, gain: 0.18 });
  if (head) tone(sfx, t + 0.05, 0.12, { type: 'sine', freq: 2600, gain: 0.15 });
}
export function playHurt() { if (!ctx) return; const t = ctx.currentTime; tone(sfx, t, 0.18, { type: 'sawtooth', freq: 220, to: 90, gain: 0.25 }); noise(sfx, t, 0.12, { freq: 900, gain: 0.3 }); }
export function playKill() {
  if (!ctx) return; const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => tone(sfx, t + i * 0.06, 0.18, { type: 'square', freq: f, gain: 0.12 }));
}
export function playDeath(pos) {
  if (!ctx) return; const d = out(pos); if (!d) return; const t = ctx.currentTime;
  tone(d, t, 0.6, { type: 'sawtooth', freq: 400, to: 60, gain: 0.3 });
  noise(d, t, 0.4, { freq: 1200, gain: 0.4, sweepTo: 200 });
  tone(d, t + 0.05, 0.25, { type: 'square', freq: 880, to: 1760, gain: 0.08 }); // cartoony "pop"
}
export function playExplosion(pos) {
  if (ctx && echo) { const es = ctx.createGain(); es.gain.value = 0.5; es.connect(echo); noise(es, ctx.currentTime, 1.0, { freq: 500, gain: 0.8, sweepTo: 80 }); }
  if (!ctx) return; const d = out(pos, 250); if (!d) return; const t = ctx.currentTime;
  noise(d, t, 1.4, { freq: 900, gain: 1.0, sweepTo: 80, attack: 0.005 });
  tone(d, t, 0.8, { type: 'sine', freq: 70, to: 25, gain: 1.0 });
}
export function playPickup(kind) {
  if (!ctx) return; const t = ctx.currentTime;
  const notes = kind === 'health' ? [660, 880, 1320] : kind === 'ammo' ? [440, 660] : [520, 780, 1040];
  notes.forEach((f, i) => tone(sfx, t + i * 0.07, 0.15, { type: 'triangle', freq: f, gain: 0.25 }));
  noise(sfx, t, 0.08, { type: 'bandpass', freq: 3000, q: 3, gain: 0.2 });
}
export function playStep(pos, strength = 1, surface = 0) {
  if (!ctx) return; const d = out(pos, 30); if (!d) return; const t = ctx.currentTime;
  noise(d, t, 0.07, { freq: surface ? 900 : 600 + Math.random() * 300, gain: 0.18 * strength });
  tone(d, t, 0.05, { type: 'sine', freq: 90 + Math.random() * 30, to: 50, gain: 0.15 * strength });
}
export function playTap(pos, strength) { playStep(pos, Math.min(1.5, 0.4 + strength * 0.4), 1); }
export function playClick() { if (!ctx) return; const t = ctx.currentTime; tone(sfx, t, 0.06, { type: 'square', freq: 880, to: 1320, gain: 0.1 }); }
export function playHover() { if (!ctx) return; tone(sfx, ctx.currentTime, 0.03, { type: 'sine', freq: 1500, gain: 0.05 }); }
export function playSpawn() { if (!ctx) return; const t = ctx.currentTime; tone(sfx, t, 0.4, { type: 'sine', freq: 300, to: 1200, gain: 0.2 }); }
export function playWhizz(pos) { if (!ctx) return; const d = out(pos, 20); if (!d) return; noise(d, ctx.currentTime, 0.15, { type: 'bandpass', freq: 3000, q: 6, gain: 0.3, sweepTo: 800 }); }
export function playCountdown(final) { if (!ctx) return; tone(sfx, ctx.currentTime, 0.15, { type: 'square', freq: final ? 1320 : 660, gain: 0.15 }); }
export function playWin() {
  if (!ctx) return; const t = ctx.currentTime;
  [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(sfx, t + i * 0.12, 0.25, { type: 'square', freq: f, gain: 0.12 }));
}

export function playHonk(pos) {
  if (!ctx) return; const d = out(pos, 120); if (!d) return; const t = ctx.currentTime;
  tone(d, t, 0.32, { type: 'square', freq: 415, gain: 0.12 }); tone(d, t, 0.32, { type: 'square', freq: 523, gain: 0.09 });
  tone(d, t + 0.4, 0.22, { type: 'square', freq: 415, gain: 0.12 }); tone(d, t + 0.4, 0.22, { type: 'square', freq: 523, gain: 0.09 });
}
export function playDoor() {
  if (!ctx) return; const t = ctx.currentTime;
  noise(sfx, t, 0.12, { freq: 500, gain: 0.5 }); tone(sfx, t, 0.15, { type: 'sine', freq: 120, to: 60, gain: 0.4 });
}
export function playCrash(speed = 10) {
  if (!ctx) return; const t = ctx.currentTime, g = Math.min(1, speed / 15);
  noise(sfx, t, 0.5, { freq: 1500, gain: 0.8 * g + 0.2, sweepTo: 200 });
  tone(sfx, t, 0.3, { type: 'triangle', freq: 90, to: 40, gain: 0.7 * g + 0.2 });
  noise(sfx, t + 0.05, 0.25, { type: 'highpass', freq: 4000, gain: 0.3 * g });   // glass tinkle
}
let eng = null;
// continuous engine sound for the car you're driving (pitch follows speed)
export function engine(on, speed = 0) {
  if (!ctx) return;
  if (on && !eng) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.0001;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfx); o1.start(); o2.start();
    eng = { o1, o2, f, g };
  }
  if (!eng) return;
  const t = ctx.currentTime;
  if (!on) { eng.g.gain.setTargetAtTime(0.0001, t, 0.1); const e = eng; eng = null; setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch {} }, 600); return; }
  const f0 = 38 + speed * 4.2;
  eng.o1.frequency.setTargetAtTime(f0, t, 0.08); eng.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.08);
  eng.f.frequency.setTargetAtTime(350 + speed * 40, t, 0.1);
  eng.g.gain.setTargetAtTime(0.07 + Math.min(0.08, speed * 0.004), t, 0.1);
}
export function playCash() {
  if (!ctx) return; const t = ctx.currentTime;
  noise(sfx, t, 0.08, { type: 'bandpass', freq: 3000, q: 4, gain: 0.3 });           // drawer
  tone(sfx, t + 0.05, 0.5, { type: 'sine', freq: 2093, gain: 0.25 });                // "ka-"
  tone(sfx, t + 0.12, 0.7, { type: 'sine', freq: 2637, gain: 0.25 });                // "-ching"
  tone(sfx, t + 0.12, 0.7, { type: 'triangle', freq: 3136, gain: 0.08 });
}
export function playScream(pos) {
  if (!ctx) return; const d = out(pos, 40); if (!d) return; const t = ctx.currentTime;
  const f = 500 + Math.random() * 300;
  tone(d, t, 0.45, { type: 'sawtooth', freq: f, to: f * 1.6, gain: 0.07, attack: 0.03 });
  tone(d, t + 0.02, 0.45, { type: 'triangle', freq: f * 1.01, to: f * 1.5, gain: 0.06, attack: 0.03 });
}
export function playSiren(pos) {
  if (!ctx) return; const d = out(pos, 90); if (!d) return; const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square';
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.1);
  g.gain.setValueAtTime(0.06, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
  for (let k = 0; k < 6; k++) { o.frequency.setValueAtTime(k % 2 ? 960 : 720, t + k * 0.42); }
  o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 2.7);
}

// ---------------------------------------------------------------- ambience (city)
export function startAmbience() {
  if (!ctx || ambience) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  const g = ctx.createGain(); g.gain.value = 0.07;
  src.connect(f); f.connect(g); g.connect(sfx); src.start();
  const extras = setInterval(() => {
    if (!ctx) return; const t = ctx.currentTime, r = Math.random();
    const far = { x: listenerPos.x + (Math.random() - 0.5) * 120, y: 3, z: listenerPos.z + (Math.random() - 0.5) * 120 };
    const d = out(far, 400); if (!d) return;
    const park = AMB.parkAt && AMB.parkAt(listenerPos.x, listenerPos.z), down = AMB.downtownAt && AMB.downtownAt(listenerPos.x, listenerPos.z);
    if (AMB.winter && r < 0.18) { [1568, 1760, 1568, 1319].forEach((f, i) => tone(d, t + i * 0.16, 0.12, { type: 'triangle', freq: f, gain: 0.035 })); return; }   // sleigh bells
    if (park && r < 0.75) { for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) tone(d, t + i * 0.11, 0.08, { type: 'sine', freq: 2600 + Math.random() * 1400, to: 3800, gain: 0.05 }); return; }   // park: lots of birds
    if (down && r < 0.5) { noise(d, t, 1.6, { type: 'bandpass', freq: 220, q: 0.8, gain: 0.14, attack: 0.5 }); if (Math.random() < 0.4) tone(d, t + 0.4, 0.3, { type: 'square', freq: 440, gain: 0.06 }); return; }   // downtown: traffic + honks
    if (r < 0.3) { tone(d, t, 0.35, { type: 'square', freq: 392, gain: 0.08 }); tone(d, t, 0.35, { type: 'square', freq: 494, gain: 0.06 }); } // car horn
    else if (r < 0.65) { for (let i = 0; i < 3; i++) tone(d, t + i * 0.12, 0.08, { type: 'sine', freq: 2800 + Math.random() * 900, to: 3600, gain: 0.05 }); } // birds
    else if (r < 0.8) { const s = ctx.createOscillator(); s.type = 'sine'; const sg = ctx.createGain(); sg.gain.value = 0.0001; s.connect(sg); sg.connect(d);
      s.frequency.setValueAtTime(700, t); for (let k = 0; k < 6; k++) s.frequency.linearRampToValueAtTime(k % 2 ? 700 : 1000, t + k * 0.35);
      sg.gain.exponentialRampToValueAtTime(0.03, t + 0.3); sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1); s.start(t); s.stop(t + 2.2); } // siren
    else noise(d, t, 2.5, { type: 'bandpass', freq: 300, q: 1, gain: 0.12, attack: 0.8 }); // passing car
  }, 3500);
  // winter wind (holiday event)
  const wsrc = ctx.createBufferSource(); wsrc.buffer = noiseBuf; wsrc.loop = true; wsrc.playbackRate.value = 0.5;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = AMB.winter ? 0.05 : 0;
  wsrc.connect(wf); wf.connect(wg); wg.connect(sfx); wsrc.start();
  const gust = setInterval(() => { if (!ctx) return; const t = ctx.currentTime; wf.frequency.setTargetAtTime(350 + Math.random() * 500, t, 1.5); wg.gain.setTargetAtTime(AMB.winter ? 0.03 + Math.random() * 0.05 : 0, t, 1.2); }, 2000);
  ambience = { src, g, extras, wsrc, gust };
}
// where you are (set by main: park / downtown) and the season, so the city sounds like the place you're in
export const AMB = { parkAt: null, downtownAt: null, winter: false };
export function stopAmbience() {
  if (!ambience) return;
  try { ambience.src.stop(); ambience.wsrc.stop(); } catch {}
  clearInterval(ambience.extras); clearInterval(ambience.gust); ambience = null;
}

// ---------------------------------------------------------------- menu music (tiny step sequencer)
export function startMusic() {
  if (!ctx || musicTimer) return;
  const bpm = 112, step = 60 / bpm / 2;
  const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]];
  const mel = [72, 0, 76, 74, 72, 0, 69, 0, 67, 69, 72, 0, 74, 0, 76, 79];
  let n = 0, next = ctx.currentTime + 0.1;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(n / 8) % 4, s = n % 8;
      if (s === 0) chords[bar].forEach(m => tone(music, next, step * 7.5, { type: 'triangle', freq: mtof(m), gain: 0.05, attack: 0.02 }));
      if (s % 2 === 0) tone(music, next, 0.14, { type: 'sine', freq: 110, to: 45, gain: 0.35 });             // kick
      if (s % 2 === 1) noise(music, next, 0.05, { type: 'highpass', freq: 7000, gain: 0.08 });              // hat
      if (s === 4) noise(music, next, 0.12, { type: 'bandpass', freq: 1800, q: 1, gain: 0.2 });              // snare
      tone(music, next, step * 0.9, { type: 'square', freq: mtof(chords[bar][0] - 24 + (s % 4 === 3 ? 7 : 0)), gain: 0.05 }); // bass
      const m = mel[n % 16]; if (m && bar % 2 === 0) tone(music, next, step * 0.8, { type: 'square', freq: mtof(m), gain: 0.035 });
      next += step; n++;
    }
  }, 50);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

// ---------------------------------------------------------------- prison + arrest sounds
export function playCuffs() {
  if (!ctx) return; const t = ctx.currentTime;
  for (const k of [0, 0.09, 0.16, 0.5, 0.59]) { tone(sfx, t + k, 0.03, { type: 'square', freq: 2400, to: 1800, gain: 0.12 }); noise(sfx, t + k, 0.03, { type: 'highpass', freq: 5000, gain: 0.25 }); }
}
export function playCarDoorSlam() { if (!ctx) return; const t = ctx.currentTime; noise(sfx, t, 0.18, { freq: 400, gain: 0.7 }); tone(sfx, t, 0.2, { type: 'sine', freq: 90, to: 45, gain: 0.6 }); }
export function playCellDoor(pos) {
  if (!ctx) return; const d = pos ? out(pos, 40) : sfx; if (!d) return; const t = ctx.currentTime;
  noise(d, t, 0.7, { type: 'bandpass', freq: 900, q: 3, gain: 0.35, sweepTo: 500 });
  tone(d, t + 0.62, 0.25, { type: 'square', freq: 140, to: 70, gain: 0.35 }); noise(d, t + 0.62, 0.12, { freq: 3000, gain: 0.5 });
}
export function playGate(pos) {
  if (!ctx) return; const d = pos ? out(pos, 80) : sfx; if (!d) return; const t = ctx.currentTime;
  noise(d, t, 3.2, { type: 'lowpass', freq: 260, gain: 0.45 }); tone(d, t, 3.2, { type: 'sawtooth', freq: 48, to: 52, gain: 0.12 });
  for (let k = 0; k < 6; k++) tone(d, t + k * 0.55, 0.12, { type: 'square', freq: 880, gain: 0.08 });
}
export function playBuzzer() { if (!ctx) return; const t = ctx.currentTime; tone(sfx, t, 0.6, { type: 'sawtooth', freq: 110, gain: 0.25 }); tone(sfx, t, 0.6, { type: 'square', freq: 220, gain: 0.08 }); }
export function playChime() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.22, 0.5, { type: 'sine', freq: f, gain: 0.18 })); }
export function playAlarm() {
  if (!ctx) return; const t = ctx.currentTime;
  for (let k = 0; k < 4; k++) tone(sfx, t + k * 0.5, 0.45, { type: 'sawtooth', freq: 600, to: 1100, gain: 0.12 });
}
export function playShock() { if (!ctx) return; const t = ctx.currentTime; noise(sfx, t, 0.5, { type: 'highpass', freq: 2500, gain: 0.7 }); for (let k = 0; k < 8; k++) tone(sfx, t + k * 0.05, 0.04, { type: 'square', freq: 60 + Math.random() * 90, gain: 0.3 }); }
export function playSwish() { if (!ctx) return; const t = ctx.currentTime; noise(sfx, t, 0.3, { type: 'bandpass', freq: 1800, q: 2, gain: 0.35, sweepTo: 600 }); }
export function playBounce(pos) { if (!ctx) return; const d = out(pos, 30); if (!d) return; tone(d, ctx.currentTime, 0.12, { type: 'sine', freq: 140, to: 70, gain: 0.35 }); }
export function playScrape(pos) { if (!ctx) return; const d = pos ? out(pos, 30) : sfx; if (!d) return; noise(d, ctx.currentTime, 0.28, { type: 'bandpass', freq: 2200, q: 4, gain: 0.3 }); }
export function playHeartbeat() { if (!ctx) return; const t = ctx.currentTime; tone(sfx, t, 0.12, { type: 'sine', freq: 60, gain: 0.5 }); tone(sfx, t + 0.22, 0.12, { type: 'sine', freq: 55, gain: 0.4 }); }

// police radio: a burst of static, then a voice line (speech synthesis, if the browser has it)
export function radio(text, { pitch = 0.85, rate = 1.05 } = {}) {
  if (ctx) {
    const t = ctx.currentTime;
    noise(sfx, t, 0.22, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.28 });
    tone(sfx, t + 0.02, 0.08, { type: 'square', freq: 1400, gain: 0.05 });
  }
  try {
    if (!('speechSynthesis' in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, (settings.volMaster || 1) * 0.9);
    const voices = speechSynthesis.getVoices();
    const v = voices.find(x => /en[-_](US|GB)/i.test(x.lang) && /male|david|daniel|alex|guy/i.test(x.name)) || voices.find(x => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = () => { if (ctx) noise(sfx, ctx.currentTime, 0.15, { type: 'bandpass', freq: 1800, q: 1.2, gain: 0.2 }); };
    speechSynthesis.speak(u);
  } catch {}
}
export function stopRadio() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {} }

// ---------------------------------------------------------------- 📻 car radio: three synth stations
export const STATIONS = [
  { name: 'CHAOS FM', bpm: 118, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], mel: [72, 74, 76, 0, 79, 76, 74, 0, 72, 0, 74, 76, 74, 72, 69, 0], lead: 'square', kick: [0, 4], snare: [2, 6], hat: 1 },
  { name: 'LO-FI 88', bpm: 82, chords: [[62, 65, 69, 72], [60, 64, 67, 71], [57, 60, 64, 67], [59, 62, 65, 69]], mel: [74, 0, 72, 0, 69, 0, 0, 67, 69, 0, 72, 0, 0, 0, 74, 0], lead: 'triangle', kick: [0, 5], snare: [4], hat: 2 },
  { name: 'BASS 101', bpm: 140, chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], mel: [69, 0, 69, 72, 0, 69, 0, 67, 69, 0, 0, 76, 0, 74, 72, 0], lead: 'sawtooth', kick: [0, 2, 4, 6], snare: [4], hat: 1, wobble: true }
];
export function carRadioOn() { return !!carRadio; }
export function carRadioStation() { return carRadio ? STATIONS[carRadio.i].name : null; }
export function startCarRadio(i = 0) {
  if (!ctx) return;
  stopCarRadio();
  const st = STATIONS[i % STATIONS.length], step = 60 / st.bpm / 2;
  let n = 0, next = ctx.currentTime + 0.15;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const timer = setInterval(() => {
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(n / 8) % 4, s = n % 8, ch = st.chords[bar];
      if (s === 0) ch.forEach(m => tone(radioBus, next, step * 7.5, { type: 'triangle', freq: mtof(m), gain: 0.04, attack: 0.03 }));
      if (st.kick.includes(s)) tone(radioBus, next, 0.16, { type: 'sine', freq: 120, to: 42, gain: 0.4 });
      if (st.snare.includes(s)) noise(radioBus, next, 0.13, { type: 'bandpass', freq: 1700, q: 1, gain: 0.22 });
      if (s % st.hat === 0) noise(radioBus, next + step / 2, 0.04, { type: 'highpass', freq: 7500, gain: 0.07 });
      const bassF = mtof(ch[0] - 24 + (s % 4 === 3 ? 7 : 0));
      if (st.wobble) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = bassF; f.type = 'lowpass'; f.frequency.setValueAtTime(200, next); f.frequency.linearRampToValueAtTime(1400, next + step / 2); f.frequency.linearRampToValueAtTime(200, next + step); g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.09, next + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, next + step); o.connect(f); f.connect(g); g.connect(radioBus); o.start(next); o.stop(next + step + 0.05); }
      else tone(radioBus, next, step * 0.9, { type: 'square', freq: bassF, gain: 0.045 });
      const m = st.mel[n % 16]; if (m && bar % 2 === 0) tone(radioBus, next, step * 0.85, { type: st.lead, freq: mtof(m), gain: 0.03 });
      next += step; n++;
    }
  }, 50);
  carRadio = { i: i % STATIONS.length, timer };
  // station jingle
  const t = ctx.currentTime; [880, 1108, 1318].forEach((f, k) => tone(radioBus, t + k * 0.07, 0.12, { type: 'sine', freq: f, gain: 0.06 }));
}
export function stopCarRadio() { if (carRadio) { clearInterval(carRadio.timer); carRadio = null; } }
// next station, then off, then the first station again
export function nextStation() { if (!carRadio) { startCarRadio(0); return STATIONS[0].name; } if (carRadio.i >= STATIONS.length - 1) { stopCarRadio(); return null; } startCarRadio(carRadio.i + 1); return STATIONS[carRadio.i].name; }

// ---------------------------------------------------------------- 🌧 rain + ⛈ thunder
let rainSrc = null, rainGain = null;
export function setRain(level) {
  if (!ctx) return;
  if (!rainSrc && level > 0.02) {
    rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 6000;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(f); f.connect(f2); f2.connect(rainGain); rainGain.connect(sfx); rainSrc.start();
  }
  if (rainGain) rainGain.gain.setTargetAtTime(Math.max(0, level) * 0.16, ctx.currentTime, 0.5);
  if (rainSrc && level <= 0.02 && rainGain.gain.value < 0.005) { try { rainSrc.stop(); } catch {} rainSrc = null; rainGain = null; }
}
export function playThunder() {
  if (!ctx) return; const t = ctx.currentTime;
  noise(sfx, t, 0.35, { type: 'lowpass', freq: 2200, gain: 0.35, sweepTo: 400 });                       // the crack
  noise(sfx, t + 0.15, 3.2, { type: 'lowpass', freq: 260, gain: 0.55, attack: 0.25, sweepTo: 70 });      // the long rumble
  tone(sfx, t + 0.1, 2.4, { type: 'sine', freq: 48, to: 32, gain: 0.25, attack: 0.3 });
  if (echo) { const es = ctx.createGain(); es.gain.value = 0.4; es.connect(echo); noise(es, t + 0.3, 1.6, { type: 'lowpass', freq: 300, gain: 0.4 }); }
}
