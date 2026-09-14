import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRenderedFrames } from './fps-workflows.mjs';
const smooth = Array.from({ length: 240 }, (_, i) => (i + 0.5) * 4000 / 240);
test('rendered FPS counts actual frames and retains slow frames and edge stalls', () => {
  const result = summarizeRenderedFrames({ timestamps: smooth, durationMs: 4000, cap: 60, hidden: false });
  assert.equal(result.averageFps, 60); assert.equal(result.passed, true);
  const stall = summarizeRenderedFrames({ timestamps: smooth.filter(t => t > 400), durationMs: 4000, cap: 60, hidden: false });
  assert.equal(stall.passed, false); assert.ok(stall.worstGapMs > 400);
  const slow = summarizeRenderedFrames({ timestamps: smooth.filter(t => t < 1000 || t > 1400), durationMs: 4000, cap: 60, hidden: false });
  assert.equal(slow.passed, false); assert.ok(slow.onePercentLowFps < result.onePercentLowFps);
});
test('hidden tabs, empty streams and duplicate frame timestamps cannot pass FPS tests', () => {
  assert.equal(summarizeRenderedFrames({ timestamps: smooth, durationMs: 4000, cap: 60, hidden: true }).passed, false);
  for (const timestamps of [[], [0, 0], [2, 1], [1, Infinity], [1, 5000]]) {
    assert.throws(() => summarizeRenderedFrames({ timestamps, durationMs: 4000, cap: 60 }));
  }
});
