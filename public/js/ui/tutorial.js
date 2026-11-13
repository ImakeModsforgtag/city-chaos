// CITY CHAOS - first-time tutorial. Seven short steps that check what you actually do (PC and VR):
// move, jump/climb, shoot, open the missions, walk to the JOBS kiosk (a beam shows the way), open it, done.
// Finishing it once pays $100 + 50 XP (the server remembers it in your save). K (PC) or the Y menu (VR) skips it.
export class Tutorial {
  constructor({ net, hud, vrui, map, toast }) {
    Object.assign(this, { net, hud, vrui, map, toast });
    this.active = false; this.i = 0; this.shots = 0;
    const send = net.send.bind(net);
    net.send = (m) => { if (m && m.type === 'shoot') this.shots++; return send(m); };   // count shots for the shooting step
    this.el = document.getElementById('tutorial');
    document.addEventListener('keydown', (e) => { if (this.active && e.code === 'KeyK' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) this.skip(); });
  }
  steps(xr) {
    const jb = this.map.jobBoard;
    return [
      { id: 'move', text: xr ? 'Move around: swing your arms like a gorilla, or push the left stick' : 'Move with W A S D and look around with the mouse (click the game first)',
        done: (c) => c.moved > 8 },
      { id: 'jump', text: xr ? 'Push down hard on the ground with both hands to jump. Slap a wall and pull yourself up to climb' : 'Press SPACE to jump. Walk into a wall and HOLD SPACE to climb it',
        done: (c) => c.rise > 0.6, auto: 25 },
      { id: 'shoot', text: xr ? 'Shoot with the RIGHT TRIGGER. A reloads, B switches guns' : 'Shoot with LEFT CLICK. R reloads, 1 2 3 (or the mouse wheel) switch guns',
        done: () => this.shots > this.shots0 },
      { id: 'missions', text: xr ? 'Press Y on your left controller to open the menu: your DAILY MISSIONS are in there' : 'Hold TAB to see the scoreboard and your 3 DAILY MISSIONS',
        done: (c) => c.board, auto: 40 },
      { id: 'walk', text: 'Follow the glowing beam to the 💼 JOBS kiosk on the downtown plaza (next to the CITY BANK)',
        done: (c) => c.toKiosk < 5, marker: jb, auto: 240 },
      { id: 'kiosk', text: xr ? 'Squeeze grip at the kiosk to see the jobs (delivery + taxi)' : 'Press E at the kiosk to see the jobs (delivery + taxi)',
        done: (c) => c.shop === 'JOB BOARD', auto: 45 },
      { id: 'tips', text: 'You\'re ready! Rob stores (aim at the clerk), stop masked robbers for bounties, take jobs, and keep your cash in the CITY BANK. Have fun!',
        done: (c) => c.t - this.stepAt > 9 }
    ];
  }
  start(xr, pos) {
    this.active = true; this.i = 0; this.xr = xr; this.list = this.steps(xr);
    this.startPos = pos.clone(); this.baseY = pos.y; this.stepAt = performance.now() / 1000; this.shots0 = this.shots;
    this.show();
  }
  show() {
    const s = this.list[this.i];
    const html = `<b>TUTORIAL ${this.i + 1}/${this.list.length}</b><span>${s.text}</span><small>${this.xr ? 'Skip: Y menu > SKIP TUTORIAL' : 'K = skip tutorial'}</small>`;
    this.el.innerHTML = html; this.el.classList.remove('hidden');
    this.vrui.setNotice(`TUTORIAL ${this.i + 1}/${this.list.length}: ${s.text}`, 6); this.noteAt = performance.now() / 1000;
  }
  next() {
    this.i++; this.stepAt = performance.now() / 1000; this.shots0 = this.shots;
    if (this.i >= this.list.length) return this.finish();
    this.hud.notice('✅ Nice!', 900);
    this.show();
  }
  target() { return this.active ? this.list[this.i].marker || null : null; }
  finish() { this.active = false; this.el.classList.add('hidden'); this.net.send({ type: 'tutorial', a: 'done' }); try { localStorage.setItem('cc_tut', '1'); } catch {} }
  skip() { if (!this.active) return; this.active = false; this.el.classList.add('hidden'); this.net.send({ type: 'tutorial', a: 'skip' }); try { localStorage.setItem('cc_tut', '1'); } catch {} this.toast('Tutorial skipped (you can replay it from HOW TO PLAY)'); }
  stop() { this.active = false; this.el.classList.add('hidden'); }
  // c = { pos, board, shop, t }
  update(c) {
    if (!this.active) return;
    const s = this.list[this.i];
    c.moved = Math.hypot(c.pos.x - this.startPos.x, c.pos.z - this.startPos.z);
    if (s.id === 'jump' && this.i !== this.jumpI) { this.jumpI = this.i; this.baseY = c.pos.y; }
    c.rise = c.pos.y - this.baseY;
    const jb = this.map.jobBoard; c.toKiosk = jb ? Math.hypot(c.pos.x - jb[0], c.pos.z - jb[2]) : 0;
    if (s.done(c) || (s.auto && c.t - this.stepAt > s.auto)) return this.next();
    if (this.xr && c.t - this.noteAt > 8) { this.noteAt = c.t; this.vrui.setNotice(`TUTORIAL ${this.i + 1}/${this.list.length}: ${s.text}`, 5); }
  }
}
