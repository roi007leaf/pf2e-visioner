/**
 * AVS Override Cleanup on Token Deletion
 * Tests that AVS overrides are properly cleaned up when tokens are deleted
 */

import { AvsOverrideManager } from '../../scripts/chat/services/infra/avs-override-manager.js';
import { MODULE_ID } from '../../scripts/constants.js';
import '../setup.js';

describe('AVS Override Cleanup on Token Deletion', () => {
  let mockObserver;
  let mockTarget;
  let mockOtherToken;
  let mockTokens;

  beforeEach(() => {
    jest.clearAllMocks();

    mockObserver = {
      id: 'observer-id',
      name: 'Observer Token',
      document: {
        id: 'observer-id',
        flags: {},
        setFlag: jest.fn(),
        getFlag: jest.fn(),
        unsetFlag: jest.fn(),
      },
      actor: {
        type: 'character',
      },
    };

    mockTarget = {
      id: 'target-id',
      name: 'Target Token',
      document: {
        id: 'target-id',
        flags: {
          [MODULE_ID]: {
            'avs-override-from-observer-id': {
              state: 'hidden',
              source: 'sneak_action',
              observerId: 'observer-id',
              targetId: 'target-id',
              timestamp: Date.now(),
            },
          },
        },
        setFlag: jest.fn(),
        getFlag: jest.fn((moduleId, flagKey) => {
          return mockTarget.document.flags?.[moduleId]?.[flagKey];
        }),
        unsetFlag: jest.fn(async (moduleId, flagKey) => {
          if (mockTarget.document.flags?.[moduleId]?.[flagKey]) {
            delete mockTarget.document.flags[moduleId][flagKey];
          }
        }),
      },
      actor: {
        type: 'character',
      },
    };

    mockOtherToken = {
      id: 'other-id',
      name: 'Other Token',
      document: {
        id: 'other-id',
        flags: {
          [MODULE_ID]: {
            'avs-override-from-target-id': {
              state: 'concealed',
              source: 'manual_action',
              observerId: 'target-id',
              targetId: 'other-id',
              timestamp: Date.now(),
            },
          },
        },
        setFlag: jest.fn(),
        getFlag: jest.fn((moduleId, flagKey) => {
          return mockOtherToken.document.flags?.[moduleId]?.[flagKey];
        }),
        unsetFlag: jest.fn(async (moduleId, flagKey) => {
          if (mockOtherToken.document.flags?.[moduleId]?.[flagKey]) {
            delete mockOtherToken.document.flags[moduleId][flagKey];
          }
        }),
      },
      actor: {
        type: 'npc',
      },
    };

    mockTokens = [mockObserver, mockTarget, mockOtherToken];

    global.canvas = {
      tokens: {
        placeables: mockTokens,
        get: jest.fn((id) => mockTokens.find((t) => t.id === id)),
      },
    };

    jest.doMock(
      '../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js',
      () => ({
        eventDrivenVisibilitySystem: {
          recalculateForTokens: jest.fn(),
        },
      }),
      { virtual: true },
    );
  });

  describe('removeAllOverridesInvolving', () => {
    test('should remove all overrides where token is the observer', async () => {
      await AvsOverrideManager.removeAllOverridesInvolving('observer-id');

      expect(mockTarget.document.unsetFlag).toHaveBeenCalledWith(
        MODULE_ID,
        'avs-override-from-observer-id',
      );
      expect(mockTarget.document.flags[MODULE_ID]['avs-override-from-observer-id']).toBeUndefined();
    });

    test('should remove all overrides where token is the target', async () => {
      await AvsOverrideManager.removeAllOverridesInvolving('target-id');

      expect(mockTarget.document.unsetFlag).toHaveBeenCalledWith(
        MODULE_ID,
        'avs-override-from-observer-id',
      );
      expect(mockOtherToken.document.unsetFlag).toHaveBeenCalledWith(
        MODULE_ID,
        'avs-override-from-target-id',
      );
    });

    test('should handle multiple overrides on same token', async () => {
      mockTarget.document.flags[MODULE_ID]['avs-override-from-other-id'] = {
        state: 'observed',
        source: 'manual_action',
        observerId: 'other-id',
        targetId: 'target-id',
        timestamp: Date.now(),
      };

      await AvsOverrideManager.removeAllOverridesInvolving('target-id');

      expect(mockTarget.document.unsetFlag).toHaveBeenCalledWith(
        MODULE_ID,
        'avs-override-from-observer-id',
      );
      expect(mockTarget.document.unsetFlag).toHaveBeenCalledWith(
        MODULE_ID,
        'avs-override-from-other-id',
      );
    });

    test('should not remove unrelated overrides', async () => {
      const unrelatedToken = {
        id: 'unrelated-id',
        name: 'Unrelated Token',
        document: {
          id: 'unrelated-id',
          flags: {
            [MODULE_ID]: {
              'avs-override-from-another-id': {
                state: 'hidden',
                source: 'hide_action',
                observerId: 'another-id',
                targetId: 'unrelated-id',
                timestamp: Date.now(),
              },
            },
          },
          unsetFlag: jest.fn(),
        },
      };

      mockTokens.push(unrelatedToken);

      await AvsOverrideManager.removeAllOverridesInvolving('observer-id');

      expect(unrelatedToken.document.unsetFlag).not.toHaveBeenCalled();
    });

    test('should handle tokens with no overrides gracefully', async () => {
      const cleanToken = {
        id: 'clean-id',
        name: 'Clean Token',
        document: {
          id: 'clean-id',
          flags: {},
          unsetFlag: jest.fn(),
        },
      };

      mockTokens.push(cleanToken);

      await expect(AvsOverrideManager.removeAllOverridesInvolving('clean-id')).resolves.not.toThrow();
    });

    test('should handle null or undefined tokenId', async () => {
      await expect(AvsOverrideManager.removeAllOverridesInvolving(null)).resolves.not.toThrow();
      await expect(AvsOverrideManager.removeAllOverridesInvolving(undefined)).resolves.not.toThrow();
    });

    test('should trigger visibility recalculation for affected tokens', async () => {
      const { eventDrivenVisibilitySystem } = await import(
        '../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js'
      );

      await AvsOverrideManager.removeAllOverridesInvolving('target-id');

      expect(eventDrivenVisibilitySystem.recalculateForTokens).toHaveBeenCalled();
      const callArgs = eventDrivenVisibilitySystem.recalculateForTokens.mock.calls[0][0];
      expect(callArgs).toContain('target-id');
      expect(callArgs).toContain('other-id');
    });

    test('should handle errors during flag removal gracefully', async () => {
      mockTarget.document.unsetFlag.mockRejectedValueOnce(new Error('Flag removal failed'));

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(AvsOverrideManager.removeAllOverridesInvolving('observer-id')).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should handle missing canvas gracefully', async () => {
      global.canvas = null;

      await expect(AvsOverrideManager.removeAllOverridesInvolving('observer-id')).resolves.not.toThrow();
    });
  });
});
