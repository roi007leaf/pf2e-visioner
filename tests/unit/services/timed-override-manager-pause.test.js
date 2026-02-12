import '../../setup.js';

import { TimedOverrideManager } from '../../../scripts/services/TimedOverrideManager.js';

describe('TimedOverrideManager pause handling', () => {
  test('realtime timers freeze during pause (expiresAt shifted on resume)', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    global.game.i18n.format.mockImplementation((key, data = {}) => {
      if (key === 'PF2E_VISIONER.TIMED_OVERRIDE.TIME_REMAINING') return data.time;
      return key;
    });

    const observerId = 'observer-1';
    const targetId = 'target-1';
    const originalExpiresAt = now + 10_000;

    const target = createMockToken({
      id: targetId,
      actor: createMockActor({ type: 'npc' }),
      flags: {
        'pf2e-visioner': {
          [`avs-override-from-${observerId}`]: {
            timedOverride: { type: 'realtime', expiresAt: originalExpiresAt },
          },
        },
      },
    });

    global.canvas.tokens.placeables = [target];

    global.game.paused = false;
    const d1 = TimedOverrideManager.getRemainingTimeDisplay(
      TimedOverrideManager.getTimerData(observerId, targetId),
    );
    expect(d1).toBe('10s');

    global.game.paused = true;
    await TimedOverrideManager.handlePauseGame(true);
    now += 5_000;

    const d2 = TimedOverrideManager.getRemainingTimeDisplay(
      TimedOverrideManager.getTimerData(observerId, targetId),
    );
    expect(d2).toBe('10s');

    global.game.paused = false;
    await TimedOverrideManager.handlePauseGame(false);

    const shifted = TimedOverrideManager.getTimerData(observerId, targetId);
    expect(shifted.expiresAt).toBe(originalExpiresAt + 5_000);

    const d3 = TimedOverrideManager.getRemainingTimeDisplay(shifted);
    expect(d3).toBe('10s');

    now += 1_000;
    const d4 = TimedOverrideManager.getRemainingTimeDisplay(
      TimedOverrideManager.getTimerData(observerId, targetId),
    );
    expect(d4).toBe('9s');
  });
});
