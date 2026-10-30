import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'docs', 'releases', 'live-assets-2026-10-30.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1 || baseline.kind !== 'historical-read-only-release-baseline'
    || baseline.worker !== 'brandle-glimmer-grove' || typeof baseline.files !== 'object'
    || baseline.files === null || Array.isArray(baseline.files)) throw new Error('Unexpected baseline schema');
  const entries = Object.entries(baseline.files);
  if (entries.length !== 12) throw new Error('Expected exactly 12 release assets');
  for (const [name, item] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || !/^[0-9a-f]{64}$/.test(item?.sha256)
      || !Number.isSafeInteger(item?.bytes) || item.bytes < 0) throw new Error('Invalid baseline asset');
  }
  return entries;
}

export async function compareSource(baseline, reader = readFile, sourceRoot = root) {
  const entries = validateBaseline(baseline);
  const matches = [];
  const differences = [];
  for (const [name, expected] of entries) {
    try {
      const bytes = await reader(join(sourceRoot, name));
      const actualHash = sha256(bytes);
      if (actualHash !== expected.sha256 || bytes.length !== expected.bytes) {
        differences.push({name, reason:'source differs from historical release baseline'});
      } else {
        matches.push(name);
      }
    } catch (error) {
      differences.push({name, reason: error?.code === 'ENOENT' ? 'asset missing' : 'asset unreadable'});
    }
  }
  return {matched:matches.length,total:entries.length,matches,differences,
    identical: differences.length === 0};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--compare-source') {
    console.error('Offline only. Usage: node scripts/compare-release-baseline.mjs --compare-source');
    process.exitCode = 2;
  } else {
    try {
      const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
      const result = await compareSource(baseline);
      console.log(JSON.stringify({releaseDate:baseline.observedDate, worker:baseline.worker, ...result},null,2));
      console.log('This checks local files only; it does not contact or deploy to Cloudflare.');
      if (!result.identical) process.exitCode = 1;
    } catch (error) {
      console.error('Baseline validation failed:', error.message);
      process.exitCode = 1;
    }
  }
}
