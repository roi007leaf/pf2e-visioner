import { jest } from '@jest/globals';

describe('Override indicator should not trigger on controlToken', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.unmock('../../../scripts/services/PendingMovement/pending-token-movement.js');
        jest.unmock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js');
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

    test('canvas pointerdown primes selected token movement intent before Foundry drag starts', async () => {
        const primePendingControlledTokenDragIntent = jest.fn();
        const releasePendingControlledTokenDragIntent = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals: jest.fn(),
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent,
            refreshPendingMovementTokenVisibility: jest.fn(),
            releasePendingControlledTokenDragIntent,
            restorePendingMovementTokenRendering: jest.fn(),
        }));
        const canvasView = {};
        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        global.canvas.app = { view: canvasView };
        global.canvas.tokens.controlled = [token];
        const addEventListenerSpy = jest.spyOn(global.window, 'addEventListener');

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const pointerDown = addEventListenerSpy.mock.calls.find(
            ([eventName]) => eventName === 'pointerdown',
        )?.[1];
        const pointerUp = addEventListenerSpy.mock.calls.find(
            ([eventName]) => eventName === 'pointerup',
        )?.[1];

        expect(pointerDown).toBeTruthy();
        expect(pointerUp).toBeTruthy();

        pointerDown({ button: 0, target: canvasView });
        expect(primePendingControlledTokenDragIntent).toHaveBeenCalledWith(token);

        pointerUp();
        expect(releasePendingControlledTokenDragIntent).toHaveBeenCalledWith();
    });

    test('Ctrl+A restores Visioner-hidden token render locks before Foundry select-all runs', async () => {
        const restorePendingMovementTokenRendering = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals: jest.fn(),
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility: jest.fn(),
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering,
        }));

        const visionerHiddenToken = {
            document: { id: 'visioner-hidden' },
            _pf2eVisionerPendingRenderState: {
                lastHiddenContext: { renderHiddenByVisioner: true, foundryHidden: false },
            },
        };
        const foundryHiddenToken = {
            document: { id: 'foundry-hidden' },
            _pf2eVisionerPendingRenderState: {
                lastHiddenContext: { renderHiddenByVisioner: true, foundryHidden: true },
            },
        };
        global.canvas.tokens.placeables = [visionerHiddenToken, foundryHiddenToken];
        global.canvas.activeLayer = global.canvas.tokens;
        const addEventListenerSpy = jest.spyOn(global.window, 'addEventListener');

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const keydown = addEventListenerSpy.mock.calls.find(
            ([eventName]) => eventName === 'keydown',
        )?.[1];
        expect(keydown).toBeTruthy();

        keydown({ ctrlKey: true, key: 'a', target: document.body });

        expect(restorePendingMovementTokenRendering).toHaveBeenCalledWith(visionerHiddenToken, {
            ignoreObservedGrace: true,
            ignoreObserverLocks: true,
        });
        expect(restorePendingMovementTokenRendering).not.toHaveBeenCalledWith(
            foundryHiddenToken,
            expect.anything(),
        );
    });

    test('Ctrl+A control-token refresh does not reapply selected observer vision', async () => {
        const refreshPendingMovementTokenVisibility = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals: jest.fn(),
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => ['target']),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility,
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering: jest.fn(),
        }));

        const observer = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        const target = { document: { id: 'target', hidden: false } };
        global.canvas.tokens.placeables = [observer, target];
        global.canvas.activeLayer = global.canvas.tokens;
        const addEventListenerSpy = jest.spyOn(global.window, 'addEventListener');

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const keydown = addEventListenerSpy.mock.calls.find(
            ([eventName]) => eventName === 'keydown',
        )?.[1];
        expect(keydown).toBeTruthy();
        keydown({ ctrlKey: true, key: 'a', target: document.body });
        global.canvas.tokens.controlled = [observer, target];
        jest.advanceTimersByTime(100);

        const restoreIndicatorsCb = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .find((cb) => String(cb).includes('allowControlledFallback'));

        expect(restoreIndicatorsCb).toBeTruthy();
        await restoreIndicatorsCb(observer, true);

        expect(refreshPendingMovementTokenVisibility).not.toHaveBeenCalled();
    });

    test('onCanvasReady does not refresh perception when vision sharing ids are unchanged', async () => {
        const perceptionUpdate = jest.fn();
        global.canvas.perception = { update: perceptionUpdate };
        global.canvas.tokens.placeables = [{
            document: {
                getFlag: jest.fn(() => null),
            },
        }];

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        expect(perceptionUpdate).not.toHaveBeenCalled();
    });

    test('onCanvasReady skips token flag writes for non-GM clients', async () => {
        global.game.user.isGM = false;
        const setFlag = jest.fn();
        const applyOperations = jest.fn();
        global.game.pf2e = {
            RuleElements: {
                custom: {
                    PF2eVisionerEffect: class {
                        constructor(rule, item) {
                            this.key = rule.key;
                            this.item = item;
                        }
                        applyOperations = applyOperations;
                    },
                },
            },
        };
        global.canvas.tokens.placeables = [{
            id: 'token-with-visioner-rule',
            name: 'Token With Rule',
            on: jest.fn(),
            actor: {
                id: 'actor-1',
                items: [{
                    name: 'Visioner Effect',
                    type: 'effect',
                    system: { rules: [{ key: 'PF2eVisionerEffect' }] },
                    ruleElements: [],
                }],
            },
            document: {
                id: 'token-with-visioner-rule',
                getFlag: jest.fn((moduleId, key) => {
                    if (key === 'visionMasterActorUuid') return 'Actor.master';
                    return {};
                }),
                setFlag,
            },
        }];

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        expect(setFlag).not.toHaveBeenCalled();
        expect(applyOperations).not.toHaveBeenCalled();
    });

    test('onCanvasReady does not broadly refresh tokens during startup', async () => {
        const refresh = jest.fn();
        global.canvas.ready = true;
        global.canvas.app = {
            renderer: {
                screen: { width: 1000, height: 1000 },
            },
        };
        global.canvas.stage = {
            worldTransform: {
                applyInverse: jest.fn((point) => ({ x: point.x, y: point.y })),
            },
        };
        global.canvas.tokens.placeables = [{
            id: 't1',
            center: { x: 100, y: 100 },
            document: {
                id: 't1',
                width: 1,
                height: 1,
                getFlag: jest.fn(() => null),
            },
            visible: true,
            destroyed: false,
            sprite: {},
            mesh: {},
            on: jest.fn(),
            refresh,
        }];

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        expect(refresh).not.toHaveBeenCalled();
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

    test('controlToken AVS recalculation runs on the next tick, not after a visible delay', async () => {
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

        const token = { document: { id: 't1' } };
        global.canvas.tokens.controlled = [token];

        trackerCb(token, true);
        recalcCb(token, true);

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .not.toHaveBeenCalled();

        jest.advanceTimersByTime(0);

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledWith(['t1']);
    });

    test('controlToken refreshes selected-view targets after AVS recalculation settles', async () => {
        const refreshPendingMovementTokenVisibility = jest.fn();
        const getControlledObserverDetectionVisualTargetIds = jest
            .fn()
            .mockReturnValue(['late-hidden']);
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals: jest.fn(),
            getControlledObserverDetectionVisualTargetIds,
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility,
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering: jest.fn(),
        }));
        global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens = jest
            .fn()
            .mockResolvedValue(undefined);

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

        const token = { document: { id: 't1', getFlag: jest.fn(() => ({})) } };
        global.canvas.tokens.controlled = [token];

        trackerCb(token, true);
        recalcCb(token, true);
        jest.advanceTimersByTime(0);
        await Promise.resolve();
        await Promise.resolve();

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledWith(['t1']);
        expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
            ignoreObservedGrace: true,
            source: 'control-token-session',
            targetTokenIds: ['late-hidden'],
            skipPerceptionRefresh: true,
        });
    });

    test('controlToken refreshes system-hidden highlights after AVS recalculation settles', async () => {
        const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);
        jest.doMock('../../../scripts/services/visual-effects.js', () => ({
            updateWallVisuals: jest.fn(),
            updateWallIndicatorsOnly: jest.fn(),
            updateSystemHiddenTokenHighlights,
        }));
        global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens = jest
            .fn()
            .mockResolvedValue(undefined);

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);
        const restoreIndicatorsCb = controlTokenCbs.find((cb) =>
            String(cb).includes('allowControlledFallback'),
        );
        const trackerCb = controlTokenCbs.find((cb) =>
            String(cb).includes('trackControlTokenSession'),
        );
        const recalcCb = controlTokenCbs.find((cb) =>
            String(cb).includes('avsRecalculateOnControlToken') ||
            String(cb).includes('recalculateForTokens'),
        );

        const token = { document: { id: 't1', getFlag: jest.fn(() => ({})) } };
        global.canvas.tokens.controlled = [token];

        trackerCb(token, true);
        await restoreIndicatorsCb(token, true);

        expect(updateSystemHiddenTokenHighlights).not.toHaveBeenCalled();

        recalcCb(token, true);
        jest.advanceTimersByTime(0);
        for (let i = 0; i < 5; i += 1) {
            await Promise.resolve();
        }

        expect(global.window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens)
            .toHaveBeenCalledWith(['t1']);
        expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith('t1');
    });

    test('controlToken immediately settles pending hidden render locks for the new observer', async () => {
        const refreshPendingMovementTokenVisibility = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => ['target']),
            hasPendingMovementRenderWork: jest.fn(() => true),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility,
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering: jest.fn(),
        }));

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);

        const restoreIndicatorsCb = controlTokenCbs.find((cb) =>
            String(cb).includes('allowControlledFallback'),
        );

        expect(restoreIndicatorsCb).toBeTruthy();

        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        global.canvas.tokens.controlled = [token];

        await restoreIndicatorsCb(token, true);

        expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
            ignoreObservedGrace: true,
            source: 'control-token-session',
            targetTokenIds: ['target'],
        });
    });

    test('controlToken settles stale observed soundwaves without pending render work', async () => {
        const refreshPendingMovementTokenVisibility = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility,
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering: jest.fn(),
        }));

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);

        const restoreIndicatorsCb = controlTokenCbs.find((cb) =>
            String(cb).includes('allowControlledFallback'),
        );

        expect(restoreIndicatorsCb).toBeTruthy();

        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        global.canvas.tokens.controlled = [token];

        await restoreIndicatorsCb(token, true);

        expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
            ignoreObservedGrace: true,
            skipTokenRefresh: true,
            skipPerceptionRefresh: true,
        });
    });

    test('controlToken immediately refreshes hidden targets for selected observer', async () => {
        const refreshPendingMovementTokenVisibility = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => ['alon', 'centipede']),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility,
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering: jest.fn(),
        }));

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const restoreIndicatorsCb = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .find((cb) => String(cb).includes('allowControlledFallback'));

        expect(restoreIndicatorsCb).toBeTruthy();

        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        global.canvas.tokens.controlled = [token];

        await restoreIndicatorsCb(token, true);

        expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
            ignoreObservedGrace: true,
            source: 'control-token-session',
            targetTokenIds: ['alon', 'centipede'],
            skipPerceptionRefresh: true,
        });
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

    test('deselecting the last observer clears hidden-token perspective and refreshes visibility', async () => {
        const clearNoObserverDetectionFilterVisuals = jest.fn();
        const restorePendingMovementTokenRendering = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals,
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility: jest.fn(),
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering,
        }));
        const updateSystemHiddenTokenHighlights = jest.fn().mockResolvedValue(undefined);
        jest.doMock('../../../scripts/services/visual-effects.js', () => ({
            updateWallVisuals: jest.fn(),
            updateWallIndicatorsOnly: jest.fn(),
            updateSystemHiddenTokenHighlights,
        }));

        const perceptionUpdate = jest.fn();
        global.canvas.perception = { update: perceptionUpdate };

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);

        const restoreIndicatorsCb = controlTokenCbs.find((cb) =>
            String(cb).includes('allowControlledFallback'),
        );

        expect(restoreIndicatorsCb).toBeTruthy();

        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        const nameplate = { visible: false };
        const hiddenToken = {
            document: { id: 'hidden-target' },
            visible: false,
            renderable: false,
            mesh: { visible: false, renderable: false, alpha: 0 },
            nameplate,
            _pf2eVisionerPendingRenderState: {
                tokenVisible: true,
                tokenRenderable: true,
                meshVisible: true,
                meshRenderable: true,
                meshAlpha: 1,
                surfaceVisibility: [{ name: 'nameplate', surface: nameplate, visible: true }],
            },
        };
        global.canvas.tokens.controlled = [token];
        global.canvas.tokens.placeables = [token, hiddenToken];

        await restoreIndicatorsCb(token, false);

        expect(updateSystemHiddenTokenHighlights).toHaveBeenCalledWith(null, null, {
            allowControlledFallback: false,
        });
        expect(perceptionUpdate).not.toHaveBeenCalled();

        global.canvas.tokens.controlled = [];
        jest.advanceTimersByTime(75);
        jest.runOnlyPendingTimers();

        expect(restorePendingMovementTokenRendering).toHaveBeenCalledWith(hiddenToken, {
            ignoreObservedGrace: true,
            ignoreObserverLocks: true,
        });
        expect(clearNoObserverDetectionFilterVisuals).toHaveBeenCalled();
        expect(perceptionUpdate).toHaveBeenCalledWith({
            initializeVision: true,
            refreshVision: true,
        });
    });

    test('deselect cleanup retries until Foundry controlled list is empty', async () => {
        const clearNoObserverDetectionFilterVisuals = jest.fn();
        const restorePendingMovementTokenRendering = jest.fn();
        jest.doMock('../../../scripts/services/PendingMovement/pending-movement-render-lock.js', () => ({
            clearNoObserverDetectionFilterVisuals,
            getControlledObserverDetectionVisualTargetIds: jest.fn(() => []),
            getPendingMovementRefreshTargetIds: jest.fn(() => []),
            hasPendingMovementRenderWork: jest.fn(() => false),
            primePendingControlledTokenDragIntent: jest.fn(),
            refreshPendingMovementTokenVisibility: jest.fn(),
            releasePendingControlledTokenDragIntent: jest.fn(),
            restorePendingMovementTokenRendering,
        }));
        jest.doMock('../../../scripts/services/visual-effects.js', () => ({
            updateWallVisuals: jest.fn(),
            updateWallIndicatorsOnly: jest.fn(),
            updateSystemHiddenTokenHighlights: jest.fn().mockResolvedValue(undefined),
        }));

        const perceptionUpdate = jest.fn();
        global.canvas.perception = { update: perceptionUpdate };

        const { onCanvasReady } = await import('../../../scripts/hooks/lifecycle.js');
        await onCanvasReady();

        const controlTokenCbs = global.Hooks.on.mock.calls
            .filter((c) => c?.[0] === 'controlToken')
            .map((c) => c?.[1])
            .filter(Boolean);
        const restoreIndicatorsCb = controlTokenCbs.find((cb) =>
            String(cb).includes('allowControlledFallback'),
        );

        const token = { document: { id: 'observer', getFlag: jest.fn(() => ({})) } };
        const hiddenToken = { document: { id: 'hidden-target' } };
        global.canvas.tokens.controlled = [token];
        global.canvas.tokens.placeables = [token, hiddenToken];

        await restoreIndicatorsCb(token, false);
        jest.advanceTimersByTime(75);

        expect(restorePendingMovementTokenRendering).not.toHaveBeenCalled();

        global.canvas.tokens.controlled = [];
        jest.advanceTimersByTime(175);
        jest.runOnlyPendingTimers();

        expect(restorePendingMovementTokenRendering).toHaveBeenCalledWith(hiddenToken, {
            ignoreObservedGrace: true,
            ignoreObserverLocks: true,
        });
        expect(clearNoObserverDetectionFilterVisuals).toHaveBeenCalledTimes(1);
        expect(perceptionUpdate).toHaveBeenCalledTimes(1);
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
