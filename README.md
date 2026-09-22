# aiwa-platform

Distributed infrastructure: transport, replication, permissions,
storage, and a graph-shaped data store. Builds entirely on
[`@aiwa/record`](https://github.com/theodoreyong9/record) — this
package adds only what Record doesn't already provide.

## What Record already covers (re-exported, not reimplemented)

Record's own `transport.js`, `replicator.js`, and `capability.js`
already are this portfolio's transports/replication/permissions layer:
`TrysteroTransport`/`LoopbackTransport`, a real HELLO/EVENTS/ACK
`Replicator`, and a signed, scoped `CapabilitySet`. `EventLog` (with a
memory or IndexedDB backend) is the storage layer. This package
re-exports all of it from its own `index.js` rather than wrapping or
forking it — a "sphere" in this stack is simply an `@aiwa/record`
`domain`; nothing new was needed to represent one.

## What's genuinely new here

- **`GuardedDataStore`** — wires Record's own `CapabilitySet` into the
  one real choke point every write already passes through
  (`DataStore._commit`, which `set`/`delete`/`transact` all call).
  Record's capability primitive is real and tested but enforces
  nothing on its own; this is that enforcement.
- **`GraphStore`** — a nested/graph-shaped alternative to Record's
  flat-KV `DataStore`: many fields per node, where a field's value can
  be a real reference (`ref(nodeId)`) to another node, resolved on
  read (`store.get(node, field)`), never eagerly denormalized. Built
  the same way `GuardedDataStore` is — a thin subclass of `DataStore`
  supplying its own `Materializer` — so it inherits real EventLog
  persistence, `rebuild()`, and `subscribe()` for free. Optional
  capability gating built in (`capabilities` param), off by default to
  match plain `DataStore`'s own behavior. `transact()` is refused
  outright rather than silently producing kv-shaped sub-events this
  store's own materializer would never recognize.

## Why "graph," not "GUN-compatible"

The architecture note this package was scoped from suggested GUN.js
could be an optional legacy transport/backend during a migration.
Checked against the actual `YourMinedApp` codebase before building
anything: **it doesn't use GUN at all** — its current data model is
flat `localStorage` keys, namespaced per sphere by string prefix
(`ym_s|<sphere>|<key>`), synced over raw Trystero/Nostr message
broadcasts, not CRDT graph replication. There is no existing GUN API
surface to be a drop-in replacement for in this portfolio today.
`GraphStore` is built for what "graph" in the platform's own charter
actually means — genuinely nested, reference-capable data — not as
compatibility shimming for a dependency that isn't in use.

## Honest limits

`TrysteroTransport` (re-exported from Record) has never been
exercised with two real, live browser tabs in this session — the
identical limit Record's own README already states for it.

## Status

21 passing `node --test` cases for this package's own new code.
Depends on `@aiwa/record` via its GitHub URL (neither package is on
npm yet).

## Testing

```
npm install
node --test
```
