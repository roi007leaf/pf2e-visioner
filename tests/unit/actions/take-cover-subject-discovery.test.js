import { discoverTakeCoverSubjects } from '../../../scripts/chat/services/actions/TakeCover/take-cover-subject-discovery.js';

describe('take cover subject discovery', () => {
  function makeToken(id, type = 'character') {
    return { id, document: { id }, actor: { type } };
  }

  test('excludes actor token, loot, hazards, and filtered allies', () => {
    const actor = makeToken('actor');
    const observer = makeToken('observer');
    const ally = makeToken('ally');
    const shouldFilterAlly = jest.fn((_, token) => token === ally);

    const subjects = discoverTakeCoverSubjects(
      { actor },
      {
        tokens: [actor, observer, ally, makeToken('loot', 'loot'), makeToken('hazard', 'hazard')],
        shouldFilterAlly,
      },
    );

    expect(subjects).toEqual([observer]);
    expect(shouldFilterAlly).toHaveBeenCalledWith(actor, observer, 'enemies');
  });
});
