import { EncounterMasterDialog } from '../../../scripts/ui/dialogs/EncounterMasterDialog.js';

describe('EncounterMasterDialog', () => {
    let dialog;

    beforeEach(() => {
        global.canvas = {
            tokens: {
                placeables: [],
                get: jest.fn()
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('_getSceneTokens', () => {
        test('filters out hazard tokens', () => {
            const hazardToken = createMockToken({
                id: 'hazard-1',
                actor: createMockActor({ type: 'hazard' })
            });
            const characterToken = createMockToken({
                id: 'char-1',
                actor: createMockActor({ type: 'character' })
            });
            global.canvas.tokens.placeables = [hazardToken, characterToken];

            dialog = new EncounterMasterDialog('', 'exclude-id');
            const result = dialog._getSceneTokens();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('char-1');
        });

        test('filters out loot tokens', () => {
            const lootToken = createMockToken({
                id: 'loot-1',
                actor: createMockActor({ type: 'loot' })
            });
            const npcToken = createMockToken({
                id: 'npc-1',
                actor: createMockActor({ type: 'npc' })
            });
            global.canvas.tokens.placeables = [lootToken, npcToken];

            dialog = new EncounterMasterDialog('', 'exclude-id');
            const result = dialog._getSceneTokens();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('npc-1');
        });

        test('excludes the specified token', () => {
            const token1 = createMockToken({ id: 'token-1' });
            const token2 = createMockToken({ id: 'token-2' });
            global.canvas.tokens.placeables = [token1, token2];

            dialog = new EncounterMasterDialog('', 'token-1');
            const result = dialog._getSceneTokens();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('token-2');
        });

        test('sorts tokens by proximity to excluded token', () => {
            const excludeToken = createMockToken({
                id: 'exclude',
                center: { x: 0, y: 0 }
            });
            const farToken = createMockToken({
                id: 'far',
                center: { x: 300, y: 400 }
            });
            const nearToken = createMockToken({
                id: 'near',
                center: { x: 30, y: 40 }
            });
            const midToken = createMockToken({
                id: 'mid',
                center: { x: 60, y: 80 }
            });

            global.canvas.tokens.placeables = [excludeToken, farToken, nearToken, midToken];
            global.canvas.tokens.get = jest.fn((id) => {
                if (id === 'exclude') return excludeToken;
                return null;
            });

            dialog = new EncounterMasterDialog('', 'exclude');
            const result = dialog._getSceneTokens();

            expect(result).toHaveLength(3);
            expect(result[0].id).toBe('near');
            expect(result[1].id).toBe('mid');
            expect(result[2].id).toBe('far');
        });

        test('filters hazards and loot then sorts by proximity', () => {
            const excludeToken = createMockToken({
                id: 'exclude',
                center: { x: 0, y: 0 }
            });
            const hazardToken = createMockToken({
                id: 'hazard',
                center: { x: 10, y: 10 },
                actor: createMockActor({ type: 'hazard' })
            });
            const farNpc = createMockToken({
                id: 'far-npc',
                center: { x: 200, y: 200 },
                actor: createMockActor({ type: 'npc' })
            });
            const nearChar = createMockToken({
                id: 'near-char',
                center: { x: 50, y: 50 },
                actor: createMockActor({ type: 'character' })
            });

            global.canvas.tokens.placeables = [excludeToken, hazardToken, farNpc, nearChar];
            global.canvas.tokens.get = jest.fn((id) => {
                if (id === 'exclude') return excludeToken;
                return null;
            });

            dialog = new EncounterMasterDialog('', 'exclude');
            const result = dialog._getSceneTokens();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('near-char');
            expect(result[1].id).toBe('far-npc');
        });
    });
});
