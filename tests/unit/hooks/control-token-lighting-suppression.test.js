import { jest } from '@jest/globals';

function getControlTokenCallbacks() {
  return global.Hooks.on.mock.calls
    .filter((call) => call?.[0] === 'controlToken')
    .map((call) => call?.[1])
    .filter(Boolean);
}

describe('controlToken lighting refresh suppression', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    delete global.__pf2eVisionerLifecycleBindings;
    delete global.__pf2eVisionerControlTokenSessions;
    global.game.pf2eVisioner = {};
    global.game.user.isGM = true;
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lifecycle controlToken suppression clears through runtime-state semantics', async () => {
    const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
    await onCanvasReady();

    const restoreIndicatorsCb = getControlTokenCallbacks().find((callback) =>
      String(callback).includes('allowControlledFallback'),
    );

    expect(restoreIndicatorsCb).toBeTruthy();

    const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
    await restoreIndicatorsCb(token, true);

    expect(global.game.pf2eVisioner.suppressLightingRefresh).toBe(true);

    jest.advanceTimersByTime(50);

    expect(
      Object.prototype.hasOwnProperty.call(
        global.game.pf2eVisioner,
        'suppressLightingRefresh',
      ),
    ).toBe(false);
  });

  test('UI controlToken suppression clears through runtime-state semantics', async () => {
    const { registerUIHooks } = await import('../../../scripts/hooks/ui.js');
    registerUIHooks();

    const controlTokenCb = getControlTokenCallbacks().find((callback) =>
      String(callback).includes('refreshTokenTool'),
    );

    expect(controlTokenCb).toBeTruthy();

    const token = { document: { id: 'observer', getFlag: jest.fn(() => null) } };
    controlTokenCb(token, true);

    expect(global.game.pf2eVisioner.suppressLightingRefresh).toBe(true);

    jest.advanceTimersByTime(50);

    expect(
      Object.prototype.hasOwnProperty.call(
        global.game.pf2eVisioner,
        'suppressLightingRefresh',
      ),
    ).toBe(false);
  });
});
