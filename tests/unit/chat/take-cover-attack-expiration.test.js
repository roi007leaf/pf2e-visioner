import '../../setup.js';

describe('Take Cover attack expiration', () => {
  let expireTakeCoverOnAttackMessage;

  beforeEach(async () => {
    jest.resetModules();
    global.game.user.isGM = true;
    delete global.ChatMessage;
    canvas.tokens.placeables = [];
    canvas.tokens.get.mockReset();
    const module = await import('../../../scripts/chat/services/take-cover-expiration-service.js');
    expireTakeCoverOnAttackMessage = module.expireTakeCoverOnAttackMessage;
  });

  test('prompts the GM when a prone ranged Take Cover actor makes an attack roll', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
    global.ChatMessage = {
      create,
      getSpeaker: jest.fn(() => ({ token: 'token-1' })),
      getWhisperRecipients: jest.fn(() => [{ id: 'gm-1' }]),
    };
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

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Remove Take Cover'),
        whisper: ['gm-1'],
      }),
    );
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('prompts the GM when the actor uses an action with the attack trait', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
    global.ChatMessage = {
      create,
      getSpeaker: jest.fn(() => ({ token: 'token-1' })),
      getWhisperRecipients: jest.fn(() => [{ id: 'gm-1' }]),
    };
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

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Remove Take Cover'),
        whisper: ['gm-1'],
      }),
    );
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
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

  test('prompts the GM for AVS Take Cover cover tracking when the actor attacks', async () => {
    const removeTakeCoverProneRangedEffects = jest.fn().mockResolvedValue();
    jest.doMock('../../../scripts/cover/batch.js', () => ({
      __esModule: true,
      removeTakeCoverProneRangedEffects,
    }));
    const create = jest.fn().mockResolvedValue({ id: 'msg-1' });
    global.ChatMessage = {
      create,
      getSpeaker: jest.fn(() => ({ token: 'token-1' })),
      getWhisperRecipients: jest.fn(() => [{ id: 'gm-1' }]),
    };

    const { expireTakeCoverOnAttackMessage } = await import(
      '../../../scripts/chat/services/take-cover-expiration-service.js'
    );

    const actor = {
      itemTypes: { effect: [] },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    const target = {
      id: 'token-1',
      name: 'Attacker',
      actor,
      document: {
        id: 'token-1',
        name: 'Attacker',
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-1': {
              observerId: 'observer-1',
              targetId: 'token-1',
              state: 'avs',
              source: 'take_cover_action',
              coverOnly: true,
              coverOverrideSource: 'take_cover_action',
              expectedCover: 'standard',
            },
          },
        },
      },
    };
    canvas.tokens.get.mockImplementation((id) => ({ 'token-1': target }[id] || null));
    canvas.tokens.placeables = [target];
    const message = {
      token: { object: target },
      flags: { pf2e: { context: { type: 'attack-roll', options: ['item:ranged'] } } },
    };

    await expireTakeCoverOnAttackMessage(message);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        speaker: { token: 'token-1' },
        whisper: ['gm-1'],
        content: expect.stringContaining('Remove Take Cover'),
        flags: {
          'pf2e-visioner': expect.objectContaining({
            takeCoverExpiration: expect.objectContaining({
              tokenId: 'token-1',
              reason: 'attack',
              status: 'pending',
            }),
          }),
        },
      }),
    );
    expect(removeTakeCoverProneRangedEffects).not.toHaveBeenCalled();
  });

  test('accepting the chat prompt removes Take Cover tracking', async () => {
    const setCoverBetween = jest.fn().mockResolvedValue(true);
    jest.doMock('../../../scripts/stores/cover-map.js', () => ({
      __esModule: true,
      getCoverBetween: jest.fn(() => 'standard'),
      setCoverBetween,
    }));

    const observer = {
      id: 'observer-1',
      name: 'Observer',
      actor: {},
      document: { id: 'observer-1', name: 'Observer' },
    };
    const actor = {
      itemTypes: { effect: [] },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    const target = {
      id: 'token-1',
      name: 'Attacker',
      actor,
      document: {
        id: 'token-1',
        name: 'Attacker',
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-1': {
              observerId: 'observer-1',
              targetId: 'token-1',
              state: 'avs',
              source: 'take_cover_action',
              coverOnly: true,
              coverOverrideSource: 'take_cover_action',
              expectedCover: 'standard',
              takeCoverExpirationPending: true,
              takeCoverExpirationReason: 'attack',
            },
          },
        },
        getFlag: jest.fn((mod, key) =>
          mod === 'pf2e-visioner' && key === 'avs-override-from-observer-1'
            ? target.document.flags['pf2e-visioner']['avs-override-from-observer-1']
            : undefined,
        ),
        unsetFlag: jest.fn().mockResolvedValue(true),
      },
    };
    canvas.tokens.get.mockImplementation((id) => ({ 'observer-1': observer, 'token-1': target }[id] || null));
    canvas.tokens.placeables = [observer, target];
    const message = {
      flags: {
        'pf2e-visioner': {
          takeCoverExpiration: {
            tokenId: 'token-1',
            reason: 'attack',
            status: 'pending',
          },
        },
      },
      update: jest.fn().mockResolvedValue(true),
    };

    const { acceptTakeCoverExpirationMessage } = await import(
      '../../../scripts/chat/services/take-cover-expiration-service.js'
    );

    await acceptTakeCoverExpirationMessage(message);

    expect(setCoverBetween).toHaveBeenCalledWith(
      observer,
      target,
      'none',
      expect.objectContaining({ skipEphemeralUpdate: false }),
    );
    expect(target.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-observer-1',
    );
    expect(message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        'flags.pf2e-visioner.takeCoverExpiration.status': 'accepted',
        content: expect.stringContaining('Take Cover removed'),
      }),
    );

    const create = jest.fn().mockResolvedValue({ id: 'msg-2' });
    global.ChatMessage = {
      create,
      getSpeaker: jest.fn(() => ({ token: 'token-1' })),
      getWhisperRecipients: jest.fn(() => [{ id: 'gm-1' }]),
    };

    const { requestTakeCoverExpirationForToken } = await import(
      '../../../scripts/chat/services/take-cover-expiration-service.js'
    );

    await expect(requestTakeCoverExpirationForToken(target, 'attack')).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
