// aiwa-platform: distributed infrastructure — transport, replication,
// permissions, storage, and a graph-shaped data store. Re-exports
// @aiwa/record's own transport/replicator/capability primitives
// unchanged (they already fully cover transports/replication/permissions
// — see README) and adds this package's own genuinely new pieces:
// capability-gated writes wired into the DataStore write path, and a
// nested/graph-shaped alternative to Record's own flat-KV DataStore.

export { TrysteroTransport, LoopbackTransport } from '@aiwa/record';
export { Replicator } from '@aiwa/record';
export { issueCapability, verifyCapability, capabilityAllows, CapabilitySet } from '@aiwa/record';
export { EventLog, createMemoryBackend, createIndexedDbBackend, DataStore, defaultKvMaterializer } from '@aiwa/record';
export { generateIdentity, identityFromSecretKey, publicIdentity, deriveId, Identity, createEvent, verifyEvent } from '@aiwa/record';

export { GuardedDataStore } from './guarded-data-store.js';
export { GraphStore } from './graph-store.js';
export { graphMaterializer, ref, isRef } from './graph-materializer.js';
export { assertCapability } from './capability-guard.js';
