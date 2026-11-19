/**
 * Bundles a TypeScript entry from tests/ with esbuild and runs it in Node.
 * Keeps the app sources free of import extensions while still allowing the
 * numeric pipeline to be benchmarked outside the browser.
 *
 *   node tools/run-ts.mjs tests/sdf.bench.ts
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.argv[2];
if (!entry) {
  console.error('usage: node tools/run-ts.mjs <file.ts>');
  process.exit(1);
}

const outDir = mkdtempSync(resolve(tmpdir(), 'zika-bench-'));
const outfile = resolve(outDir, 'entry.mjs');

await build({
  entryPoints: [resolve(root, entry)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile,
  sourcemap: 'inline',
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);
