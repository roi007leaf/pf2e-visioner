import {
  DiversionActionHandler,
  getDiversionBeneficiary,
  getDiversionResultVisibility,
} from '../../../scripts/chat/services/actions/DiversionAction.js';

describe('Distracting Performance diversion beneficiary', () => {
  beforeEach(() => {
    global.game = { user: { targets: new Set() } };
  });

  test('defaults to performer and prefers explicitly chosen ally', () => {
    const performer = { id: 'performer' };
    const ally = { id: 'ally' };

    expect(getDiversionBeneficiary({ actor: performer })).toBe(performer);
    expect(getDiversionBeneficiary({ actor: performer, diversionTarget: ally })).toBe(ally);
  });

  test('applies visibility result to chosen ally while retaining enemy observer', () => {
    const handler = new DiversionActionHandler();
    const performer = { id: 'performer' };
    const ally = { id: 'ally' };
    const enemy = { id: 'enemy' };

    const change = handler.outcomeToChange(
      { actor: performer, diversionTarget: ally },
      { observer: enemy, currentVisibility: 'observed', newVisibility: 'hidden' },
    );

    expect(change).toMatchObject({
      observer: enemy,
      target: ally,
      oldVisibility: 'observed',
      newVisibility: 'hidden',
    });
  });

  test('only transfers successful-check benefits to ally', () => {
    const performer = { id: 'performer' };
    const ally = { id: 'ally' };
    const actionData = { actor: performer, diversionTarget: ally };

    expect(getDiversionResultVisibility(actionData, 'observed', 'success', 'hidden')).toBe(
      'hidden',
    );
    expect(getDiversionResultVisibility(actionData, 'hidden', 'failure', 'observed')).toBe(
      'hidden',
    );
    expect(
      getDiversionResultVisibility(actionData, 'undetected', 'critical-failure', 'observed'),
    ).toBe('undetected');
  });

  test('keeps normal failure mapping when performer benefits', () => {
    const performer = { id: 'performer' };

    expect(
      getDiversionResultVisibility({ actor: performer }, 'hidden', 'failure', 'observed'),
    ).toBe('observed');
  });

  test('stores beneficiary id so later revert does not fall back to performer', () => {
    const handler = new DiversionActionHandler();
    const entry = handler.buildCacheEntryFromChange({
      observer: { id: 'enemy' },
      target: { id: 'ally' },
      oldVisibility: 'observed',
    });

    expect(entry).toEqual({
      observerId: 'enemy',
      targetId: 'ally',
      oldVisibility: 'observed',
    });
  });

  test('captures single targeted ally before direct apply or preview', async () => {
    const performer = {
      id: 'performer',
      actor: {
        alliance: 'party',
        items: [{ type: 'feat', system: { slug: 'distracting-performance' } }],
      },
      document: { disposition: 1 },
    };
    const ally = {
      id: 'ally',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1, hidden: false },
    };
    game.user.targets = new Set([ally]);
    const actionData = { actor: performer, roll: { total: 20 } };

    await new DiversionActionHandler().ensurePrerequisites(actionData);

    expect(actionData.diversionTarget).toBe(ally);
  });

  test('falls back to performer without exactly one targeted ally', async () => {
    const performer = {
      id: 'performer',
      actor: {
        alliance: 'party',
        items: [{ type: 'feat', system: { slug: 'distracting-performance' } }],
      },
      document: { disposition: 1 },
    };
    const allyA = {
      id: 'ally-a',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1, hidden: false },
    };
    const allyB = {
      id: 'ally-b',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1, hidden: false },
    };
    game.user.targets = new Set([allyA, allyB]);
    const actionData = { actor: performer, roll: { total: 20 } };

    await new DiversionActionHandler().ensurePrerequisites(actionData);

    expect(actionData.diversionTarget).toBe(performer);
  });
});
