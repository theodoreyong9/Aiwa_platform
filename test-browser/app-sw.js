// A real service worker: intercepts requests under its scope and
// serves them from a real, IndexedDB-reconstructed AIWA bundle,
// instead of the network. See generate-sw-bundle.mjs for why this
// imports from ./*.for-sw.js rather than directly from
// ../src/serve-worker.js (a real, confirmed browser constraint, not a
// difference in behavior).

import { createFetchHandler } from './serve-worker.for-sw.js';

const handleFetch = createFetchHandler({
  domain: 'jobber',
  dbName: 'aiwa-platform-jobber-sw-check',
  scope: '/test-browser/app/',
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', handleFetch);
