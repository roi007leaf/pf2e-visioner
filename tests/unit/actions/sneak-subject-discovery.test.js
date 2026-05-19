import { discoverSneakSubjects } from '../../../scripts/chat/services/actions/Sneak/sneak-subject-discovery.js';

describe('sneak subject discovery', () => {
  function makeToken(id, type = 'character') {
    return {
      id,
      document: { id },
      actor: { id: `${id}-actor`, type },
    };
  }

  test('excludes the sneaking token and non-observer actor types', () => {
    const actor = makeToken('sneak');
    const observer = makeToken('observer');
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');

    const subjects = discoverSneakSubjects(
      { actor },
      {
        tokens: [actor, observer, loot, hazard],
        getSneakingToken: jest.fn(() => actor),
        getSetting: jest.fn(() => false),
        shouldFilterAlly: jest.fn(() => false),
      },
    );

    expect(subjects).toEqual([observer]);
  });

  test('uses explicit ignoreAllies preference before global setting', () => {
    const actor = makeToken('sneak');
    const ally = makeToken('ally');
    const shouldFilterAlly = jest.fn(() => true);
    const getSetting = jest.fn(() => false);

    const subjects = discoverSneakSubjects(
      { actor, ignoreAllies: true },
      {
        tokens: [ally],
        getSneakingToken: jest.fn(() => actor),
        getSetting,
        shouldFilterAlly,
      },
    );

    expect(subjects).toEqual([]);
    expect(shouldFilterAlly).toHaveBeenCalledWith(actor, ally, 'enemies', true);
    expect(getSetting).not.toHaveBeenCalled();
  });
});
