/**
 * Comprehensive tests for Action Extractor
 * Tests message parsing, action detection, actor resolution, and edge cases
 */

import '../../setup.js';

describe('Action Extractor Tests', () => {
  let extractActionData;

  beforeEach(async () => {
    // Reset canvas and game mocks to clean state
    global.canvas.tokens.placeables = [];
    if (global.canvas.tokens.get?.mockClear) {
      global.canvas.tokens.get.mockClear();
    }
    if (global.game.actors?.get?.mockClear) {
      global.game.actors.get.mockClear();
    }
    if (global.fromUuidSync?.mockClear) {
      global.fromUuidSync.mockClear();
    }

    // Import the function under test
    const module = await import('../../../scripts/chat/services/action-extractor.js');
    extractActionData = module.extractActionData;
  });

  describe('Point Out Action Detection', () => {
    test('detects point out action from flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'point-out',
      });
    });

    test('detects point out action from russian flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'указать на врага',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'point-out',
      });
    });

    test('detects point out action from context options', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              options: ['action:point-out'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'point-out',
      });
    });

    test('detects point out action from origin roll options', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            origin: {
              rollOptions: ['item:point-out'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'point-out',
      });
    });

    test('includes target reference for point out actions', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        flags: {
          pf2e: {
            target: { actor: 'target-actor-id' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result.context.target).toEqual({ actor: 'target-actor-id' });
    });
  });

  describe('Seek Action Detection', () => {
    test('detects seek action from perception check with seek option', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'perception-check',
              options: ['action:seek'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'seek',
      });
    });

    test('detects seek action from perception check with seek slug', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'perception-check',
              slug: 'seek',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'seek',
      });
    });

    test('does not detect seek from non-perception checks', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:seek'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });

  describe('Create a Diversion Action Detection', () => {
    test('detects create a diversion from skill check with action option', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:create-a-diversion:deception'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'create-a-diversion',
      });
    });

    test('detects create a diversion from skill check with slug', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'create-a-diversion',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'create-a-diversion',
      });
    });

    test('detects create a diversion from flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Create a Diversion',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'create-a-diversion',
      });
    });
  });

  describe('Take Cover Action Detection', () => {
    test('detects take cover from action context with option', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'action',
              options: ['action:take-cover'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
      });
    });

    test('detects take cover from action context with slug', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'action',
              slug: 'take-cover',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
      });
    });

    test('detects take cover from origin roll options', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            origin: {
              rollOptions: ['origin:item:take-cover'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
      });
    });

    test('detects take cover from flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Take Cover',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
      });
    });

    test('detects take cover from french flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: "Mise à l'abri",
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
      });
    });
  });

  describe('Avoid Notice Action Detection', () => {
    test('avoid notice is detected but not processed as action type', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: { type: 'skill-check' }, // Required context
            origin: {
              rollOptions: ['origin:item:avoid-notice'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      // Avoid notice is detected but excluded from sneak processing and has no dedicated action type
      expect(result).toBeNull();
    });

    test('avoid notice from context options returns null', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:avoid-notice'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });

    test('avoid notice from content returns null', async () => {
      const message = {
        id: 'msg1',
        content: 'Avoid Notice check',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });

  describe('Sneak Action Detection', () => {
    test('detects sneak from skill check with action option', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:sneak'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'sneak',
      });
    });

    test('detects sneak from skill check with slug', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'sneak',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'sneak',
      });
    });

    test('detects sneak from flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Sneak past the guards',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'sneak',
      });
    });

    test('does not detect sneak from sneak attack flavor', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Sneak Attack',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });

    test('does not detect sneak when create a diversion is detected first', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Create a Diversion with sneaky movements',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'create-a-diversion',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result.actionType).toBe('create-a-diversion');
    });

    test('requires context to exist for sneak detection', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Sneak',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });

  describe('Hide Action Detection', () => {
    test('detects hide from skill check with action option', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:hide'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'hide',
      });
    });

    test('detects hide from skill check with slug', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'hide',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'hide',
      });
    });

    test('detects hide from flavor text', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Hide behind the tree',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'hide',
      });
    });

    test('does not detect hide when sneak is already detected', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:sneak'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result.actionType).toBe('sneak');
    });

    test('does not detect hide from sneak attack flavor', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Sneak Attack',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });

    test('does not detect hide when create a diversion is detected first', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Create a Diversion by hiding',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'create-a-diversion',
            },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result.actionType).toBe('create-a-diversion');
    });

    test('requires context to exist for hide detection', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Hide',
        flags: {},
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });

  describe('Attack Roll and Consequences Detection', () => {
    test('detects attack roll from context type', async () => {
      const mockToken = {
        actor: {
          itemTypes: { condition: [] },
        },
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'attack-roll',
            },
          },
        },
        token: { object: mockToken },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull(); // Should be null since token is not hidden/undetected
    });

    test('skips attack consequences for damage-taken messages', async () => {
      const mockToken = {
        actor: {
          itemTypes: {
            condition: [{ slug: 'hidden' }],
          },
        },
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'damage-taken',
            },
            appliedDamage: { total: 10 },
          },
        },
        token: { object: mockToken },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });

  describe('Actor Token Resolution', () => {
    test('resolves actor token from message.token.object', async () => {
      const mockToken = { id: 'token1', actor: { id: 'actor1' } };
      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        token: { object: mockToken },
      };

      const result = await extractActionData(message);

      expect(result.actor).toBe(mockToken);
    });

    test('resolves actor token from canvas tokens by speaker token ID', async () => {
      const mockToken = { id: 'token1', actor: { id: 'actor1' } };
      global.canvas.tokens.get.mockReturnValue(mockToken);

      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        speaker: { token: 'token1' },
      };

      const result = await extractActionData(message);

      expect(result.actor).toBe(mockToken);
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('token1');
    });

    test('resolves actor token from speaker actor active tokens', async () => {
      const mockToken = { id: 'token1', actor: { id: 'actor1' } };
      const mockActor = {
        getActiveTokens: jest.fn().mockReturnValue([mockToken]),
      };

      // Ensure the mock exists before setting it
      if (!global.game.actors) {
        global.game.actors = { get: jest.fn() };
      }
      global.game.actors.get.mockReturnValue(mockActor);

      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        speaker: { actor: 'actor1' },
      };

      const result = await extractActionData(message);

      expect(result.actor).toBe(mockToken);
      expect(global.game.actors.get).toHaveBeenCalledWith('actor1');
      expect(mockActor.getActiveTokens).toHaveBeenCalledWith(true, true);
    });

    test('resolves actor token from origin UUID', async () => {
      const mockToken = { id: 'token1', actor: { id: 'actor1' } };
      const mockOriginDoc = {
        actor: {
          getActiveTokens: jest.fn().mockReturnValue([mockToken]),
        },
      };

      // Ensure the mock exists before setting it
      if (!global.fromUuidSync) {
        global.fromUuidSync = jest.fn();
      }
      global.fromUuidSync.mockReturnValue(mockOriginDoc);

      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        flags: {
          pf2e: {
            origin: { uuid: 'origin-uuid' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result.actor).toBe(mockToken);
      expect(global.fromUuidSync).toHaveBeenCalledWith('origin-uuid');
    });

    test('handles graceful fallback when actor resolution fails', async () => {
      // Ensure the mock exists before setting it
      if (!global.game.actors) {
        global.game.actors = { get: jest.fn() };
      }
      global.game.actors.get.mockImplementation(() => {
        throw new Error('Actor not found');
      });

      const message = {
        id: 'msg1',
        flavor: 'Point Out',
        speaker: { actor: 'invalid-actor' },
      };

      const result = await extractActionData(message);

      expect(result.actor).toBeNull();
    });
  });

  describe('Roll Data Processing', () => {
    test('processes roll data from skill checks', async () => {
      const mockRoll = {
        total: 15,
        dice: [{ total: 12 }],
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:hide'],
            },
          },
        },
        rolls: [mockRoll],
      };

      const result = await extractActionData(message);

      expect(result.roll).toEqual({
        total: 15,
        dice: [{ total: 12 }],
      });
    });

    test('handles legacy roll format with _total', async () => {
      const mockRoll = {
        _total: 18,
        terms: [{ total: 14 }],
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:sneak'],
            },
          },
        },
        rolls: [mockRoll],
      };

      const result = await extractActionData(message);

      expect(result.roll).toEqual({
        total: 18,
        dice: [{ total: 14 }],
      });
    });

    test('handles malformed roll data gracefully', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:hide'],
            },
          },
        },
        rolls: [{ invalid: 'data' }],
      };

      const result = await extractActionData(message);

      // The code creates a roll object with total: 0 and dice: [{ total: undefined }]
      expect(result.roll).toEqual({
        total: 0,
        dice: [{ total: undefined }],
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('returns null for null message', async () => {
      const result = await extractActionData(null);
      expect(result).toBeNull();
    });

    test('returns null for undefined message', async () => {
      const result = await extractActionData(undefined);
      expect(result).toBeNull();
    });

    test('returns null when no action type is detected', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Some random message',
        flags: {},
      };

      const result = await extractActionData(message);
      expect(result).toBeNull();
    });

    test('handles missing context gracefully', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Take Cover',
        flags: { pf2e: {} },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'take-cover',
        context: undefined,
      });
    });

    test('handles missing flags gracefully', async () => {
      const message = {
        id: 'msg1',
        flavor: 'Point Out',
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'point-out',
      });
    });

    test('handles case-insensitive flavor text matching', async () => {
      const message = {
        id: 'msg1',
        flavor: 'HIDE BEHIND COVER',
        flags: {
          pf2e: {
            context: { type: 'skill-check' },
          },
        },
      };

      const result = await extractActionData(message);

      expect(result).toMatchObject({
        messageId: 'msg1',
        actionType: 'hide',
      });
    });

    test('handles recall knowledge with hide in the flavor name', async () => {
      const message = {
        id: 'msg1',
        flavor: 'hide lore:',
      };

      const result = await extractActionData(message);
      expect(result).toBeNull();
    });

    test('handles Devise a Stratagem and other self checks', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'self-effect',
              item: 'abcdef123',
            },
          },
        },
      };

      const result = await extractActionData(message);
      expect(result).toBeNull();
    });

    test('handles skill checks that should not be processed', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              domains: {
                0: 'skill-check',
                1: 'arcana',
              },
            },
          },
        },
      };

      const result = await extractActionData(message);
      expect(result).toBeNull();
    });
  });

  describe('Action Priority and Exclusions', () => {
    test('prioritizes specific actions over generic ones', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:create-a-diversion', 'action:hide'],
            },
          },
        },
      };

      const result = await extractActionData(message);

      // Create a Diversion should be detected before Hide
      expect(result.actionType).toBe('create-a-diversion');
    });

    test('sneak takes priority over hide when both could match', async () => {
      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              options: ['action:sneak'],
            },
          },
        },
        flavor: 'Sneak and Hide',
      };

      const result = await extractActionData(message);

      expect(result.actionType).toBe('sneak');
    });

    test('excludes skill checks from attack consequences', async () => {
      const mockToken = {
        actor: {
          itemTypes: {
            condition: [{ slug: 'hidden' }],
          },
        },
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'attack-roll',
              domains: ['skill-check'],
            },
          },
        },
        token: { object: mockToken },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });

    test('excludes self-effect from attack consequences', async () => {
      const mockToken = {
        actor: {
          itemTypes: {
            condition: [{ slug: 'hidden' }],
          },
        },
      };

      const message = {
        id: 'msg1',
        flags: {
          pf2e: {
            context: {
              type: 'self-effect',
            },
          },
        },
        content: 'Attack Roll',
        token: { object: mockToken },
      };

      const result = await extractActionData(message);

      expect(result).toBeNull();
    });
  });
});
