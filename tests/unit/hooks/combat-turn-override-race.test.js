import '../../setup.js';

const mockHasAVSOverrides = jest.fn();
const mockGetAVSOverrides = jest.fn();
const mockCalculateVisibilityWithoutOverrides = jest.fn();
const mockDetectFromPoint = jest.fn();
const mockRemoveOverridePair = jest.fn();
const mockShow = jest.fn();

jest.mock('../../../scripts/services/CombatStartCoverService.js', () => ({
  combatStartCoverService: { applyCombatStartAutoCover: jest.fn() },
}));

jest.mock('../../../scripts/services/EncounterStealthInitiativeService.js', () => ({
  encounterStealthInitiativeService: {
    applyEncounterStartVisibility: jest.fn(),
    clearCombat: jest.fn(),
    handleCombatantInitiativeUpdate: jest.fn(),
    isEnabled: jest.fn(() => false),
    isInitiativeRelevantUpdate: jest.fn(() => false),
    scheduleTrackerVisibilityRefresh: jest.fn(),
  },
}));

jest.mock('../../../scripts/api.js', () => ({
  api: { hasAVSOverrides: mockHasAVSOverrides, getAVSOverrides: mockGetAVSOverrides },
}));

jest.mock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
  optimizedVisibilityCalculator: {
    calculateVisibilityWithoutOverrides: mockCalculateVisibilityWithoutOverrides,
  },
}));

jest.mock('../../../scripts/cover/auto-cover/CoverDetector.js', () => ({
  CoverDetector: class {
    detectFromPoint(...args) {
      return mockDetectFromPoint(...args);
    }
  },
}));

jest.mock('../../../scripts/ui/OverrideValidationIndicator.js', () => ({
  __esModule: true,
  default: { removeOverridePair: mockRemoveOverridePair, show: mockShow },
}));

describe('turn-change AVS validation race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    game.settings.set('pf2e-visioner', 'avsOverrideValidationOnTurnChange', true);
  });

  test('does not queue an override removed while turn validation is calculating', async () => {
    let persistedOverride = { state: 'concealed', source: 'manual_action' };
    const observer = {
      id: 'rootfall',
      document: { id: 'rootfall', x: 0, y: 0, width: 1, height: 1, elevation: 0 },
    };
    const target = {
      id: 'flint',
      document: {
        id: 'flint',
        x: 100,
        y: 0,
        width: 1,
        height: 1,
        elevation: 0,
        getFlag: jest.fn(() => persistedOverride),
      },
    };
    const tokens = new Map([
      [observer.id, observer],
      [target.id, target],
    ]);
    canvas.tokens.get = jest.fn((id) => tokens.get(id));
    game.combat = { combatants: new Set([{ tokenId: target.id }]) };

    const queued = {
      observerId: observer.id,
      targetId: target.id,
      state: 'concealed',
      source: 'manual_action',
    };
    mockHasAVSOverrides.mockReturnValue(true);
    mockGetAVSOverrides.mockReturnValue([queued]);
    mockCalculateVisibilityWithoutOverrides.mockImplementation(async () => {
      persistedOverride = undefined;
      return 'observed';
    });
    mockDetectFromPoint.mockReturnValue('none');

    const { checkAvsOverrides } = await import('../../../scripts/hooks/combat.js');
    await checkAvsOverrides();

    expect(mockRemoveOverridePair).toHaveBeenCalledWith(observer.id, target.id);
    expect(mockShow).not.toHaveBeenCalled();
  });
});
