import { describe, expect, test } from '@jest/globals';
import { isScentBlocked } from '../../../../scripts/helpers/scent-wall-utils.js';
import { changeAffectsLineOfSight } from '../../../../scripts/visibility/auto-visibility/core/AvsInvalidationReasonRouter.js';

const observer = { center: { x: 0, y: 0 }, document: { elevation: 0 } };
const target = { center: { x: 100, y: 0 }, document: { elevation: 0 } };
const wall = (fields = {}) => ({ c: [50, -50, 50, 50], flags: { 'pf2e-visioner': { blocksScent: true } }, ...fields });

describe('independent scent wall restriction', () => {
  test('sight and sound restrictions alone do not block scent', () => {
    expect(isScentBlocked(observer, target, [wall({ flags: {}, sight: 20, sound: 20 })])).toBe(false);
  });
  test('scent blocks independently of sight and sound', () => {
    expect(isScentBlocked(observer, target, [wall({ sight: 0, sound: 0 })])).toBe(true);
  });
  test.each([0, 2])('closed or locked door blocks scent (%s)', (ds) => {
    expect(isScentBlocked(observer, target, [wall({ door: 1, ds })])).toBe(true);
  });
  test('open door allows scent', () => {
    expect(isScentBlocked(observer, target, [wall({ door: 1, ds: 1 })])).toBe(false);
  });
  test('wall outside the path does not block scent', () => {
    expect(isScentBlocked(observer, target, [wall({ c: [50, 20, 50, 50] })])).toBe(false);
  });
  test.each([
    { 'flags.pf2e-visioner.blocksScent': true },
    { 'flags.pf2e-visioner.blocksScent': false },
    { flags: { 'pf2e-visioner': { blocksScent: false } } },
    { flags: { 'pf2e-visioner': { '-=blocksScent': null } } },
  ])('scent restriction changes invalidate visibility: %j', (change) => {
    expect(changeAffectsLineOfSight(change)).toBe(true);
  });
});
