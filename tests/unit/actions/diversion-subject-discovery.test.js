import { discoverDiversionSubjects } from '../../../scripts/chat/services/actions/Diversion/diversion-subject-discovery.js';

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
});
