import '../../setup.js';
// Mock the visibility module used by the dialog before importing it
jest.mock('../../../scripts/visibility/auto-visibility/index.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibilityWithoutOverrides: jest.fn().mockResolvedValue('observed'),
  },
}));

// Mock FeatsHandler to properly handle very-very-sneaky feat
jest.mock('../../../scripts/chat/services/FeatsHandler.js', () => ({
  FeatsHandler: {
    isEnvironmentActive: jest.fn().mockReturnValue(false),
    overridePrerequisites: jest.fn().mockImplementation((tokenOrActor, base, extra = {}) => {
      // Check if actor has very-very-sneaky feat
      const actor = tokenOrActor.actor || tokenOrActor;
      const hasVeryVerySneaky = actor?.items?.some(item =>
        item.type === 'feat' && item.system?.slug === 'very-very-sneaky'
      );

      if (hasVeryVerySneaky) {
        return {
          ...base,
          startQualifies: true,
          endQualifies: true,
          bothQualify: true,
          reason: 'Very, Very Sneaky removes end cover/concealment requirement'
        };
      }
      return base;
    })
  }
}));

// Mock shared-utils to prevent filtering from removing outcomes
jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  filterOutcomesByAllies: jest.fn((outcomes) => outcomes), // Don't filter any outcomes
  filterOutcomesByDefeated: jest.fn((outcomes) => outcomes), // Don't filter any outcomes
  filterOutcomesByEncounter: jest.fn((outcomes) => outcomes), // Don't filter any outcomes
  hasActiveEncounter: jest.fn(() => false), // No active encounter
}));

describe('SneakPreviewDialog - feat-based end-position relaxation', () => {
  test('very-very-sneaky relaxes end position requirement', async () => {
    // Lazy import to align with module system
    const mod = require('../../../scripts/chat/dialogs/SneakPreviewDialog.js');
    const { SneakPreviewDialog } = mod;

    // Build a minimal sneaking token with Very, Very Sneaky feat
    const sneakingToken = {
      id: 'sneaker',
      name: 'Sneaky Goblin',
      document: {
        id: 'sneaker-doc',
        setFlag: jest.fn().mockResolvedValue(true),
        unsetFlag: jest.fn().mockResolvedValue(true),
        getFlag: jest.fn(),
      },
      actor: {
        id: 'actor-1',
        name: 'Sneaky Goblin',
        items: [{ type: 'feat', system: { slug: 'very-very-sneaky' } }],
        document: { id: 'actor-1' },
      },
    };

    // Observer token with no cover / not concealed at end
    const observer = { id: 'obs-1', name: 'Watcher', document: { id: 'obs-1', hidden: false, getFlag: jest.fn(() => ({})) } };

    // Mock a basic outcome with positionTransition lacking end cover/concealment
    const outcomes = [{
      token: observer,
      oldVisibility: 'observed',
      currentVisibility: 'observed',
      newVisibility: 'hidden',
      outcome: 'success',
      positionTransition: {
        startPosition: { avsVisibility: 'hidden', coverState: 'none', distance: 10, lightingConditions: 'bright' },
        endPosition: { avsVisibility: 'observed', coverState: 'none', distance: 20, lightingConditions: 'bright' },
        hasChanged: true,
        avsVisibilityChanged: true,
        coverStateChanged: false,
        transitionType: 'worsened',
      },
    }];

    // Stub position tracker used by dialog to avoid real canvas access
    const dialog = new SneakPreviewDialog(sneakingToken, outcomes, [], { startStates: {} });
    dialog.positionTracker = {
      _capturePositionState: jest.fn().mockResolvedValue({
        avsVisibility: 'observed',
        coverState: 'none',
        distance: 20,
        lightingConditions: 'bright',
      }),
    };

    const ctx = await dialog._prepareContext({});
    expect(ctx).toBeTruthy();

    // The dialog should have integrated FeatsHandler.overrideSneakPrerequisites and marked
    // end position as qualifying despite no cover/concealment when the actor has very-very-sneaky
    expect(dialog.outcomes).toHaveLength(1);
    const processed = dialog.outcomes[0];
    expect(processed).toBeDefined();
    expect(processed._featPositionOverride).toBeDefined();
    expect(processed._featPositionOverride.endQualifies).toBe(true);

    // And it should not force newVisibility to observed due to end position
    expect(processed.newVisibility).not.toBe('observed');
  });

  test('end-of-turn dialog initializes all filter properties correctly', async () => {
    // Lazy import to align with module system
    const mod = require('../../../scripts/chat/dialogs/SneakPreviewDialog.js');
    const { SneakPreviewDialog } = mod;

    const sneakingToken = {
      id: 'sneaker',
      name: 'Test Sneaker',
      actor: { id: 'actor1' },
      document: {
        getFlag: jest.fn().mockReturnValue({}),
      },
    };

    const outcomes = [{
      token: {
        id: 'observer1',
        name: 'Observer',
        document: {
          getFlag: jest.fn().mockReturnValue({}),
        },
      },
      newVisibility: 'hidden',
      previousVisibility: 'observed',
    }];

    // Create end-of-turn dialog
    const endOfTurnDialog = new SneakPreviewDialog(
      sneakingToken,
      outcomes,
      {},
      {},
      { isEndOfTurnDialog: true }
    );

    // Verify all filter properties are properly initialized
    expect(endOfTurnDialog.isEndOfTurnDialog).toBe(true);
    expect(endOfTurnDialog.encounterOnly).toBeDefined();
    expect(endOfTurnDialog.ignoreAllies).toBeDefined();
    expect(endOfTurnDialog.hideFoundryHidden).toBeDefined();
    expect(endOfTurnDialog.filterByDetection).toBeDefined();
    expect(endOfTurnDialog.showChangesOnly).toBeDefined();

    // Verify defaults are appropriate
    expect(typeof endOfTurnDialog.encounterOnly).toBe('boolean');
    expect(typeof endOfTurnDialog.ignoreAllies).toBe('boolean');
    expect(typeof endOfTurnDialog.hideFoundryHidden).toBe('boolean');
    expect(typeof endOfTurnDialog.filterByDetection).toBe('boolean');
    expect(typeof endOfTurnDialog.showChangesOnly).toBe('boolean');

    // Prepare context to ensure filters are passed to template
    const context = await endOfTurnDialog._prepareContext({});
    expect(context.encounterOnly).toBe(endOfTurnDialog.encounterOnly);
    expect(context.ignoreAllies).toBe(endOfTurnDialog.ignoreAllies);
    expect(context.hideFoundryHidden).toBe(endOfTurnDialog.hideFoundryHidden);
    expect(context.filterByDetection).toBe(endOfTurnDialog.filterByDetection);
    expect(context.showOnlyChanges).toBe(endOfTurnDialog.showChangesOnly);
  });
});
