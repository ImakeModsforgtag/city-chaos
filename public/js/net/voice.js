// Proximity voice chat: WebRTC peer-to-peer audio, signaled through the game server.
// Everyone in a room connects to everyone (fine for 8 players). Voices are positioned at
// each player's head, so they get quieter with distance.
import * as audio from '../audio/audio.js';
import { serverBase } from './network.js';

export class Voice {
  constructor(net) {
    this.net = net;
    this.peers = new Map();   // id -> { pc, tr, panner, el }
    this.myId = null;
    this.mic = null;          // MediaStreamTrack
    this.enabled = false;     // mic on
    this.ice = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
    fetch(serverBase() + '/api/ice').then(r => r.ok ? r.json() : null).then(j => { if (j && j.iceServers) this.ice = j.iceServers; }).catch(() => {});
    net.on('rtc', (m) => this.onSignal(m.from, m.data));
  }
  setRoom(myId, playerIds) {
    this.closeAll(); this.myId = myId;
    for (const id of playerIds) if (id !== myId) this.addPeer(id);
  }
  addPeer(id) {
    if (this.peers.has(id) || id === this.myId || !window.RTCPeerConnection) return;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer = { pc, tr: null, panner: null, el: null, initiator: this.myId < id };
    this.peers.set(id, peer);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ type: 'rtc', to: id, data: { c: e.candidate } }); };
    pc.ontrack = (e) => this.attachRemote(peer, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && peer.initiator) this.restart(id); };
    if (peer.initiator) {
      peer.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (this.mic) peer.tr.sender.replaceTrack(this.mic);
      this.offer(id);
    }
  }
  async offer(id, restart = false) {
    const peer = this.peers.get(id); if (!peer) return;
    try {
      const o = await peer.pc.createOffer(restart ? { iceRestart: true } : undefined);
      await peer.pc.setLocalDescription(o);
      this.net.send({ type: 'rtc', to: id, data: { sdp: peer.pc.localDescription } });
    } catch (e) { console.warn('voice offer failed', e); }
  }
  restart(id) { this.offer(id, true); }
  async onSignal(from, data) {
    if (!this.peers.has(from)) this.addPeer(from);
    const peer = this.peers.get(from); if (!peer) return;
    const pc = peer.pc;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          peer.tr = pc.getTransceivers()[0];
          if (peer.tr) { peer.tr.direction = 'sendrecv'; if (this.mic) await peer.tr.sender.replaceTrack(this.mic); }
          const a = await pc.createAnswer(); await pc.setLocalDescription(a);
          this.net.send({ type: 'rtc', to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.c) await pc.addIceCandidate(data.c).catch(() => {});
    } catch (e) { console.warn('voice signal error', e); }
  }
  attachRemote(peer, stream) {
    const ctx = audio.audioCtx(); if (!ctx) return;
    // Chrome needs the stream attached to a (muted) media element before Web Audio receives it
    peer.el = new Audio(); peer.el.muted = true; peer.el.srcObject = stream; peer.el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    peer.panner = audio.makePanner();
    src.connect(peer.panner); peer.panner.connect(audio.voiceOutput());
  }
  setPosition(id, x, y, z) {
    const p = this.peers.get(id); if (!p || !p.panner) return;
    const pn = p.panner;
    if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition(x, y, z);
  }
  async setMic(on) {
    if (on && !this.mic) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        this.mic = s.getAudioTracks()[0];
      } catch (e) { this.enabled = false; throw e; }
    }
    if (this.mic) this.mic.enabled = on;
    this.enabled = on;
    for (const p of this.peers.values()) if (p.tr && this.mic) p.tr.sender.replaceTrack(on ? this.mic : null).catch(() => {});
    this.net.send({ type: 'voice', on });
  }
  removePeer(id) {
    const p = this.peers.get(id); if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.el) p.el.srcObject = null;
    if (p.panner) p.panner.disconnect();
    this.peers.delete(id);
  }
  closeAll() { for (const id of [...this.peers.keys()]) this.removePeer(id); }
}
