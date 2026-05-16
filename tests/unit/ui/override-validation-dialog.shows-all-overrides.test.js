describe('OverrideValidationDialog - shows all overrides', () => {
    const LEGENDARY_SNEAK_RULES_TEXT =
        "You're always sneaking unless you choose to be seen, even when there's nowhere to hide. You can Hide and Sneak even without cover or being Concealed. When you employ an exploration tactic other than Avoiding Notice, you also gain the benefits of Avoiding Notice unless you choose not to.";

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

    it('should label concealed override states as observed plus concealed', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [
                {
                    observerId: 'obs1',
                    targetId: 'tgt1',
                    observerName: 'Observer1',
                    targetName: 'Target1',
                    state: 'concealed',
                    currentVisibility: 'concealed',
                    currentCover: 'none',
                    expectedCover: 'none',
                    source: 'manual_action',
                    reason: 'Position changed'
                }
            ],
            tokenName: 'TestToken'
        });

        const context = await dialog._prepareContext({});
        const override = context.overrides[0];

        expect(override.prevVisibility).toMatchObject({
            key: 'concealed',
            label: 'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed'
        });
        expect(override.statusVisibility).toMatchObject({
            key: 'concealed',
            label: 'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed'
        });
        expect(override.currentVisibilityDescription).toContain(
            'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed'
        );
    });

    it('should not statically import the visibility label helper from validation UI files', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const files = [
            'scripts/ui/OverrideValidationDialog.js',
            'scripts/ui/OverrideValidationIndicator.js'
        ];

        for (const file of files) {
            const source = await fs.readFile(path.join(process.cwd(), file), 'utf8');
            const importLine = source
                .split('\n')
                .find((line) => line.includes("from '../constants.js'"));

            expect(importLine).not.toContain('getVisibilityStateLabelKey');
        }
    });

    it('should render Take Cover cover-only current cover as auto cover', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [
                {
                    observerId: 'obs1',
                    targetId: 'tgt1',
                    observerName: 'Observer1',
                    targetName: 'Target1',
                    state: 'avs',
                    coverOnly: true,
                    source: 'take_cover_action',
                    currentVisibility: 'observed',
                    currentCover: 'lesser',
                    expectedCover: 'standard',
                    reason: 'Cover changed'
                }
            ],
            tokenName: 'TestToken',
            movedTokenId: 'tgt1'
        });

        const context = await dialog._prepareContext({});

        expect(context.overrides[0].prevCover.key).toBe('standard');
        expect(context.overrides[0].statusCover.key).toBe('auto');
        expect(context.overrides[0].statusCover.icon).toBe('fas fa-arrows-rotate');
        expect(context.overrides[0].statusCover.label).toBe('Auto Cover');
    });

    it('should preserve Legendary Sneak context for override rows', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [
                {
                    observerId: 'obs1',
                    targetId: 'tgt1',
                    observerName: 'Observer1',
                    targetName: 'Target1',
                    state: 'undetected',
                    currentVisibility: 'observed',
                    currentCover: 'none',
                    source: 'sneak_action',
                    reason: 'Legendary Sneak applies',
                    stealthPositionBypassFeat: 'legendary-sneak',
                    stealthPositionBypassLabel: 'Legendary Sneak',
                    stealthPositionBypassIcon: 'fas fa-user-ninja',
                    stealthPositionBypassTooltip: LEGENDARY_SNEAK_RULES_TEXT
                }
            ],
            tokenName: 'TestToken',
            movedTokenId: 'tgt1'
        });

        const context = await dialog._prepareContext({});

        expect(context.overrides[0].stealthPositionBypassFeat).toBe('legendary-sneak');
        expect(context.overrides[0].stealthPositionBypassLabel).toBe('Legendary Sneak');
        expect(context.overrides[0].stealthPositionBypassTooltip).toContain("there's nowhere to hide");
        expect(context.overrides[0].stealthPositionBypassTooltip).toContain('Avoiding Notice');
    });

    it('should expose Legendary Sneak context on the moved target header', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [
                {
                    observerId: 'obs1',
                    targetId: 'tgt1',
                    observerName: 'Observer1',
                    targetName: 'Celdar',
                    state: 'undetected',
                    currentVisibility: 'observed',
                    currentCover: 'none',
                    source: 'sneak_action',
                    reason: 'Legendary Sneak applies',
                    stealthPositionBypassFeat: 'legendary-sneak',
                    stealthPositionBypassLabel: 'Legendary Sneak',
                    stealthPositionBypassIcon: 'fas fa-user-ninja',
                    stealthPositionBypassTooltip: LEGENDARY_SNEAK_RULES_TEXT
                }
            ],
            tokenName: 'Celdar',
            movedTokenId: 'tgt1'
        });

        const context = await dialog._prepareContext({});

        expect(context.targetHeader.stealthPositionBypassFeat).toBe('legendary-sneak');
        expect(context.targetHeader.stealthPositionBypassLabel).toBe('Legendary Sneak');
        expect(context.targetHeader.stealthPositionBypassTooltip).toContain("there's nowhere to hide");
        expect(context.targetHeader.stealthPositionBypassTooltip).toContain('Avoiding Notice');
    });
});
