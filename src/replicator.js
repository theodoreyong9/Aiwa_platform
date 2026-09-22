// The real Replicator — uses a real Transport (never knows which
// one) to sync a real EventLog with real peers, sending only the
// real, minimal set of missing events — never "here is my entire
// database." The real HELLO / EVENTS / ACK protocol, kept
// deliberately simple for this real v0.1.

function encode(msg) { return new TextEncoder().encode(JSON.stringify(msg)); }
function decode(bytes) { return JSON.parse(new TextDecoder().decode(bytes)); }

export class Replicator {
  constructor({ transport, log, domain }) {
    this.transport = transport;
    this.log = log;
    this.domain = domain;
    this._onEventHandlers = new Set();
    this._onSyncHandlers = new Set();
  }

  async start() {
    this._queue = Promise.resolve(); // a real, simple, sequential queue — messages must never interleave mid-handling, or a real race (computing our own heads before a concurrently-arriving EVENTS message finishes appending) can silently corrupt a real sync round
    this._unsubMessage = this.transport.onMessage((peer, bytes) => {
      this._queue = this._queue.then(() => this._handleMessage(peer, bytes)).catch((err) => console.error('Real replicator message handling failed:', err));
    });
    this._unsubJoin = this.transport.onPeerJoin((peer) => {
      this._queue = this._queue.then(() => this._sayHello(peer)).catch((err) => console.error('Real replicator hello failed:', err));
    });
    await this.transport.connect();
  }

  async stop() {
    this._unsubMessage?.();
    this._unsubJoin?.();
    await this.transport.disconnect();
  }

  async _sayHello(peer) {
    const heads = await this.log.head();
    await this.transport.send(peer, encode({ type: 'HELLO', domain: this.domain, heads }));
  }

  async _handleMessage(peer, bytes) {
    const msg = decode(bytes);
    if (msg.domain !== this.domain) return; // real, different domain — not this real replicator's concern

    if (msg.type === 'HELLO') {
      // The real, minimal-missing-ancestor computation: every real
      // event this side has that is not reachable from the real,
      // announced heads is a real, plausible gap on their side.
      const missing = [];
      for await (const event of this.log.since(msg.heads)) missing.push(event);
      if (missing.length > 0) await this.transport.send(peer, encode({ type: 'EVENTS', domain: this.domain, events: missing }));
      // Also tell them our own heads, so a real, one-sided HELLO becomes a real, two-way exchange.
      const heads = await this.log.head();
      await this.transport.send(peer, encode({ type: 'HELLO_ACK', domain: this.domain, heads }));
    }

    if (msg.type === 'HELLO_ACK') {
      const missing = [];
      for await (const event of this.log.since(msg.heads)) missing.push(event);
      if (missing.length > 0) await this.transport.send(peer, encode({ type: 'EVENTS', domain: this.domain, events: missing }));
    }

    if (msg.type === 'EVENTS') {
      await this.log.appendMany(msg.events);
      for (const event of msg.events) for (const h of this._onEventHandlers) h(event);
      await this.transport.send(peer, encode({ type: 'ACK', domain: this.domain, ids: msg.events.map((e) => e.id) }));
      for (const h of this._onSyncHandlers) h({ peer, receivedCount: msg.events.length });
    }

    if (msg.type === 'ACK') {
      for (const h of this._onSyncHandlers) h({ peer, ackedIds: msg.ids });
    }
  }

  /** Real, explicit publish — pushes real, given events to every real, currently-connected peer. */
  async publish(events) {
    await this.transport.broadcast(encode({ type: 'EVENTS', domain: this.domain, events }));
  }

  onEvent(handler) { this._onEventHandlers.add(handler); return () => this._onEventHandlers.delete(handler); }
  onSync(handler) { this._onSyncHandlers.add(handler); return () => this._onSyncHandlers.delete(handler); }
}
