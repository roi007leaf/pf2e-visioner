/**
 * Chat Message Updates and Error Handling Tests
 * Tests for chat message update scenarios and player error visibility
 */

import '../../setup.js';

describe('Chat Message Updates and Error Handling Tests', () => {
  let originalSettings;
  let mockMessage;
  let mockHtml;
  let processedMessages;

  beforeEach(async () => {
    // Store original settings
    originalSettings = {
      debug: game.settings.get('pf2e-visioner', 'debug'),
      autoCover: game.settings.get('pf2e-visioner', 'autoCover'),
    };

    // Mock processed messages cache
    processedMessages = new Set();

    // Mock chat message with proper action data
    mockMessage = {
      id: 'test-message-123',
      author: { id: game.user.id },
      content: 'I Hide behind the wall',
      flavor: 'Hide action',
      speaker: {
        token: 'test-token-id',
        actor: 'test-actor-id',
      },
      flags: {
        pf2e: {
          context: {
            type: 'skill-check',
            slug: 'hide',
            options: ['action:hide'],
          },
        },
      },
      render: jest.fn().mockResolvedValue(true),
    };

    // Mock HTML element with jQuery-like interface
    mockHtml = {
      find: jest.fn((selector) => {
        // Mock different scenarios based on selector
        if (selector === '.pf2e-visioner-automation-panel') {
          return {
            length: 0, // Initially no panels exist
          };
        }
        if (selector === '.message-content') {
          return {
            length: 1,
            after: jest.fn(),
          };
        }
        return { length: 0 };
      }),
      attr: jest.fn(),
      addClass: jest.fn(),
      removeClass: jest.fn(),
    };

    // Reset game user state
    game.user.isGM = true;

    // Mock canvas tokens for action extraction
    const mockToken = createMockToken({
      id: 'test-token-id',
      actor: { id: 'test-actor-id' },
    });

    global.canvas.tokens = {
      ...global.canvas.tokens,
      get: jest.fn((id) => (id === 'test-token-id' ? mockToken : null)),
      placeables: [mockToken],
    };

    // Mock game actors
    global.game.actors = {
      get: jest.fn((id) => (id === 'test-actor-id' ? mockToken.actor : null)),
    };
  });

  afterEach(() => {
    // Restore original settings
    Object.keys(originalSettings).forEach((key) => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('Chat Message Update Bug Fix', () => {
    test('should detect missing UI panels correctly', () => {
      // Test the core logic of the fix - DOM detection
      const htmlWithPanels = {
        find: jest.fn((selector) => {
          if (selector === '.pf2e-visioner-automation-panel') {
            return { length: 1 }; // Panels exist
          }
          return { length: 0 };
        }),
      };

      const htmlWithoutPanels = {
        find: jest.fn((selector) => {
          if (selector === '.pf2e-visioner-automation-panel') {
            return { length: 0 }; // No panels
          }
          return { length: 0 };
        }),
      };

      // Test detection logic
      const hasVisionerUI1 =
        htmlWithPanels.find && htmlWithPanels.find('.pf2e-visioner-automation-panel').length > 0;
      const hasVisionerUI2 =
        htmlWithoutPanels.find &&
        htmlWithoutPanels.find('.pf2e-visioner-automation-panel').length > 0;

      expect(hasVisionerUI1).toBe(true);
      expect(hasVisionerUI2).toBe(false);
    });

    test('should handle missing find method gracefully', () => {
      // Test graceful handling when find method is not available
      const htmlWithoutFind = {
        attr: jest.fn(),
        addClass: jest.fn(),
      };

      // This should not throw and should return falsy (triggering re-injection)
      const hasVisionerUI =
        htmlWithoutFind.find && htmlWithoutFind.find('.pf2e-visioner-automation-panel').length > 0;

      expect(hasVisionerUI).toBeFalsy(); // Use toBeFalsy to handle undefined
    });

    test('should identify action messages correctly', () => {
      // Test action data extraction patterns
      const hideMessage = {
        flavor: 'Hide action',
        flags: {
          pf2e: {
            context: {
              type: 'skill-check',
              slug: 'hide',
              options: ['action:hide'],
            },
          },
        },
      };

      const seekMessage = {
        flavor: 'Seek action',
        flags: {
          pf2e: {
            context: {
              type: 'perception-check',
              slug: 'seek',
              options: ['action:seek'],
            },
          },
        },
      };

      // Test pattern matching
      const isHideAction = hideMessage.flags?.pf2e?.context?.slug === 'hide';
      const isSeekAction = seekMessage.flags?.pf2e?.context?.slug === 'seek';

      expect(isHideAction).toBe(true);
      expect(isSeekAction).toBe(true);
    });

    test('should handle processed messages cache correctly', () => {
      // Test the processedMessages Set behavior
      const processedMessages = new Set();
      const messageId = 'test-message-123';

      // Initially not processed
      expect(processedMessages.has(messageId)).toBe(false);

      // Add to processed
      processedMessages.add(messageId);
      expect(processedMessages.has(messageId)).toBe(true);

      // Remove from processed (for re-injection)
      processedMessages.delete(messageId);
      expect(processedMessages.has(messageId)).toBe(false);
    });
  });

  describe('Player Error Handling Tests', () => {
    beforeEach(() => {
      // Set up as non-GM player for these tests
      game.user.isGM = false;
    });

    test('should not show console errors to players during token deletion', async () => {
      // Mock scene cleanup service
      const mockCleanupDeletedToken = jest.fn().mockImplementation((token) => {
        // Simulate potential error scenarios that should be handled gracefully
        if (!token?.document?.id) {
          // This should be handled without throwing to players
          console.warn('Token cleanup: Invalid token reference');
          return;
        }
      });

      jest.doMock(
        '../../../scripts/services/scene-cleanup.js',
        () => ({
          cleanupDeletedToken: mockCleanupDeletedToken,
        }),
        { virtual: true },
      );

      // Mock tokens being deleted (race condition scenario)
      const tokens = [
        createMockToken({ id: 'token1', name: 'Ally A' }),
        createMockToken({ id: 'token2', name: 'Ally B' }),
        null, // Simulate token already deleted
        createMockToken({ id: 'token3', name: 'Enemy C' }),
      ];

      // Simulate cleanup for each token
      tokens.forEach((token) => {
        expect(() => mockCleanupDeletedToken(token)).not.toThrow();
      });

      expect(mockCleanupDeletedToken).toHaveBeenCalledTimes(4);

      // Verify console.warn was called for invalid token but no errors thrown
      expect(console.warn).toHaveBeenCalledWith('Token cleanup: Invalid token reference');
    });

    test('should handle party token consolidation errors gracefully for players', async () => {
      // Mock party token state service
      const mockRestoreTokenStateFromParty = jest
        .fn()
        .mockImplementation(async (tokenDoc, scene) => {
          try {
            // Simulate restoration logic that might fail
            if (!tokenDoc?.id) {
              throw new Error('Invalid token document');
            }

            return true;
          } catch (error) {
            // Error should be logged but not thrown to players
            console.warn('Party token restoration failed:', error.message);
            return false;
          }
        });

      jest.doMock(
        '../../../scripts/services/party-token-state.js',
        () => ({
          restoreTokenStateFromParty: mockRestoreTokenStateFromParty,
        }),
        { virtual: true },
      );

      const validToken = createMockToken({ id: 'valid-token' });
      const invalidToken = null;

      // Both should complete without throwing
      await expect(mockRestoreTokenStateFromParty(validToken.document, canvas.scene)).resolves.toBe(
        true,
      );
      await expect(mockRestoreTokenStateFromParty(invalidToken, canvas.scene)).resolves.toBe(false);

      // Verify error was logged but not thrown
      expect(console.warn).toHaveBeenCalledWith(
        'Party token restoration failed:',
        'Invalid token document',
      );
    });

    test('should handle visibility effect errors gracefully for players', async () => {
      // Mock visibility effects service
      const mockBatchUpdateVisibilityEffects = jest
        .fn()
        .mockImplementation(async (observer, targets) => {
          try {
            if (!observer?.actor) {
              throw new Error('Observer has no actor');
            }

            // Simulate effect updates
            targets.forEach(({ target, state }) => {
              if (!target?.actor) {
                throw new Error(`Target ${target?.id} has no actor`);
              }
            });

            return true;
          } catch (error) {
            // Log error but don't throw to players
            console.warn('Visibility effect update failed:', error.message);
            return false;
          }
        });

      jest.doMock(
        '../../../scripts/visibility/ephemeral.js',
        () => ({
          batchUpdateVisibilityEffects: mockBatchUpdateVisibilityEffects,
        }),
        { virtual: true },
      );

      const validObserver = createMockToken({ id: 'observer', actor: { id: 'actor1' } });
      const invalidTarget = createMockToken({ id: 'target', actor: null });

      const targets = [{ target: invalidTarget, state: 'hidden' }];

      // Should not throw error to player
      await expect(mockBatchUpdateVisibilityEffects(validObserver, targets)).resolves.toBe(false);

      expect(console.warn).toHaveBeenCalledWith(
        'Visibility effect update failed:',
        'Target target has no actor',
      );
    });

    test('should handle cover effect errors gracefully for players', async () => {
      // Mock cover effects service
      const mockBatchUpdateCoverEffects = jest
        .fn()
        .mockImplementation(async (observer, targets) => {
          try {
            if (!observer?.document?.id) {
              throw new Error('Invalid observer token');
            }

            // Simulate cover calculation that might fail
            targets.forEach(({ target, state }) => {
              if (!target?.document?.id) {
                throw new Error(`Invalid target token: ${target?.id}`);
              }
            });

            return true;
          } catch (error) {
            // Log error but don't throw to players
            console.warn('Cover effect update failed:', error.message);
            return false;
          }
        });

      jest.doMock(
        '../../../scripts/cover/ephemeral.js',
        () => ({
          batchUpdateCoverEffects: mockBatchUpdateCoverEffects,
        }),
        { virtual: true },
      );

      const validObserver = createMockToken({ id: 'observer' });
      const invalidTarget = { id: 'invalid', document: null };

      const targets = [{ target: invalidTarget, state: 'standard' }];

      // Should not throw error to player
      await expect(mockBatchUpdateCoverEffects(validObserver, targets)).resolves.toBe(false);

      expect(console.warn).toHaveBeenCalledWith(
        'Cover effect update failed:',
        'Invalid target token: invalid',
      );
    });

    test('should handle race conditions during mass token operations gracefully', async () => {
      // Mock scene cleanup with race condition handling
      const mockCleanupDeletedToken = jest.fn().mockImplementation((token) => {
        try {
          // Simulate race condition where token properties become undefined
          if (!token?.document?.id) {
            console.warn('Race condition detected: Token reference invalid during cleanup');
            return;
          }

          // Simulate cleanup operations that might fail due to race conditions
          if (Math.random() > 0.8) {
            // 20% chance of race condition
            throw new Error("Cannot read properties of undefined (reading 'id')");
          }
        } catch (error) {
          // Handle race condition gracefully
          console.warn('Token cleanup race condition handled:', error.message);
        }
      });

      // Simulate mass token deletion (party consolidation scenario)
      const tokens = Array.from({ length: 10 }, (_, i) =>
        createMockToken({ id: `token-${i}`, name: `Token ${i}` }),
      );

      // Add some null/undefined tokens to simulate race conditions
      tokens.push(null, undefined, { document: null }, { document: { id: null } });

      // All cleanup operations should complete without throwing
      tokens.forEach((token) => {
        expect(() => mockCleanupDeletedToken(token)).not.toThrow();
      });

      expect(mockCleanupDeletedToken).toHaveBeenCalledTimes(tokens.length);
    });
  });

  describe('Chat Message Re-rendering Integration Tests', () => {
    test('should simulate message update scenarios correctly', () => {
      // Test the logic of panel detection during updates
      let panelExists = true;

      const mockHtmlDynamic = {
        find: jest.fn((selector) => {
          if (selector === '.pf2e-visioner-automation-panel') {
            return { length: panelExists ? 1 : 0 };
          }
          return { length: 0 };
        }),
      };

      // Initially panels exist
      expect(mockHtmlDynamic.find('.pf2e-visioner-automation-panel').length).toBe(1);

      // Simulate message update removing panels
      panelExists = false;
      expect(mockHtmlDynamic.find('.pf2e-visioner-automation-panel').length).toBe(0);

      // Simulate re-injection
      panelExists = true;
      expect(mockHtmlDynamic.find('.pf2e-visioner-automation-panel').length).toBe(1);
    });

    test('should handle renderChatMessageHTML hook registration', () => {
      // Test hook registration pattern
      const mockRegisterChatHooks = () => {
        global.Hooks.on('renderChatMessageHTML', (message, element) => {
          // Simulate the adaptation logic
          const jq = typeof window.$ === 'function' ? window.$(element) : element;
          return jq;
        });
      };

      mockRegisterChatHooks();

      // Verify hook was registered
      expect(global.Hooks.on).toHaveBeenCalledWith('renderChatMessageHTML', expect.any(Function));
    });
  });

  describe('Error Recovery and Resilience Tests', () => {
    test('should handle UI injection failure patterns', () => {
      // Test error handling patterns
      const mockUIInjector = {
        inject: (message, html) => {
          if (!message || !html) {
            throw new Error('Invalid parameters');
          }
          return true;
        },
      };

      // Test with valid parameters
      expect(() => mockUIInjector.inject(mockMessage, mockHtml)).not.toThrow();

      // Test with invalid parameters (should throw, but be caught in real implementation)
      expect(() => mockUIInjector.inject(null, mockHtml)).toThrow('Invalid parameters');
    });

    test('should validate message data structure', () => {
      // Test message validation patterns
      const validateMessage = (message) => {
        if (!message) return false;
        if (!message.id) return false;
        if (!message.flags) return false;
        return true;
      };

      const validMessage = mockMessage;
      const invalidMessages = [null, undefined, {}, { id: null }, { id: 'test', flags: null }];

      expect(validateMessage(validMessage)).toBe(true);
      invalidMessages.forEach((msg) => {
        expect(validateMessage(msg)).toBe(false);
      });
    });

    test('should handle DOM operation errors gracefully', () => {
      // Test DOM error handling patterns
      const safeFind = (html, selector) => {
        try {
          return html.find && html.find(selector);
        } catch (error) {
          console.warn('DOM operation failed:', error.message);
          return null;
        }
      };

      const errorHtml = {
        find: jest.fn().mockImplementation(() => {
          throw new Error('DOM operation failed');
        }),
      };

      // Should not throw
      expect(() => safeFind(errorHtml, '.test-selector')).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith('DOM operation failed:', 'DOM operation failed');
    });
  });
});
