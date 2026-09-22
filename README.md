# aiwa-platform

Distributed infrastructure: transport, replication, permissions, and a
graph-shaped data store. Depends on [`aiwa-core`](https://github.com/theodoreyong9/Aiwa_core)
for the event/identity/storage substrate (`EventLog`, `Identity`,
`DataStore`) — the sibling repo in this stack, not an outside project.

## What this package owns

- **`transport.js`** — `TrysteroTransport`/`LoopbackTransport`, a real,
  minimal five-method transport contract (`connect`/`disconnect`/`peers`/
  `send`/`broadcast` plus join/leave/message handlers). Knows nothing
  about events, domains, or identity — only real bytes to real peers.
- **`replicator.js`** — a real HELLO/EVENTS/ACK sync protocol: on
  connect, exchange heads; send only the real, minimal missing set
  (via `EventLog.since()`), never a full history dump.
- **`capability.js`** — a signed, scoped `CapabilitySet`: an
  application never receives "access to everything," only what was
  genuinely, verifiably issued to it.
- **`GuardedDataStore`** — wires `capability.js`'s own `CapabilitySet`
  into the one real choke point every write already passes through
  (`DataStore._commit`, which `set`/`delete`/`transact` all call).
  `capability.js` is a real, tested primitive that enforces nothing on
  its own; this is that enforcement.
- **`GraphStore`** — a nested/graph-shaped alternative to `aiwa-core`'s
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

A "sphere" in this stack is simply an `aiwa-core` `domain` — nothing
new was needed to represent one.

## Where this package's own code came from

`transport.js`, `replicator.js`, and `capability.js` started as a
direct copy of [`theodoreyong9/record`](https://github.com/theodoreyong9/record)
— an existing, tested foundation elsewhere in this portfolio, used as
a reference rather than reinvented from scratch. Record is not one of
this stack's own repos, so its code lives here as this package's own
files, not as a live dependency.

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

`TrysteroTransport` has never been exercised with two real, live
browser tabs in this session — the identical limit stated for it
wherever this code has lived before.

## Status

21 passing `node --test` cases. Depends on `aiwa-core` via its GitHub
URL (neither is on npm yet).

## Testing

```
npm install
node --test
```
