import { CoverAdjustment } from '../../../scripts/rule-elements/operations/CoverAdjustment.js';

function makeToken(id) {
  const flags = { 'pf2e-visioner': {} };
  return {
    id,
    document: {
      id,
      flags,
      async setFlag(scope, key, value) { (flags[scope] ??= {})[key] = value; return value; },
      getFlag(scope, key) { return flags[scope]?.[key]; },
    },
  };
}

describe('CoverAdjustment storage', () => {
  test("direction 'to' stores adjustment on target keyed by subject id", async () => {
    const subject = makeToken('caster');
    const target = makeToken('foe');
    CoverAdjustment.getTargetTokens = () => [target];
    await CoverAdjustment.applyCoverAdjustment(
      { type: 'adjustCover', direction: 'to', targets: 'targeted', mode: 'bonus', amount: -2, scope: 'next-attack', source: 'phase-bolt', priority: 120 },
      subject,
      { item: { slug: 'phase-bolt' } },
    );
    const stored = target.document.getFlag('pf2e-visioner', 'coverAdjustments');
    expect(stored.caster).toEqual([
      { id: 'phase-bolt', priority: 120, mode: 'bonus', steps: undefined, amount: -2, scope: 'next-attack', predicate: undefined },
    ]);
  });

  test("direction 'from' stores adjustment on subject keyed by each target id", async () => {
    const subject = makeToken('target-creature');
    const observer = makeToken('pc');
    CoverAdjustment.getTargetTokens = () => [observer];
    await CoverAdjustment.applyCoverAdjustment(
      { type: 'adjustCover', direction: 'from', observers: 'all', mode: 'step', steps: -1, scope: 'while-active', source: 'shooting-star' },
      subject,
      { item: { slug: 'shooting-star' } },
    );
    expect(subject.document.getFlag('pf2e-visioner', 'coverAdjustments').pc[0]).toMatchObject({ id: 'shooting-star', mode: 'step', steps: -1, scope: 'while-active' });
  });

  test('getActiveCoverAdjustments + consume', async () => {
    const target = makeToken('foe');
    await target.document.setFlag('pf2e-visioner', 'coverAdjustments', { caster: [{ id: 'phase-bolt', scope: 'next-attack', mode: 'bonus', amount: -2 }] });
    const attacker = makeToken('caster');
    expect(CoverAdjustment.getActiveCoverAdjustments(attacker, target)).toHaveLength(1);
    await CoverAdjustment.consumeCoverAdjustment(target, 'caster', 'phase-bolt');
    expect(CoverAdjustment.getActiveCoverAdjustments(attacker, target)).toHaveLength(0);
  });

  test('removeCoverAdjustment clears only this rule element', async () => {
    const subject = makeToken('caster');
    const target = makeToken('foe');
    await target.document.setFlag('pf2e-visioner', 'coverAdjustments', { caster: [{ id: 'phase-bolt' }, { id: 'other' }] });
    CoverAdjustment.getTargetTokens = () => [target];
    await CoverAdjustment.removeCoverAdjustment({ direction: 'to', source: 'phase-bolt' }, subject, { item: { slug: 'phase-bolt' } });
    expect(target.document.getFlag('pf2e-visioner', 'coverAdjustments').caster).toEqual([{ id: 'other' }]);
  });
});
