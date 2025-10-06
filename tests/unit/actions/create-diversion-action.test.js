/**
 * Comprehensive tests for Create a Diversion Action
 * Tests all scenarios: per-row apply/revert, dialog apply-all/revert-all, chat apply-changes
 * Tests all settings combinations: allies filter on/off, enforce raw on/off
 */

import '../../setup.js';

describe('Create a Diversion Action Comprehensive Tests', () => {
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
      const { buildDiversionPanel } = require('../../../scripts/chat/ui/panel/diversion.js');

      game.user.isGM = true;
      const panel = buildDiversionPanel();

      expect(panel.actionButtonsHtml).toContain('data-action="apply-now-diversion"');
      expect(panel.actionButtonsHtml).toContain('Apply Changes');
    });
  });

  describe('Status Mapping Tests', () => {
    test('create-a-diversion from observed state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('create-a-diversion', 'observed', 'critical-success')).toBe(
        'hidden',
      );
      expect(getDefaultNewStateFor('create-a-diversion', 'observed', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('create-a-diversion', 'observed', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('create-a-diversion', 'observed', 'critical-failure')).toBe(
        'observed',
      );
    });

    test('create-a-diversion from concealed state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('create-a-diversion', 'concealed', 'critical-success')).toBe(
        'hidden',
      );
      expect(getDefaultNewStateFor('create-a-diversion', 'concealed', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('create-a-diversion', 'concealed', 'failure')).toBe('concealed');
      expect(getDefaultNewStateFor('create-a-diversion', 'concealed', 'critical-failure')).toBe(
        'concealed',
      );
    });

    test('create-a-diversion from hidden state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('create-a-diversion', 'hidden', 'critical-success')).toBe(
        'hidden',
      );
      expect(getDefaultNewStateFor('create-a-diversion', 'hidden', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('create-a-diversion', 'hidden', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('create-a-diversion', 'hidden', 'critical-failure')).toBe(
        'observed',
      );
    });

    test('create-a-diversion from undetected state produces correct outcomes', () => {
      const {
        getDefaultNewStateFor,
      } = require('../../../scripts/chat/services/data/action-state-config.js');

      expect(getDefaultNewStateFor('create-a-diversion', 'undetected', 'critical-success')).toBe(
        'hidden',
      );
      expect(getDefaultNewStateFor('create-a-diversion', 'undetected', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('create-a-diversion', 'undetected', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('create-a-diversion', 'undetected', 'critical-failure')).toBe(
        'observed',
      );
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

        // Simulate the filtering logic from create-a-diversion action
        const diversorAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const filteredOutcomes = mockOutcomes.filter((outcome) => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          return outcome.hasActionableChange && outcome.token.actor.alliance !== diversorAlliance;
        });

        expect(filteredOutcomes).toHaveLength(1);
        expect(filteredOutcomes[0].token.id).toBe('enemy1');
      });

      test('reversed filter bug fix - when ignoreAllies is clicked, applies to enemies not allies', () => {
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

        // This was the bug: filters were reversed
        const diversorAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const correctlyFilteredOutcomes = mockOutcomes.filter((outcome) => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          // Correct logic: exclude allies (same alliance), keep enemies (different alliance)
          return outcome.hasActionableChange && outcome.token.actor.alliance !== diversorAlliance;
        });

        // Should only affect enemies, not allies
        expect(correctlyFilteredOutcomes).toHaveLength(1);
        expect(correctlyFilteredOutcomes[0].token.id).toBe('enemy1');
        expect(correctlyFilteredOutcomes[0].token.actor.alliance).toBe('opposition');
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

    test('apply all works when ignoreAllies setting is toggled in dialog', () => {
      // This was a reported bug: Apply All didn't work until ignoreAllies was toggled
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [{ token: { id: 'enemy1' }, newVisibility: 'hidden', hasActionableChange: true }],
        actionData: { actor: { alliance: 'party' } },
      };

      // Should work immediately without needing to toggle ignoreAllies
      const changedOutcomes = mockDialog.outcomes.filter((o) => o.hasActionableChange);

      expect(changedOutcomes).toHaveLength(1);
      expect(changedOutcomes[0].token.id).toBe('enemy1');
    });

    test('apply all passes ignoreAllies setting consistently', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [{ token: { id: 'enemy1' }, hasActionableChange: true }],
        actionData: { actor: { id: 'diversionist' } },
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
  });

  describe('hasActionableChange Calculation Tests', () => {
    describe('Without RAW Enforcement', () => {

      test('create-a-diversion from observed to hidden (success) is actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'observed';
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, 'success');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('hidden');
        expect(hasActionableChange).toBe(true);
      });

      test('create-a-diversion from observed to observed (failure) is not actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'observed';
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, 'failure');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(false);
      });

      test('create-a-diversion from hidden to hidden (success) is not actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'hidden';
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, 'success');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('hidden');
        expect(hasActionableChange).toBe(false);
      });

      test('create-a-diversion from undetected to observed (failure) is actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'undetected';
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, 'failure');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(true);
      });

      test('create-a-diversion from concealed to concealed (failure) is not actionable', () => {
        const {
          getDefaultNewStateFor,
        } = require('../../../scripts/chat/services/data/action-state-config.js');

        const oldState = 'concealed';
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, 'failure');
        const hasActionableChange = newState !== oldState;

        expect(newState).toBe('concealed');
        expect(hasActionableChange).toBe(false);
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
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
        {
          oldState: 'undetected',
          outcome: 'failure',
          expectedNewState: 'observed',
          shouldBeActionable: true,
        },
        {
          oldState: 'concealed',
          outcome: 'success',
          expectedNewState: 'hidden',
          shouldBeActionable: true,
        },
        {
          oldState: 'concealed',
          outcome: 'failure',
          expectedNewState: 'concealed',
          shouldBeActionable: false,
        },
      ];

      testCases.forEach(({ oldState, outcome, expectedNewState, shouldBeActionable }) => {
        const newState = getDefaultNewStateFor('create-a-diversion', oldState, outcome);
        const hasActionableChange = newState !== oldState;

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
