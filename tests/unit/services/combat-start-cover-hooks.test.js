import '../../setup.js';
import { jest } from '@jest/globals';

const mockApplyCombatStartAutoCover = jest.fn();
const mockApplyEncounterStartVisibility = jest.fn();
const mockClearCombat = jest.fn();
const mockScheduleTrackerVisibilityRefresh = jest.fn();
const mockHandleCombatantInitiativeUpdate = jest.fn();

jest.mock('../../../scripts/services/CombatStartCoverService.js', () => ({
  __esModule: true,
  combatStartCoverService: {
    applyCombatStartAutoCover: (...args) => mockApplyCombatStartAutoCover(...args),
  },
}));

jest.mock('../../../scripts/services/EncounterStealthInitiativeService.js', () => ({
  __esModule: true,
  encounterStealthInitiativeService: {
    applyEncounterStartVisibility: (...args) => mockApplyEncounterStartVisibility(...args),
    clearCombat: (...args) => mockClearCombat(...args),
    scheduleTrackerVisibilityRefresh: (...args) => mockScheduleTrackerVisibilityRefresh(...args),
    handleCombatantInitiativeUpdate: (...args) => mockHandleCombatantInitiativeUpdate(...args),
  },
}));

describe('combat start cover hook integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game.user.isGM = true;
    global.game.combat = null;
  });

  test('combat start computes cover before stealth initiative visibility setup', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-start-cover', combatants: [] };

    registerCombatHooks();
    const combatStartCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'combatStart')[1];

    await combatStartCallback(combat);

    expect(mockApplyCombatStartAutoCover).toHaveBeenCalledWith(combat);
    expect(mockApplyEncounterStartVisibility).toHaveBeenCalledWith(combat, {
      requireStarted: false,
    });
    expect(mockApplyCombatStartAutoCover.mock.invocationCallOrder[0]).toBeLessThan(
      mockApplyEncounterStartVisibility.mock.invocationCallOrder[0],
    );
  });
});
