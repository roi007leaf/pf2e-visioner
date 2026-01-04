/**
 * Sniping Duo Dedication integration
 * Ensures designated duo members do not grant token-based lesser cover to one another's Strikes.
 */

import coverDetector from '../../../scripts/cover/auto-cover/CoverDetector.js';
import '../../setup.js';

function createActor({ id, uuid, items = [], flags = {} } = {}) {
    const store = { ...flags };
    return {
        id: id || 'actor-' + Math.random().toString(36).slice(2),
        uuid: uuid || (id ? `Actor.${id}` : undefined),
        items,
        flags: { 'pf2e-visioner': { ...store } },
        getFlag: jest.fn((moduleId, key) => {
            if (moduleId !== 'pf2e-visioner') return null;
            return store[key] !== undefined ? store[key] : null;
        }),
        setFlag: jest.fn(async (moduleId, key, value) => {
            if (moduleId !== 'pf2e-visioner') return false;
            store[key] = value;
            return true;
        }),
        unsetFlag: jest.fn(async (moduleId, key) => {
            if (moduleId !== 'pf2e-visioner') return false;
            delete store[key];
            return true;
        }),
        system: { traits: { size: { value: 'med' } } },
    };
}

describe('CoverDetector - Sniping Duo Dedication', () => {
    beforeEach(() => {
        global.canvas.tokens.placeables = [];
        global.canvas.tokens.controlled = [];

        try {
            coverDetector._snipingDuoRecords?.clear?.();
        } catch { }

        game.settings.set('pf2e-visioner', 'autoCoverIgnoreUndetected', false);
        game.settings.set('pf2e-visioner', 'autoCoverIgnoreDead', false);
        game.settings.set('pf2e-visioner', 'autoCoverIgnoreAllies', false);
        game.settings.set('pf2e-visioner', 'autoCoverAllowProneBlockers', true);

        game.settings.set('pf2e-visioner', 'autoCoverTokenIntersectionMode', 'tactical');
    });

    test('does not apply when no duo link is present', () => {
        const sniperActor = createActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [{ type: 'feat', system: { slug: 'sniping-duo-dedication' } }],
        });
        const targetActor = createActor({ id: 'target', uuid: 'Actor.target' });
        const spotterActor = createActor({ id: 'spotter', uuid: 'Actor.spotter' });

        const attacker = global.createMockToken({ id: 'attacker', x: 0, y: 0, center: { x: 25, y: 25 }, actor: sniperActor });
        const target = global.createMockToken({ id: 'targetToken', x: 300, y: 0, center: { x: 325, y: 25 }, actor: targetActor });
        const blocker = global.createMockToken({ id: 'blocker', x: 150, y: 0, center: { x: 175, y: 25 }, actor: spotterActor });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike']) },
        });

        expect(cover).not.toBe('none');
        expect(coverDetector.peekSnipingDuoCoverIgnore(attacker.id, target.id)).toBeNull();
    });

    test('ignores designated spotter only when it actually blocks (Strike)', () => {
        const sniperActor = createActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [{ type: 'feat', system: { slug: 'sniping-duo-dedication' } }],
            flags: { snipingDuoSpotterActorUuid: 'Actor.spotter' },
        });
        const targetActor = createActor({ id: 'target', uuid: 'Actor.target' });
        const spotterActor = createActor({ id: 'spotter', uuid: 'Actor.spotter' });

        const attacker = global.createMockToken({ id: 'attacker', x: 0, y: 0, center: { x: 25, y: 25 }, actor: sniperActor });
        const target = global.createMockToken({ id: 'targetToken', x: 300, y: 0, center: { x: 325, y: 25 }, actor: targetActor });
        const blocker = global.createMockToken({ id: 'blocker', x: 150, y: 0, center: { x: 175, y: 25 }, actor: spotterActor });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike']) },
        });

        expect(cover).toBe('none');
        const rec = coverDetector.peekSnipingDuoCoverIgnore(attacker.id, target.id);
        expect(rec).toEqual(expect.objectContaining({
            feat: 'sniping-duo-dedication',
            ignoredTokenId: 'blocker',
        }));
    });

    test('does not apply to non-Strike attack rolls (even if duo member is between)', () => {
        const sniperActor = createActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [{ type: 'feat', system: { slug: 'sniping-duo-dedication' } }],
            flags: { snipingDuoSpotterActorUuid: 'Actor.spotter' },
        });
        const targetActor = createActor({ id: 'target', uuid: 'Actor.target' });
        const spotterActor = createActor({ id: 'spotter', uuid: 'Actor.spotter' });

        const attacker = global.createMockToken({ id: 'attacker', x: 0, y: 0, center: { x: 25, y: 25 }, actor: sniperActor });
        const target = global.createMockToken({ id: 'targetToken', x: 300, y: 0, center: { x: 325, y: 25 }, actor: targetActor });
        const blocker = global.createMockToken({ id: 'blocker', x: 150, y: 0, center: { x: 175, y: 25 }, actor: spotterActor });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'attack-roll', options: new Set(['attack:ranged']) },
        });

        expect(cover).not.toBe('none');
        expect(coverDetector.peekSnipingDuoCoverIgnore(attacker.id, target.id)).toBeNull();
    });

    test('does not record ignore when duo member does not block (clear line)', () => {
        const sniperActor = createActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [{ type: 'feat', system: { slug: 'sniping-duo-dedication' } }],
            flags: { snipingDuoSpotterActorUuid: 'Actor.spotter' },
        });
        const targetActor = createActor({ id: 'target', uuid: 'Actor.target' });
        const spotterActor = createActor({ id: 'spotter', uuid: 'Actor.spotter' });

        const attacker = global.createMockToken({ id: 'attacker', x: 0, y: 0, center: { x: 25, y: 25 }, actor: sniperActor });
        const target = global.createMockToken({ id: 'targetToken', x: 300, y: 0, center: { x: 325, y: 25 }, actor: targetActor });
        const blocker = global.createMockToken({ id: 'blocker', x: 150, y: 250, center: { x: 175, y: 275 }, actor: spotterActor });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike']) },
        });

        expect(cover).toBe('none');
        expect(coverDetector.peekSnipingDuoCoverIgnore(attacker.id, target.id)).toBeNull();
    });

    test('ignores the sniper as a blocker for the spotter (verified reciprocal link)', () => {
        const sniperActor = createActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [{ type: 'feat', system: { slug: 'sniping-duo-dedication' } }],
            flags: { snipingDuoSpotterActorUuid: 'Actor.spotter' },
        });
        const spotterActor = createActor({
            id: 'spotter',
            uuid: 'Actor.spotter',
            flags: { snipingDuoSniperActorUuid: 'Actor.sniper' },
        });
        const targetActor = createActor({ id: 'target', uuid: 'Actor.target' });

        const sniperToken = global.createMockToken({ id: 'sniperToken', x: 150, y: 0, center: { x: 175, y: 25 }, actor: sniperActor });
        const attackerSpotter = global.createMockToken({ id: 'spotterToken', x: 0, y: 0, center: { x: 25, y: 25 }, actor: spotterActor });
        const target = global.createMockToken({ id: 'targetToken', x: 300, y: 0, center: { x: 325, y: 25 }, actor: targetActor });

        global.canvas.tokens.placeables = [attackerSpotter, target, sniperToken];

        const cover = coverDetector.detectBetweenTokens(attackerSpotter, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike']) },
        });

        expect(cover).toBe('none');
        const rec = coverDetector.peekSnipingDuoCoverIgnore(attackerSpotter.id, target.id);
        expect(rec).toEqual(expect.objectContaining({
            feat: 'sniping-duo-dedication',
            ignoredTokenId: 'sniperToken',
        }));
    });
});
