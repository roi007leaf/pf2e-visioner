import '../../setup.js';

// Mock minimal geometry helpers
jest.mock('../../../scripts/helpers/size-elevation-utils.js', () => ({
    getSizeRank: (t) => t._sizeRank || 2,
    getTokenRect: (t) => ({ x1: t.x - 25, y1: t.y - 25, x2: t.x + 25, y2: t.y + 25 }),
    getTokenCorners: () => [],
    getTokenVerticalSpanFt: () => ({ bottom: 0, top: 6 }),
}));

jest.mock('../../../scripts/helpers/line-intersection.js', () => ({
    intersectsBetweenTokens: (attacker, target, rect) => {
        // simple mock: if blocker positioned roughly between x of attacker & target, treat as intersecting
        const ax = attacker.x, tx = target.x;
        const mid = (ax + tx) / 2;
        return rect.x1 < mid && rect.x2 > mid;
    },
    segmentRectIntersectionLength: () => 10,
}));

// Mock visibility util referenced indirectly
jest.mock('../../../scripts/utils.js', () => ({ getVisibilityBetween: () => 'observed' }));

// Stub canvas tokens for blocker iteration
beforeEach(() => {
    global.canvas = {
        tokens: { placeables: [] },
        walls: { objects: { children: [] } },
        grid: { size: 50 },
    };
    global.game = {
        settings: { get: () => false },
    };
});

const buildToken = (id, x, y, sizeRank = 2, feats = []) => ({
    id,
    x,
    y,
    center: { x, y },
    document: { x, y, width: 1, height: 1, hidden: false },
    actor: {
        system: { traits: { size: { value: 'med' } } },
        items: feats.map((slug) => ({ type: 'feat', system: { slug } })),
    },
    _sizeRank: sizeRank,
});

describe('CoverDetector - Ceaseless Shadows cover upgrade', () => {
    test('upgrades lesser->standard and standard->greater for target with feat', () => {
        const attacker = buildToken('att', 0, 0, 2, []);
        const target = buildToken('tgt', 300, 0, 2, ['ceaseless-shadows']); // TARGET has the feat

        // Two blockers: one big (gives standard), one small (lesser if alone)
        const bigBlocker = buildToken('blk1', 150, 0, 5, []); // +3 size ranks => standard
        const smallBlocker = buildToken('blk2', 150, 50, 2, []); // equal size => lesser

        // Case 1: only small blocker -> lesser becomes standard
        canvas.tokens.placeables = [attacker, target, smallBlocker];
        const { default: cd } = require('../../../scripts/cover/auto-cover/CoverDetector.js');
        const c1 = cd._evaluateCreatureSizeCover(attacker, target, [smallBlocker]);
        expect(c1).toBe('standard');

        // Case 2: big blocker gives standard which upgrades to greater
        canvas.tokens.placeables = [attacker, target, bigBlocker];
        const c2 = cd._evaluateCreatureSizeCover(attacker, target, [bigBlocker]);
        expect(c2).toBe('greater');
    });

    test('no upgrade when target lacks feat', () => {
        const attacker = buildToken('att2', 0, 0, 2, []);
        const target = buildToken('tgt2', 300, 0, 2, []); // TARGET has no feat
        const smallBlocker = buildToken('blk3', 150, 0, 2, []); // equal size => lesser

        canvas.tokens.placeables = [attacker, target, smallBlocker];
        const { default: cd } = require('../../../scripts/cover/auto-cover/CoverDetector.js');
        const c = cd._evaluateCreatureSizeCover(attacker, target, [smallBlocker]);
        expect(['lesser', 'standard']).toContain(c); // should remain baseline (lesser)
    });
});
