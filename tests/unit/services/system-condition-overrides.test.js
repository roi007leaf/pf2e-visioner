import {
  SYSTEM_CONDITION_OVERRIDE_SOURCE,
  isSystemConditionSlug,
  strongestSystemConditionState,
  resolveEnemyObservers,
  syncSystemConditionOverridesForToken,
} from '../../../scripts/services/system-condition-overrides.js';

function actor(conditionSlugs = [], alliance = 'opposition') {
  return { alliance, itemTypes: { condition: conditionSlugs.map((slug) => ({ slug })) } };
}
function tok(id, alliance, disposition = 0, conditions = []) {
  return { document: { id, disposition }, actor: actor(conditions, alliance) };
}

describe('system-condition-overrides helpers', () => {
  test('source constant', () => {
    expect(SYSTEM_CONDITION_OVERRIDE_SOURCE).toBe('system-condition');
  });

  test('isSystemConditionSlug matches the three conditions only', () => {
    expect(isSystemConditionSlug('hidden')).toBe(true);
    expect(isSystemConditionSlug('concealed')).toBe(true);
    expect(isSystemConditionSlug('undetected')).toBe(true);
    expect(isSystemConditionSlug('off-guard')).toBe(false);
    expect(isSystemConditionSlug('')).toBe(false);
  });

  test('strongestSystemConditionState picks undetected > hidden > concealed', () => {
    expect(strongestSystemConditionState(actor(['concealed', 'undetected']))).toBe('undetected');
    expect(strongestSystemConditionState(actor(['concealed', 'hidden']))).toBe('hidden');
    expect(strongestSystemConditionState(actor(['concealed']))).toBe('concealed');
    expect(strongestSystemConditionState(actor([]))).toBeNull();
  });

  test('resolveEnemyObservers returns opposite-alliance tokens, excluding self', () => {
    const target = tok('t', 'opposition');
    const pc = tok('pc', 'party');
    const ally = tok('npc2', 'opposition');
    const enemies = resolveEnemyObservers(target, [target, pc, ally]);
    expect(enemies.map((e) => e.document.id)).toEqual(['pc']);
  });

  test('resolveEnemyObservers falls back to disposition when alliance is null', () => {
    const target = tok('t', null, -1);
    const foe = tok('foe', null, 1);
    const friend = tok('friend', null, -1);
    const enemies = resolveEnemyObservers(target, [target, foe, friend]);
    expect(enemies.map((e) => e.document.id)).toEqual(['foe']);
  });
});

function tgt(id = 't') {
  return { document: { id, disposition: -1 }, actor: { alliance: 'opposition', itemTypes: { condition: [] } } };
}
function obs(id) {
  return { document: { id, disposition: 1 }, actor: { alliance: 'party', itemTypes: { condition: [] } } };
}

function makeDeps(overrides = {}) {
  const applied = [];
  const removed = [];
  return {
    state: { applied, removed },
    deps: {
      isEnabled: () => true,
      getOverrideData: jest.fn(async () => null),
      applyOverride: jest.fn(async (o, t, s) => applied.push([o.document.id, t.document.id, s])),
      removeOverride: jest.fn(async (oId, tId) => removed.push([oId, tId])),
      resolveEnemies: () => [obs('pc1'), obs('pc2')],
      strongestState: () => 'hidden',
      ...overrides,
    },
  };
}

describe('syncSystemConditionOverridesForToken', () => {
  test('setting off → no writes', async () => {
    const { state, deps } = makeDeps({ isEnabled: () => false, strongestState: () => 'hidden' });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([]);
    expect(state.removed).toEqual([]);
  });

  test('condition present → applies state to each enemy', async () => {
    const { state, deps } = makeDeps();
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([
      ['pc1', 't', 'hidden'],
      ['pc2', 't', 'hidden'],
    ]);
  });

  test('skips a pair that already has a manual override', async () => {
    const { state, deps } = makeDeps({
      getOverrideData: jest.fn(async (o) =>
        o.document.id === 'pc1' ? { source: 'manual_action', state: 'observed' } : null,
      ),
    });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([['pc2', 't', 'hidden']]);
  });

  test('no condition → clears only system-condition overrides', async () => {
    const { state, deps } = makeDeps({
      strongestState: () => null,
      getOverrideData: jest.fn(async (o) =>
        o.document.id === 'pc1'
          ? { source: 'system-condition', state: 'hidden' }
          : { source: 'manual_action', state: 'hidden' },
      ),
    });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([]);
    expect(state.removed).toEqual([['pc1', 't']]);
  });
});
