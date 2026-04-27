import '../../setup.js';

describe('Logger settings cache', () => {
  let getLogger;

  beforeEach(async () => {
    jest.resetModules();
    const mod = await import('../../../scripts/utils/logger.js');
    getLogger = mod.getLogger;
  });

  test('reads settings once and caches for subsequent calls', () => {
    game.settings.get.mockClear();

    const log = getLogger('AVS');
    log.enabled();
    log.enabled();
    log.enabled();

    const debugCalls = game.settings.get.mock.calls.filter(
      ([, key]) => key === 'autoVisibilityDebugMode' || key === 'debug'
    );
    expect(debugCalls.length).toBe(2);
  });

  test('does not re-read settings on different scope', () => {
    game.settings.get.mockClear();

    const avsLog = getLogger('AVS');
    const globalLog = getLogger('SomeScope');
    avsLog.enabled();
    globalLog.enabled();
    globalLog.enabled();

    const debugCalls = game.settings.get.mock.calls.filter(
      ([, key]) => key === 'autoVisibilityDebugMode' || key === 'debug'
    );
    expect(debugCalls.length).toBe(2);
  });

  test('returns correct value per scope', () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityDebugMode', true);
    game.settings.set('pf2e-visioner', 'debug', false);

    const avsLog = getLogger('AVS');
    const globalLog = getLogger('SomeScope');

    expect(avsLog.enabled()).toBe(true);
    expect(globalLog.enabled()).toBe(false);
  });

  test('does not print lazy function source when payload evaluation fails', () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityDebugMode', true);
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => { });

    const log = getLogger('AVS');
    const badPayload = () => {
      throw new Error('payload failed');
    };
    log.debug(badPayload);

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('PF2E Visioner [AVS]'),
      expect.objectContaining({
        msg: 'logger-lazy-payload-error',
        error: 'payload failed',
      }),
    );
    expect(debugSpy.mock.calls[0]).not.toContain(badPayload);
  });
});
