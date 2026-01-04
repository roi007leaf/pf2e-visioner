describe('OverrideValidationDialog - shows all overrides', () => {
    let OverrideValidationDialog;
    let OverrideValidationIndicator;

    beforeEach(async () => {
        const dialogModule = await import('../../../scripts/ui/OverrideValidationDialog.js');
        OverrideValidationDialog = dialogModule.OverrideValidationDialog;

        const indicatorModule = await import('../../../scripts/ui/OverrideValidationIndicator.js');
        OverrideValidationIndicator = indicatorModule.default;
    });

    afterEach(() => {
    });

    it('should receive full invalid override set even when badge is filtered', async () => {
        const rawInvalidOverrides = [
            {
                observerId: 'obs1',
                targetId: 'tgt1',
                observerName: 'Observer1',
                targetName: 'Target1',
                state: 'concealed',
                currentVisibility: 'observed',
                currentCover: 'none',
                expectedCover: 'standard',
                source: 'manual_action',
                reason: 'Position changed'
            },
            {
                observerId: 'obs2',
                targetId: 'tgt2',
                observerName: 'Observer2',
                targetName: 'Target2',
                state: 'hidden',
                currentVisibility: 'concealed',
                currentCover: 'none',
                expectedCover: 'none',
                source: 'sneak',
                reason: 'Lighting changed'
            },
            {
                observerId: 'obs3',
                targetId: 'tgt3',
                observerName: 'Observer3',
                targetName: 'Target3',
                state: 'avs',
                currentVisibility: 'observed',
                currentCover: 'none',
                expectedCover: 'none',
                source: 'manual_action',
                reason: 'AVS state only'
            }
        ];

        const dialog = new OverrideValidationDialog({
            invalidOverrides: rawInvalidOverrides,
            tokenName: 'TestToken',
            movedTokenId: 'moved1'
        });

        expect(dialog.invalidOverrides).toBeDefined();
        expect(dialog.invalidOverrides.length).toBe(rawInvalidOverrides.length);
        expect(dialog.invalidOverrides.length).toBe(3);

        const context = await dialog._prepareContext({});

        expect(context.overrides).toBeDefined();
        expect(context.overrides.length).toBe(3);
    });

    it('should pass raw overrides from indicator to dialog', async () => {
        const indicatorModule = await import('../../../scripts/ui/OverrideValidationIndicator.js');
        const indicator = indicatorModule.default;

        const rawOverrides = [
            {
                observerId: 'obs1',
                targetId: 'tgt1',
                observerName: 'Observer1',
                targetName: 'Target1',
                state: 'concealed',
                currentVisibility: 'observed',
                currentCover: 'none',
                expectedCover: 'standard',
                source: 'manual_action',
                reason: 'Position changed'
            },
            {
                observerId: 'obs2',
                targetId: 'tgt2',
                observerName: 'Observer2',
                targetName: 'Target2',
                state: 'avs',
                currentVisibility: 'observed',
                currentCover: 'none',
                expectedCover: 'none',
                source: 'manual_action',
                reason: 'AVS state only'
            }
        ];

        indicator.show(rawOverrides, 'TestToken', 'movedId', { pulse: false });

        expect(indicator._rawOverrides).toBeDefined();
        expect(indicator._rawOverrides.length).toBe(2);
        expect(indicator._rawOverrides).toEqual(rawOverrides);
    });
});
