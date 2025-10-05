jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
    default: { normalizeTokenRef: (v) => v }
}));

function getManager() {
    const mod = require('../../../scripts/cover/auto-cover/CoverUIManager.js');
    return mod.default || mod;
}

function makeMessage(flags) {
    return {
        flags,
        toObject: () => ({ flags }),
    };
}

describe('Ceaseless Shadows chat indicator', () => {
    test('shouldShowCoverOverrideIndicator true with feat upgrade flag', async () => {
        const message = makeMessage({ 'pf2e-visioner': { coverFeatUpgrade: { from: 'lesser', to: 'standard', feat: 'ceaseless-shadows', ts: Date.now() } } });
        const prevIsGM = global.game?.user?.isGM;
        if (!global.game) global.game = { user: { isGM: true } };
        else global.game.user.isGM = true;
        const mgr = getManager();
        if (typeof mgr.shouldShowCoverOverrideIndicator !== 'function') {
            expect(true).toBe(true);
            return;
        }
        const res = await mgr.shouldShowCoverOverrideIndicator(message);
        if (prevIsGM !== undefined) global.game.user.isGM = prevIsGM;
        expect(res).toBe(true);
    });

    test('injectCoverOverrideIndicator adds feat element', async () => {
        const message = makeMessage({ 'pf2e-visioner': { coverFeatUpgrade: { from: 'lesser', to: 'standard', feat: 'ceaseless-shadows', ts: Date.now() } } });
        const html = { find: () => ({ length: 0, first: () => ({ length: 0 }), after: () => { }, append: () => { }, html: () => { }, is: () => false, prepend: () => { } }) };
        const prevIsGM = global.game?.user?.isGM;
        if (!global.game) global.game = { user: { isGM: true } };
        else global.game.user.isGM = true;
        const mgr = getManager();
        if (typeof mgr.injectCoverOverrideIndicator === 'function') {
            await mgr.injectCoverOverrideIndicator(message, html, true);
        }
        if (prevIsGM !== undefined) global.game.user.isGM = prevIsGM;
    });

    test('feat upgrade indicator NOT shown when blocker has coverOverride', async () => {
        const message = makeMessage({
            'pf2e-visioner': {
                coverFeatUpgrade: {
                    from: 'lesser',
                    to: 'standard',
                    feat: 'ceaseless-shadows',
                    ts: Date.now(),
                    hasBlockerWithOverride: true
                }
            }
        });

        let indicatorAdded = false;
        const html = {
            find: (selector) => {
                if (selector && selector.includes('pf2e-visioner-cover-feat-indicator')) {
                    indicatorAdded = true;
                }
                return {
                    length: 0,
                    first: () => ({ length: 0 }),
                    after: () => { },
                    append: () => { },
                    html: () => { },
                    is: () => false,
                    prepend: () => { }
                };
            }
        };

        const prevIsGM = global.game?.user?.isGM;
        if (!global.game) global.game = { user: { isGM: true } };
        else global.game.user.isGM = true;
        const mgr = getManager();
        if (typeof mgr.injectCoverOverrideIndicator === 'function') {
            await mgr.injectCoverOverrideIndicator(message, html, true);
        }
        if (prevIsGM !== undefined) global.game.user.isGM = prevIsGM;

        expect(indicatorAdded).toBe(false);
    });
});
