describe('AVS GM Vision warning banner', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        delete global.pf2eVisioner;
        global.Hooks.on.mockClear();
        global.game.user.isGM = true;
        global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
        global.game.settings.set('pf2e-visioner', 'suppressAvsGmVisionWarning', false);
        global.game.settings.set('pf2e', 'gmVision', false);
        delete global.canvas.effects;
        delete global.canvas.visibility;
        global.canvas.scene.getFlag = jest.fn().mockReturnValue(false);
        global.ui.controls = { controls: [] };
    });

    test('shows banner when GM Vision enabled and AVS enabled', async () => {
        global.game.settings.set('pf2e', 'gmVision', true);

        const {
            registerAvsGmVisionWarning,
            updateAvsGmVisionWarning,
            isGmVisionModeActive,
        } = await import('../../../scripts/ui/AvsGmVisionWarning.js');

        expect(isGmVisionModeActive()).toBe(true);

        registerAvsGmVisionWarning();
        updateAvsGmVisionWarning();

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(true);

        const title = el.querySelector('.title');
        const body = el.querySelector('.body');
        expect(title?.textContent).toBe('PF2E_VISIONER.AVS_GM_VISION_WARNING.TITLE');
        expect(body?.textContent).toBe('PF2E_VISIONER.AVS_GM_VISION_WARNING.BODY');
    });

    test('hides banner when GM Vision is disabled', async () => {
        global.game.settings.set('pf2e', 'gmVision', false);

        const { updateAvsGmVisionWarning, isGmVisionModeActive } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        expect(isGmVisionModeActive()).toBe(false);

        updateAvsGmVisionWarning();

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(false);
    });

    test('hides banner when AVS is disabled for the scene', async () => {
        global.canvas.scene.getFlag = jest.fn().mockImplementation((moduleId, key) => {
            if (moduleId === 'pf2e-visioner' && key === 'disableAVS') return true;
            return false;
        });
        global.game.settings.set('pf2e', 'gmVision', true);

        const { updateAvsGmVisionWarning, isGmVisionModeActive } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        expect(isGmVisionModeActive()).toBe(false);

        updateAvsGmVisionWarning();
        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(false);
    });

    test('hides banner when AVS is disabled globally', async () => {
        global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
        global.game.settings.set('pf2e', 'gmVision', true);

        const { updateAvsGmVisionWarning, isGmVisionModeActive } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        expect(isGmVisionModeActive()).toBe(false);

        updateAvsGmVisionWarning();

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(false);
    });

    test('updates when pf2e.gmVision setting changes', async () => {
        const { registerAvsGmVisionWarning } = await import('../../../scripts/ui/AvsGmVisionWarning.js');

        registerAvsGmVisionWarning();

        const updateSettingCbs = global.Hooks.on.mock.calls
            .filter(([hook]) => hook === 'updateSetting')
            .map(([, cb]) => cb);

        expect(updateSettingCbs.length).toBeGreaterThan(0);

        const cb = updateSettingCbs[0];

        global.game.settings.set('pf2e', 'gmVision', true);
        cb({ namespace: 'pf2e', key: 'gmVision' });

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(true);
    });

    test('can dismiss banner and it reappears after GM Vision toggles', async () => {
        global.game.settings.set('pf2e', 'gmVision', true);

        const { registerAvsGmVisionWarning, updateAvsGmVisionWarning } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        registerAvsGmVisionWarning();
        updateAvsGmVisionWarning();

        const updateSettingCbs = global.Hooks.on.mock.calls
            .filter(([hook]) => hook === 'updateSetting')
            .map(([, cb]) => cb);
        const cb = updateSettingCbs[0];

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(true);

        const close = el.querySelector('button.close');
        expect(close).toBeTruthy();
        close.click();
        expect(el.classList.contains('visible')).toBe(false);

        global.game.settings.set('pf2e', 'gmVision', false);
        cb({ namespace: 'pf2e', key: 'gmVision' });

        global.game.settings.set('pf2e', 'gmVision', true);
        cb({ namespace: 'pf2e', key: 'gmVision' });
        expect(el.classList.contains('visible')).toBe(true);
    });

    test('does not show banner when suppression is enabled', async () => {
        global.game.settings.set('pf2e', 'gmVision', true);
        global.game.settings.set('pf2e-visioner', 'suppressAvsGmVisionWarning', true);

        const { updateAvsGmVisionWarning, isGmVisionModeActive } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        expect(isGmVisionModeActive()).toBe(true);

        updateAvsGmVisionWarning();

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(false);
    });

    test('dont show again checkbox persists suppression', async () => {
        global.game.settings.set('pf2e', 'gmVision', true);

        const { registerAvsGmVisionWarning, updateAvsGmVisionWarning } = await import(
            '../../../scripts/ui/AvsGmVisionWarning.js'
        );

        registerAvsGmVisionWarning();
        updateAvsGmVisionWarning();

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(true);

        const checkbox = el.querySelector('input[name="dont-show-again"]');
        expect(checkbox).toBeTruthy();

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        expect(global.game.settings.get('pf2e-visioner', 'suppressAvsGmVisionWarning')).toBe(true);
        expect(el.classList.contains('visible')).toBe(false);
    });

    test('updates when suppression setting changes', async () => {
        global.game.settings.set('pf2e', 'gmVision', true);

        const { registerAvsGmVisionWarning } = await import('../../../scripts/ui/AvsGmVisionWarning.js');

        registerAvsGmVisionWarning();

        const updateSettingCbs = global.Hooks.on.mock.calls
            .filter(([hook]) => hook === 'updateSetting')
            .map(([, cb]) => cb);
        const cb = updateSettingCbs[0];

        const el = document.getElementById('pf2e-visioner-avs-gm-vision-warning');
        expect(el).toBeTruthy();
        expect(el.classList.contains('visible')).toBe(true);

        global.game.settings.set('pf2e-visioner', 'suppressAvsGmVisionWarning', true);
        cb({ namespace: 'pf2e-visioner', key: 'suppressAvsGmVisionWarning' });

        expect(el.classList.contains('visible')).toBe(false);
    });
});
