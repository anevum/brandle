import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareSource, validateBaseline } from './compare-release-baseline.mjs';

const baseline = JSON.parse(await readFile(new URL('../docs/releases/live-assets-2026-10-30.json', import.meta.url)));
test('historical asset baseline is valid and immutable in scope', () => {
  assert.equal(validateBaseline(baseline).length,12);
  assert.equal(baseline.worker,'brandle-glimmer-grove');
});
test('offline source matches the observed release baseline', async () => {
  const outcome = await compareSource(baseline);
  assert.deepEqual(outcome.differences,[]);
  assert.equal(outcome.matched,12);
});
test('offline comparison detects changed assets', async () => {
  const original = await readFile(new URL('../index.html', import.meta.url));
  const outcome = await compareSource(baseline, path => path.endsWith('index.html') ? Buffer.concat([original,Buffer.from('x')]) : readFile(path));
  assert.equal(outcome.identical,false);
  assert.ok(outcome.differences.some(v=>v.name==='index.html'));
});
test('invalid manifest and missing asset fail closed', async () => {
  assert.throws(()=>validateBaseline({...baseline,files:{}}));
  const outcome = await compareSource(baseline, async path => {if(path.endsWith('sw.js'))throw Object.assign(new Error('missing'),{code:'ENOENT'});return readFile(path)});
  assert.ok(outcome.differences.some(v=>v.name==='sw.js'&&v.reason==='asset missing'));
});
