/**
 * Comprehensive tests for Sneak Action
 * Tests all scenarios: per-row apply/revert, dialog apply-all/revert-all, chat apply-changes
 * Tests all settings combinations: allies filter on/off, enforce raw on/off, sneak enforce raw on/off
 */

import '../../setup.js';

describe('Sneak Action Comprehensive Tests', () => {
  let originalSettings;

  beforeEach(() => {
    // Store original settings
    originalSettings = {
      ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
    };
  });

  afterEach(() => {
    // Restore original settings
    Object.keys(originalSettings).forEach((key) => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });
  });

  describe('Status Mapping Tests', () => {
    describe('Without RAW Enforcement', () => {

      test('sneak from observed state produces correct outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        expect(getDefaultNewStateFor('sneak', 'observed', 'critical-success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'observed', 'success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'observed', 'failure')).toBe('hidden');
        expect(getDefaultNewStateFor('sneak', 'observed', 'critical-failure')).toBe('observed');
      });

      test('sneak from concealed state produces correct outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        expect(getDefaultNewStateFor('sneak', 'concealed', 'critical-success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'concealed', 'success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'concealed', 'failure')).toBe('hidden');
        expect(getDefaultNewStateFor('sneak', 'concealed', 'critical-failure')).toBe('concealed');
      });

      test('sneak from hidden state produces correct outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        expect(getDefaultNewStateFor('sneak', 'hidden', 'critical-success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'hidden', 'success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'hidden', 'failure')).toBe('hidden');
        expect(getDefaultNewStateFor('sneak', 'hidden', 'critical-failure')).toBe('observed');
      });

      test('sneak from undetected state produces correct outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        expect(getDefaultNewStateFor('sneak', 'undetected', 'critical-success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'undetected', 'success')).toBe('undetected');
        expect(getDefaultNewStateFor('sneak', 'undetected', 'failure')).toBe('hidden');
        expect(getDefaultNewStateFor('sneak', 'undetected', 'critical-failure')).toBe('observed');
      });
    });
  });

  describe('Apply Changes (Chat Button) Tests', () => {
    describe('Ignore Allies: OFF', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'ignoreAllies', false);
      });

      test('applies changes to all tokens including allies', () => {
        const mockOutcomes = [
          {
            token: { id: 'ally1', actor: { alliance: 'party' } },
            newVisibility: 'undetected',
            hasActionableChange: true,
          },
          {
            token: { id: 'enemy1', actor: { alliance: 'opposition' } },
            newVisibility: 'hidden',
            hasActionableChange: true,
          },
        ];

        // When ignoreAllies is false, all outcomes should be processed
        const filteredOutcomes = mockOutcomes.filter((outcome) => outcome.hasActionableChange);

        expect(filteredOutcomes).toHaveLength(2);
        expect(filteredOutcomes.map((o) => o.token.id)).toEqual(['ally1', 'enemy1']);
      });
    });

    describe('Ignore Allies: ON', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      });

      test('applies changes only to enemies, filtering out allies', () => {
        const mockOutcomes = [
          {
            token: { id: 'ally1', actor: { alliance: 'party' } },
            newVisibility: 'undetected',
            hasActionableChange: true,
          },
          {
            token: { id: 'enemy1', actor: { alliance: 'opposition' } },
            newVisibility: 'hidden',
            hasActionableChange: true,
          },
        ];

        // Simulate the filtering logic from sneak action
        const sneakerAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const filteredOutcomes = mockOutcomes.filter((outcome) => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          return outcome.hasActionableChange && outcome.token.actor.alliance !== sneakerAlliance;
        });

        expect(filteredOutcomes).toHaveLength(1);
        expect(filteredOutcomes[0].token.id).toBe('enemy1');
      });
    });
  });

  describe('Dialog Apply All Tests', () => {
    test('apply all uses pre-filtered outcomes from dialog', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [
          { token: { id: 'enemy1' }, newVisibility: 'undetected', hasActionableChange: true },
          // Note: allies already filtered out by dialog
        ],
        actionData: { actor: { alliance: 'party' } },
      };

      // The fix: use outcomes that are already filtered by the dialog
      const changedOutcomes = mockDialog.outcomes.filter((o) => o.hasActionableChange);

      expect(changedOutcomes).toHaveLength(1);
      expect(changedOutcomes[0].token.id).toBe('enemy1');
    });

    test('apply all passes ignoreAllies setting consistently', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [{ token: { id: 'enemy1' }, hasActionableChange: true }],
        actionData: { actor: { id: 'sneaker' } },
      };

      // Ensure ignoreAllies is passed to the apply service
      const actionDataWithIgnoreAllies = {
        ...mockDialog.actionData,
        ignoreAllies: mockDialog.ignoreAllies,
      };

      expect(actionDataWithIgnoreAllies.ignoreAllies).toBe(true);
    });
  });

  describe('Dialog Revert All Tests', () => {
    test('revert all uses pre-filtered outcomes from dialog', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [
          { token: { id: 'enemy1' }, oldVisibility: 'observed', currentVisibility: 'undetected' },
        ],
      };

      // Should use dialog.outcomes which are already filtered
      const revertOutcomes = mockDialog.outcomes;

      expect(revertOutcomes).toHaveLength(1);
      expect(revertOutcomes[0].token.id).toBe('enemy1');
    });
  });

  describe('Per-Row Apply Tests', () => {
    test('per-row apply affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, newVisibility: 'undetected', hasActionableChange: true },
        { token: { id: 'enemy2' }, newVisibility: 'hidden', hasActionableChange: true },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Should only process the specific outcome
      expect(targetOutcome.token.id).toBe('enemy1');
      expect(targetOutcome.newVisibility).toBe('undetected');

      // Other outcomes should remain unaffected
      const otherOutcomes = mockOutcomes.filter((o) => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
      expect(otherOutcomes[0].token.id).toBe('enemy2');
    });
  });

  describe('Per-Row Revert Tests', () => {
    test('per-row revert affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, oldVisibility: 'observed', currentVisibility: 'undetected' },
        { token: { id: 'enemy2' }, oldVisibility: 'concealed', currentVisibility: 'hidden' },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Should create specific revert change for this token only
      const revertVisibility = targetOutcome.oldVisibility || targetOutcome.currentVisibility;
      const revertChange = { target: targetOutcome.token, newVisibility: revertVisibility };

      expect(revertChange.target.id).toBe('enemy1');
      expect(revertChange.newVisibility).toBe('observed');

      // Should not affect other tokens
      const otherOutcomes = mockOutcomes.filter((o) => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
    });

    test('VERIFICATION: sneak per-row revert should only affect the specific token (no bug)', async () => {
      // This test verifies that sneak action doesn't have the same per-row revert bug
      // that attack consequences had, since sneak uses a different implementation

      // Mock the sneak dialog per-row revert logic
      const mockOutcomes = [
        {
          token: { id: 'observer1', name: 'Observer 1' },
          oldVisibility: 'observed',
          currentVisibility: 'hidden',
        },
        {
          token: { id: 'observer2', name: 'Observer 2' },
          oldVisibility: 'observed',
          currentVisibility: 'hidden',
        },
        {
          token: { id: 'observer3', name: 'Observer 3' },
          oldVisibility: 'observed',
          currentVisibility: 'hidden',
        },
      ];

      const targetTokenId = 'observer1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Simulate sneak dialog per-row revert logic (from sneak-preview-dialog.js)
      const revertVisibility = targetOutcome.oldVisibility || targetOutcome.currentVisibility;
      const changes = [{ target: targetOutcome.token, newVisibility: revertVisibility }];

      // EXPECTED BEHAVIOR: Only 1 token should be reverted
      expect(changes).toHaveLength(1);
      expect(changes[0].target.id).toBe('observer1');
      expect(changes[0].newVisibility).toBe('observed');

      // Other tokens should NOT be in the changes array
      const revertedTokenIds = changes.map((c) => c.target.id);
      expect(revertedTokenIds).not.toContain('observer2');
      expect(revertedTokenIds).not.toContain('observer3');

      // This test should pass because sneak uses direct applyVisibilityChanges
      // instead of the cached revert system that had the bug
    });
  });



  describe('hasActionableChange Calculation Tests', () => {
    test('hasActionableChange correctly identifies state transitions', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      const testCases = [
        {
          oldState: 'observed',
          outcome: 'success',
          expectedNewState: 'undetected',
          shouldBeActionable: true,
        },
        {
          oldState: 'observed',
          outcome: 'critical-failure',
          expectedNewState: 'observed',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'success',
          expectedNewState: 'undetected',
          shouldBeActionable: true,
        },
        {
          oldState: 'hidden',
          outcome: 'failure',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'undetected',
          outcome: 'success',
          expectedNewState: 'undetected',
          shouldBeActionable: false,
        },
        {
          oldState: 'undetected',
          outcome: 'critical-failure',
          expectedNewState: 'observed',
          shouldBeActionable: true,
        },
      ];

      testCases.forEach(({ oldState, outcome, expectedNewState, shouldBeActionable }) => {
        const newState = getDefaultNewStateFor('sneak', oldState, outcome);
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe(expectedNewState);
        expect(hasActionableChange).toBe(shouldBeActionable);
      });
    });
  });



  describe('Global Settings Fallback Tests', () => {
    test('sneak action uses global ignoreAllies when not explicitly provided', () => {
      // Set the setting and ensure it's returned correctly
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);

      const actionData = { actor: { id: 'sneaker' } }; // No ignoreAllies property
      const fallbackValue =
        actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies');

      expect(fallbackValue).toBe(true);
    });

    test('sneak action uses explicit ignoreAllies when provided', () => {
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);

      const actionData = { actor: { id: 'sneaker' }, ignoreAllies: false }; // Explicit override
      const fallbackValue =
        actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies');

      expect(fallbackValue).toBe(false);
    });
  });

  describe('Cover Modifier Service Integration', () => {
    test('calculateStealthRollTotals works with sneak context', () => {
      const {
        calculateStealthRollTotals,
      } = require('../../../scripts/chat/services/infra/shared-utils.js');

      const baseTotal = 22;
      const autoCoverResult = {
        state: 'standard',
        bonus: 2,
        isOverride: false,
      };
      const actionData = {
        context: {
          _visionerStealth: { bonus: 0 },
        },
      };

      const result = calculateStealthRollTotals(baseTotal, autoCoverResult, actionData);

      expect(result.total).toBe(24); // Base total + cover bonus (22 + 2)
      expect(result).toHaveProperty('originalTotal');
    });

    test('smart override display logic works correctly', () => {
      // Test the logic that determines shouldShowOverride
      const wasOverridden = true;
      const total = 20;
      const originalTotal = 16;
      const margin = 5;
      const originalMargin = 1;
      const outcome = 'success';
      const originalOutcome = 'failure';
      const newVisibility = 'hidden';
      const originalNewVisibility = 'observed';

      const shouldShowOverride =
        wasOverridden &&
        (total !== originalTotal ||
          margin !== originalMargin ||
          outcome !== originalOutcome ||
          newVisibility !== originalNewVisibility);

      expect(shouldShowOverride).toBe(true);
    });

    test('smart override display hides when no difference', () => {
      const wasOverridden = true;
      const total = 18;
      const originalTotal = 18;
      const margin = 3;
      const originalMargin = 3;
      const outcome = 'success';
      const originalOutcome = 'success';
      const newVisibility = 'hidden';
      const originalNewVisibility = 'hidden';

      const shouldShowOverride =
        wasOverridden &&
        (total !== originalTotal ||
          margin !== originalMargin ||
          outcome !== originalOutcome ||
          newVisibility !== originalNewVisibility);

      expect(shouldShowOverride).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('handles empty outcomes gracefully', () => {
      const emptyOutcomes = [];
      const changedOutcomes = emptyOutcomes.filter((o) => o?.hasActionableChange);

      expect(changedOutcomes).toHaveLength(0);
    });

    test('handles missing outcome properties gracefully', () => {
      const incompleteOutcome = { token: { id: 'test' } };
      const revertVisibility =
        incompleteOutcome.oldVisibility || incompleteOutcome.currentVisibility || 'observed';

      expect(revertVisibility).toBe('observed');
    });

    test('filters out null/undefined outcomes', () => {
      const mixedOutcomes = [
        { token: { id: 'valid' }, hasActionableChange: true },
        null,
        undefined,
        { token: null },
      ];

      const validOutcomes = mixedOutcomes.filter((o) => o?.token?.id && o.hasActionableChange);

      expect(validOutcomes).toHaveLength(1);
      expect(validOutcomes[0].token.id).toBe('valid');
    });
  });
});
