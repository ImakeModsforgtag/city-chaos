// Keyboard + mouse with pointer lock.
export class DesktopInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;
    this.onUnlock = null;
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore giant spikes some browsers send when locking
      const mx = Number(e.movementX) || 0, my = Number(e.movementY) || 0;
      if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
      this.mouse.dx += mx; this.mouse.dy += my;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; });
    document.addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0; }
}
