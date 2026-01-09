import { jest } from '@jest/globals';

describe('OverrideValidationIndicator GM visibility', () => {
    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '';
        global.game.user.isGM = true;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('does not create/show indicator for non-GM', async () => {
        global.game.user.isGM = false;

        const { default: indicator } = await import('../../../scripts/ui/OverrideValidationIndicator.js');

        indicator.show(
            [
                {
                    observerId: 'observer',
                    targetId: 'target',
                    state: 'observed',
                    currentVisibility: 'hidden',
                    hasCover: false,
                    hasConcealment: false,
                    expectedCover: 'none',
                    currentCover: 'none',
                    source: 'manual_action',
                },
            ],
            'Target',
            'target',
        );

        expect(document.querySelector('.pf2e-visioner-override-indicator')).toBeNull();
    });

    test('creates indicator for GM on show()', async () => {
        global.game.user.isGM = true;

        const { default: indicator } = await import('../../../scripts/ui/OverrideValidationIndicator.js');

        indicator.show(
            [
                {
                    observerId: 'observer',
                    targetId: 'target',
                    state: 'observed',
                    currentVisibility: 'hidden',
                    hasCover: false,
                    hasConcealment: false,
                    expectedCover: 'none',
                    currentCover: 'none',
                    source: 'manual_action',
                },
            ],
            'Target',
            'target',
        );

        expect(document.querySelector('.pf2e-visioner-override-indicator')).not.toBeNull();
    });
});
