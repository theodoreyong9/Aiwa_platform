// aiwa-platform: distributed infrastructure — transport, replication,
// permissions, storage, and a graph-shaped data store. Depends on
// aiwa-core for the event/identity/storage substrate (EventLog,
// Identity, DataStore); re-exports the pieces this package's own code
// builds on so a consumer never has to import both packages by hand.

export { EventLog, createMemoryBackend, createIndexedDbBackend, DataStore, defaultKvMaterializer } from 'aiwa-core';
export { generateIdentity, identityFromSecretKey, publicIdentity, deriveId, Identity, createEvent, verifyEvent } from 'aiwa-core';

export { LoopbackTransport } from './transport.js';
export { WebrtcTransport } from './webrtc-transport.js';
export { encodeSignal, decodeSignal } from './signaling-codec.js';
export { Replicator } from './replicator.js';
export { issueCapability, verifyCapability, capabilityAllows, CapabilitySet } from './capability.js';

export { GuardedDataStore } from './guarded-data-store.js';
export { GraphStore } from './graph-store.js';
export { graphMaterializer, ref, isRef } from './graph-materializer.js';
export { assertCapability } from './capability-guard.js';
export { publishBundle, readBundle, latestBundle } from './bundle.js';
