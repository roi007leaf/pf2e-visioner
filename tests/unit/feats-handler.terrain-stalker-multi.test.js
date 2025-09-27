import '../setup.js';

// We will import the real feats-handler (module exports default and/or named)
let FeatsHandler;

beforeAll(() => {
    const mod = require('../../scripts/chat/services/feats-handler.js');
    FeatsHandler = mod.FeatsHandler || mod.default || mod;
});

function makeFeat(slug, selection) {
    const feat = {
        type: 'feat',
        system: { slug, rules: [] },
    };
    if (selection) {
        feat.system.rules.push({ key: 'ChoiceSet', selection });
    }
    return feat;
}

function makeActorWithFeats(items) {
    return {
        items,
        system: { attributes: {} },
    };
}

describe('FeatsHandler - multiple Terrain Stalker feats', () => {
    test('collects selections from multiple items', () => {
        const items = [
            makeFeat('terrain-stalker', 'forest'),
            makeFeat('terrain-stalker', 'urban'),
            makeFeat('keen-eyes'),
        ];
        const actor = makeActorWithFeats(items);

        const all = FeatsHandler.getTerrainStalkerSelections(actor);
        // Order not guaranteed; compare as sets
        expect(new Set(all)).toEqual(new Set(['forest', 'urban']));

        // Back-compat single getter still returns first or some selection
        const single = FeatsHandler.getTerrainStalkerSelection(actor);
        expect(['forest', 'urban']).toContain(single);
    });

    test('overridePrerequisites: Terrain Stalker passes when any selected environment active', () => {
        const items = [
            makeFeat('terrain-stalker', 'forest'),
            makeFeat('terrain-stalker', 'urban'),
        ];
        const actor = makeActorWithFeats(items);
        const token = { actor };

        // Isolate module and mock environment.js for this test only
        jest.isolateModules(() => {
            jest.doMock('../../scripts/utils/environment.js', () => ({
                __esModule: true,
                default: {
                    isEnvironmentActive: (tok, key) => key === 'urban',
                    getMatchingEnvironmentRegions: jest.fn().mockReturnValue([]),
                },
            }));
            const mod2 = require('../../scripts/chat/services/feats-handler.js');
            const FH = mod2.FeatsHandler || mod2.default || mod2;
            const base = { startQualifies: false, endQualifies: false };
            const result = FH.overridePrerequisites(token, base, { action: 'sneak' });
            expect(result.startQualifies).toBe(true);
            expect(result.endQualifies).toBe(false);
            expect(result.reason).toMatch(/Terrain Stalker \(urban\)/);
        });
        jest.dontMock('../../scripts/utils/environment.js');
        jest.resetModules();
    });

    test('overridePrerequisites: Vanish into the Land relaxes both when any TS selection has difficult terrain', () => {
        const items = [
            makeFeat('terrain-stalker', 'forest'),
            makeFeat('terrain-stalker', 'urban'),
            makeFeat('vanish-into-the-land'),
        ];
        const actor = makeActorWithFeats(items);
        const token = { actor };

        jest.isolateModules(() => {
            jest.doMock('../../scripts/utils/environment.js', () => ({
                __esModule: true,
                default: {
                    isEnvironmentActive: jest.fn().mockReturnValue(false),
                    getMatchingEnvironmentRegions: jest
                        .fn()
                        .mockImplementation((tok, key) => (key === 'forest' ? [{}] : [])),
                },
            }));

            const mod2 = require('../../scripts/chat/services/feats-handler.js');
            const FH = mod2.FeatsHandler || mod2.default || mod2;

            const base = { startQualifies: false, endQualifies: false };
            const result = FH.overridePrerequisites(token, base, { action: 'hide' });
            expect(result.startQualifies).toBe(true);
            expect(result.endQualifies).toBe(true);
            expect(result.reason).toMatch(/Vanish into the Land \(forest difficult terrain\)/);
        });
        jest.dontMock('../../scripts/utils/environment.js');
        jest.resetModules();
    });
});
