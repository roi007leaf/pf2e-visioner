import '../../setup.js';

describe('sneak start position capture', () => {
  test('uses explicit stored start position first', async () => {
    const { captureSneakStartPosition } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-position.js'
    );
    const actionData = {};
    const stored = { center: { x: 10, y: 20 } };

    captureSneakStartPosition(actionData, { storedStartPosition: stored });

    expect(actionData.storedStartPosition).toBe(stored);
  });

  test('uses message sneakStartPosition before current token fallback', async () => {
    const { captureSneakStartPosition } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-position.js'
    );
    const actionData = {
      message: {
        flags: {
          'pf2e-visioner': {
            sneakStartPosition: { center: { x: 30, y: 40 } },
          },
        },
      },
    };

    captureSneakStartPosition(actionData, {
      getSneakingToken: jest.fn(() => ({ center: { x: 1, y: 2 } })),
    });

    expect(actionData.storedStartPosition).toEqual({ center: { x: 30, y: 40 } });
  });

  test('captures current token center when no stored position exists', async () => {
    const { captureSneakStartPosition } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-position.js'
    );
    const actionData = {};
    const token = {
      id: 'token-1',
      name: 'Sneaker',
      x: 100,
      y: 200,
      center: { x: 125, y: 225 },
      document: { elevation: 15 },
    };

    captureSneakStartPosition(actionData, {
      getSneakingToken: jest.fn(() => token),
      now: jest.fn(() => 12345),
    });

    expect(actionData.storedStartPosition).toEqual({
      x: 100,
      y: 200,
      center: { x: 125, y: 225 },
      elevation: 15,
      tokenId: 'token-1',
      tokenName: 'Sneaker',
      timestamp: 12345,
    });
  });
});
