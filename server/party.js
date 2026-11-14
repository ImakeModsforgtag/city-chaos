// CITY CHAOS - parties (server). A party is a group of friends that sticks together between rooms:
// whenever the party leader creates or joins a room (or finds a quick match), everyone else in the party
// is sent to the same room. Party codes are 5 letters; a party lasts while somebody in it is online.
import crypto from 'crypto';
import { CODE_CHARS, MAX_PLAYERS } from '../public/shared/constants.js';

const MAX = 8, GRACE = 90;   // members who drop off stay in the party for 90 s (reconnects, page reloads)
export class Parties {
  constructor(state) { this.state = state; this.parties = new Map(); this.byClient = new Map(); }
  code() { for (let i = 0; i < 500; i++) { let c = ''; for (let j = 0; j < 5; j++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!this.parties.has(c)) return c; } return null; }
  of(client) { const k = this.byClient.get(client); return k ? this.parties.get(k.code) : null; }
  handle(client, msg) {
    switch (msg.type) {
      case 'partyCreate': {
        this.leave(client, true);
        const code = this.code(); if (!code) return;
        const party = { code, leader: null, members: [] }; this.parties.set(code, party);
        this.add(client, party); return;
      }
      case 'partyJoin': {
        const party = this.parties.get(String(msg.code || '').toUpperCase().trim());
        if (!party) return client.send({ type: 'partyError', message: 'No party with that code. Check it and try again.' });
        if (party === this.of(client)) return this.sendState(party);
        if (party.members.length >= MAX) return client.send({ type: 'partyError', message: 'That party is full (8 players).' });
        this.leave(client, true); this.add(client, party);
        // the leader is already in a room: come along
        const L = party.members.find(m => m.key === party.leader);
        if (L && L.client && L.client.room) this.go(client, L.client.room, L.name);
        return;
      }
      case 'partyRejoin': {   // after a reconnect / page reload
        const party = this.parties.get(String(msg.code || '').toUpperCase());
        const m = party && party.members.find(x => x.key === msg.key);
        if (!m) return client.send({ type: 'party', code: null });
        if (m.client) this.byClient.delete(m.client);
        m.client = client; m.offlineAt = 0; m.name = String(msg.name || m.name).slice(0, 16);
        this.byClient.set(client, { code: party.code, key: m.key });
        return this.sendState(party);
      }
      case 'partyLeave': return this.leave(client, false);
    }
  }
  add(client, party) {
    const key = crypto.randomBytes(8).toString('hex');
    party.members.push({ key, client, name: String((client.info && client.info.name) || 'Player').slice(0, 16), offlineAt: 0 });
    if (!party.leader) party.leader = key;
    this.byClient.set(client, { code: party.code, key });
    client.send({ type: 'partyKey', code: party.code, key });
    this.sendState(party);
  }
  leave(client, quiet) {
    const k = this.byClient.get(client); if (!k) { if (!quiet) client.send({ type: 'party', code: null }); return; }
    this.byClient.delete(client);
    const party = this.parties.get(k.code); if (!party) return;
    party.members = party.members.filter(m => m.key !== k.key);
    client.send({ type: 'party', code: null });
    if (!party.members.length) { this.parties.delete(party.code); return; }
    if (party.leader === k.key) party.leader = (party.members.find(m => m.client) || party.members[0]).key;
    this.sendState(party);
  }
  sendState(party) {
    const members = party.members.map(m => ({ name: m.name, leader: m.key === party.leader, online: !!m.client, room: m.client && m.client.room ? m.client.room.code : null }));
    for (const m of party.members) if (m.client) m.client.send({ type: 'party', code: party.code, members, leader: m.key === party.leader });
  }
  // somebody just entered a room: if it's the leader, bring the party
  entered(client, room) {
    const party = this.of(client); if (!party) return;
    const k = this.byClient.get(client);
    if (k.key === party.leader) {
      const L = party.members.find(m => m.key === k.key);
      for (const m of party.members) if (m.client && m.client !== client && m.client.room !== room) this.go(m.client, room, L ? L.name : 'Your party leader');
    }
    this.sendState(party);
  }
  go(client, room, by) {
    if (room.connectedCount >= MAX_PLAYERS) return client.send({ type: 'partyError', message: `${by}'s room is full, so you couldn't follow them.` });
    client.send({ type: 'partyGo', room: room.code, by });
  }
  left(client) { const party = this.of(client); if (party) this.sendState(party); }
  // a connection closed: keep the spot for a while (reconnects), then drop them
  closed(client) {
    const k = this.byClient.get(client); if (!k) return;
    const party = this.parties.get(k.code); if (!party) return;
    const m = party.members.find(x => x.key === k.key); if (m) { m.client = null; m.offlineAt = Date.now(); }
    this.byClient.delete(client);
    this.sendState(party);
  }
  tick() {
    const t = Date.now();
    for (const party of this.parties.values()) {
      const before = party.members.length;
      party.members = party.members.filter(m => m.client || t - m.offlineAt < GRACE * 1000);
      if (!party.members.length) { this.parties.delete(party.code); continue; }
      if (!party.members.some(m => m.key === party.leader)) party.leader = (party.members.find(m => m.client) || party.members[0]).key;
      if (party.members.length !== before) this.sendState(party);
    }
  }
}
