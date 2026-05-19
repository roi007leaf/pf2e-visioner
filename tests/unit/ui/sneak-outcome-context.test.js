/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(() => 'concealed'),
}));

jest.mock('../../../scripts/visibility/auto-visibility/index.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibilityWithoutOverrides: jest.fn(async () => 'hidden'),
  },
}));

jest.mock('../../../scripts/visibility/perception-profile.js', () => ({
  overrideToDisplayVisibility: jest.fn((flag) => flag.visibility || 'hidden'),
}));

jest.mock('../../../scripts/chat/services/data/action-state-config.js', () => ({
  getDefaultNewStateFor: jest.fn(() => 'hidden'),
  getDesiredOverrideStatesForAction: jest.fn(() => [{ value: 'observed' }, { value: 'hidden' }]),
}));

jest.mock('../../../scripts/chat/services/FeatsHandler.js', () => ({
  FeatsHandler: {
    isEnvironmentActive: jest.fn(() => true),
    overridePrerequisites: jest.fn((token, effective) => effective),
  },
}));

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    hasSneakyFeat: jest.fn(() => true),
    isObserverDeferred: jest.fn(() => false),
  },
}));

import {
  collectSneakerOverrideFlagsByObserverId,
  prepareSneakOutcomeContexts,
  recalculateSneakPositionOutcomes,
} from '../../../scripts/chat/dialogs/Sneak/sneak-outcome-context.js';
import { optimizedVisibilityCalculator } from '../../../scripts/visibility/auto-visibility/index.js';
import {
  getDefaultNewStateFor,
  getDesiredOverrideStatesForAction,
} from '../../../scripts/chat/services/data/action-state-config.js';
import { FeatsHandler } from '../../../scripts/chat/services/FeatsHandler.js';

describe('sneak outcome context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.canvas = {
      tokens: {
        placeables: [],
        get: jest.fn(),
      },
    };
  });

  function buildDialog(overrides = {}) {
    return {
      sneakingToken: { id: 'sneak-token', actor: { id: 'sneak-actor' } },
      _deferredChecks: new Set(),
      getVisibilityBetween: jest.fn(() => 'observed'),
      buildOverrideStates: jest.fn((states) => states),
      isOldStateAvsControlled: jest.fn(() => false),
      isCurrentStateAvsControlled: jest.fn(() => false),
      _getPositionTransitionForToken: jest.fn(() => ({
        startPosition: { effectiveVisibility: 'hidden' },
        endPosition: { effectiveVisibility: 'concealed', coverState: 'standard' },
        transitionType: 'improved',
      })),
      _preparePositionDisplay: jest.fn(() => ({
        startPosition: { qualifies: true },
        endPosition: { qualifies: false },
      })),
      _isEligibleForSneakyDefer: jest.fn(() => true),
      _assessPositionQuality: jest.fn(() => 'good'),
      _startPositionQualifiesForSneak: jest.fn(() => true),
      _endPositionQualifiesForSneak: jest.fn(() => true),
      getOutcomeClass: jest.fn(() => 'success'),
      getOutcomeLabel: jest.fn(() => 'Success'),
      visibilityConfig: jest.fn((state) => ({ state })),
      formatMargin: jest.fn((margin) => `${margin}`),
      resolveTokenImage: jest.fn(() => 'token.webp'),
      ...overrides,
    };
  }

  test('collects sneaker override flags once by observer id', () => {
    const sneakerToken = {
      id: 'scene-sneak',
      actor: { id: 'sneak-actor' },
      document: { id: 'scene-sneak-doc' },
    };
    global.canvas.tokens.placeables = [sneakerToken];
    global.canvas.tokens.get.mockReturnValue({
      document: {
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-doc': { visibility: 'hidden' },
          },
        },
      },
    });

    const flags = collectSneakerOverrideFlagsByObserverId(buildDialog());

    expect(flags.get('observer-doc')).toEqual({ visibility: 'hidden' });
    expect(global.canvas.tokens.get).toHaveBeenCalledWith('scene-sneak-doc');
  });

  test('prepares display context with hoisted override flags and shared desired states', () => {
    global.canvas.tokens.placeables = [
      {
        actor: { id: 'sneak-actor' },
        document: { id: 'scene-sneak-doc' },
      },
    ];
    global.canvas.tokens.get.mockReturnValue({
      document: {
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-doc': { visibility: 'hidden' },
          },
        },
      },
    });
    const dialog = buildDialog();
    const outcome = {
      token: { id: 'observer', document: { id: 'observer-doc' } },
      outcome: 'success',
      margin: 3,
      newVisibility: 'concealed',
      rollTotal: 19,
    };

    const [processed] = prepareSneakOutcomeContexts(dialog, [outcome], {
      currentVisibilityMode: 'dialog',
      includeOldVisibility: true,
      oldStatePreference: 'currentFirst',
      useSneakerOverrideFlags: true,
    });

    expect(processed.oldVisibility).toBe('hidden');
    expect(processed.availableStates).toEqual([{ value: 'observed' }, { value: 'hidden' }]);
    expect(processed.canDefer).toBe(true);
    expect(getDesiredOverrideStatesForAction).toHaveBeenCalledTimes(1);
    expect(global.canvas.tokens.get).toHaveBeenCalledTimes(1);
  });

  test('recalculates position outcomes and refreshes live end visibility', async () => {
    const dialog = buildDialog();
    const outcome = {
      token: { id: 'observer' },
      oldVisibility: 'observed',
      currentVisibility: 'observed',
      outcome: 'success',
      positionTransition: {
        startPosition: { effectiveVisibility: 'hidden' },
        endPosition: { effectiveVisibility: 'concealed', coverState: 'standard' },
      },
    };

    await recalculateSneakPositionOutcomes(dialog, [outcome], {
      refreshLiveEndVisibility: true,
    });

    expect(outcome.liveEndVisibility).toBe('hidden');
    expect(outcome.newVisibility).toBe('hidden');
    expect(optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides).toHaveBeenCalledWith(
      outcome.token,
      dialog.sneakingToken,
    );
    expect(getDefaultNewStateFor).toHaveBeenCalledWith('sneak', 'observed', 'success');
    expect(FeatsHandler.isEnvironmentActive).toHaveBeenCalledTimes(1);
  });

  test('resets overrides when recalculated position no longer qualifies', async () => {
    const dialog = buildDialog({ _endPositionQualifiesForSneak: jest.fn(() => false) });
    const outcome = {
      token: { id: 'observer' },
      overrideState: 'hidden',
      positionTransition: {
        startPosition: { effectiveVisibility: 'hidden' },
        endPosition: { effectiveVisibility: 'observed', coverState: 'none' },
      },
    };

    await recalculateSneakPositionOutcomes(dialog, [outcome], { resetOverrideState: true });

    expect(outcome.newVisibility).toBe('avs');
    expect(outcome.overrideState).toBeNull();
  });
});
