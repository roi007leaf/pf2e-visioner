jest.mock('../../../scripts/rule-elements/operations/ActionQualifier.js', () => ({
  ActionQualifier: {
    forceStartQualifies: jest.fn(() => false),
    forceEndQualifies: jest.fn(() => false),
    checkSneakPrerequisites: jest.fn(() => ({ qualifies: true })),
  },
}));

jest.mock('../../../scripts/utils.js', () => ({
  getCoverBetween: jest.fn(() => 'none'),
  getVisibilityBetween: jest.fn(() => 'hidden'),
}));

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  __esModule: true,
  default: {
    isEnabled: jest.fn(() => false),
    detectCoverBetweenTokens: jest.fn(() => 'none'),
  },
}));

jest.mock('../../../scripts/chat/services/data/action-state-config.js', () => ({
  getDefaultNewStateFor: jest.fn(() => 'hidden'),
}));

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    isObserverDeferred: jest.fn(() => false),
    removeDeferredCheck: jest.fn(),
  },
}));

import {
  recalculateSneakOutcomeVisibility,
  sneakEndPositionQualifies,
  sneakStartPositionQualifies,
  startPositionQualifiesForSneak,
} from '../../../scripts/chat/dialogs/Sneak/sneak-position-qualification.js';

describe('sneak dialog position qualification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = { settings: { get: jest.fn(() => false) } };
  });

  test('exports stable start and end prerequisite helpers', () => {
    expect(sneakStartPositionQualifies('hidden')).toBe(true);
    expect(sneakStartPositionQualifies('concealed')).toBe(false);
    expect(sneakEndPositionQualifies('concealed', 'none')).toBe(true);
    expect(sneakEndPositionQualifies('observed', 'standard')).toBe(true);
  });

  test('start qualification uses stored start state before live fallback', () => {
    const dialog = {
      sneakingToken: { document: { getFlag: jest.fn(() => null) } },
      startStates: { observer: { visibility: 'undetected' } },
      _getPositionTransitionForToken: jest.fn(() => null),
    };

    expect(startPositionQualifiesForSneak(dialog, { id: 'observer' }, {})).toBe(true);
  });

  test('recalculation switches to AVS when either position fails', async () => {
    const updateOutcome = jest.fn();
    const dialog = {
      _getPositionTransitionForToken: jest.fn(() => null),
      _deferredChecks: new Set(),
      _updateOutcomeDisplayForToken: updateOutcome,
    };
    const outcome = {
      token: { id: 'observer' },
      oldVisibility: 'observed',
      outcome: 'success',
      positionTransition: {
        startPosition: { avsVisibility: 'hidden' },
        endPosition: { avsVisibility: 'observed', coverState: 'none' },
      },
    };

    await recalculateSneakOutcomeVisibility(dialog, outcome);

    expect(outcome.newVisibility).toBe('avs');
    expect(outcome.overrideState).toBeNull();
    expect(updateOutcome).toHaveBeenCalledWith('observer', outcome);
  });
});
