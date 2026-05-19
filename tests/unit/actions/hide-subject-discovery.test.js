import { discoverHideSubjects } from '../../../scripts/chat/services/actions/Hide/hide-subject-discovery.js';

describe('hide subject discovery', () => {
  function makeToken(id, type = 'character') {
    return {
      id,
      document: { id },
      actor: { id: `${id}-actor`, type },
    };
  }

  test('excludes actor token, loot, and hazards', () => {
    const actor = makeToken('actor');
    const observer = makeToken('observer');
    const loot = makeToken('loot', 'loot');
    const hazard = makeToken('hazard', 'hazard');

    const subjects = discoverHideSubjects(
      { actor, ignoreAllies: false },
      {
        tokens: [actor, observer, loot, hazard],
        shouldFilterAlly: jest.fn(() => false),
      },
    );

    expect(subjects).toEqual([observer]);
  });

  test('passes explicit ignoreAllies preference to ally filter', () => {
    const actor = makeToken('actor');
    const ally = makeToken('ally');
    const shouldFilterAlly = jest.fn(() => true);

    const subjects = discoverHideSubjects(
      { actor, ignoreAllies: true },
      {
        tokens: [ally],
        shouldFilterAlly,
      },
    );

    expect(subjects).toEqual([]);
    expect(shouldFilterAlly).toHaveBeenCalledWith(actor, ally, 'enemies', true);
  });
});
