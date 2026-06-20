import { discoverPointOutSubjects } from '../../../scripts/chat/services/actions/PointOut/point-out-subject-discovery.js';

describe('point out subject discovery', () => {
  function makeToken(id, disposition = 1, type = 'character') {
    return {
      id,
      document: { id, disposition },
      actor: { type },
    };
  }

  test('returns same-disposition allies that cannot see target', async () => {
    const pointer = makeToken('pointer', 1);
    const allyHidden = makeToken('ally-hidden', 1);
    const allyObserved = makeToken('ally-observed', 1);
    const enemy = makeToken('enemy', -1);
    const target = makeToken('target', -1);

    const result = await discoverPointOutSubjects(
      { actor: pointer },
      {
        target,
        canvasTokens: {
          placeables: [pointer, allyHidden, allyObserved, enemy],
        },
        getVisibilityBetween: jest.fn((ally) =>
          ally === allyHidden ? 'hidden' : 'observed',
        ),
      },
    );

    expect(result).toEqual([{ ally: allyHidden, target, currentVisibility: 'hidden' }]);
  });

  test('resolves target from visioner point-out flag', async () => {
    const pointer = makeToken('pointer', 1);
    const ally = makeToken('ally', 1);
    const target = makeToken('target', -1);
    const tokenMap = new Map([['target', target]]);

    const result = await discoverPointOutSubjects(
      { actor: pointer, messageId: 'message' },
      {
        message: {
          flags: {
            'pf2e-visioner': {
              pointOut: { targetTokenId: 'target' },
            },
          },
        },
        canvasTokens: {
          get: (id) => tokenMap.get(id),
          placeables: [pointer, ally],
        },
        user: { targets: new Set() },
        getVisibilityBetween: jest.fn(() => 'undetected'),
      },
    );

    expect(result).toEqual([{ ally, target, currentVisibility: 'undetected' }]);
  });
});
