import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSummary } from './performance-workflows.mjs';

test('performance percentiles retain slow-tail samples and never mutate input', () => {
  const samples = [1000, ...Array(19).fill(10)];
  const result = timingSummary(samples);
  assert.equal(result.medianMs, 10);
  assert.equal(result.p95Ms, 10);
  assert.equal(result.maxMs, 1000);
  assert.equal(samples[0], 1000);
  assert.equal(timingSummary([10, 10, 10, 1000]).p95Ms, 1000);
});
test('missing, negative and nonfinite performance samples cannot pass', () => {
  for (const samples of [[], [-1], [NaN], [Infinity]]) assert.throws(() => timingSummary(samples));
});
