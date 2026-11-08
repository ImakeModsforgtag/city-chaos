// Meta Quest Touch controllers via WebXR (xr-standard gamepad mapping).
// buttons: 0 trigger, 1 grip, 3 stick click, 4 A/X, 5 B/Y.  axes: 2,3 = thumbstick.
import * as THREE from 'three';

const BTN = { trigger: 0, grip: 1, stick: 3, a: 4, b: 5 };

export class VRInput {
  constructor(renderer, rig) {
    this.renderer = renderer;
    this.hands = {};
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      rig.add(ray); rig.add(grip);
      const slot = { ray, grip, source: null, gamepad: null, now: {}, prev: {}, stick: new THREE.Vector2(), connected: false };
      ray.addEventListener('connected', (e) => {
        slot.source = e.data; slot.gamepad = e.data.gamepad; slot.connected = true;
        const hand = e.data.handedness === 'left' ? 'left' : 'right';
        slot.hand = hand; this.hands[hand] = slot;
      });
      ray.addEventListener('disconnected', () => {
        slot.connected = false;
        if (this.hands[slot.hand] === slot) delete this.hands[slot.hand];
      });
    }
    this.state = this.blank();
  }
  blank() {
    return { left: { trigger: 0, grip: 0, stick: new THREE.Vector2(), pressed: {}, held: {} },
             right: { trigger: 0, grip: 0, stick: new THREE.Vector2(), pressed: {}, held: {} } };
  }
  update() {
    const s = this.state;
    for (const side of ['left', 'right']) {
      const h = this.hands[side], o = s[side];
      o.pressed = {}; o.released = {};
      if (!h || !h.gamepad) { o.held = {}; o.trigger = 0; o.grip = 0; o.stick.set(0, 0); continue; }
      const gp = h.gamepad;
      for (const [name, idx] of Object.entries(BTN)) {
        const b = gp.buttons[idx];
        const down = !!b && (b.pressed || b.value > 0.6);
        if (down && !o.held[name]) o.pressed[name] = true;
        if (!down && o.held[name]) o.released[name] = true;
        o.held[name] = down;
      }
      o.trigger = gp.buttons[0] ? gp.buttons[0].value : 0;
      o.grip = gp.buttons[1] ? gp.buttons[1].value : 0;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
      const ay = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
      o.stick.set(Math.abs(ax) > 0.12 ? ax : 0, Math.abs(ay) > 0.12 ? ay : 0);
    }
    return s;
  }
  get(side) { return this.hands[side]; }
  pulse(side, intensity = 0.5, ms = 40) {
    const h = this.hands[side];
    const act = h && h.gamepad && h.gamepad.hapticActuators && h.gamepad.hapticActuators[0];
    if (act && act.pulse) try { act.pulse(intensity, ms); } catch {}
  }
}
