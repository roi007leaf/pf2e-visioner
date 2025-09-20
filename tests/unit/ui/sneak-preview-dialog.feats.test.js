import '../../setup.js';
// Mock the visibility module used by the dialog before importing it
jest.mock('../../../scripts/visibility/auto-visibility/index.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibilityWithoutOverrides: jest.fn().mockResolvedValue('observed'),
  },
}));

describe('SneakPreviewDialog - feat-based end-position relaxation', () => {
  test('very-very-sneaky relaxes end position requirement', async () => {
    // Lazy import to align with module system
    const mod = require('../../../scripts/chat/dialogs/sneak-preview-dialog.js');
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
        items: [ { type: 'feat', system: { slug: 'very-very-sneaky' } } ],
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
    const processed = dialog.outcomes[0];
    expect(processed._featPositionOverride).toBeDefined();
    expect(processed._featPositionOverride.endQualifies).toBe(true);

    // And it should not force newVisibility to observed due to end position
    expect(processed.newVisibility).not.toBe('observed');
  });
});
