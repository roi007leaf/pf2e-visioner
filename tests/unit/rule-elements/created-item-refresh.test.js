import { applyPlayerCreatedVisionerRules } from '../../../scripts/rule-elements/created-item-refresh.js';

test('active GM applies every player-created rule sequentially before turn advance', async () => {
  const calls = [];
  const rules = ['to', 'from'].map((direction) => ({
    key: 'PF2eVisionerEffect',
    applyOperations: jest.fn(async (options) => {
      calls.push(direction + '-start');
      await Promise.resolve();
      calls.push(direction + '-end');
      expect(options.triggerRecalculation).toBe(true);
    }),
  }));
  expect(
    await applyPlayerCreatedVisionerRules({ parent: {}, rules }, 'player', {
      isGM: () => true,
      isOriginGM: () => false,
    }),
  ).toBe(true);
  expect(calls).toEqual(['to-start', 'to-end', 'from-start', 'from-end']);
});

test('player and secondary GM clients do not duplicate scene writes; GM origins keep native handling', async () => {
  const applyOperations = jest.fn();
  const item = { parent: {}, rules: [{ key: 'PF2eVisionerEffect', applyOperations }] };
  expect(await applyPlayerCreatedVisionerRules(item, 'player', { isGM: () => false })).toBe(false);
  expect(
    await applyPlayerCreatedVisionerRules(item, 'gm', { isGM: () => true, isOriginGM: () => true }),
  ).toBe(false);
  expect(
    await applyPlayerCreatedVisionerRules({ ...item, parent: null }, 'player', {
      isGM: () => true,
    }),
  ).toBe(false);
  expect(applyOperations).not.toHaveBeenCalled();
});
