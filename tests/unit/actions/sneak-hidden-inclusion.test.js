import '../../setup.js';

describe('Sneak hidden-token inclusion', () => {
    test('discoverSubjects includes Foundry-hidden tokens', async () => {
        const sneaker = createMockToken({ id: 'sneaker', actor: createMockActor({ id: 'actorA' }) });
        const enemyVisible = createMockToken({ id: 'enemy1', actor: createMockActor({ id: 'actorE1' }), document: { id: 'enemy1', hidden: false } });
        const enemyHidden = createMockToken({ id: 'enemy2', actor: createMockActor({ id: 'actorE2' }), document: { id: 'enemy2', hidden: true } });

        canvas.tokens.placeables = [sneaker, enemyVisible, enemyHidden];

        const { SneakActionHandler } = await import('../../../scripts/chat/services/actions/sneak-action.js');
        const handler = new SneakActionHandler();
        const subjects = await handler.discoverSubjects({ actor: sneaker });

        const ids = subjects.map(t => t.id).sort();
        expect(ids).toEqual(['enemy1', 'enemy2']);
    });

    test('startSneak captures start states for hidden tokens', async () => {
        const { SneakDialogService } = await import('../../../scripts/chat/services/dialogs/sneak-dialog-service.js');
        const message = { id: 'msg1', setFlag: jest.fn(async () => { }), flags: { 'pf2e-visioner': {} } };
        game.messages = { get: jest.fn(() => message) };

        const sneaker = createMockToken({ id: 'sneaker', actor: createMockActor({ id: 'actorA' }) });
        const enemyHidden = createMockToken({ id: 'enemy2', actor: createMockActor({ id: 'actorE2' }), document: { id: 'enemy2', hidden: true } });
        canvas.tokens.placeables = [sneaker, enemyHidden];

        const svc = new SneakDialogService();
        await svc.startSneak({ actor: sneaker, messageId: 'msg1' });

        // Ensure setFlag called with start states and contains hidden enemy id
        const calls = message.setFlag.mock.calls.filter(c => c[0] === 'pf2e-visioner' && (c[1] === 'sneakStartStates' || c[1] === 'startStates'));
        expect(calls.length).toBeGreaterThan(0);
        const lastPayload = calls[calls.length - 1][2];
        expect(lastPayload).toBeTruthy();
        const keys = Object.keys(lastPayload);
        expect(keys).toContain('enemy2');
    });
});
