import {
  discoverDiversionSubjects,
  resolveTargetedDiversionBeneficiary,
} from '../../../scripts/chat/services/actions/Diversion/diversion-subject-discovery.js';

describe('diversion subject discovery', () => {
  function makeToken(id, type = 'character') {
    return { id, document: { id }, actor: { type } };
  }

  test('excludes actor token, loot, and hazards', () => {
    const actor = makeToken('actor');
    const observer = makeToken('observer');

    const subjects = discoverDiversionSubjects(
      { actor, ignoreAllies: false },
      {
        tokens: [actor, observer, makeToken('loot', 'loot'), makeToken('hazard', 'hazard')],
        shouldFilterAlly: jest.fn(() => false),
      },
    );

    expect(subjects).toEqual([observer]);
  });

  test('passes explicit ignoreAllies preference through', () => {
    const actor = makeToken('actor');
    const ally = makeToken('ally');
    const shouldFilterAlly = jest.fn(() => true);

    const subjects = discoverDiversionSubjects(
      { actor, ignoreAllies: true },
      { tokens: [ally], shouldFilterAlly },
    );

    expect(subjects).toEqual([]);
    expect(shouldFilterAlly).toHaveBeenCalledWith(actor, ally, 'enemies', true);
  });

  test('excludes both performer and chosen Distracting Performance beneficiary', () => {
    const performer = makeToken('performer');
    const beneficiary = makeToken('beneficiary');
    const observer = makeToken('observer');

    const subjects = discoverDiversionSubjects(
      { actor: performer, diversionTarget: beneficiary, ignoreAllies: false },
      {
        tokens: [performer, beneficiary, observer],
        shouldFilterAlly: jest.fn(() => false),
      },
    );

    expect(subjects).toEqual([observer]);
  });

  test('uses exactly one targeted ally as Distracting Performance beneficiary', () => {
    const performer = makeToken('performer');
    const ally = makeToken('ally');
    const enemy = makeToken('enemy');
    const shouldFilterAlly = jest.fn((actor, token) => token === enemy);

    expect(
      resolveTargetedDiversionBeneficiary(performer, new Set([ally, enemy]), {
        shouldFilterAlly,
      }),
    ).toBe(ally);
    expect(shouldFilterAlly).toHaveBeenCalledWith(performer, ally, 'allies', true);
  });

  test('returns no beneficiary when multiple allies are targeted', () => {
    const performer = makeToken('performer');
    const allyA = makeToken('ally-a');
    const allyB = makeToken('ally-b');

    expect(
      resolveTargetedDiversionBeneficiary(performer, [allyA, allyB], {
        shouldFilterAlly: jest.fn(() => false),
      }),
    ).toBeNull();
  });
});
