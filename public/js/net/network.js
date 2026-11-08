// WebSocket client with automatic reconnect + server clock sync.
// Server = same site by default, or window.CITY_CHAOS_SERVER (public/config.js) when the
// website is hosted separately (e.g. Netlify) from the game server (e.g. Render).
export function serverBase() { return (window.CITY_CHAOS_SERVER || '').trim().replace(/\/+$/, ''); }
function serverWsUrl() {
  const base = serverBase();
  if (base) return base.replace(/^http/i, 'ws') + '/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
export class Network {
  constructor() {
    this.handlers = {};
    this.ws = null;
    this.token = sessionStorage.getItem('cc_token') || null;
    this.connected = false;
    this.offset = 0;          // serverTime - localTime (seconds)
    this.rtt = 0.1;
    this.retry = 0;
    this.inRoom = false;
    this.hello = null;        // function returning hello payload
    this.wantClose = false;
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, msg) { (this.handlers[type] || []).forEach(f => f(msg)); }
  local() { return performance.now() / 1000; }
  serverNow() { return this.local() + this.offset; }

  connect() {
    const ws = new WebSocket(serverWsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.retry = 0; this.lastMsgAt = this.local();
      this.send({ type: 'hello', ...(this.hello ? this.hello() : {}), token: this.inRoom ? this.token : null });
      this.ping(); clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 2000);
      this.emit('open');
    };
    ws.onmessage = (e) => {
      this.lastMsgAt = this.local();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        const now = this.local(), rtt = now - m.t;
        this.rtt = this.rtt * 0.8 + rtt * 0.2;
        const off = m.st + rtt / 2 - now;
        this.offset = this.samples ? this.offset * 0.85 + off * 0.15 : off;
        this.samples = (this.samples || 0) + 1;
        return;
      }
      if (m.type === 'welcome') {
        this.token = m.token; sessionStorage.setItem('cc_token', m.token);
        if (this.inRoom) { this.inRoom = false; this.emit('roomLost', m); } // grace expired / server restarted
      }
      if (m.type === 'joined') { this.inRoom = true; if (typeof m.st === 'number') this.offset = m.st - this.local(); }
      if (m.type === 'left') this.inRoom = false;
      this.emit(m.type, m);
    };
    ws.onclose = () => {
      this.connected = false; clearInterval(this.pingTimer);
      this.emit('close');
      if (this.wantClose) return;
      const delay = Math.min(8000, 500 * Math.pow(1.7, this.retry++));
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }
  ping() { this.send({ type: 'ping', t: this.local() }); }
  // Watchdog: the server talks 20+ times a second. If it goes quiet for 4s the connection has
  // silently stalled (common through tunnels/Wi-Fi) - drop it and reconnect right away.
  startWatchdog() {
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (!this.connected || !this.ws) return;
      if (this.local() - (this.lastMsgAt || 0) > 4) {
        console.warn('[net] no data from server for 4s - reconnecting');
        const old = this.ws;
        old.onopen = old.onmessage = old.onclose = old.onerror = null;
        try { old.close(); } catch {}
        this.connected = false; clearInterval(this.pingTimer);
        this.emit('close');
        this.retry = 0;
        this.connect();
      }
    }, 1000);
  }
  send(m) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
}
