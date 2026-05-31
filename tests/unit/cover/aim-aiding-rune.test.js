/**
 * Aim-Aiding armor rune integration
 * Ensures allied rune wearers do not grant token-based lesser cover to ranged attacks.
 */

import coverDetector from '../../../scripts/cover/auto-cover/CoverDetector.js';
import '../../setup.js';

function createActor({ id, uuid, alliance = 'party', items = [], rollOptions = [] } = {}) {
    return {
        id: id || 'actor-' + Math.random().toString(36).slice(2),
        uuid: uuid || (id ? `Actor.${id}` : undefined),
        type: 'character',
        alliance,
        items,
        itemTypes: {
            armor: items.filter((item) => item?.type === 'armor'),
        },
        getRollOptions: jest.fn(() => rollOptions),
        system: { traits: { size: { value: 'med' } } },
    };
}

function createArmor({ runes = [], isEquipped = true, isInvested = true } = {}) {
    return {
        type: 'armor',
        isEquipped,
        isInvested,
        system: {
            equipped: { carryType: isEquipped ? 'worn' : 'held' },
            runes: { property: runes },
            traits: { value: ['magical'] },
        },
    };
}

describe('CoverDetector - Aim-Aiding armor rune', () => {
    beforeEach(() => {
        global.canvas.walls.placeables = [];
        global.canvas.tokens.placeables = [];
        global.canvas.tokens.controlled = [];

        game.settings.set('pf2e-visioner', 'autoCoverIgnoreUndetected', false);
        game.settings.set('pf2e-visioner', 'autoCoverIgnoreDead', false);
        game.settings.set('pf2e-visioner', 'autoCoverIgnoreAllies', false);
        game.settings.set('pf2e-visioner', 'autoCoverAllowProneBlockers', true);
        game.settings.set('pf2e-visioner', 'autoCoverTokenIntersectionMode', 'tactical');
        game.settings.set('pf2e-visioner', 'wallCoverAllowGreater', true);
    });

    test('ignores allied blocker wearing an Aim-Aiding rune for ranged attacks', () => {
        const attackerActor = createActor({ id: 'attacker', alliance: 'party' });
        const blockerActor = createActor({
            id: 'blocker',
            alliance: 'party',
            items: [createArmor({ runes: ['aimAiding'] })],
        });
        const targetActor = createActor({ id: 'target', alliance: 'opposition' });

        const attacker = global.createMockToken({
            id: 'attacker-token',
            x: 0,
            y: 0,
            center: { x: 25, y: 25 },
            actor: attackerActor,
        });
        const target = global.createMockToken({
            id: 'target-token',
            x: 300,
            y: 0,
            center: { x: 325, y: 25 },
            actor: targetActor,
        });
        const blocker = global.createMockToken({
            id: 'blocker-token',
            x: 150,
            y: 0,
            center: { x: 175, y: 25 },
            actor: blockerActor,
        });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike', 'item:ranged']) },
        });

        expect(cover).toBe('none');
    });

    test('still counts allied Aim-Aiding wearer as cover for melee attacks', () => {
        const attackerActor = createActor({ id: 'attacker', alliance: 'party' });
        const blockerActor = createActor({
            id: 'blocker',
            alliance: 'party',
            items: [createArmor({ runes: ['aimAiding'] })],
        });
        const targetActor = createActor({ id: 'target', alliance: 'opposition' });

        const attacker = global.createMockToken({
            id: 'attacker-token',
            x: 0,
            y: 0,
            center: { x: 25, y: 25 },
            actor: attackerActor,
        });
        const target = global.createMockToken({
            id: 'target-token',
            x: 300,
            y: 0,
            center: { x: 325, y: 25 },
            actor: targetActor,
        });
        const blocker = global.createMockToken({
            id: 'blocker-token',
            x: 150,
            y: 0,
            center: { x: 175, y: 25 },
            actor: blockerActor,
        });

        global.canvas.tokens.placeables = [attacker, target, blocker];

        const cover = coverDetector.detectBetweenTokens(attacker, target, {
            attackContext: { type: 'strike-attack-roll', options: new Set(['action:strike', 'item:melee']) },
        });

        expect(cover).not.toBe('none');
    });
});
