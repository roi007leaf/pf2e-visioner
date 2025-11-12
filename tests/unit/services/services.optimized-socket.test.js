/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('services/optimized-socket', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('schedules exactly one refresh via keep-alive', async () => {
    jest.useFakeTimers();

    // Mock dependent modules
    jest.doMock('../../../scripts/services/socket.js', () => ({
      _socketService: { socket: true, executeForEveryone: jest.fn() },
      REFRESH_CHANNEL: 'refresh',
    }), { virtual: true });

    jest.doMock('../../../scripts/services/optimized-visual-effects.js', () => ({
      updateWallVisuals: jest.fn().mockResolvedValue(undefined),
    }), { virtual: true });

    const mod = await import('../../../scripts/services/optimized-socket.js');

    // Call twice quickly; should coalesce
    mod.refreshEveryonesPerceptionOptimized();
    mod.refreshEveryonesPerceptionOptimized();

    // Advance timers to trigger keep-alive execution
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    const { _socketService } = await import('../../../scripts/services/socket.js');
    expect(_socketService.executeForEveryone).toHaveBeenCalledWith('refresh');

    jest.useRealTimers();
  });

  test('force refresh bypasses scheduling and calls executeForEveryone', async () => {
    // Mock dependent modules
    jest.doMock('../../../scripts/services/socket.js', () => ({
      _socketService: { socket: true, executeForEveryone: jest.fn() },
      REFRESH_CHANNEL: 'refresh',
    }), { virtual: true });

    jest.doMock('../../../scripts/services/optimized-visual-effects.js', () => ({
      updateWallVisuals: jest.fn().mockResolvedValue(undefined),
    }), { virtual: true });

    const mod = await import('../../../scripts/services/optimized-socket.js');
    await mod.forceRefreshEveryonesPerception();

    const { _socketService } = await import('../../../scripts/services/socket.js');
    expect(_socketService.executeForEveryone).toHaveBeenCalledWith('refresh');
  });
});
