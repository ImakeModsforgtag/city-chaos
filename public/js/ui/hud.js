// Desktop HUD (DOM). Cheap to update: we only touch elements whose value changed.
import { WEAPONS } from '/shared/weapons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

export const WANTED_TEXT = ['', 'Police are investigating', 'Police are chasing you', 'Police will try to arrest you', 'SWAT has joined the pursuit', 'MAXIMUM POLICE RESPONSE'];

export class HUD {
  constructor() {
    this.el = $('hud'); this.cache = {};
    this.hitTimer = 0;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }
  set(id, val, prop = 'textContent') { if (this.cache[id + prop] === val) return; this.cache[id + prop] = val; if (prop === 'style.width') $(id).style.width = val; else $(id)[prop] = val; }

  update(st) {
    const hp = Math.max(0, Math.round(st.hp));
    this.set('htext', String(hp));
    if (this.cache.hw !== hp) { this.cache.hw = hp; $('hfill').style.width = hp + '%'; $('hfill').classList.toggle('low', hp <= 30); }
    if (st.lvl) { this.set('lvlnum', String(st.lvl.lvl)); this.set('xpfill', Math.round(st.lvl.frac * 100) + '%', 'style.width'); }
    $('jobline').classList.toggle('hidden', !st.task);
    if (st.task) this.set('jobline', st.task);
    $('missions').classList.toggle('hidden', !st.missions);
    if (st.missions) this.set('missions', st.missions, 'innerHTML');
    const ap = Math.round(st.armor || 0);
    this.set('armorbox', ap ? `🛡 <b>${ap}</b>` : '', 'innerHTML');
    this.set('boostbox', st.boost ? `⚡ BOOST ${st.boost}s` : '', 'innerHTML');
    const w = st.weapon;
    if (w) {
      this.set('wname', WEAPONS[w.w].icon + ' ' + WEAPONS[w.w].name);
      this.set('mag', String(w.mag)); this.set('reserve', String(w.reserve));
      $('ammo').classList.toggle('empty', w.mag === 0);
    }
    const rb = $('reloadbar');
    rb.classList.toggle('on', st.reloading);
    if (st.reloading) rb.firstElementChild.style.width = Math.round(st.reloadP * 100) + '%';
    const slotsKey = st.slots.map(s => s.w).join(',') + '|' + st.cur;
    if (this.cache.slots !== slotsKey) {
      this.cache.slots = slotsKey;
      $('slots').innerHTML = st.slots.map((s, i) => `<div class="${i === st.cur ? 'on' : ''}">${i + 1} ${WEAPONS[s.w].icon} ${WEAPONS[s.w].name}</div>`).join('');
    }
    this.set('timer', st.timer);
    $('teamscore').classList.toggle('hidden', !st.teams);
    if (st.teams) this.set('teamscore', `<b class="red">${st.teamScores[0]}</b> : <b class="blue">${st.teamScores[1]}</b>`, 'innerHTML');
    this.set('myscore', `K ${st.kills} · D ${st.deaths}`);
    this.set('cash', '$' + (st.cash || 0));
    const wv = st.wanted || 0;
    this.set('wanted', wv ? `<span class="on">${'★'.repeat(wv)}</span><span class="off">${'★'.repeat(5 - wv)}</span><i>${WANTED_TEXT[wv]}</i>` : '', 'innerHTML');
    // prison status + subtitles
    const pp = $('prisonpanel');
    if (st.prison) { pp.classList.remove('hidden'); this.set('prisonpanel', st.prison.html, 'innerHTML'); } else pp.classList.add('hidden');
    const sub = $('subtitle');
    if (st.sub) { sub.classList.remove('hidden'); this.set('subtitle', st.sub, 'innerHTML'); } else sub.classList.add('hidden');
    const robEl = $('robbar');
    if (st.rob) { robEl.classList.remove('hidden'); this.set('robtext', st.rob.text); $('robfill').style.width = Math.round((st.rob.p || 0) * 100) + '%'; }
    else robEl.classList.add('hidden');
    // prompt
    const pr = $('prompt');
    if (st.prompt) { this.set('prompt', st.prompt); pr.classList.remove('hidden'); } else pr.classList.add('hidden');
    // death
    $('death').classList.toggle('hidden', !st.death);
    if (st.death) { this.set('death-by', st.death.by ? `by ${st.death.by}` : ''); this.set('death-timer', `Respawning in ${Math.max(1, Math.ceil(st.death.t))}`); }
    $('crosshair').classList.toggle('hidden', !!st.death || !!st.driving);
    $('ammobox').classList.toggle('hidden', !!st.driving || !st.weapon); $('slots').classList.toggle('hidden', !!st.driving || !st.slots.length);
    // scoreboard
    const sb = $('scoreboard');
    sb.classList.toggle('hidden', !st.showBoard);
    if (st.showBoard) this.renderBoard(st.board);
    // match end
    const me = $('matchend');
    me.classList.toggle('hidden', !st.matchEnd);
    if (st.matchEnd) this.set('matchend', `<div class="big">${esc(st.matchEnd)}</div><div>Next match in ${Math.ceil(st.matchResetIn)}s</div>`, 'innerHTML');
    // fps
    $('fps').classList.toggle('hidden', !st.showFps);
    if (st.showFps) this.set('fps', `${st.fps} FPS · ${st.ping}ms`);
    this.hitTimer -= st.dt;
    if (this.hitTimer <= 0) $('hitmarker').classList.remove('show');
  }

