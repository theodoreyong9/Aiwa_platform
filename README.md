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
- **`bundle.js`** — publishing a real, *multi-file* application bundle
  (an entire app: `index.html`, `css/`, `js/`) as verifiable,
  content-addressed AIWA events — `contract-registry.js`'s single-file
  pattern (in `aiwa-core`) generalized to a real app. `publishBundle`
  content-addresses every file independently (parentless,
  `createdAt=0`, so a byte-identical file across two versions reuses
  the exact same event and is never retransmitted) plus one real,
  signed, timestamped manifest event listing every file's own event id
  and chaining from the domain's prior heads, so `EventLog.head()`
  naturally resolves to the latest published version and `since()`
  naturally computes the minimal real update. `readBundle`/
  `latestBundle` reconstruct a full, byte-for-byte-verified bundle
  from a manifest — every event involved was already cryptographically
  verified on `EventLog.append()`, this only reassembles.

A "sphere" in this stack is simply an `aiwa-core` `domain` — nothing
new was needed to represent one.

## Publishing an app bundle instead of GitHub Pages

`examples/publish-jobber.mjs` is a real, runnable proof of concept:
reads Jobber's actual deployed bundle (every real `.html`/`.css`/`.js`
file, excluding this repo's own test/tooling directories) from a real
checkout, publishes it via `publishBundle`, reads it back via
`readBundle`, and verifies every file byte-for-byte. Run against the
real `Jobber` repo in this portfolio:

```
node examples/publish-jobber.mjs /path/to/Jobber
```

Real, measured result: 35 files, 420,753 bytes, published in ~250ms,
read back byte-for-byte identical in <1ms, and republishing the exact
same content as a new "version" grows the log by exactly one event —
the new manifest — never the 35 unchanged files again.

**What this proves**: the publish → verify → reconstruct mechanism is
real and correct against a genuine, non-toy application, not a
synthetic fixture.

**What this does NOT yet prove** (the next real steps, not done here):
- Actual peer-to-peer replication between two separate processes/tabs
  — this run is in-process, one `EventLog`, no `Transport`/`Replicator`
  involved yet.
- How a browser actually *serves and runs* a reconstructed bundle — a
  service worker reading from an EventLog-backed cache is the likely
  shape (the same pattern this portfolio's existing PWA service
  workers already use for offline caching, just sourcing content from
  AIWA-synced events instead of a `fetch()` to an origin server), but
  it isn't built yet.
- How a brand-new peer with zero existing connections bootstraps its
  very first contact with no fixed hosting at all — a real, physical
  constraint (a browser can't run code it hasn't fetched from
  *somewhere*), deliberately deferred rather than hand-waved.

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

29 passing `node --test` cases. Depends on `aiwa-core` via its GitHub
URL (neither is on npm yet).

## Testing

```
npm install
node --test
```
