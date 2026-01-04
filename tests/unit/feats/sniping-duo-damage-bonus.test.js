import { MODULE_ID } from '../../../scripts/constants.js';
import '../../setup.js';

function createFlaggedActor({ id, uuid, items = [], flags = {} } = {}) {
    const actor = createMockActor({ id, uuid, items });
    actor.uuid = uuid || actor.uuid || `Actor.${actor.id}`;
    actor.items = items;
    actor.flags = actor.flags || {};
    actor.flags[MODULE_ID] = { ...flags };

    actor.getFlag = jest.fn((mod, key) => actor.flags?.[mod]?.[key] ?? null);
    actor.setFlag = jest.fn(async (mod, key, value) => {
        actor.flags[mod] = actor.flags[mod] || {};
        actor.flags[mod][key] = value;
        return value;
    });
    actor.unsetFlag = jest.fn(async (mod, key) => {
        if (actor.flags?.[mod]) delete actor.flags[mod][key];
    });

    return actor;
}

function featItem(slug) {
    return { type: 'feat', system: { slug } };
}

describe('Sniping Duo damage bonus', () => {
    test('successful Strike grants next-Strike damage bonus to other member vs target', async () => {
        jest.resetModules();

        const targetActor = createFlaggedActor({ id: 'target', uuid: 'Actor.target' });

        const spotterActor = createFlaggedActor({
            id: 'spotter',
            uuid: 'Actor.spotter',
        });

        const sniperActor = createFlaggedActor({
            id: 'sniper',
            uuid: 'Actor.sniper',
            items: [featItem('sniping-duo-dedication')],
            flags: {
                snipingDuoSpotterActorUuid: spotterActor.uuid,
            },
        });

        const sniperToken = createMockToken({ id: 't-sniper', actor: sniperActor });
        const spotterToken = createMockToken({ id: 't-spotter', actor: spotterActor });
        const targetToken = createMockToken({ id: 't-target', actor: targetActor });

        canvas.tokens.placeables = [sniperToken, spotterToken, targetToken];
        canvas.tokens.get = jest.fn((id) => {
            if (id === 't-sniper') return sniperToken;
            if (id === 't-spotter') return spotterToken;
            if (id === 't-target') return targetToken;
            return null;
        });

        game.actors = {
            get: jest.fn((id) => (id === sniperActor.id ? sniperActor : null)),
        };

        const { SnipingDuoDamageBonus } = await import('../../../scripts/feats/sniping-duo-damage-bonus.js');

        const message = {
            timestamp: Date.now(),
            speaker: { token: 't-sniper', actor: sniperActor.id },
            flags: {
                pf2e: {
                    context: {
                        type: 'strike-attack-roll',
                        outcome: 'success',
                        target: { token: 't-target' },
                    },
                },
            },
        };

        await SnipingDuoDamageBonus._test.handleCreateChatMessage(message);

        const state = await spotterActor.getFlag(MODULE_ID, 'snipingDuoNextStrikeDamageBonus');
        expect(state).toBeTruthy();
        expect(state[targetActor.uuid]).toEqual(
            expect.objectContaining({
                targetActorKey: targetActor.uuid,
                grantedByActorKey: sniperActor.uuid,
            }),
        );
    });

    test('applies +1 per weapon die on next Strike damage and consumes the bonus', async () => {
        jest.resetModules();

        const targetActor = createFlaggedActor({ id: 'target', uuid: 'Actor.target' });
        const spotterActor = createFlaggedActor({ id: 'spotter', uuid: 'Actor.spotter' });

        await spotterActor.setFlag(MODULE_ID, 'snipingDuoNextStrikeDamageBonus', {
            [targetActor.uuid]: {
                targetActorKey: targetActor.uuid,
                grantedByActorKey: 'Actor.sniper',
                createdAt: Date.now(),
                expires: null,
            },
        });

        const { SnipingDuoDamageBonus } = await import('../../../scripts/feats/sniping-duo-damage-bonus.js');

        const context = {
            actor: spotterActor,
            target: targetActor,
            modifiers: [],
        };

        const roll = { formula: '2d6+4' };

        await SnipingDuoDamageBonus._test.handlePreRollDamage(roll, context);

        expect(context.modifiers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    modifier: 2,
                    type: 'circumstance',
                }),
            ]),
        );

        const state = await spotterActor.getFlag(MODULE_ID, 'snipingDuoNextStrikeDamageBonus');
        expect(state).toBeNull();
    });

    test('expires at end of the other member next turn', async () => {
        jest.resetModules();

        const actor = createFlaggedActor({ id: 'a', uuid: 'Actor.a' });

        const combatants = [
            { actor },
            { actor: createFlaggedActor({ id: 'b', uuid: 'Actor.b' }) },
        ];

        game.combat = {
            id: 'combat-1',
            _id: 'combat-1',
            started: true,
            round: 1,
            turn: 1,
            turns: combatants,
            combatants: { size: 2, contents: combatants },
        };

        const { SnipingDuoDamageBonus } = await import('../../../scripts/feats/sniping-duo-damage-bonus.js');

        const expiry = SnipingDuoDamageBonus._test.computeExpiryForNextTurnEnd(actor);
        expect(expiry).toEqual(
            expect.objectContaining({
                round: 2,
                actorIndex: 0,
            }),
        );

        const rec = { expires: expiry };

        game.combat.round = 2;
        game.combat.turn = 0;
        expect(SnipingDuoDamageBonus._test.isExpired(rec)).toBe(false);

        game.combat.round = 2;
        game.combat.turn = 1;
        expect(SnipingDuoDamageBonus._test.isExpired(rec)).toBe(true);
    });
});
