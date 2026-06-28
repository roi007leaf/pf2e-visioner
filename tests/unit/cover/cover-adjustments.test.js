import { adjustCoverState, applyCoverAdjustments } from '../../../scripts/cover/cover-adjustments.js';

describe('adjustCoverState', () => {
  test('step -1 walks down the ladder and clamps at none', () => {
    expect(adjustCoverState('greater', { mode: 'step', steps: -1 })).toBe('standard');
    expect(adjustCoverState('standard', { mode: 'step', steps: -1 })).toBe('lesser');
    expect(adjustCoverState('lesser', { mode: 'step', steps: -1 })).toBe('none');
    expect(adjustCoverState('none', { mode: 'step', steps: -1 })).toBe('none');
  });
  test('bonus -2 maps via AC bonus', () => {
    expect(adjustCoverState('greater', { mode: 'bonus', amount: -2 })).toBe('standard');
    expect(adjustCoverState('standard', { mode: 'bonus', amount: -2 })).toBe('none');
    expect(adjustCoverState('lesser', { mode: 'bonus', amount: -2 })).toBe('none');
    expect(adjustCoverState('none', { mode: 'bonus', amount: -2 })).toBe('none');
  });
  test('unknown mode is a no-op', () => {
    expect(adjustCoverState('standard', { mode: 'wat' })).toBe('standard');
  });
});

describe('applyCoverAdjustments', () => {
  const ro = ['item:slug:shooting-star'];
  test('stacks cumulatively, highest priority first, returns applied ids', () => {
    const adjustments = [
      { id: 'a', priority: 100, mode: 'step', steps: -1 },
      { id: 'b', priority: 200, mode: 'step', steps: -1 },
    ];
    expect(applyCoverAdjustments('greater', adjustments, ro)).toEqual({ state: 'lesser', applied: ['b', 'a'] });
  });
  test('skips adjustments whose predicate fails', () => {
    const adjustments = [{ id: 'a', priority: 100, mode: 'step', steps: -1, predicate: ['item:slug:phase-bolt'] }];
    expect(applyCoverAdjustments('standard', adjustments, ro)).toEqual({ state: 'standard', applied: [] });
  });
  test('applies adjustment whose predicate matches', () => {
    const adjustments = [{ id: 'a', priority: 100, mode: 'step', steps: -1, predicate: ['item:slug:shooting-star'] }];
    expect(applyCoverAdjustments('standard', adjustments, ro)).toEqual({ state: 'lesser', applied: ['a'] });
  });
});
