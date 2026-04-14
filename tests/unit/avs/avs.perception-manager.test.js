import '../../setup.js';

import * as socketSvc from '../../../scripts/services/socket.js';
import { OptimizedPerceptionManager } from '../../../scripts/visibility/auto-visibility/PerceptionManager.js';

describe('OptimizedPerceptionManager', () => {
    let mgr;
    beforeEach(() => {
        // spy on socket and canvas
        jest.spyOn(socketSvc, 'refreshEveryonesPerception');
        global.canvas.perception = { update: jest.fn() };
        jest.useFakeTimers();
        mgr = OptimizedPerceptionManager.getInstance();
        mgr.cleanup();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('refreshPerception schedules once and executes', async () => {
        mgr.refreshPerception();
        mgr.refreshPerception(); // dedup
        // The keep-alive system executes immediately, so advance timers and check
        jest.advanceTimersByTime(100); // Keep-alive poll interval
        await Promise.resolve();
        jest.advanceTimersByTime(100); // Debounce inside refreshEveryonesPerception
        await Promise.resolve();
        expect(socketSvc.refreshEveryonesPerception).toHaveBeenCalled();
        expect(global.canvas.perception.update).toHaveBeenCalledWith({
            refreshVision: true,
            refreshLighting: false,
            refreshOcclusion: true,
        });
        expect(mgr.isRefreshScheduled()).toBe(false);
    });

    test('forceRefreshPerception calls immediately and clears scheduled flag', () => {
        mgr.refreshPerception();
        mgr.forceRefreshPerception();
        expect(mgr.isRefreshScheduled()).toBe(false);
        expect(socketSvc.refreshEveryonesPerception).toHaveBeenCalled();
        expect(global.canvas.perception.update).toHaveBeenCalled();
    });

    test('getStatus returns flag state', () => {
        expect(mgr.getStatus()).toEqual({ refreshScheduled: false });
        mgr.refreshPerception();
        // After refresh executes immediately via keep-alive, the flag is cleared
        jest.advanceTimersByTime(100);
        expect(mgr.getStatus()).toEqual({ refreshScheduled: false });
    });
});
