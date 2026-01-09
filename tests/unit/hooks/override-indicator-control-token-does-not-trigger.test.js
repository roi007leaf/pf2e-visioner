import { jest } from '@jest/globals';

describe('Override indicator should not trigger on controlToken', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        document.body.innerHTML = '';
        global.game.user.isGM = true;

        global.canvas.tokens.controlled = [];
        global.canvas.tokens.placeables = [];
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
});
