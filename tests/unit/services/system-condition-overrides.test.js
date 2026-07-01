import {
  CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE,
  SYSTEM_CONDITION_OVERRIDE_SOURCE,
  isSystemConditionSlug,
  removableSystemConditionItems,
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

describe('removableSystemConditionItems', () => {
  test('includes standalone system conditions, excludes granted and non-system', () => {
    const actorWith = {
      itemTypes: {
        condition: [
          { slug: 'undetected' },
          { slug: 'hidden', grantedBy: { id: 'effect' } },
          { slug: 'off-guard' },
          { slug: 'concealed', flags: { pf2e: { grantedBy: { id: 'x' } } } },
        ],
      },
    };
    expect(removableSystemConditionItems(actorWith).map((c) => c.slug)).toEqual(['undetected']);
  });
});

function makeConsumeDeps(overrides = {}) {
  const applied = [];
  const removedOverrides = [];
  const removedConditions = [];
  return {
    state: { applied, removedOverrides, removedConditions },
    deps: {
      isEnabled: () => true,
      getOverrideData: jest.fn(async () => null),
      applyOverride: jest.fn(async (o, t, s, src) =>
        applied.push([o.document.id, t.document.id, s, src]),
      ),
      removeOverride: jest.fn(async (oId, tId) => removedOverrides.push([oId, tId])),
      resolveEnemies: () => [obs('pc1')],
      strongestState: () => 'undetected',
      getRemovableConditions: () => [{ slug: 'undetected' }],
      removeConditions: jest.fn(async (conds) =>
        removedConditions.push(...conds.map((c) => c.slug)),
      ),
      ...overrides,
    },
  };
}

describe('syncSystemConditionOverridesForToken condition consumption', () => {
  test('standalone condition → converts to a permanent override and removes the condition', async () => {
    const { state, deps } = makeConsumeDeps();
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([
      ['pc1', 't', 'undetected', CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE],
    ]);
    expect(state.removedConditions).toEqual(['undetected']);
  });

  test('effect-granted only (nothing removable) → transient source, condition kept', async () => {
    const { state, deps } = makeConsumeDeps({ getRemovableConditions: () => [] });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([['pc1', 't', 'undetected', SYSTEM_CONDITION_OVERRIDE_SOURCE]]);
    expect(state.removedConditions).toEqual([]);
  });

  test('no enemies → condition is not consumed', async () => {
    const { state, deps } = makeConsumeDeps({ resolveEnemies: () => [] });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.removedConditions).toEqual([]);
  });

  test('all enemies already carry a manual override → condition kept', async () => {
    const { state, deps } = makeConsumeDeps({
      getOverrideData: jest.fn(async () => ({ source: 'manual_action', state: 'observed' })),
    });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.applied).toEqual([]);
    expect(state.removedConditions).toEqual([]);
  });

  test('converted override is not reverted once the condition is gone (no revert loop)', async () => {
    const { state, deps } = makeConsumeDeps({
      strongestState: () => null,
      getRemovableConditions: () => [],
      getOverrideData: jest.fn(async () => ({
        source: CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE,
        state: 'undetected',
      })),
    });
    await syncSystemConditionOverridesForToken(tgt(), deps);
    expect(state.removedOverrides).toEqual([]);
    expect(state.removedConditions).toEqual([]);
  });
});
