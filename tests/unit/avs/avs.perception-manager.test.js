import '../../setup.js';

import * as socketSvc from '../../../scripts/services/socket.js';
import { OptimizedPerceptionManager } from '../../../scripts/visibility/auto-visibility/PerceptionManager.js';

describe('OptimizedPerceptionManager', () => {
    let mgr;
    beforeEach(() => {
        // spy on socket and canvas
        jest.spyOn(socketSvc, 'refreshEveryonesPerception');
        global.canvas.perception = { update: jest.fn() };
        // rAF immediate, but keep original to restore later
        global._origRAF = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        jest.useFakeTimers();
        mgr = OptimizedPerceptionManager.getInstance();
        mgr.cleanup();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        if (global._origRAF) {
            global.requestAnimationFrame = global._origRAF;
            delete global._origRAF;
        }
    });

    test('refreshPerception schedules once and executes', async () => {
        mgr.refreshPerception();
        mgr.refreshPerception(); // dedup
        expect(mgr.isRefreshScheduled()).toBe(true);
        // flush rAF then debounce inside refreshEveryonesPerception (100ms)
        jest.advanceTimersByTime(0);
        await Promise.resolve();
        jest.advanceTimersByTime(100);
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
        expect(mgr.getStatus()).toEqual({ refreshScheduled: true });
    });
});
