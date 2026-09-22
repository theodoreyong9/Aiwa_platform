// Regenerates jobber-fixture.json (gitignored — a real snapshot, not
// meant to be committed and go stale) from a real, live Jobber
// checkout, for publish-durability.html to fetch and publish.
//
// Usage: node test-browser/generate-fixture.mjs /path/to/Jobber

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jobberRoot = path.resolve(process.argv[2] ?? path.join(__dirname, '../../Jobber'));
const outPath = path.join(__dirname, 'jobber-fixture.json');

const EXCLUDED_DIRS = new Set(['test', 'node_modules', '.git', 'scripts', '.github']);

/** The real, deployed bundle only — see examples/publish-jobber.mjs's own identical logic. */
async function collectFiles(root) {
  const relPaths = [];
  async function walk(dir, relBase) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(abs, rel);
      } else if (/\.(html|css|js)$/.test(entry.name)) {
        relPaths.push(rel);
      }
    }
  }
  await walk(root, '');
  return relPaths;
}

const relPaths = await collectFiles(jobberRoot);
if (relPaths.length === 0) throw new Error(`No .html/.css/.js files found under ${jobberRoot} — wrong path?`);
const files = await Promise.all(relPaths.map(async (p) => ({ path: p, content: await readFile(path.join(jobberRoot, p), 'utf-8') })));
await writeFile(outPath, JSON.stringify(files));
console.log(`Wrote ${files.length} real files from ${jobberRoot} to ${outPath}`);
