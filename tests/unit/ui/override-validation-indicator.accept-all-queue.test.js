describe('OverrideValidationIndicator bulk acceptance', () => {
  let indicator;
  let removeOverride;
  let recalculateAll;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '';

    removeOverride = jest.fn(async () => true);
    recalculateAll = jest.fn(async () => undefined);
    jest.doMock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
      __esModule: true,
      default: { removeOverride },
    }));
    jest.doMock('../../../scripts/api.js', () => ({
      __esModule: true,
      autoVisibility: { recalculateAll },
      api: {
        updateTokenVisuals: jest.fn(async () => undefined),
        refreshEveryonesPerception: jest.fn(),
      },
    }));

    global.game.user = { isGM: true };
    global.game.settings.get = jest.fn(() => false);
    global.game.i18n.format = jest.fn((key) => key);
    global.game.i18n.localize = jest.fn((key) => key);
    global.ui.windows = {};
    global.ui.notifications = { info: jest.fn(), error: jest.fn() };
    global.canvas.tokens.get = jest.fn(() => ({
      document: { getFlag: jest.fn(() => false) },
    }));

    const { OverrideValidationIndicator } = await import(
      '../../../scripts/ui/OverrideValidationIndicator.js'
    );
    indicator = new OverrideValidationIndicator();
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/chat/services/infra/AvsOverrideManager.js');
    jest.dontMock('../../../scripts/api.js');
    document.body.innerHTML = '';
  });

  test('accepts every queued token in one transaction and leaves indicator drained', async () => {
    const first = {
      observerId: 'observer-1',
      targetId: 'target-1',
      state: 'hidden',
      currentVisibility: 'observed',
      expectedCover: 'none',
      currentCover: 'none',
      source: 'manual_action',
    };
    const second = {
      observerId: 'observer-2',
      targetId: 'target-2',
      state: 'undetected',
      currentVisibility: 'observed',
      expectedCover: 'none',
      currentCover: 'none',
      source: 'manual_action',
    };

    indicator.show([first], 'First', 'mover-1');
    indicator.show([second], 'Second', 'mover-2');

    await indicator.clearAll();

    expect(removeOverride).toHaveBeenCalledTimes(2);
    expect(removeOverride).toHaveBeenCalledWith(
      first.observerId,
      first.targetId,
      expect.objectContaining({ deferAvsRefresh: true }),
    );
    expect(removeOverride).toHaveBeenCalledWith(
      second.observerId,
      second.targetId,
      expect.objectContaining({ deferAvsRefresh: true }),
    );
    expect(recalculateAll).toHaveBeenCalledTimes(1);
    expect(indicator.hasQueuedTokens()).toBe(false);
  });
});
