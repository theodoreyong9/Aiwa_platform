import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentity, EventLog, createMemoryBackend } from 'aiwa-core';
import { publishBundle } from '../src/bundle.js';
import { resolveFromBundle, createFetchHandler } from '../src/serve-worker.js';

async function publishedLog(files, domain = 'jobber') {
  const identity = await generateIdentity();
  const log = new EventLog();
  await publishBundle(identity, log, domain, { name: domain, version: '1.0.0', files });
  return log;
}

test('resolveFromBundle serves a real published file with the correct content type', async () => {
  const log = await publishedLog([
    { path: 'index.html', content: '<h1>hi</h1>' },
    { path: 'js/app.js', content: 'console.log(1)' },
  ]);
  const res = await resolveFromBundle(log, 'jobber', 'js/app.js');
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/javascript; charset=utf-8');
  assert.equal(await res.text(), 'console.log(1)');
});

test('resolveFromBundle treats an empty or "/" path as index.html', async () => {
  const log = await publishedLog([{ path: 'index.html', content: 'root page' }]);
  assert.equal(await (await resolveFromBundle(log, 'jobber', '')).text(), 'root page');
  assert.equal(await (await resolveFromBundle(log, 'jobber', '/')).text(), 'root page');
});

test('resolveFromBundle returns null for a real path not in the bundle', async () => {
  const log = await publishedLog([{ path: 'index.html', content: 'x' }]);
  assert.equal(await resolveFromBundle(log, 'jobber', 'missing.js'), null);
});

test('resolveFromBundle returns null when nothing has been published to this domain yet', async () => {
  const log = new EventLog();
  assert.equal(await resolveFromBundle(log, 'jobber', 'index.html'), null);
});

test('resolveFromBundle resolves the real latest version from a FRESH EventLog over a persisted backend (a real restart)', async () => {
  const identity = await generateIdentity();
  const backend = createMemoryBackend();
  const sessionOne = new EventLog(backend);
  await publishBundle(identity, sessionOne, 'jobber', { name: 'jobber', version: '1.0.0', files: [{ path: 'a.js', content: 'v1' }] });
  await publishBundle(identity, sessionOne, 'jobber', { name: 'jobber', version: '2.0.0', files: [{ path: 'a.js', content: 'v2' }] });
  const sessionTwo = new EventLog(backend);
  const res = await resolveFromBundle(sessionTwo, 'jobber', 'a.js');
  assert.equal(await res.text(), 'v2');
});

test('createFetchHandler requires a domain and a scope', () => {
  assert.throws(() => createFetchHandler({ scope: '/app/' }), /domain is required/);
  assert.throws(() => createFetchHandler({ domain: 'jobber' }), /scope is required/);
});

test('createFetchHandler ignores a request outside its scope — never calls respondWith', () => {
  const handler = createFetchHandler({ domain: 'jobber', scope: '/app/', createLog: () => new EventLog() });
  let called = false;
  handler({ request: new Request('https://example.com/other/thing.js'), respondWith: () => { called = true; } });
  assert.equal(called, false);
});

test('createFetchHandler serves a real, in-scope request via respondWith', async () => {
  const log = await publishedLog([{ path: 'index.html', content: 'served' }]);
  const handler = createFetchHandler({ domain: 'jobber', scope: '/app/', createLog: () => log });
  let responsePromise;
  handler({ request: new Request('https://example.com/app/index.html'), respondWith: (p) => { responsePromise = p; } });
  const response = await responsePromise;
  assert.equal(await response.text(), 'served');
});

test('createFetchHandler responds 404 for an in-scope request not in the bundle', async () => {
  const log = await publishedLog([{ path: 'index.html', content: 'x' }]);
  const handler = createFetchHandler({ domain: 'jobber', scope: '/app/', createLog: () => log });
  let responsePromise;
  handler({ request: new Request('https://example.com/app/missing.js'), respondWith: (p) => { responsePromise = p; } });
  const response = await responsePromise;
  assert.equal(response.status, 404);
});
