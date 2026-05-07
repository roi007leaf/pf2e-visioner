import '../../setup.js';

describe('Vision for NPCs setting application', () => {
    let originalScenes;
    let originalActors;

    beforeEach(() => {
        originalScenes = game.scenes;
        originalActors = game.actors;

        game.user.isGM = true;

        game.settings.set('pf2e-visioner', 'enableAllTokensVision', false);

        const npcTokenOff = {
            id: 'npc-off',
            vision: false,
            sight: { enabled: false },
            actor: { type: 'npc' },
        };

        const npcTokenOn = {
            id: 'npc-on',
            vision: true,
            sight: { enabled: true },
            actor: { type: 'npc' },
        };

        const pcToken = {
            id: 'pc',
            actorId: 'pc-actor',
            vision: true,
            sight: { enabled: true },
            actor: { type: 'character' },
        };

        const partyToken = {
            id: 'party',
            actorId: 'party-actor',
            vision: true,
            sight: { enabled: true },
            get actor() {
                throw new Error('party token actor getter should not be accessed');
            },
        };

        const mockScene = {
            tokens: { contents: [npcTokenOff, npcTokenOn, pcToken, partyToken] },
            updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        };

        const npcActor = {
            id: 'npc-actor',
            type: 'npc',
            prototypeToken: { vision: false, sight: { enabled: false } },
            update: jest.fn().mockResolvedValue({}),
        };

        const pcActor = {
            id: 'pc-actor',
            type: 'character',
            prototypeToken: { vision: false, sight: { enabled: false } },
            update: jest.fn().mockResolvedValue({}),
        };

        const partyActor = {
            id: 'party-actor',
            type: 'party',
            prototypeToken: { vision: true, sight: { enabled: true } },
            update: jest.fn().mockResolvedValue({}),
        };

        game.scenes = { contents: [mockScene] };
        game.actors = {
            contents: [npcActor, pcActor, partyActor],
            get: jest.fn((id) =>
                [npcActor, pcActor, partyActor].find((actor) => actor.id === id) ?? null,
            ),
        };
    });

    afterEach(() => {
        game.scenes = originalScenes;
        game.actors = originalActors;
        jest.restoreAllMocks();
    });

    test('enabling turns on vision for existing NPC tokens and NPC prototype tokens only', async () => {
        const scene = game.scenes.contents[0];
        const npcActor = game.actors.contents[0];
        const pcActor = game.actors.contents[1];
        const partyActor = game.actors.contents[2];

        game.settings.set('pf2e-visioner', 'enableAllTokensVision', true);

        const { applyEnableAllTokensVisionSetting } = await import('../../../scripts/hooks/lifecycle.js');
        await applyEnableAllTokensVisionSetting(true);

        expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
            'Token',
            [expect.objectContaining({ _id: 'npc-off', vision: true, sight: { enabled: true } })],
            expect.objectContaining({ diff: false, render: false }),
        );

        expect(npcActor.update).toHaveBeenCalledWith(
            expect.objectContaining({
                'prototypeToken.vision': true,
                'prototypeToken.sight.enabled': true,
            }),
            expect.any(Object),
        );

        expect(pcActor.update).not.toHaveBeenCalled();
        expect(partyActor.update).not.toHaveBeenCalled();
    });

    test('disabling turns off vision for existing NPC tokens and NPC prototype tokens only', async () => {
        const scene = game.scenes.contents[0];
        const npcActor = game.actors.contents[0];
        const pcActor = game.actors.contents[1];

        npcActor.prototypeToken.vision = true;
        npcActor.prototypeToken.sight.enabled = true;

        game.settings.set('pf2e-visioner', 'enableAllTokensVision', false);

        const { applyEnableAllTokensVisionSetting } = await import('../../../scripts/hooks/lifecycle.js');
        await applyEnableAllTokensVisionSetting(false);

        expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
            'Token',
            [expect.objectContaining({ _id: 'npc-on', vision: false, sight: { enabled: false } })],
            expect.objectContaining({ diff: false, render: false }),
        );

        expect(npcActor.update).toHaveBeenCalledWith(
            expect.objectContaining({
                'prototypeToken.vision': false,
                'prototypeToken.sight.enabled': false,
            }),
            expect.any(Object),
        );
        expect(pcActor.update).not.toHaveBeenCalled();
    });
});
