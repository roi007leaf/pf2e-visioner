jest.mock('../../../scripts/chat/dialogs/Sneak/sneak-dialog-filtering.js', () => ({
  applySneakVisualFilters: jest.fn((outcomes, options = {}) => {
    if (options.showChangesOnly) {
      return outcomes.filter((outcome) => outcome.hasActionableChange);
    }
    return outcomes;
  }),
  getSneakDialogFilteredOutcomes: jest.fn(async (app) => app.outcomes),
}));

jest.mock('../../../scripts/chat/dialogs/Sneak/sneak-outcome-context.js', () => ({
  prepareSneakOutcomeContexts: jest.fn((app, outcomes) =>
    outcomes.map((outcome) => ({ ...outcome, prepared: true })),
  ),
  recalculateSneakPositionOutcomes: jest.fn(async () => {}),
}));

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    hasSneakyFeat: jest.fn(() => true),
    getTurnSneakState: jest.fn(() => ({ isActive: true, sneakActions: [{}, {}] })),
    shouldDeferEndPositionCheck: jest.fn((token, observer) => observer?.id === 'observer-2'),
  },
}));

jest.mock('../../../scripts/chat/services/FeatsHandler.js', () => ({
  FeatsHandler: {
    hasFeat: jest.fn(() => false),
    getSneakSpeedMultiplier: jest.fn(() => 0.5),
    getSneakDistanceBonusFeet: jest.fn(() => 0),
  },
}));

jest.mock('../../../scripts/chat/services/SneakSpeedService.js', () => ({
  SneakSpeedService: {
    getSneakMaxDistanceFeet: jest.fn(async () => 15),
  },
}));

import {
  getSneakMovementType,
  prepareSneakDialogContext,
} from '../../../scripts/chat/dialogs/Sneak/sneak-dialog-context.js';

describe('sneak dialog context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      i18n: { localize: jest.fn((key) => key), format: jest.fn((key) => key) },
      settings: { get: jest.fn(() => false) },
    };
  });

  function buildApp() {
    return {
      sneakingToken: {
        id: 'sneaker',
        name: 'Sneaker',
        document: { movementAction: 'fly' },
        actor: {
          system: { movement: { speeds: { land: { value: 30 }, fly: { value: 40 } } } },
          getFlag: jest.fn(() => null),
        },
      },
      outcomes: [
        { token: { id: 'observer-1' }, hasActionableChange: true, canDefer: true },
        { token: { id: 'observer-2' }, hasActionableChange: false, isDeferred: true },
      ],
      _deferredChecks: new Set(['observer-2']),
      _hasPositionData: true,
      _positionDisplayMode: 'enhanced',
      ignoreAllies: true,
      hideFoundryHidden: true,
      showChangesOnly: false,
      isEndOfTurnDialog: false,
      _captureCurrentEndPositionsForOutcomes: jest.fn(async () => {}),
      _extractPositionTransitions: jest.fn(async () => {}),
      _sortOutcomesByQualification: jest.fn((outcomes) => outcomes),
      resolveTokenImage: jest.fn(() => 'sneaker.webp'),
      buildCommonContext: jest.fn(() => ({ totalChanges: 1 })),
    };
  }

  test('normalizes movement type from token document', () => {
    expect(getSneakMovementType({ document: { movementAction: 'flying' } })).toBe('fly');
    expect(getSneakMovementType({ document: { movementType: 'stride' } })).toBe('stride');
    expect(getSneakMovementType({ document: { movementType: 'unknown' } })).toBe('walk');
  });

  test('assembles processed outcomes and bulk/deferred context', async () => {
    const app = buildApp();
    const context = await prepareSneakDialogContext(app, {});

    expect(context.sneaker).toMatchObject({ name: 'Sneaker', image: 'sneaker.webp' });
    expect(context.outcomes).toHaveLength(2);
    expect(context.canBulkDefer).toBe(true);
    expect(context.hasDeferableTokens).toBe(true);
    expect(context.canBulkUndefer).toBe(true);
    expect(context.hasDeferredTokens).toBe(true);
    expect(context.canProcessEndTurn).toBe(true);
    expect(context.deferredChecksCount).toBe(1);
    expect(context.hasDeferredChecks).toBe(true);
    expect(context.consecutiveSneaks).toBe(2);
    expect(context.sneakDistance).toMatchObject({
      maxFeet: 15,
      movementType: 'fly',
      supported: true,
      speed: 40,
    });
    expect(app.outcomes.every((outcome) => outcome.prepared)).toBe(true);
  });
});
