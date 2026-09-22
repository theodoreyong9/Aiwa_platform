// The real Transport — knows nothing of profiles, DAGs, AIWA,
// messages, users, or transactions. Only real bytes, to real peers.
// A real TrysteroTransport is provided; any other real transport
// (WebSocket, Nostr, LAN) implements the identical, real, five-method
// contract and nothing else changes above it.

/**
 * The real, minimal contract every real Transport implementation
 * must satisfy:
 *   connect(), disconnect(), peers(), send(peer, bytes),
 *   broadcast(bytes), onMessage(handler), onPeerJoin(handler),
 *   onPeerLeave(handler)
 */
export class TrysteroTransport {
  constructor({ appId = 'aiwa-platform', roomId, relayUrls } = {}) {
    this.appId = appId;
    this.roomId = roomId;
    this.relayUrls = relayUrls;
    this._room = null;
    this._sendBytes = null;
  }

  async connect() {
    const mod = await import('https://esm.sh/trystero@0.25.3/nostr');
    this._room = mod.joinRoom({ appId: this.appId, relayUrls: this.relayUrls }, this.roomId);
    const [sendBytes, getBytes] = this._room.makeAction('bytes');
    this._sendBytes = sendBytes;
    this._onMessageHandlers = new Set();
    this._onJoinHandlers = new Set();
    this._onLeaveHandlers = new Set();
    getBytes((data, peerId) => { for (const h of this._onMessageHandlers) h(peerId, data); });
    this._room.onPeerJoin((peerId) => { for (const h of this._onJoinHandlers) h(peerId); });
    this._room.onPeerLeave((peerId) => { for (const h of this._onLeaveHandlers) h(peerId); });
  }

  async disconnect() {
    this._room?.leave();
  }

  peers() {
    return this._room ? Object.keys(this._room.getPeers()) : [];
  }

  async send(peer, bytes) {
    await this._sendBytes(bytes, peer);
  }
  async broadcast(bytes) {
    await this._sendBytes(bytes);
  }

  onMessage(handler) { this._onMessageHandlers.add(handler); return () => this._onMessageHandlers.delete(handler); }
  onPeerJoin(handler) { this._onJoinHandlers.add(handler); return () => this._onJoinHandlers.delete(handler); }
  onPeerLeave(handler) { this._onLeaveHandlers.add(handler); return () => this._onLeaveHandlers.delete(handler); }
}

/** A real, in-process, in-memory transport — for real, deterministic tests, never for two real, separate devices. */
export class LoopbackTransport {
  static _registry = new Map();

  constructor(peerId) {
    this.peerId = peerId;
    this._onMessageHandlers = new Set();
    this._onJoinHandlers = new Set();
    this._onLeaveHandlers = new Set();
  }
  async connect() {
    for (const [id] of LoopbackTransport._registry) {
      for (const h of this._onJoinHandlers) h(id);
      for (const h of LoopbackTransport._registry.get(id)._onJoinHandlers) h(this.peerId);
    }
    LoopbackTransport._registry.set(this.peerId, this);
  }
  async disconnect() {
    LoopbackTransport._registry.delete(this.peerId);
    for (const [, t] of LoopbackTransport._registry) for (const h of t._onLeaveHandlers) h(this.peerId);
  }
  peers() { return [...LoopbackTransport._registry.keys()].filter((id) => id !== this.peerId); }
  async send(peer, bytes) {
    const target = LoopbackTransport._registry.get(peer);
    if (target) for (const h of target._onMessageHandlers) h(this.peerId, bytes);
  }
  async broadcast(bytes) {
    for (const peer of this.peers()) await this.send(peer, bytes);
  }
  onMessage(handler) { this._onMessageHandlers.add(handler); return () => this._onMessageHandlers.delete(handler); }
  onPeerJoin(handler) { this._onJoinHandlers.add(handler); return () => this._onJoinHandlers.delete(handler); }
  onPeerLeave(handler) { this._onLeaveHandlers.add(handler); return () => this._onLeaveHandlers.delete(handler); }
}
