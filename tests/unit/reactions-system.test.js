/**
 * Test suite for the reactions system
 */

import { REACTIONS } from '../../scripts/constants.js';

// Mock game object
global.game = {
  i18n: {
    localize: jest.fn((key) => key),
  },
  settings: {
    get: jest.fn(() => false), // Default all settings to false
  },
};

// Mock notify
jest.mock('../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { SeekPreviewDialog } from '../../scripts/chat/dialogs/seek-preview-dialog.js';
import { notify } from '../../scripts/chat/services/infra/notifications.js';

describe('Reactions System', () => {
  let dialog;
  let mockActor;
  let mockOutcomes;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    notify.info.mockClear();
    notify.warn.mockClear();
    notify.error.mockClear();

    // Mock actor with Sense the Unseen feat
    mockActor = {
      itemTypes: {
        feat: [
          {
            name: 'Sense the Unseen',
            system: { slug: 'sense-the-unseen' },
          },
        ],
      },
    };

    // Mock outcomes with failed undetected targets
    mockOutcomes = [
      {
        target: { id: 'target1', name: 'Target 1' },
        outcome: 'failure',
        currentVisibility: 'undetected',
        newVisibility: 'undetected',
        changed: false,
      },
      {
        target: { id: 'target2', name: 'Target 2' },
        outcome: 'success',
        currentVisibility: 'hidden',
        newVisibility: 'observed',
        changed: true,
      },
    ];

    // Create dialog instance
    const mockActorToken = { actor: mockActor };
    dialog = new SeekPreviewDialog(mockActorToken, mockOutcomes, [], {});
    dialog._originalOutcomes = [...mockOutcomes];
  });

  describe('Reaction Detection', () => {
    test('should detect available Sense the Unseen reaction', () => {
      const availableReactions = dialog.getAvailableReactions(mockOutcomes);

      expect(availableReactions).toHaveLength(1);
      expect(availableReactions[0].key).toBe('senseTheUnseen');
      expect(availableReactions[0].applied).toBe(false);
    });

    test('should not detect reactions when feat is missing', () => {
      const actorWithoutFeat = { itemTypes: { feat: [] } };
      const dialogWithoutFeat = new SeekPreviewDialog(
        { actor: actorWithoutFeat },
        mockOutcomes,
        [],
        {},
      );

      const availableReactions = dialogWithoutFeat.getAvailableReactions(mockOutcomes);

      expect(availableReactions).toHaveLength(0);
    });

    test('should not detect reactions when no failed undetected outcomes', () => {
      const successfulOutcomes = [
        {
          target: { id: 'target1', name: 'Target 1' },
          outcome: 'success',
          currentVisibility: 'hidden',
          newVisibility: 'observed',
          changed: true,
        },
      ];

      const availableReactions = dialog.getAvailableReactions(successfulOutcomes);

      expect(availableReactions).toHaveLength(0);
    });

    test('should not detect reactions for critical failures with undetected targets', () => {
      const criticalFailureOutcomes = [
        {
          target: { id: 'target1', name: 'Target 1' },
          outcome: 'critical-failure',
          currentVisibility: 'undetected',
          newVisibility: 'undetected',
          changed: false,
        },
      ];

      const availableReactions = dialog.getAvailableReactions(criticalFailureOutcomes);

      expect(availableReactions).toHaveLength(0);
    });
  });

  describe('Reaction Application', () => {
    test('should apply Sense the Unseen reaction successfully', async () => {
      await dialog.applyReaction('senseTheUnseen');

      // Check that the failed undetected outcome was upgraded to hidden
      const failedOutcome = dialog.outcomes.find((o) => o.target.id === 'target1');
      expect(failedOutcome.newVisibility).toBe('hidden');
      expect(failedOutcome.changed).toBe(true);
      expect(failedOutcome.senseUnseenApplied).toBe(true);
      expect(failedOutcome.hasActionableChange).toBe(true);
      expect(failedOutcome.overrideState).toBe('hidden');

      // Check that successful outcomes were not affected
      const successfulOutcome = dialog.outcomes.find((o) => o.target.id === 'target2');
      expect(successfulOutcome.newVisibility).toBe('observed');
      expect(successfulOutcome.senseUnseenApplied).toBeUndefined();

      // Check that reaction was marked as applied
      expect(dialog._appliedReactions.has('senseTheUnseen')).toBe(true);

      // Check notification
      expect(notify.info).toHaveBeenCalledWith(
        expect.stringContaining('Applied Sense the Unseen to 1 failed outcome(s)'),
      );
    });

    test('should prevent multiple applications of the same reaction', async () => {
      // Apply reaction first time
      await dialog.applyReaction('senseTheUnseen');
      expect(dialog._appliedReactions.has('senseTheUnseen')).toBe(true);

      // Try to apply again
      await dialog.applyReaction('senseTheUnseen');

      // Should show info message about already applied
      expect(notify.info).toHaveBeenCalledWith(expect.stringContaining('has already been applied'));
    });

    test('should handle unknown reaction gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await dialog.applyReaction('unknownReaction');

      expect(consoleSpy).toHaveBeenCalledWith('Unknown reaction: unknownReaction');
      consoleSpy.mockRestore();
    });

    test('should handle reaction with no applicable outcomes', async () => {
      // Create outcomes with no failed undetected targets
      const noFailedOutcomes = [
        {
          target: { id: 'target1', name: 'Target 1' },
          outcome: 'success',
          currentVisibility: 'hidden',
          newVisibility: 'observed',
          changed: true,
        },
      ];

      dialog.outcomes = noFailedOutcomes;

      await dialog.applyReaction('senseTheUnseen');

      expect(notify.warn).toHaveBeenCalledWith('No failed outcomes with undetected targets found.');
    });

    test('should not apply reaction to critical failures', async () => {
      // Create outcomes with critical failure undetected target
      const criticalFailureOutcomes = [
        {
          target: { id: 'target1', name: 'Target 1' },
          outcome: 'critical-failure',
          currentVisibility: 'undetected',
          newVisibility: 'undetected',
          changed: false,
        },
      ];

      dialog.outcomes = criticalFailureOutcomes;

      await dialog.applyReaction('senseTheUnseen');

      // Should not have changed the critical failure outcome
      expect(dialog.outcomes[0].newVisibility).toBe('undetected');
      expect(dialog.outcomes[0].changed).toBe(false);
      expect(dialog.outcomes[0].senseUnseenApplied).toBeUndefined();
      expect(notify.warn).toHaveBeenCalledWith('No failed outcomes with undetected targets found.');
    });
  });

  describe('REACTIONS Configuration', () => {
    test('should have properly configured Sense the Unseen reaction', () => {
      const reaction = REACTIONS.senseTheUnseen;

      expect(reaction).toBeDefined();
      expect(reaction.id).toBe('sense-the-unseen');
      expect(reaction.name).toBe('PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.name');
      expect(reaction.type).toBe('reaction');
      expect(reaction.icon).toBe('fas fa-eye');
      expect(typeof reaction.isAvailable).toBe('function');
      expect(typeof reaction.apply).toBe('function');
    });

    test('should correctly check availability conditions', () => {
      const reaction = REACTIONS.senseTheUnseen;

      // Test with valid context
      const validContext = {
        actor: mockActor,
        outcomes: mockOutcomes,
      };
      expect(reaction.isAvailable(validContext)).toBe(true);

      // Test without actor
      const noActorContext = {
        actor: null,
        outcomes: mockOutcomes,
      };
      expect(reaction.isAvailable(noActorContext)).toBe(false);

      // Test without feat
      const noFeatContext = {
        actor: { itemTypes: { feat: [] } },
        outcomes: mockOutcomes,
      };
      expect(reaction.isAvailable(noFeatContext)).toBe(false);

      // Test without failed undetected outcomes
      const noFailedContext = {
        actor: mockActor,
        outcomes: [
          {
            target: { id: 'target1', name: 'Target 1' },
            outcome: 'success',
            currentVisibility: 'hidden',
            newVisibility: 'observed',
            changed: true,
          },
        ],
      };
      expect(reaction.isAvailable(noFailedContext)).toBe(false);
    });
  });

  describe('UI Integration', () => {
    test('should track applied reactions state', () => {
      expect(dialog._appliedReactions).toBeInstanceOf(Set);
      expect(dialog._appliedReactions.size).toBe(0);

      dialog._appliedReactions.add('senseTheUnseen');
      expect(dialog._appliedReactions.has('senseTheUnseen')).toBe(true);
    });

    test('should include applied state in available reactions', () => {
      dialog._appliedReactions.add('senseTheUnseen');

      const availableReactions = dialog.getAvailableReactions(mockOutcomes);

      expect(availableReactions).toHaveLength(1);
      expect(availableReactions[0].applied).toBe(true);
    });

    test('should update toggle button animation state after reaction is applied', () => {
      // Mock DOM elements
      const mockToggleButton = {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      };

      dialog.element = {
        querySelector: jest.fn((selector) => {
          if (selector === '.reactions-toggle-button') {
            return mockToggleButton;
          }
          return null;
        }),
      };

      // Before applying reaction - should have animation
      dialog.updateReactionsToggleButton();
      expect(mockToggleButton.classList.add).toHaveBeenCalledWith('has-available');

      // After applying reaction - should stop animation
      dialog._appliedReactions.add('senseTheUnseen');
      dialog.updateReactionsToggleButton();
      expect(mockToggleButton.classList.remove).toHaveBeenCalledWith('has-available');
    });
  });
});
