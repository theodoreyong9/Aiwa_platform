// Our own, relay-free P2P transport — no Trystero, no Nostr relay, no
// signaling server, no third-party dependency of any kind. Real,
// direct RTCPeerConnection, STUN-only for NAT traversal (STUN servers
// never see application data and never even see that two peers are
// related — they only ever answer "what's my own public address").
// The one real signaling exchange every new connection needs still has
// to travel over SOME real, out-of-band channel — pasted text, a QR
// code, a shared file, an already-open connection to a third peer —
// but this class never picks or uses one itself: createOfferFor() /
// acceptOffer() / completeConnection() only ever hand back or accept
// an opaque, real signal blob (see signaling-codec.js).
//
// Implements the identical five-method Transport contract every other
// transport in this package satisfies (connect/disconnect/peers/send/
// broadcast + join/leave/message handlers), so Replicator works with
// this unchanged — just built from many individual direct connections
// instead of one shared relay-based room.
//
// HONEST LIMIT: RTCPeerConnection doesn't exist in Node, so the real
// network path (ICE negotiation, real SDP, real data flow) has no
// meaningful test here — see webrtc-transport.test.mjs for what IS
// genuinely covered (this class's own connection bookkeeping and
// validation, against a minimal, deliberately fake PC) and what isn't.
// Not yet exercised with two real, live browser tabs in this session.

import { encodeSignal, decodeSignal } from './signaling-codec.js';

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class WebrtcTransport {
  constructor({
    selfId = crypto.randomUUID(),
    iceServers = DEFAULT_ICE_SERVERS,
    dataChannelLabel = 'aiwa-platform',
    createPeerConnection = (config) => new RTCPeerConnection(config),
  } = {}) {
    this.selfId = selfId;
    this._iceServers = iceServers;
    this._dataChannelLabel = dataChannelLabel;
    this._createPeerConnection = createPeerConnection;
    this._links = new Map(); // peerId -> { pc, channel } — both pending (not yet open) and open connections
    this._openPeers = new Set(); // the subset of _links whose channel has genuinely opened
    this._onMessageHandlers = new Set();
    this._onJoinHandlers = new Set();
    this._onLeaveHandlers = new Set();
  }

  // Nothing to "join" without a relay — real connections are made one
  // at a time via createOfferFor/acceptOffer/completeConnection.
  async connect() {}
  async disconnect() {
    for (const peerId of [...this._links.keys()]) this._closeLink(peerId);
  }

  peers() {
    return [...this._openPeers];
  }

  async send(peerId, bytes) {
    const link = this._links.get(peerId);
    if (link?.channel?.readyState === 'open') link.channel.send(bytes);
  }
  async broadcast(bytes) {
    for (const peerId of this.peers()) await this.send(peerId, bytes);
  }

  onMessage(handler) { this._onMessageHandlers.add(handler); return () => this._onMessageHandlers.delete(handler); }
  onPeerJoin(handler) { this._onJoinHandlers.add(handler); return () => this._onJoinHandlers.delete(handler); }
  onPeerLeave(handler) { this._onLeaveHandlers.add(handler); return () => this._onLeaveHandlers.delete(handler); }

  _wireChannel(peerId, pc, channel) {
    this._links.set(peerId, { pc, channel });
    channel.onopen = () => {
      this._openPeers.add(peerId);
      for (const h of this._onJoinHandlers) h(peerId);
    };
    channel.onmessage = (e) => {
      const bytes = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      for (const h of this._onMessageHandlers) h(peerId, bytes);
    };
    channel.onclose = () => this._closeLink(peerId);
  }

  _closeLink(peerId) {
    const link = this._links.get(peerId);
    if (!link) return;
    this._links.delete(peerId);
    const wasOpen = this._openPeers.delete(peerId);
    try { link.channel?.close(); } catch { /* already closing */ }
    try { link.pc.close(); } catch { /* already closed */ }
    if (wasOpen) for (const h of this._onLeaveHandlers) h(peerId);
  }

  /** The initiating side: opens a real data channel, gathers a real offer, returns an opaque blob to send `remotePeerId` over any real out-of-band channel. */
  async createOfferFor(remotePeerId) {
    if (this._links.has(remotePeerId)) throw new Error(`Already connected (or connecting) to '${remotePeerId}'.`);
    const pc = this._createPeerConnection({ iceServers: this._iceServers });
    const channel = pc.createDataChannel(this._dataChannelLabel);
    this._wireChannel(remotePeerId, pc, channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    return encodeSignal('offer', this.selfId, pc.localDescription.sdp);
  }

  /**
   * The responding side: accepts a real offer blob received out-of-band,
   * returns a real answer blob to send back over the same real channel.
   * Registers the new connection under the offer's own real `originId`
   * unless `peerId` overrides it.
   */
  async acceptOffer(offerBlob, { peerId } = {}) {
    const decoded = decodeSignal(offerBlob);
    if (decoded.kind !== 'offer') throw new Error('acceptOffer: expected an offer, not an answer.');
    const id = peerId ?? decoded.originId;
    if (this._links.has(id)) throw new Error(`Already connected (or connecting) to '${id}'.`);
    const pc = this._createPeerConnection({ iceServers: this._iceServers });
    pc.ondatachannel = (e) => this._wireChannel(id, pc, e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: decoded.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    return encodeSignal('answer', this.selfId, pc.localDescription.sdp);
  }

  /** The initiating side: completes a connection previously started with createOfferFor, using the real answer blob received back out-of-band. */
  async completeConnection(remotePeerId, answerBlob) {
    const link = this._links.get(remotePeerId);
    if (!link) throw new Error(`No pending connection to '${remotePeerId}' — call createOfferFor(remotePeerId) first.`);
    const decoded = decodeSignal(answerBlob);
    if (decoded.kind !== 'answer') throw new Error('completeConnection: expected an answer, not an offer.');
    await link.pc.setRemoteDescription({ type: 'answer', sdp: decoded.sdp });
  }
}
