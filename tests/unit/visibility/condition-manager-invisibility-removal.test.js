import '../../setup.js';

import { ConditionManager } from '../../../scripts/visibility/auto-visibility/ConditionManager.js';

describe('ConditionManager invisibility removal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.game.user.isGM = true;
    global.canvas.perception = { update: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('forced invisibility removal clears flags even when actor condition state is stale', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn((slug) => slug === 'invisible'),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn((slug) => slug === 'invisible') },
    };
    const token = {
      id: 'token-1',
      name: 'Token 1',
      actor,
      document: {
        id: 'token-1',
        flags: {
          'pf2e-visioner': {
            invisibility: {
              observer: { previousState: 'hidden', establishedState: 'hidden' },
            },
          },
        },
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };

    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [token];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: false,
    });

    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility');
    expect(global.canvas.perception.update).toHaveBeenCalled();
  });
});
