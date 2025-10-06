import '../../setup.js';

function createActorWithFeats(slugs = []) {
    const items = slugs.map((slug) => ({ type: 'feat', system: { slug } }));
    return {
        items,
        system: { attributes: {} },
    };
}

jest.mock('../../../scripts/utils/environment.js', () => ({
    __esModule: true,
    default: {
        isEnvironmentActive: jest.fn(),
    },
}));

describe('FeatsHandler - Camouflage feat', () => {
    let FeatsHandler;
    let EnvironmentHelper;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        const mod = require('../../../scripts/chat/services/FeatsHandler.js');
        FeatsHandler = mod.FeatsHandler || mod.default || mod;
        const envMod = require('../../../scripts/utils/environment.js');
        EnvironmentHelper = envMod.default;
    });

    describe('overridePrerequisites with Camouflage', () => {
        test('Camouflage relaxes prerequisites when in natural terrain (forest)', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === 'forest');

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.endQualifies).toBe(true);
            expect(result.reason).toMatch(/Camouflage removes cover\/concealment requirement in natural terrain/);
        });

        test('Camouflage works in any natural terrain type', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            const naturalTerrains = ['aquatic', 'arctic', 'desert', 'forest', 'mountain', 'plains', 'sky', 'swamp', 'underground'];

            for (const terrain of naturalTerrains) {
                EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === terrain);

                const base = { startQualifies: false, endQualifies: false };
                const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

                expect(result.endQualifies).toBe(true);
                expect(result.reason).toMatch(/Camouflage/);
            }
        });

        test('Camouflage does not relax prerequisites when not in natural terrain', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockReturnValue(false);

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.startQualifies).toBe(false);
            expect(result.endQualifies).toBe(false);
            expect(result.bothQualify).toBe(false);
        });

        test('Camouflage does not activate in urban terrain', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === 'urban');

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.startQualifies).toBe(false);
            expect(result.endQualifies).toBe(false);
        });

        test('Camouflage works for Hide action in natural terrain', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === 'mountain');

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'hide' });

            expect(result.endQualifies).toBe(true);
        });

        test('Camouflage does not override when already qualified', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === 'plains');

            const base = { startQualifies: true, endQualifies: true, reason: 'Already has cover' };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.endQualifies).toBe(true);
            expect(result.reason).toBe('Already has cover');
        });

        test('Camouflage is checked after Ceaseless Shadows but before Legendary Sneak', () => {
            const actorCamouflage = createActorWithFeats(['camouflage']);

            EnvironmentHelper.isEnvironmentActive.mockReturnValue(false);

            const base = { startQualifies: false, endQualifies: false };

            const resultCamouflage = FeatsHandler.overridePrerequisites({ actor: actorCamouflage }, base);
            expect(resultCamouflage.startQualifies).toBe(false);
        });

        test('Camouflage only requires natural terrain, not specific terrain types', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };

            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => {
                return env === 'swamp';
            });

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.endQualifies).toBe(true);
        });

        test('Camouflage handles environment check errors gracefully', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };
            EnvironmentHelper.isEnvironmentActive.mockImplementation(() => {
                throw new Error('Environment check failed');
            });

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.startQualifies).toBe(false);
            expect(result.endQualifies).toBe(false);
        });

        test('Camouflage is independent from Terrain Stalker', () => {
            const actor = createActorWithFeats(['camouflage']);
            const token = { actor };

            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => {
                return env === 'desert';
            });

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.endQualifies).toBe(true);
        });

        test('Camouflage and Terrain Stalker can both apply', () => {
            const actor = createActorWithFeats(['camouflage', 'terrain-stalker']);
            const token = { actor };

            EnvironmentHelper.isEnvironmentActive.mockImplementation((tok, env) => env === 'arctic');

            const base = { startQualifies: false, endQualifies: false };
            const result = FeatsHandler.overridePrerequisites(token, base, { action: 'sneak' });

            expect(result.endQualifies).toBe(true);
        });
    });
});
