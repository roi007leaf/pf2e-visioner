import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCases, casePassed } from './coverage.mjs';
import { fullCases } from './cases.mjs';
import { workflows, executeWorkflow } from './workflows.mjs';
import { verifySamplingArea } from './visual-surface.mjs';
import { detectionPattern } from './artwork.mjs';

test('an obscured screenshot cannot pass as absent token artwork', async () => {
  await assert.rejects(verifySamplingArea({ evaluate: async () => ['DIALOG'] }, {}), /obstructed/);
  await verifySamplingArea({ evaluate: async () => [] }, {});
});

test('missing soundwaves fail; hearing rejects colored linework', () => {
  const png = { width: 100, height: 100, data: Buffer.alloc(100 * 100 * 4) };
  const rect = { x: 10, y: 10, width: 80, height: 80 };
  assert.equal(detectionPattern(png, rect).visible, false);
  for (const color of [[180, 180, 180], [180, 0, 180]]) {
    png.data.fill(0);
    for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) {
      if (Math.round(Math.hypot(x - 50, y - 50)) % 7 < 2) png.data.set([...color, 255], (y * 100 + x) * 4);
    }
    const result = detectionPattern(png, rect);
    assert.equal(result.visible, true);
    assert.equal(result.neutral, color[1] > 0);
  }
});

test('all full-suite cases are executable, with no manual steps or undefined workflows', () => {
  validateCases(fullCases);
  for (const scenario of fullCases) for (const step of scenario.steps) {
    assert.equal(step.review, undefined);
    if (step.workflow) assert.equal(typeof workflows[step.workflow], 'function', step.workflow);
  }
});

test('unknown workflows fail instead of counting an empty run as passed', async () => {
  await assert.rejects(executeWorkflow('unknown', { evidence: [] }), /Unknown automated workflow/);
});

test('manual review steps cannot be registered as automated coverage', () => {
  assert.throws(() => validateCases([{ name: 'manual', steps: [
    { expect: { visible: true }, review: { instruction: 'Look', expected: 'Visible' } },
  ] }]), /manual|guided|review/i);
});

test('a human verdict cannot certify an automated result', () => {
  assert.equal(casePassed({ status: 'passed', mode: 'guided', steps: [
    { status: 'passed', review: { verdict: 'passed' } },
  ] }), false);
});

test('empty or untyped verdicts cannot certify automated execution', () => {
  for (const result of [
    { status: 'passed' },
    { status: 'passed', mode: 'automated', steps: [] },
    { status: 'passed', mode: 'manual', steps: [{ status: 'passed' }] },
    { status: 'passed', mode: 'automated', steps: [{ status: 'passed', assertions: [] }] },
  ]) assert.equal(casePassed(result), false);
  assert.equal(casePassed({ status: 'passed', mode: 'automated', steps: [{ status: 'passed', assertions: [{ status: 'passed' }] }] }), true);
});

test('a failed nested workflow assertion cannot be hidden by a passing step', () => {
  assert.equal(casePassed({ status: 'passed', mode: 'automated', steps: [
    { status: 'passed', assertions: [{ status: 'failed' }] },
  ] }), false);
});
