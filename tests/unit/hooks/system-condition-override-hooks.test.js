import {
  handleConditionItemChange,
  handleTokenCreatedForSystemConditions,
} from '../../../scripts/services/system-condition-overrides.js';

function conditionItem(slug, sceneTokens) {
  return { type: 'condition', slug, actor: { getActiveTokens: () => sceneTokens } };
}

describe('system-condition hook helpers', () => {
  test('handleConditionItemChange reconciles each scene token of a condition item', async () => {
    const calls = [];
    const t1 = { document: { id: 't1' }, actor: {} };
    const item = conditionItem('hidden', [t1]);
    await handleConditionItemChange(item, { sync: async (tok) => calls.push(tok.document.id) });
    expect(calls).toEqual(['t1']);
  });

  test('handleConditionItemChange ignores non-condition / non-matching items', async () => {
    const calls = [];
    const sync = async (tok) => calls.push(tok.document.id);
    await handleConditionItemChange({ type: 'effect', slug: 'hidden' }, { sync });
    await handleConditionItemChange(
      {
        type: 'condition',
        slug: 'off-guard',
        actor: { getActiveTokens: () => [{ document: { id: 'x' } }] },
      },
      { sync },
    );
    expect(calls).toEqual([]);
  });

  test('handleTokenCreatedForSystemConditions reconciles conditioned enemies of the new token', async () => {
    const calls = [];
    const newTok = { document: { id: 'new' }, actor: { alliance: 'party' } };
    const conditioned = { document: { id: 'foe' }, actor: { alliance: 'opposition' } };
    await handleTokenCreatedForSystemConditions(newTok, {
      getSceneTokens: () => [newTok, conditioned],
      strongestState: (actor) => (actor === conditioned.actor ? 'hidden' : null),
      isEnemyOf: (a, b) => a.document.id === 'foe' && b.document.id === 'new',
      sync: async (tok) => calls.push(tok.document.id),
    });
    expect(calls).toEqual(['foe']);
  });
});
