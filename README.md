# aiwa-platform

Distributed infrastructure: transport, replication, permissions, and a
graph-shaped data store. Depends on [`aiwa-core`](https://github.com/theodoreyong9/Aiwa_core)
for the event/identity/storage substrate (`EventLog`, `Identity`,
`DataStore`) — the sibling repo in this stack, not an outside project.

## Where this sits

```
          ┌────────────────────────────────────────────────┐
          │ AIWA_project                                   │
          │ one concrete deployment (a single static page, │
          │ no build step, no fixed server)                │
          └────────────────────────────────────────────────┘
                                   │
                                   │  imports all three, directly
                                   ▼
              ┌─────────────────────────────────────┐
              ▼                                     ▼
┌───────────────────────────┐      ┌─────────────────────────────────┐
│ aiwa-lib                  │      │ aiwa-platform  <-- you are here │
│ public wallet API (AIWA), │      │ transport, replication,         │
│ Channel, contract SDK     │      │ capability-gated storage,       │
│                           │      │ bundle publishing               │
└───────────────────────────┘      └─────────────────────────────────┘
              │                                     │
              └──────────────────┬──────────────────┘
                                 ▼
         ┌──────────────────────────────────────────────┐
         │ aiwa-core                                    │
         │ the protocol itself: identity, event log,    │
         │ progression, accrual, conservation, Mirror,  │
         │ Causal Tick, contracts, delegation, vouchers │
         │                                              │
         │ depends on nothing of its own - only         │
         │ @noble/curves, @noble/hashes, @scure/bip39,  │
         │ optional @solana/web3.js                     │
         └──────────────────────────────────────────────┘
```

This package has NO protocol logic of its own — it never decides what
counts as a valid state transition (that's `aiwa-core` alone). It only
moves and stores real, already-signed `aiwa-core` events: over the
wire (`webrtc-transport.js`, `replicator.js`), or into a real,
capability-gated or graph-shaped local store (`capability.js`,
`GuardedDataStore`, `GraphStore`).

## What this package owns

- **`webrtc-transport.js`** — `WebrtcTransport`: our own, relay-free
  P2P transport. No Trystero, no Nostr relay, no signaling server, no
  third-party dependency of any kind — real, direct `RTCPeerConnection`,
  STUN-only for NAT traversal. The one real signaling exchange a new
  connection needs (`createOfferFor`/`acceptOffer`/`completeConnection`,
  via `signaling-codec.js`) hands back an opaque blob the caller sends
  over whatever real out-of-band channel they choose — pasted text, a
  QR code, an already-open connection to a third peer. This class never
  picks or uses a channel itself.
- **`transport.js`** — `LoopbackTransport`, a real, in-process transport
  for deterministic tests, never for two real, separate devices. Both
  transports implement the identical, minimal five-method contract
  (`connect`/`disconnect`/`peers`/`send`/`broadcast` plus join/leave/
  message handlers) — nothing above either one (`Replicator`) changes.
- **`replicator.js`** — a real HELLO/EVENTS/ACK sync protocol: on
  connect, exchange heads; send only the real, minimal missing set
  (via `EventLog.since()`), chunked and ACK-gated (see "Chunked
  replication" below) — never one unbounded message.
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
  `listBundlesByAuthor` finds every domain (across every real
  `bundle.manifest` event in the log) published by a given author id —
  no new protocol needed, since `event.author` is already
  cryptographically verified on every append; this only scans and
  summarizes what was already, verifiably true.
- **`serve-worker.js`** — the piece that turns "a bundle was published
  and can be reconstructed" into "a browser can actually run it": a
  real service worker fetch handler (`createFetchHandler`) that
  intercepts requests under a given scope and serves them from
  `latestBundle`'s real, IndexedDB-reconstructed content, instead of
  the network. See `test-browser/sw-serve-check.html` below for the
  real, live proof.
- **`introducer.js`** — the real, solvable part of "the bootstrap
  problem" (see below): `Introducer` lets a peer with just ONE real
  connection ask that peer to introduce it to one of its OTHER real
  peers — a real WebRTC offer/answer relayed over the two already-open
  connections, exactly the way a person introduces two friends who
  don't know each other. Once introduced, the two have a genuinely
  DIRECT connection; the mediator is no longer in that connection's
  data path at all. Zero fixed server, zero directory, ever — only
  ever grows an existing connection, never creates the first one.

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

**What this does NOT prove, and never will** (a real, physical
constraint, not a missing feature — see "The bootstrap problem" below):
how a brand-new peer with zero existing connections gets its very
first real contact with no fixed hosting at all. `introducer.js` below
solves the part of this that's actually solvable — growing a network
from one connection — but the very first connection of all is
irreducible.

Three items that used to be on this list no longer are: actual
peer-to-peer replication between two separate, real browser tabs (see
`test-browser/sandbox.html` below), how a browser actually *serves and
runs* a reconstructed bundle (see `test-browser/sw-serve-check.html`
below), and growing a network from one connection with zero fixed
server (see "The bootstrap problem" below).

### `test-browser/publish-durability.html` — the same proof, but durable

`examples/publish-jobber.mjs` above is in-process and memory-only: the
instant that Node process exits, everything it published is gone —
nothing is actually "published" in any lasting sense. This harness
closes that gap: it publishes Jobber's real bundle into `aiwa-core`'s
real `createIndexedDbBackend`, in a real browser, then a genuinely
fresh page navigation (new JS context, nothing carried over in memory)
reconstructs it via `latestBundle` from real IndexedDB storage alone.

```
node test-browser/generate-fixture.mjs /path/to/Jobber   # writes the gitignored jobber-fixture.json
python3 -m http.server 8935                               # from this repo's own root
```
then open `?phase=publish`, then reload the same URL with `?phase=reload`.

Real, measured result: all 35 real files published in ~420ms, survived
a genuine page reload, and were reconstructed byte-for-byte (0
mismatches) in ~95ms, recovered purely from real IndexedDB storage —
confirming Jobber's bundle really is durable, not merely
demonstrated-and-forgotten.

This run only ever published one version before reloading, which is
exactly why it didn't catch a real bug in `aiwa-core`'s
`EventLog.head()`: a *second* real version published before a restart
made `latestBundle()` throw a false "real fork" error on reload — see
`aiwa-core`'s README for the bug and `test/bundle.test.mjs`'s dedicated
regression test here for the exact scenario. Fixed upstream; this
package's own `aiwa-core` dependency has been updated to the fix.

### `test-browser/sw-serve-check.html` — a real browser actually running the bundle

Everything above reconstructs a bundle *in a script*; this proves a
real service worker can actually **serve** it, so an ordinary page
navigation and its own subresource loads (`<script src>`, `fetch()`)
work exactly as they would against a real origin server — with no
origin server involved at all.

`app-sw.js` registers `createFetchHandler({ domain: 'jobber', scope: '/test-browser/app/' })`
(this package's own real function, unmodified) for that scope.
`/test-browser/app/` corresponds to no real file anywhere on the
static server, so a real page successfully loading there is only
explainable by the service worker having intercepted the navigation
and served it from `latestBundle`'s real, IndexedDB-reconstructed
bundle.

```
node test-browser/generate-fixture.mjs /path/to/Jobber   # if not already generated
node test-browser/generate-sw-bundle.mjs                  # writes the gitignored *.for-sw.js files
python3 -m http.server 8935                               # from this repo's own root
```
then open `sw-serve-check.html?phase=publish`, then
`?phase=register`, then navigate directly to
`/test-browser/app/index.html`.

**A real, confirmed browser constraint found building this**: a
service worker's `register()` call rejects outright ("ServiceWorker
script evaluation failed") on a bare `import ... from 'aiwa-core'` —
unlike an ordinary page, a service worker does not inherit its
registering page's `<script type="importmap">`, so the same technique
`sandbox.html`/`publish-durability.html` use above doesn't carry over.
A real npm consumer bundling their service worker with Vite/Webpack/
esbuild/Rollup (the standard way real PWAs ship one) never hits this.
`generate-sw-bundle.mjs` works around it, for this zero-build-step
proof only, by pointing `serve-worker.js`'s and `bundle.js`'s own
`'aiwa-core'` import at the *concrete* files that actually define what
each one uses (`event-log.js`, `event.js`) rather than the package's
`index.js` barrel — which re-exports the *entire* package, including
`identity.js`'s `@noble/curves` and `solana-wallet.js`'s
`@solana/web3.js`/`@scure/bip39`, none of which a bare-specifier-free
worker could load anyway and none of which this service worker needs.
Every line of actual logic is untouched; only which file the one
import resolves to changes.

Real, confirmed result: a genuine top-level navigation to
`/test-browser/app/index.html` returned a real 200 with Jobber's real
`index.html`, byte-for-byte identical to the source, and
`navigator.serviceWorker.controller` was set (a real controlled
client) — its own subsequent `fetch('/test-browser/app/js/app.js')`
also came back 200 and byte-identical, and a path not in the bundle
correctly got the service worker's own 404, not the static server's.
Jobber's real page then went on to request its *other* real scripts
and (for `.png`/font/CDN resources this fixture deliberately excludes,
being `.html`/`.css`/`.js`-only) genuinely 404's on those — an honest
reflection of the fixture's own scope, not a defect in
`serve-worker.js` itself.

## Where this package's own code came from

`replicator.js` and `capability.js` started as a direct copy of
[`theodoreyong9/record`](https://github.com/theodoreyong9/record) — an
existing, tested foundation elsewhere in this portfolio, used as a
reference rather than reinvented from scratch. Record is not one of
this stack's own repos, so its code lives here as this package's own
files, not as a live dependency. `webrtc-transport.js` and
`signaling-codec.js` are new, written for this package: Record's own
`transport.js` used Trystero (a real, third-party P2P library) —
deliberately not carried over. See "No Trystero" below.

## No Trystero

Trystero (and by extension its Nostr relay dependency) has been
removed entirely — not made optional, removed. `WebrtcTransport` is
our own, from-scratch, relay-free implementation of the same transport
contract. See "The bootstrap problem" below for what growing a real
network from there still needs, and what `introducer.js` does and
doesn't solve about it — a genuinely separate problem from "which
library sends the bytes," deliberately not hidden behind this
transport's own removal of Trystero.

## Why "graph," not "GUN-compatible"

The architecture note this package was scoped from suggested GUN.js
could be an optional legacy transport/backend during a migration.
Checked against the actual `YourMinedApp` codebase before building
anything: **it doesn't use GUN at all** — its current data model is
flat `localStorage` keys, namespaced per sphere by string prefix
(`ym_s|<sphere>|<key>`), synced over raw Trystero/Nostr message
broadcasts (also since removed — see "No Trystero"), not CRDT graph
replication. There is no existing GUN API surface to be a drop-in
replacement for in this portfolio today. `GraphStore` is built for
what "graph" in the platform's own charter actually means — genuinely
nested, reference-capable data — not as compatibility shimming for a
dependency that isn't in use.

### `test-browser/sandbox.html` — a real WebRTC connection, two real tabs

`RTCPeerConnection` doesn't exist in Node, so `webrtc-transport.test.mjs`
(above) only covers this class's own real bookkeeping and validation
logic against a minimal, deliberately fake `RTCPeerConnection` — not the
real network path. `sandbox.html` closes that gap: it exposes this
package's real building blocks (`WebrtcTransport`, `Replicator`, plus
`aiwa-core`'s `EventLog`/`generateIdentity`/`createEvent`) as
`window.aiwa.*` globals on a generic page, so two genuinely separate
browser tabs can be driven — by Playwright, or by hand in devtools — through
a real offer/answer/complete handshake with the resulting blobs passed
between them exactly as a real deployment would (pasted text, a QR code —
this class never picks the channel itself).

```
python3 -m http.server 8935   # from this repo's own root
```
then open `test-browser/sandbox.html` in two separate tabs and, in each
tab's devtools console, set up an identity/log/transport/replicator and
carry out the real offer → answer → complete exchange by copying each
blob to the other tab.

**Real, measured result** (Playwright + real Chromium, two real, separate
browser contexts, run in this environment): a genuine `RTCPeerConnection`
data channel opened between two real tabs with zero relay or signaling
server, and `Replicator` correctly synced both a pre-existing event (via
the initial HELLO handshake) and a live, newly-published event across it.

**A real bug this run found and fixed**: the first attempt hung
indefinitely at `createOfferFor` — `waitForIceGatheringComplete` waited
unboundedly for `iceGatheringState === 'complete'`, but this sandbox's
network policy blocks STUN (UDP) traffic outright, so the server-reflexive
candidate never resolves and gathering never reaches `'complete'` on its
own. Fixed by bounding the wait with a real timeout (`iceGatheringTimeoutMs`,
default 3000ms): send the offer/answer with whatever candidates (host,
and srflx if it arrived in time) were gathered, rather than waiting
forever for one that may never come. This isn't a workaround specific to
this sandbox — restrictive firewalls in real deployments hit the same
failure mode, so a bounded wait is the correct behavior in general.
Regression-tested in `webrtc-transport.test.mjs` against a fake PC whose
`iceGatheringState` never reaches `'complete'`.

## The bootstrap problem

A brand-new peer, or a brand-new network with nobody in it yet, has a
real, physical problem: a browser can't run code it hasn't fetched
from *somewhere*, and can't connect to a peer it has no way to reach.
No P2P system of any kind escapes this — BitTorrent needs a magnet
link or a tracker from somewhere, a DHT needs bootstrap nodes, Bitcoin
needs seed node addresses — it isn't specific to AIWA, and isn't solved
here. What genuinely *is* solvable, and is solved by `introducer.js`:
once a peer has gotten its very first real connection by ANY real,
out-of-band means (a pasted link, a QR code, in person —
`webrtc-transport.js`'s own `createOfferFor`/`acceptOffer` deliberately
never picks that channel itself), it never needs another fixed
rendezvous point again. `Introducer` lets it ask that one connection to
introduce it to another, which introduces it to another, and so on —
the network grows by relayed introduction alone, with zero server, zero
directory, ever, after that first out-of-band step.

`test/introducer.test.mjs` covers the real protocol logic (who gets
asked, who relays what to whom, including a genuine race a live run
surfaced: two independent real connections give no guaranteed relative
message order, so a relayed offer can arrive before the "you're being
introduced" message that explains it — handled by buffering it until
that message arrives, not by assuming an ordering no real network
guarantees).

**Real, confirmed result** (Playwright + real Chromium, three real,
separate browser tabs A/M/P): A and M established a real WebRTC
connection, M and P established a real WebRTC connection, and A and P
had never heard of each other. A then asked M — its only real
connection — to introduce it to one of M's other real peers, purely
via `Introducer`'s relay over the two already-open real data channels.
The introduction resolved with A connected to P; after M's own
transport was disconnected entirely, A and P still exchanged a real
message directly — proof the resulting connection is genuinely direct,
not still routed through the mediator. Zero fixed server, zero
directory, at any point after the initial two out-of-band A↔M and M↔P
connections.

## Chunked replication — bounding an unbounded full-sync payload

A real, previously-unaddressed limit (Yellow Paper §12.1): `HELLO`/
`HELLO_ACK` handling used to collect every real missing event into one
array and send it as a single `EVENTS` message — a domain offline a
long time, or a brand-new peer catching up on a long real history, hit
a real memory and bandwidth spike proportional to total history size,
on both the sender (building the array) and the receiver (buffering it
before one `appendMany()` call). `_sendChunked()` now sorts the real
missing set topologically, splits it into bounded chunks (`chunkSize`,
default 100), and releases them one at a time — the next chunk only
once the previous chunk's own real `ACK` genuinely arrives. Real
backpressure, not a fixed delay: a slow or momentarily disconnected
peer simply never gets the next chunk until it catches up.

**Two real bugs found closing this loop:**

1. `EventLog.since()`'s own real output order is whatever the backend's
   `allIds()` happens to return — never guaranteed parents-before-children.
   Harmless as a single `appendMany()` call (its own internal retry loop
   tolerates any order), but genuinely broken once split across several
   separate `EVENTS` messages: a child delivered in an earlier chunk
   than its real parent makes that chunk's own `appendMany()` fail
   outright. Fixed by sorting the full missing set topologically before
   chunking, so each chunk only ever depends on an earlier chunk or
   something the receiver already has.
2. The existing `HELLO`/`HELLO_ACK` exchange already computes and sends
   "what's missing" *twice* per real connection — once handling the
   peer's `HELLO`, again handling their own `HELLO_ACK` (same announced
   heads both times, since nothing changes for them in between).
   Harmless before chunking (`EventLog.append()`'s own idempotency
   silently absorbs the redundant resend); a real bug once chunked,
   since a second, independent `_sendChunked()` call for a peer already
   mid-sync would clobber the first call's own pending-chunk queue and
   put two chunks genuinely in flight at once. `_syncInFlight` skips the
   redundant second call outright.

**Honest limit**: `_syncInFlight`'s own dedup only covers the window
while a chunked sync is actually in progress. In the narrow race where
the very first sync completes (all chunks sent and acked) in the
instant before the redundant `HELLO_ACK`-triggered call would have been
skipped, that second call proceeds and harmlessly re-sends the same
already-delivered events once more — wasted bandwidth, never incorrect
(`EventLog.append()`'s idempotency absorbs it), and not observed in
`test/replicator.test.mjs`'s own real runs. Eliminating it fully would
mean redesigning the `HELLO`/`HELLO_ACK` handshake itself, out of scope
here.

## Honest limits

The real, two-tab WebRTC path above was exercised only on the same
machine (loopback, host candidates) — genuine NAT traversal across two
different networks (a real srflx/STUN or relay/TURN path) has not been
tested, since this sandbox's own network policy blocks the STUN traffic
that would be needed to exercise it.

## Status

77 passing `node --test` cases. Depends on `aiwa-core` via its GitHub
URL (neither is on npm yet).

## Testing

```
npm install
node --test
```
