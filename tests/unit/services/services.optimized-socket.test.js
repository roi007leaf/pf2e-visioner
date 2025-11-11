/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('services/optimized-socket', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('schedules exactly one refresh via setTimeout', async () => {
    // Fake setTimeout
    const timeoutQueue = [];
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (cb, delay) => {
      timeoutQueue.push(cb);
      return 1;
    };

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

    // Flush setTimeout
    expect(timeoutQueue.length).toBe(1);
    await timeoutQueue.shift()();

    const { _socketService } = await import('../../../scripts/services/socket.js');
    expect(_socketService.executeForEveryone).toHaveBeenCalledWith('refresh');

    // Clean up
    global.setTimeout = origSetTimeout;
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
