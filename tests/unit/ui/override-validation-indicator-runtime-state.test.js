import { jest } from '@jest/globals';

describe('OverrideValidationIndicator runtime state integration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.body.innerHTML = '';
    global.game.user.isGM = true;
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/services/runtime-state.js');
  });

  test('openDialog records moved token through runtime-state helper', async () => {
    const setLastMovedTokenId = jest.fn();
    jest.doMock('../../../scripts/services/runtime-state.js', () => ({
      getLastMovedTokenId: jest.fn(() => null),
      setLastMovedTokenId,
    }));

    const { default: indicator } = await import(
      '../../../scripts/ui/OverrideValidationIndicator.js'
    );

    indicator.show(
      [
        {
          observerId: 'observer',
          targetId: 'target',
          observerName: 'Observer',
          targetName: 'Target',
          state: 'hidden',
          currentVisibility: 'observed',
          currentCover: 'none',
          expectedCover: 'none',
          source: 'manual_action',
        },
      ],
      'Target',
      'moved-token',
      { pulse: false },
    );

    await indicator.openDialog();

    expect(setLastMovedTokenId).toHaveBeenCalledWith('moved-token');
  });
});
