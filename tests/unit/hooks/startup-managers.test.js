import '../../setup.js';

import {
  initializeDeferredSeekManager,
  initializeTurnSneakTracker,
  registerEffectPerceptionHooks,
  registerTimedOverrideHooks,
} from '../../../scripts/hooks/startup-managers.js';

describe('startup manager hook helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('initializes the turn sneak tracker by loading its module', async () => {
    const loadTurnSneakTracker = jest.fn().mockResolvedValue({});

    const result = await initializeTurnSneakTracker({ loadTurnSneakTracker });

    expect(result).toEqual({ initialized: true });
    expect(loadTurnSneakTracker).toHaveBeenCalledTimes(1);
  });

  test('logs turn sneak tracker initialization failures without throwing', async () => {
    const failure = new Error('turn tracker failed');
    const error = jest.fn();

    const result = await initializeTurnSneakTracker({
      loadTurnSneakTracker: jest.fn().mockRejectedValue(failure),
      error,
    });

    expect(result).toEqual({ initialized: false, reason: 'error' });
    expect(error).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to initialize turn sneak tracker:',
      failure,
    );
  });

  test('initializes the deferred seek manager silently when loading succeeds', async () => {
    const initialize = jest.fn();

    const result = await initializeDeferredSeekManager({
      loadDeferredSeekManager: jest.fn().mockResolvedValue({ initialize }),
    });

    expect(result).toEqual({ initialized: true });
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  test('preserves silent deferred seek manager failures', async () => {
    const result = await initializeDeferredSeekManager({
      loadDeferredSeekManager: jest.fn().mockRejectedValue(new Error('deferred failed')),
    });

    expect(result).toEqual({ initialized: false, reason: 'error' });
  });

  test('registers timed override hooks and logs failures', async () => {
    const registerHooks = jest.fn();

    await expect(
      registerTimedOverrideHooks({
        loadTimedOverrideManager: jest.fn().mockResolvedValue({ registerHooks }),
      }),
    ).resolves.toEqual({ registered: true });
    expect(registerHooks).toHaveBeenCalledTimes(1);

    const failure = new Error('timed override failed');
    const error = jest.fn();
    await expect(
      registerTimedOverrideHooks({
        loadTimedOverrideManager: jest.fn().mockRejectedValue(failure),
        error,
      }),
    ).resolves.toEqual({ registered: false, reason: 'error' });
    expect(error).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to register timed override hooks:',
      failure,
    );
  });

  test('loads effect perception handlers before binding active effect hooks', async () => {
    const onCreateActiveEffect = jest.fn();
    const onUpdateActiveEffect = jest.fn();
    const onDeleteActiveEffect = jest.fn();
    const hooks = { on: jest.fn() };

    const result = await registerEffectPerceptionHooks({
      hooks,
      loadEffectPerceptionHooks: jest.fn().mockResolvedValue({
        onCreateActiveEffect,
        onUpdateActiveEffect,
        onDeleteActiveEffect,
      }),
    });

    expect(result).toEqual({ registered: true });
    expect(hooks.on).toHaveBeenCalledWith('createActiveEffect', onCreateActiveEffect);
    expect(hooks.on).toHaveBeenCalledWith('updateActiveEffect', onUpdateActiveEffect);
    expect(hooks.on).toHaveBeenCalledWith('deleteActiveEffect', onDeleteActiveEffect);
  });

  test('propagates effect perception loading failures as core registration failures', async () => {
    const failure = new Error('effect perception failed');

    await expect(
      registerEffectPerceptionHooks({
        loadEffectPerceptionHooks: jest.fn().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure);
  });
});
