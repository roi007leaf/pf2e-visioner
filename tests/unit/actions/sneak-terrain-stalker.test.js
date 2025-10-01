/**
 * Terrain Stalker free-sneak tests
 */

import '../../setup.js';

// Mock FeatsHandler to simulate Terrain Stalker selection and environment
jest.mock('../../../scripts/chat/services/feats-handler.js', () => ({
    FeatsHandler: {
        getTerrainStalkerSelection: jest.fn(() => 'underbrush'),
        isEnvironmentActive: jest.fn(() => true),
    },
}));

// Mock EventDrivenVisibilitySystem to report undetected (can be overridden per test)
jest.mock('../../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js', () => ({
    eventDrivenVisibilitySystem: {
        calculateVisibilityWithOverrides: jest.fn(async () => 'undetected'),
    },
}));

describe('Terrain Stalker free-sneak', () => {
    const gridFeet = 5; // feet per square
    const pxPerSquare = 100; // pixels per square

    beforeAll(() => {
        // Ensure canvas + scene grid exists
        global.canvas = global.canvas || {};
        canvas.scene = canvas.scene || {};
        canvas.scene.grid = { size: pxPerSquare, distance: gridFeet };
    });

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    function makeToken(x, y) {
        return {
            center: { x, y },
            document: {
                x,
                y,
                elevation: 0,
                id: `${x},${y}`,
                getFlag: jest.fn(() => ({})),
                flags: {}
            },
            id: `${x},${y}`,
            actor: { id: `a-${x}-${y}` },
            name: `T-${x}-${y}`,
        };
    }

    test('applies when moved <= 1 grid and path >= 10 ft from enemies and all undetected', async () => {
        const { SneakActionHandler } = require('../../../scripts/chat/services/actions/sneak-action.js');
        const handler = new SneakActionHandler();

        // Sneaker moved exactly 1 square: (0,0) -> (100,0)
        const start = { x: 0, y: 0 };
        const actorToken = makeToken(100, 0);

        // Two enemies far enough (>= 300 px => 15 ft)
        const enemy1 = makeToken(200, 300);
        const enemy2 = makeToken(400, -300);

        // Discover all non-allied enemies
        handler.discoverSubjects = jest.fn(async () => [enemy1, enemy2]);

        const actionData = {
            actorToken,
            actor: actorToken, // fallback paths
            storedStartPosition: start,
            roll: { total: 0, dice: [{ results: [{ result: 0 }] }] },
        };

        // Subject used by analyzeOutcome (one observer per call)
        const subject = enemy1;

        // Call through the public path
        const res = await handler.analyzeOutcome(actionData, subject);

        // Since all criteria are met, free path should apply and mark _tsFreeSneak
        expect(res)._isNotNull;
        expect(res._tsFreeSneak).toBe(true);
        // Free path should not change visibility; it preserves the pre-check visibility
        expect(res.newVisibility).toBe(res.currentVisibility);
    });

    test('does not apply if moved > 1 grid', async () => {
        const { SneakActionHandler } = require('../../../scripts/chat/services/actions/sneak-action.js');
        const handler = new SneakActionHandler();

        // Move > 1 square: (0,0) -> (110, 0) ~ 5.5 ft
        const start = { x: 0, y: 0 };
        const actorToken = makeToken(110, 0);

        // One enemy far away
        const enemy = makeToken(1000, 1000);

        handler.discoverSubjects = jest.fn(async () => [enemy]);

        const actionData = {
            actorToken,
            actor: actorToken,
            storedStartPosition: start,
            roll: { total: 0, dice: [{ results: [{ result: 0 }] }] },
        };

        const subject = enemy;

        const res = await handler.analyzeOutcome(actionData, subject);

        // Free path shouldn't be marked; newVisibility is computed by normal flow
        expect(res._tsFreeSneak).not.toBe(true);
    });

    test('does not apply if path comes within < 10 ft of an enemy', async () => {
        const { SneakActionHandler } = require('../../../scripts/chat/services/actions/sneak-action.js');
        const handler = new SneakActionHandler();

        // Segment: (0,0) -> (100,0). Enemy at (50, 100) => 100 px = 5 ft from path
        const start = { x: 0, y: 0 };
        const actorToken = makeToken(100, 0);
        const closeEnemy = makeToken(50, 100);

        handler.discoverSubjects = jest.fn(async () => [closeEnemy]);

        const actionData = {
            actorToken,
            actor: actorToken,
            storedStartPosition: start,
            roll: { total: 0, dice: [{ results: [{ result: 0 }] }] },
        };

        const res = await handler.analyzeOutcome(actionData, closeEnemy);

        expect(res._tsFreeSneak).not.toBe(true);
    });

    test('does not apply if any enemy does not see sneaker as undetected', async () => {
        const { SneakActionHandler } = require('../../../scripts/chat/services/actions/sneak-action.js');
        const { eventDrivenVisibilitySystem } = require('../../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js');

        // Make one enemy return observed
        eventDrivenVisibilitySystem.calculateVisibilityWithOverrides
            .mockImplementationOnce(async () => 'undetected')
            .mockImplementationOnce(async () => 'observed');

        const handler = new SneakActionHandler();

        const start = { x: 0, y: 0 };
        const actorToken = makeToken(100, 0);
        const e1 = makeToken(300, 300);
        const e2 = makeToken(400, 400);

        handler.discoverSubjects = jest.fn(async () => [e1, e2]);

        const actionData = {
            actorToken,
            actor: actorToken,
            storedStartPosition: start,
            roll: { total: 0, dice: [{ results: [{ result: 0 }] }] },
        };

        const res = await handler.analyzeOutcome(actionData, e1);

        expect(res._tsFreeSneak).not.toBe(true);
    });
});
