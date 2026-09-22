// Regenerates the gitignored *.for-sw.js files this directory's
// app-sw.js imports, from the real, shipped src/bundle.js and
// src/serve-worker.js — unchanged except for their one bare
// `'aiwa-core'` import specifier, rewritten to a concrete path.
//
// WHY this is needed: confirmed in this environment that a real
// service worker's script evaluation fails outright on a bare
// specifier — `register()` itself rejects with "ServiceWorker script
// evaluation failed" — because, unlike an ordinary page, a service
// worker does not inherit its registering page's `<script
// type="importmap">`. A real npm consumer bundling their service
// worker with Vite/Webpack/esbuild/Rollup (the standard way real PWAs
// ship one) never hits this; loading the unbundled source directly,
// with no build step, does. See aiwa-platform's own README, "Honest
// limits", for this finding.
//
// Every line of actual logic here is identical to the real, shipped
// file — this only rewrites import specifiers, never behavior.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function patch(srcRelPath, outName, replacements) {
  let content = await readFile(path.join(__dirname, srcRelPath), 'utf-8');
  for (const [from, to] of replacements) content = content.replaceAll(from, to);
  await writeFile(path.join(__dirname, outName), content);
  console.log(`Wrote ${outName} (from ${srcRelPath}, ${replacements.length} import(s) rewritten)`);
}

// Pointed at the concrete files that actually define what's used
// (event.js, event-log.js), never the package's own index.js barrel —
// that re-exports the ENTIRE package (identity.js's @noble/curves,
// solana-wallet.js's @solana/web3.js/@scure/bip39, ...), none of which
// this service worker needs, and all of it bare specifiers a worker
// can't resolve anyway. event.js/event-log.js have no bare-specifier
// imports at all, so this is the one combination a worker CAN load
// with no bundler and no import map.
await patch('../src/bundle.js', 'bundle.for-sw.js', [["from 'aiwa-core'", "from '/node_modules/aiwa-core/src/event.js'"]]);
await patch('../src/serve-worker.js', 'serve-worker.for-sw.js', [
  ["from 'aiwa-core'", "from '/node_modules/aiwa-core/src/event-log.js'"],
  ["from './bundle.js'", "from './bundle.for-sw.js'"],
]);
