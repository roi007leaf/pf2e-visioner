describe('Sniping Duo check dialog blocks cover override', () => {
    test('forces chosen cover to detected state when Sniping Duo applies', async () => {
        jest.resetModules();

        jest.unmock('../../../scripts/cover/auto-cover/CoverUIManager.js');

        jest.doMock(
            '../../../scripts/cover/auto-cover/AutoCoverSystem.js',
            () => ({ default: { normalizeTokenRef: (v) => v } }),
        );

        jest.doMock(
            '../../../scripts/constants.js',
            () => ({ MODULE_ID: 'pf2e-visioner', COVER_STATES: {} }),
        );

        jest.doMock(
            '../../../scripts/helpers/cover-helpers.js',
            () => ({
                getCoverLabel: (s) => s,
                getCoverBonusByState: () => 0,
            }),
        );

        if (!global.foundry) global.foundry = {};
        if (!global.foundry.utils) global.foundry.utils = {};
        global.foundry.utils.randomID = () => 'roll-id';

        if (!global.game) global.game = {};
        if (!global.game.i18n) global.game.i18n = {};
        global.game.i18n.localize = (k) => k;

        const rollBtnEl = {
            dataset: {},
            addEventListener: jest.fn(() => { }),
        };

        global.$ = (htmlString) => {
            const obj = {
                _html: String(htmlString || ''),
                find: () => ({ length: 0, append: () => { } }),
                on: () => { },
            };
            return obj;
        };

        const beforeSpy = jest.fn();
        const findSpy = jest.fn((selector) => {
            if (selector === '.pv-cover-override') return { length: 0 };
            if (selector === '.roll-mode-panel') return { length: 0, before: () => { } };
            if (selector === '.dialog-buttons') return { before: beforeSpy };
            if (selector === 'button.roll') return [rollBtnEl];
            return { length: 0, before: () => { } };
        });
        const html = { find: findSpy };

        const dialog = {
            _pvCoverOverride: 'greater',
            setPosition: jest.fn(() => { }),
            context: {
                actor: { token: { id: 'attacker' } },
                target: { id: 'target', actor: {} },
            },
        };

        const target = { id: 'target', actor: {} };

        const mod = jest.requireActual('../../../scripts/cover/auto-cover/CoverUIManager.js');
        const mgr = mod.default || mod;

        expect(typeof mgr.injectDialogCoverUI).toBe('function');

        const onChosen = jest.fn();

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await mgr.injectDialogCoverUI(
            dialog,
            html,
            'standard',
            target,
            'none',
            { ignoredTokenName: 'Spotter' },
            onChosen,
        );

        expect(findSpy).toHaveBeenCalled();
        expect(dialog.setPosition).toHaveBeenCalled();
        expect(beforeSpy).toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();

        expect(rollBtnEl.dataset.pvCoverBind).toBe('1');

        const clickCall = rollBtnEl.addEventListener.mock.calls.find((c) => c?.[0] === 'click');
        expect(clickCall).toBeTruthy();
        const rollClickHandler = clickCall[1];
        expect(typeof rollClickHandler).toBe('function');

        rollClickHandler();

        expect(onChosen).toHaveBeenCalledWith(
            expect.objectContaining({
                chosen: 'standard',
                originalState: 'standard',
            }),
        );

        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
