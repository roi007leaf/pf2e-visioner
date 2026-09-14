import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQaWorld } from './world-guard.mjs';

test('default QA guard accepts only visioner-qa', () => {
  assert.doesNotThrow(() => assertQaWorld('visioner-qa'));
  assert.throws(() => assertQaWorld('kingmaker'), /Wrong Foundry world.*kingmaker.*visioner-qa/);
});

test('unavailable world identity cannot pass the QA guard', () => {
  for (const value of [undefined, null, '']) assert.throws(() => assertQaWorld(value), /Wrong Foundry world/);
});

test('explicit alternate QA world requires an exact match', () => {
  assert.doesNotThrow(() => assertQaWorld('qa-other', 'qa-other'));
  assert.throws(() => assertQaWorld('visioner-qa', 'qa-other'), /Wrong Foundry world/);
  assert.throws(() => assertQaWorld('qa-other', ''), /must not be blank/);
});
