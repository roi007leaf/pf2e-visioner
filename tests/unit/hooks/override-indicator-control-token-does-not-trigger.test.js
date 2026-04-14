import { jest } from '@jest/globals';

describe('Override indicator should not trigger on controlToken', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        delete global.__pf2eVisionerLifecycleBindings;
        delete global.__pf2eVisionerControlTokenSessions;
        document.body.innerHTML = '';
        jest.useFakeTimers();
        global.game.user.isGM = true;

        global.canvas.tokens.controlled = [];
        global.canvas.tokens.placeables = [];
        global.window.pf2eVisioner = {
            services: {
                autoVisibilitySystem: {
                    recalculateForTokens: jest.fn(),
                },
            },
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('controlToken hook does not create indicator when queue empty', async () => {
        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);

        const overrideIndicatorCb = controlTokenCbs.find((cb) =>
            String(cb).includes("../ui/OverrideValidationIndicator.js"),
        );

        expect(overrideIndicatorCb).toBeTruthy();

        await overrideIndicatorCb({ id: 't1' }, true);

        expect(document.querySelector('.pf2e-visioner-override-indicator')).toBeNull();
    });

    test('onCanvasReady does not duplicate singleton hook registrations', async () => {
        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();
        const firstControlHookCount = global.Hooks.on.mock.calls.filter((c) => c?.[0] === 'controlToken').length;

        await onCanvasReady();
        const secondControlHookCount = global.Hooks.on.mock.calls.filter((c) => c?.[0] === 'controlToken').length;

        expect(firstControlHookCount).toBeGreaterThan(0);
        expect(secondControlHookCount).toBe(firstControlHookCount);
    });

    test('controlToken schedules AVS recalculation for the controlled token', async () => {
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

        expect(trackerCb).toBeTruthy();
        const token = { document: { id: 't1' } };
        global.canvas.tokens.controlled = [token];

        trackerCb(token, true);
        recalcCb(token, true);
        jest.advanceTimersByTime(100);

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledWith(['t1']);
    });

    test('controlToken clears stale AVS recalculation when control is removed', async () => {
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

        expect(trackerCb).toBeTruthy();
        expect(recalcCb).toBeTruthy();

        const token = { document: { id: 't1' } };

        global.canvas.tokens.controlled = [token];
        trackerCb(token, true);
        recalcCb(token, true);

        global.canvas.tokens.controlled = [];
        trackerCb(token, false);
        recalcCb(token, false);

        jest.advanceTimersByTime(100);

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .not.toHaveBeenCalled();
    });

    test('controlToken only keeps the latest queued recalculation across token switches', async () => {
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

        expect(trackerCb).toBeTruthy();
        expect(recalcCb).toBeTruthy();

        const tokenA = { document: { id: 't1' } };
        const tokenB = { document: { id: 't2' } };

        global.canvas.tokens.controlled = [tokenA];
        trackerCb(tokenA, true);
        recalcCb(tokenA, true);

        global.canvas.tokens.controlled = [tokenB];
        trackerCb(tokenB, true);
        recalcCb(tokenB, true);

        jest.advanceTimersByTime(100);

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledTimes(1);
        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledWith(['t2']);
    });
});
