import RegionHelper from '../../../scripts/utils/region.js';

describe('RegionHelper.hasDifficultTerrain', () => {
    const makeRegion = (behaviors) => ({
        document: { behaviors },
    });

    test('environmentfeature with system.terrain.difficult = true', () => {
        const region = makeRegion([
            { type: 'environmentFeature', system: { terrain: { difficult: true } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(true);
    });

    test('modifyMovementCost with multiplier > 1 counts as difficult', () => {
        const region = makeRegion([
            { type: 'modifyMovementCost', system: { difficulties: { walk: 2, fly: 1 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(true);
    });

    test('modifyMovementCost with all multipliers <= 1 is not difficult', () => {
        const region = makeRegion([
            { type: 'modifyMovementCost', system: { difficulties: { walk: 1, fly: 1, swim: 1 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(false);
    });

    test('movementType filtering - walk sees difficult, fly does not', () => {
        const region = makeRegion([
            { type: 'modifyMovementCost', system: { difficulties: { walk: 2, fly: 1 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region, 'walk')).toBe(true);
        expect(RegionHelper.hasDifficultTerrain(region, 'fly')).toBe(false);
    });

    test('movementType normalization - land maps to walk', () => {
        const region = makeRegion([
            { type: 'modifyMovementCost', system: { difficulties: { walk: 2 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region, 'land')).toBe(true);
    });

    test('fallback: type contains "difficult"', () => {
        const region = makeRegion([
            { type: 'difficultTerrain', system: {} },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(true);
    });

    test('fallback: system.terrain.difficult truthy', () => {
        const region = makeRegion([
            { type: 'other', system: { terrain: { difficult: 1 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(true);
    });

    test('does not misclassify by presence of "difficulties" key only', () => {
        const region = makeRegion([
            { type: 'other', system: { difficulties: { walk: 1, fly: 1 } } },
        ]);
        expect(RegionHelper.hasDifficultTerrain(region)).toBe(false);
    });
});
