jest.mock('../../../scripts/visibility/auto-visibility/index.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibilityWithoutOverrides: jest.fn(async () => 'concealed'),
  },
}));

import {
  captureCurrentSneakEndPositions,
  extractSneakPositionTransitions,
  getSneakPositionTransitionForToken,
} from '../../../scripts/chat/dialogs/Sneak/sneak-position-transitions.js';
import { optimizedVisibilityCalculator } from '../../../scripts/visibility/auto-visibility/index.js';

describe('sneak position transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('captures live end position and creates transition when missing', async () => {
    const app = {
      sneakingToken: { id: 'sneaker' },
      startStates: { observer: { visibility: 'hidden', cover: 'none' } },
      positionTracker: {
        _capturePositionState: jest.fn(async () => ({
          effectiveVisibility: 'concealed',
          coverState: 'standard',
          distance: 20,
          lightingConditions: 'dim',
        })),
      },
    };
    const outcome = { token: { id: 'observer', document: { id: 'observer-doc' } } };

    await captureCurrentSneakEndPositions(app, [outcome]);

    expect(app.positionTracker._capturePositionState).toHaveBeenCalledWith(
      app.sneakingToken,
      outcome.token,
      expect.any(Number),
      { forceFresh: true, useCurrentPositionForCover: true },
    );
    expect(optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides).toHaveBeenCalledWith(
      outcome.token,
      app.sneakingToken,
    );
    expect(outcome.endCover).toBe('standard');
    expect(outcome.endVisibility).toBe('concealed');
    expect(outcome.liveEndVisibility).toBe('concealed');
    expect(outcome.positionTransition).toMatchObject({
      hasChanged: true,
      transitionType: 'improved',
      startPosition: { effectiveVisibility: 'hidden', coverState: 'none' },
      endPosition: { effectiveVisibility: 'concealed', coverState: 'standard' },
    });
  });

  test('extracts transition cache and end-turn lookup prefers preserved outcome data', async () => {
    const transition = { endPosition: { effectiveVisibility: 'hidden' } };
    const app = {
      _positionTransitions: new Map(),
      _hasPositionData: false,
      isEndOfTurnDialog: true,
      outcomes: [{ token: { id: 'observer' }, positionTransition: transition }],
    };

    await extractSneakPositionTransitions(app, app.outcomes);

    expect(app._hasPositionData).toBe(true);
    expect(app._positionTransitions.get('observer')).toBe(transition);
    expect(getSneakPositionTransitionForToken(app, { id: 'observer' })).toBe(transition);
  });
});
