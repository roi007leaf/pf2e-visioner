import '../setup.js';

describe('Echolocation integration', () => {
    test('FeatsHandler.adjustVisibility does not set temp echolocation flag (effect-driven)', async () => {
        const mod = require('../../scripts/chat/services/feats-handler.js');
        const FeatsHandler = mod.FeatsHandler || mod.default || mod;

        // Ensure a combat exists for expiry metadata
        global.game.combat = { id: 'cmb1', turn: 2, round: 1 };

        // Actor with an echolocation feat and setFlag mocked (legacy)
        const actor = {
            items: [{ type: 'feat', system: { slug: 'echolocation' } }],
            type: 'character', // mark as PC
            hasPlayerOwner: true,
            system: { attributes: {} },
            uuid: 'Actor.xyz',
            setFlag: jest.fn().mockResolvedValue(true),
        };

        // Call adjustVisibility for Seek; should set a flag but not change visibility here
        const result = FeatsHandler.adjustVisibility('seek', actor, 'observed', 'observed', {});
        expect(result).toBe('observed');

        // New behavior: no temporary flag is set; relies on PF2e effect item
        expect(actor.setFlag).not.toHaveBeenCalled();
    });

    test('FeatsHandler.adjustVisibility does not set echolocation flag for NPCs', async () => {
        const mod = require('../../scripts/chat/services/feats-handler.js');
        const FeatsHandler = mod.FeatsHandler || mod.default || mod;

        global.game.combat = { id: 'cmb1', turn: 2, round: 1 };

        // NPC actor with echolocation feat
        const npc = {
            items: [{ type: 'feat', system: { slug: 'echolocation' } }],
            type: 'npc',
            hasPlayerOwner: false,
            system: { attributes: {} },
            uuid: 'Actor.npc',
            setFlag: jest.fn().mockResolvedValue(true),
        };

        const result = FeatsHandler.adjustVisibility('seek', npc, 'observed', 'observed', {});
        expect(result).toBe('observed');
        expect(npc.setFlag).not.toHaveBeenCalled();
    });

    test('VisionAnalyzer: echolocation upgrades hearing to precise within range and is considered precise non-visual', () => {
        const { VisionAnalyzer } = require('../../scripts/visibility/auto-visibility/VisionAnalyzer.js');

        // Observer token with imprecise hearing 60 ft and active effect 'effect-echolocation' (40 ft default)
        const observerActor = {
            system: { perception: { senses: { hearing: { value: { acuity: 'imprecise', range: 60 } } } } },
            itemTypes: { effect: [{ slug: 'effect-echolocation', name: 'Echolocation (Seek)' }] },
        };
        const observer = global.createMockToken({ id: 'observer', x: 0, y: 0, actor: observerActor });

        // Target within 15 ft (3 grid squares)
        const target = global.createMockToken({ id: 'target', x: 3, y: 0 });

        const va = VisionAnalyzer.getInstance();
        const summary = va.getSensingSummary(observer);

        expect(summary.echolocationActive).toBe(true);
        expect(summary.echolocationRange).toBe(40);
        // precise should include hearing at range 40
        const hearingPrecise = summary.precise.find((s) => s.type === 'hearing');
        expect(hearingPrecise).toBeTruthy();
        expect(hearingPrecise.range).toBe(40);

        // With target within 15 ft, precise non-visual should be in range
        expect(va.hasPreciseNonVisualInRange(observer, target)).toBe(true);
        // And imprecise sensing also reaches (hearing 60 ft imprecise)
        expect(va.canSenseImprecisely(observer, target)).toBe(true);
    });

    // noisy environment feature removed; no hearing distortion tests remain
});
