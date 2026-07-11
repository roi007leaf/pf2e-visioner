import { jest } from '@jest/globals';

describe('Reselecting an observer nudges core vision refresh for soundwave rings', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        delete global.__pf2eVisionerLifecycleBindings;
        delete global.__pf2eVisionerControlTokenSessions;
        jest.useFakeTimers();
        global.game.user.isGM = true;

        global.canvas.tokens.controlled = [];
        global.canvas.tokens.placeables = [];
        global.window.pf2eVisioner = {
            services: {
                autoVisibilitySystem: {
                    recalculateForTokens: jest.fn().mockResolvedValue(undefined),
                },
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    async function flushPending() {
        for (let i = 0; i < 5; i += 1) {
            jest.advanceTimersByTime(0);
            await Promise.resolve();
        }
    }

    test('reselecting the same unchanged observer schedules a refreshVision perception update', async () => {
        const perceptionUpdate = jest.fn();
        global.canvas.perception = { update: perceptionUpdate };

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);
        const trackerCb = controlTokenCbs.find((cb) =>
            String(cb).includes('trackControlTokenSession'),
        );
        const recalcCb = controlTokenCbs.find((cb) =>
            String(cb).includes('avsRecalculateOnControlToken') ||
            String(cb).includes('recalculateForTokens'),
        );

        const observer = { name: 'Lyra', document: { id: 'observer' } };

        global.canvas.tokens.controlled = [observer];
        trackerCb(observer, true);
        recalcCb(observer, true);
        await flushPending();
        perceptionUpdate.mockClear();

        global.canvas.tokens.controlled = [];
        trackerCb(observer, false);

        global.canvas.tokens.controlled = [observer];
        trackerCb(observer, true);
        recalcCb(observer, true);
        await flushPending();

        expect(perceptionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ refreshVision: true }),
        );
    });
});
