import '../../setup.js';

describe('Take Cover attack expiration', () => {
  let expireTakeCoverOnAttackMessage;

  beforeEach(async () => {
    global.game.user.isGM = true;
    const module = await import('../../../scripts/chat/services/take-cover-expiration-service.js');
    expireTakeCoverOnAttackMessage = module.expireTakeCoverOnAttackMessage;
  });

  test('removes the prone ranged Take Cover effect when the actor makes an attack roll', async () => {
    const effect = {
      id: 'effect-1',
      flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } },
    };
    const actor = {
      itemTypes: { effect: [effect] },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    const token = { id: 'token-1', actor };
    const message = {
      token: { object: token },
      flags: { pf2e: { context: { type: 'attack-roll', options: ['item:ranged'] } } },
    };

    await expireTakeCoverOnAttackMessage(message);

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['effect-1']);
  });

  test('removes the prone ranged Take Cover effect when the actor uses an action with the attack trait', async () => {
    const actor = {
      itemTypes: {
        effect: [
          {
            id: 'effect-1',
            flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } },
          },
        ],
      },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    const message = {
      token: { object: { id: 'token-1', actor } },
      flags: {
        pf2e: {
          context: {
            type: 'skill-check',
            slug: 'grapple',
            options: ['action:grapple', 'item:trait:attack'],
          },
        },
      },
    };

    await expireTakeCoverOnAttackMessage(message);

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['effect-1']);
  });

  test('does not remove the Take Cover effect from damage-taken messages', async () => {
    const actor = {
      itemTypes: {
        effect: [
          {
            id: 'effect-1',
            flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } },
          },
        ],
      },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    const message = {
      token: { object: { id: 'token-1', actor } },
      flags: { pf2e: { context: { type: 'damage-taken' } } },
    };

    await expireTakeCoverOnAttackMessage(message);

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
