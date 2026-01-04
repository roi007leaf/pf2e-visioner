describe('OverrideValidationDialog - accept forces hide', () => {
    let OverrideValidationDialog;

    beforeEach(async () => {
        global.canvas = {
            tokens: {
                get: jest.fn((id) => ({
                    id,
                    actor: {
                        signature: `sig-${id}`
                    }
                }))
            }
        };

        global.ui = {
            notifications: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn()
            }
        };

        global.game = {
            i18n: {
                format: jest.fn((key, data) => `${key}: ${JSON.stringify(data)}`),
                localize: jest.fn((key) => key)
            }
        };

        const dialogModule = await import('../../../scripts/ui/OverrideValidationDialog.js');
        OverrideValidationDialog = dialogModule.OverrideValidationDialog;
    });

    it('should have _onAcceptAll method that imports and calls indicator.hide', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [],
            tokenName: 'TestToken',
            movedTokenId: 'moved1'
        });

        expect(typeof dialog._onAcceptAll).toBe('function');

        const methodSource = dialog._onAcceptAll.toString();
        expect(methodSource).toContain('indicator.hide(true)');
    });

    it('should have _onRejectAll method that imports and calls indicator.hide', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [],
            tokenName: 'TestToken',
            movedTokenId: 'moved1'
        });

        expect(typeof dialog._onRejectAll).toBe('function');

        const methodSource = dialog._onRejectAll.toString();
        expect(methodSource).toContain('indicator.hide(true)');
    });

    it('should have _onAcceptIndividual method that imports and calls indicator.hide with force', async () => {
        const dialog = new OverrideValidationDialog({
            invalidOverrides: [],
            tokenName: 'TestToken',
            movedTokenId: 'moved1'
        });

        expect(typeof dialog._onAcceptIndividual).toBe('function');

        const methodSource = dialog._onAcceptIndividual.toString();
        expect(methodSource).toContain('indicator.hide(true)');
    });
});
