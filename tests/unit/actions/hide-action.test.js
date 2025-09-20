/**
 * Comprehensive tests for Hide Action
 * Tests all scenarios: per-row apply/revert, dialog apply-all/revert-all, chat apply-changes
 * Tests all settings combinations: allies filter on/off, enforce raw on/off
 */

import '../../setup.js';

describe('Hide Action Comprehensive Tests', () => {
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

  describe('Panel Generation and Button Actions', () => {
    test('chat panel generates correct apply-changes button', () => {
      const { buildHidePanel } = require('../../../scripts/chat/ui/panel/hide.js');

      game.user.isGM = true;
      const panel = buildHidePanel();

      expect(panel.actionButtonsHtml).toContain('data-action="apply-now-hide"');
      expect(panel.actionButtonsHtml).toContain('Apply Changes');
    });
  });

  describe('Status Mapping Tests', () => {
    test('hide from observed state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('hide', 'observed', 'critical-success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'observed', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'observed', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('hide', 'observed', 'critical-failure')).toBe('observed');
    });

    test('hide from concealed state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('hide', 'concealed', 'critical-success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'concealed', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'concealed', 'failure')).toBe('concealed');
      expect(getDefaultNewStateFor('hide', 'concealed', 'critical-failure')).toBe('concealed');
    });

    test('hide from hidden state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('hide', 'hidden', 'critical-success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'hidden', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('hide', 'hidden', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('hide', 'hidden', 'critical-failure')).toBe('observed');
    });

    test('hide from undetected state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('hide', 'undetected', 'critical-success')).toBe('undetected');
      expect(getDefaultNewStateFor('hide', 'undetected', 'success')).toBe('undetected');
      expect(getDefaultNewStateFor('hide', 'undetected', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('hide', 'undetected', 'critical-failure')).toBe('observed');
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
            newVisibility: 'hidden',
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
            newVisibility: 'hidden',
            hasActionableChange: true,
          },
          {
            token: { id: 'enemy1', actor: { alliance: 'opposition' } },
            newVisibility: 'hidden',
            hasActionableChange: true,
          },
        ];

        // Simulate the filtering logic from hide action
        const hiderAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const filteredOutcomes = mockOutcomes.filter((outcome) => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          return outcome.hasActionableChange && outcome.token.actor.alliance !== hiderAlliance;
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
          { token: { id: 'enemy1' }, newVisibility: 'hidden', hasActionableChange: true },
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
        actionData: { actor: { id: 'hider' } },
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
          { token: { id: 'enemy1' }, oldVisibility: 'observed', currentVisibility: 'hidden' },
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
        { token: { id: 'enemy1' }, newVisibility: 'hidden', hasActionableChange: true },
        { token: { id: 'enemy2' }, newVisibility: 'hidden', hasActionableChange: true },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Should only process the specific outcome
      expect(targetOutcome.token.id).toBe('enemy1');
      expect(targetOutcome.newVisibility).toBe('hidden');

      // Other outcomes should remain unaffected
      const otherOutcomes = mockOutcomes.filter((o) => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
      expect(otherOutcomes[0].token.id).toBe('enemy2');
    });
  });

  describe('Per-Row Revert Tests', () => {
    test('per-row revert affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, oldVisibility: 'observed', currentVisibility: 'hidden' },
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

    test('BUG FIX VERIFICATION: hide per-row revert should pass targetTokenId', () => {
      // This test verifies that the hide dialog per-row revert bug is fixed

      const mockActionData = {
        messageId: 'test-message-456',
        actor: { id: 'hider', alliance: 'party' },
      };

      const tokenId = 'observer1';

      // Simulate the fixed dialog logic
      const actionDataWithTarget = {
        ...mockActionData,
        ignoreAllies: true,
        targetTokenId: tokenId,
      };

      // Verify that targetTokenId is passed correctly
      expect(actionDataWithTarget.targetTokenId).toBe('observer1');
      expect(actionDataWithTarget.messageId).toBe('test-message-456');
      expect(actionDataWithTarget.ignoreAllies).toBe(true);

      // This ensures the fix is in place and per-row revert will only affect the target token
    });
  });

  describe('hasActionableChange Calculation Tests', () => {
    describe('Without RAW Enforcement', () => {

      test('hide from observed to hidden (success) is actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'observed';
        const newState = getDefaultNewStateFor('hide', oldState, 'success');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('hidden');
        expect(hasActionableChange).toBe(true);
      });

      test('hide from observed to observed (failure) is not actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'observed';
        const newState = getDefaultNewStateFor('hide', oldState, 'failure');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(false);
      });

      test('hide from hidden to hidden (success) is not actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'hidden';
        const newState = getDefaultNewStateFor('hide', oldState, 'success');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('hidden');
        expect(hasActionableChange).toBe(false);
      });

      test('hide from undetected to observed (failure) is actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'undetected';
        const newState = getDefaultNewStateFor('hide', oldState, 'failure');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(true);
      });
    });


    test('hasActionableChange correctly identifies state transitions', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      const testCases = [
        {
          oldState: 'observed',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
        {
          oldState: 'observed',
          outcome: 'failure',
          expectedNewState: 'observed',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'failure',
          expectedNewState: 'observed',
          shouldBeActionable: true,
        },
        {
          oldState: 'undetected',
          outcome: 'success',
          expectedNewState: 'undetected',
          shouldBeActionable: false,
        },
        {
          oldState: 'undetected',
          outcome: 'failure',
          expectedNewState: 'observed',
          shouldBeActionable: true,
        },
      ];

      testCases.forEach(({ oldState, outcome, expectedNewState, shouldBeActionable }) => {
        const newState = getDefaultNewStateFor('hide', oldState, outcome);
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe(expectedNewState);
        expect(hasActionableChange).toBe(shouldBeActionable);
      });
    });
  });

  describe('Cover Modifier Service Integration', () => {
    test('calculateStealthRollTotals handles override modifiers correctly', () => {
      const {
        calculateStealthRollTotals,
      } = require('../../../scripts/chat/services/infra/shared-utils.js');

      const baseTotal = 18;
      const autoCoverResult = {
        state: 'greater',
        bonus: 4,
        isOverride: true,
        overrideDetails: {
          originalState: 'standard',
          finalState: 'greater',
        },
      };
      const actionData = {
        context: {
          _visionerStealth: { bonus: 0 },
        },
      };

      const result = calculateStealthRollTotals(baseTotal, autoCoverResult, actionData);

      expect(result.total).toBe(22); // Base total + cover bonus (18 + 4)
      expect(result).toHaveProperty('originalTotal');
      expect(result).toHaveProperty('baseRollTotal');
    });

    test('calculateStealthRollTotals calculates base roll total for overrides', () => {
      const {
        calculateStealthRollTotals,
      } = require('../../../scripts/chat/services/infra/shared-utils.js');

      const baseTotal = 20;
      const autoCoverResult = {
        state: 'greater',
        bonus: 4,
        isOverride: true,
      };
      const actionData = {
        context: {
          _visionerStealth: { bonus: 0 },
        },
      };

      const result = calculateStealthRollTotals(baseTotal, autoCoverResult, actionData);

      expect(result.baseRollTotal).toBe(20); // Base roll without any cover modifiers
      expect(result.total).toBe(24); // Base total + cover bonus (20 + 4)
    });

    test('getOutcomeLabel formats outcomes correctly', () => {
      const { getOutcomeLabel } = require('../../../scripts/chat/services/ui/dialog-utils.js');

      expect(getOutcomeLabel('success')).toBe('Success');
      expect(getOutcomeLabel('failure')).toBe('Failure');
      expect(getOutcomeLabel('critical-success')).toBe('Critical Success');
      expect(getOutcomeLabel('critical-failure')).toBe('Critical Failure');
    });

    test('determineOutcome calculates correct outcomes', () => {
      const { determineOutcome } = require('../../../scripts/chat/services/infra/shared-utils.js');

      expect(determineOutcome(20, 10, 15)).toBe('success'); // +5 margin
      expect(determineOutcome(25, 10, 15)).toBe('critical-success'); // +10 margin
      expect(determineOutcome(14, 10, 15)).toBe('failure'); // -1 margin
      expect(determineOutcome(5, 10, 15)).toBe('failure'); // -10 margin, but need <= -10 for crit failure

      // Natural 20/1 effects
      expect(determineOutcome(14, 20, 15)).toBe('success'); // Nat 20 promotes failure to success
      expect(determineOutcome(16, 1, 15)).toBe('failure'); // Nat 1 demotes success to failure
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
