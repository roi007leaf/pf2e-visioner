import '../../setup.js';

describe('sneak token resolution', () => {
  test('prefers explicit actorToken and sneakingToken references', async () => {
    const { resolveSneakingToken } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-token-resolution.js'
    );
    const actorToken = { id: 'actor-token' };
    const sneakingToken = { id: 'sneaking-token' };

    expect(resolveSneakingToken({ actorToken, sneakingToken })).toBe(actorToken);
    expect(resolveSneakingToken({ sneakingToken })).toBe(sneakingToken);
  });

  test('uses active actor token before canvas actor-id lookup', async () => {
    const { resolveSneakingToken } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-token-resolution.js'
    );
    const activeToken = { id: 'active-token' };
    const canvasToken = { id: 'canvas-token', actor: { id: 'actor-1' } };

    const result = resolveSneakingToken(
      {
        actor: {
          id: 'actor-1',
          getActiveTokens: jest.fn(() => [activeToken]),
        },
      },
      [canvasToken],
    );

    expect(result).toBe(activeToken);
  });

  test('falls back to message speaker token', async () => {
    const { resolveSneakingToken } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-token-resolution.js'
    );
    const speakerToken = { id: 'speaker-token' };

    expect(
      resolveSneakingToken(
        { message: { speaker: { token: 'speaker-token' } } },
        [speakerToken],
      ),
    ).toBe(speakerToken);
  });
});
