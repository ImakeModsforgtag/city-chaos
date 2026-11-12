// CITY CHAOS - temporary speed / jump boosts bought at the stores (energy drink, coffee, shakes...).
// Applies them to desktop walking (Walker.mods) and VR movement (gravity scale + Gorilla arm cap).
export class Boosts {
  constructor({ walker, vrMover, toast }) {
    Object.assign(this, { walker, vrMover, toast });
    this.boost = null;
    this.apply();
  }
  apply() {
    const b = this.boost;
    this.walker.mods = { speed: b ? b.speed : 1, jump: b ? b.jump : 1 };
    this.vrMover.gravityScale = 1 / this.walker.mods.jump;
  }
  speedMul() { return this.walker.mods.speed; }
  // a boost bought at a store, for dur seconds (null = clear)
  setBoost(b) { this.boost = b ? { speed: b.speed || 1, jump: b.jump || 1, until: performance.now() / 1000 + b.dur } : null; this.apply(); }
  boostLeft() { return this.boost ? Math.max(0, this.boost.until - performance.now() / 1000) : 0; }
  tickBoost() { if (this.boost && this.boostLeft() <= 0) { this.boost = null; this.apply(); this.toast('Your boost wore off'); } }
}
