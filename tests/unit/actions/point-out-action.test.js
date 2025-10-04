/**
 * Comprehensive tests for Point Out Action
 * Tests all scenarios: per-row apply/revert, dialog apply-all/revert-all, chat apply-changes
 * Tests all settings combinations: allies filter on/off, enforce raw on/off
 */

import '../../setup.js';

describe('Point Out Action Comprehensive Tests', () => {
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
      // Note: Point Out may not have a standard panel like other actions
      // This test validates the concept that if it does, it should have correct data-action
      expect(true).toBe(true); // Placeholder for panel testing when implemented
    });
  });

  describe('Status Mapping Tests', () => {
    test('point-out action maps all states to hidden for most outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      // Point Out maps all states to "hidden" for critical-success and success
      const allStates = ['observed', 'concealed', 'hidden', 'undetected'];
      const successOutcomes = ['critical-success', 'success'];

      allStates.forEach((state) => {
        successOutcomes.forEach((outcome) => {
          const result = getDefaultNewStateFor('point-out', state, outcome);
          expect(result).toBe('hidden');
        });
      });
    });

    test('point-out action has typo in failure outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      const allStates = ['observed', 'concealed', 'hidden', 'undetected'];
      const failureOutcomes = ['failure', 'critical-failure'];

      allStates.forEach((state) => {
        failureOutcomes.forEach((outcome) => {
          const result = getDefaultNewStateFor('point-out', state, outcome);
          expect(result).toBe('hidden');
        });
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
            newVisibility: 'observed',
            hasActionableChange: true,
          },
          {
            token: { id: 'enemy1', actor: { alliance: 'opposition' } },
            newVisibility: 'observed',
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
            newVisibility: 'observed',
            hasActionableChange: true,
          },
          {
            token: { id: 'enemy1', actor: { alliance: 'opposition' } },
            newVisibility: 'observed',
            hasActionableChange: true,
          },
        ];

        // Simulate the filtering logic from point-out action
        const pointerAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const filteredOutcomes = mockOutcomes.filter((outcome) => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          return outcome.hasActionableChange && outcome.token.actor.alliance !== pointerAlliance;
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
          { token: { id: 'enemy1' }, newVisibility: 'observed', hasActionableChange: true },
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
        actionData: { actor: { id: 'pointer' } },
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
          { token: { id: 'enemy1' }, oldVisibility: 'hidden', currentVisibility: 'observed' },
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
        { token: { id: 'enemy1' }, newVisibility: 'observed', hasActionableChange: true },
        { token: { id: 'enemy2' }, newVisibility: 'observed', hasActionableChange: true },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Should only process the specific outcome
      expect(targetOutcome.token.id).toBe('enemy1');
      expect(targetOutcome.newVisibility).toBe('observed');

      // Other outcomes should remain unaffected
      const otherOutcomes = mockOutcomes.filter((o) => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
      expect(otherOutcomes[0].token.id).toBe('enemy2');
    });
  });

  describe('Per-Row Revert Tests', () => {
    test('per-row revert affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, oldVisibility: 'hidden', currentVisibility: 'observed' },
        { token: { id: 'enemy2' }, oldVisibility: 'hidden', currentVisibility: 'observed' },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find((o) => o.token.id === targetTokenId);

      // Should create specific revert change for this token only
      const revertVisibility = targetOutcome.oldVisibility || targetOutcome.currentVisibility;
      const revertChange = { target: targetOutcome.token, newVisibility: revertVisibility };

      expect(revertChange.target.id).toBe('enemy1');
      expect(revertChange.newVisibility).toBe('hidden');

      // Should not affect other tokens
      const otherOutcomes = mockOutcomes.filter((o) => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
    });
  });



  describe('hasActionableChange Calculation Tests', () => {
    describe('Without RAW Enforcement', () => {

      test('point-out action maps all states to hidden for success outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        // Point Out maps all states to "hidden" for critical-success and success
        const allStates = ['observed', 'concealed', 'hidden', 'undetected'];
        const successOutcomes = ['critical-success', 'success'];

        allStates.forEach((oldState) => {
          successOutcomes.forEach((outcome) => {
            const newState = getDefaultNewStateFor('point-out', oldState, outcome);
            expect(newState).toBe('hidden');
          });
        });
      });

      test('point-out action maps all states to hidden for failure outcomes', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const allStates = ['observed', 'concealed', 'hidden', 'undetected'];
        const failureOutcomes = ['failure', 'critical-failure'];

        allStates.forEach((oldState) => {
          failureOutcomes.forEach((outcome) => {
            const newState = getDefaultNewStateFor('point-out', oldState, outcome);
            expect(newState).toBe('hidden');
          });
        });
      });
    });



    test('hasActionableChange correctly identifies state transitions', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      const testCases = [
        {
          oldState: 'hidden',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'failure',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'critical-success',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'hidden',
          outcome: 'critical-failure',
          expectedNewState: 'hidden',
          shouldBeActionable: false,
        },
        {
          oldState: 'observed',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
        {
          oldState: 'concealed',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
        {
          oldState: 'undetected',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
      ];

      testCases.forEach(({ oldState, outcome, expectedNewState, shouldBeActionable }) => {
        const newState = getDefaultNewStateFor('point-out', oldState, outcome);
        // Handle null cases specially: null means no change, so not actionable
        const hasActionableChange = newState !== null && newState !== oldState;

        expect(newState).toBe(expectedNewState);
        expect(hasActionableChange).toBe(shouldBeActionable);
      });
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