  renderBoard(b) {
    const key = JSON.stringify(b);
    if (this.cache.board === key) return; this.cache.board = key;
    const head = b.teams ? `<h3 style="text-align:center;margin:0 0 8px"><span style="color:#ff7b8b">RED ${b.teamScores[0]}</span> : <span style="color:#7ba8ff">${b.teamScores[1]} BLUE</span> <small style="opacity:.7">(to ${b.killLimit})</small></h3>`
      : `<h3 style="text-align:center;margin:0 0 8px">FREE FOR ALL <small style="opacity:.7">(first to ${b.killLimit})</small></h3>`;
    $('scoreboard').innerHTML = head + `<table><tr><th>PLAYER</th><th>TEAM</th><th>ELIMS</th><th>DEATHS</th><th>CASH</th><th></th></tr>` +
      b.players.map(p => `<tr class="${p.me ? 'me' : ''}"><td><span class="sw" style="background:${p.color}"></span><small style="color:#ffd23f">Lv${p.lvl || 1}</small> ${esc(p.name)}${p.host ? ' 👑' : ''}${p.connected ? '' : ' (away)'}</td><td>${p.team === 0 ? '<span style="color:#ff7b8b">RED</span>' : p.team === 1 ? '<span style="color:#7ba8ff">BLUE</span>' : '-'}</td><td>${p.kills}</td><td>${p.deaths}</td><td>$${p.cash || 0}${p.wanted ? ' <span style="color:#ffd23f">' + '★'.repeat(p.wanted) + '</span>' : ''}</td><td>${p.vr ? '🥽' : '🖱'}</td></tr>`).join('') + '</table>';
  }

  hit(head) {
    const h = $('hitmarker'); h.classList.add('show'); h.classList.toggle('head', !!head); this.hitTimer = 0.12;
  }
  damage(angle) {
    const f = $('dmgflash'); f.style.transition = 'none'; f.style.opacity = '0.7';
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = '0'; });
    if (angle !== null && angle !== undefined) {
      const i = document.createElement('i');
      i.style.transform = `rotate(${angle}rad) translateY(-120px)`;
      $('dmgdirs').appendChild(i);
      setTimeout(() => { i.style.opacity = '0'; }, 400);
      setTimeout(() => i.remove(), 1400);
    }
  }
  feed(html, me = false) {
    const d = document.createElement('div'); d.innerHTML = html; if (me) d.className = 'me';
    const kf = $('killfeed'); kf.prepend(d);
    while (kf.children.length > 5) kf.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }
  // "+25 XP Takedown" pop under the crosshair
  xpPop(text) {
    const el = $('xppop'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.xpT); this.xpT = setTimeout(() => el.classList.remove('show'), 1400);
  }
  // big centered banner (LEVEL UP, MISSION COMPLETE). Several at once wait their turn.
  levelUp(html, dur = 3500) {
    this.banners = this.banners || [];
    this.banners.push([html, dur]);
    if (!this.bannerOn) this.nextBanner();
  }
  nextBanner() {
    const el = $('levelup'), b = this.banners.shift();
    if (!b) { this.bannerOn = false; el.classList.add('hidden'); return; }
    this.bannerOn = true;
    el.innerHTML = b[0]; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    setTimeout(() => this.nextBanner(), this.banners.length ? Math.min(b[1], 2200) : b[1]);
  }
  notice(s, dur = 1800) {
    const n = $('notice'); n.textContent = s; n.classList.remove('hidden');
    n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
    clearTimeout(this.nt); this.nt = setTimeout(() => n.classList.add('hidden'), dur);
  }
}

export function toast(s, ms = 2500) {
  const t = $('toast'); t.textContent = s; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}
