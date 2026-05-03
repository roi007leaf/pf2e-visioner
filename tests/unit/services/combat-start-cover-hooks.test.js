import '../../setup.js';
import { jest } from '@jest/globals';

const mockApplyCombatStartAutoCover = jest.fn();
const mockApplyEncounterStartVisibility = jest.fn();
const mockClearCombat = jest.fn();
const mockScheduleTrackerVisibilityRefresh = jest.fn();
const mockHandleCombatantInitiativeUpdate = jest.fn();
const mockIsEnabled = jest.fn();
const mockIsInitiativeRelevantUpdate = jest.fn();
const mockRequestGMApplyEncounterStealthInitiative = jest.fn();

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
    isEnabled: (...args) => mockIsEnabled(...args),
    isInitiativeRelevantUpdate: (...args) => mockIsInitiativeRelevantUpdate(...args),
  },
}));

jest.mock('../../../scripts/services/socket.js', () => ({
  __esModule: true,
  requestGMApplyEncounterStealthInitiative: (...args) => mockRequestGMApplyEncounterStealthInitiative(...args),
}));

describe('combat start cover hook integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game.user.isGM = true;
    global.game.combat = null;
    mockIsEnabled.mockReturnValue(true);
    mockIsInitiativeRelevantUpdate.mockReturnValue(true);
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

  test('player initiative updates request GM stealth initiative handling over socket', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true };
    const combatant = { id: 'combatant-1', combat };
    const updateData = { initiative: 18 };

    global.game.user.isGM = false;
    registerCombatHooks();
    const updateCombatantCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'updateCombatant')[1];

    await updateCombatantCallback(combatant, updateData);

    expect(mockRequestGMApplyEncounterStealthInitiative).toHaveBeenCalledWith({
      combatId: 'combat-1',
      combatantId: 'combatant-1',
      updateData,
    });
    expect(mockHandleCombatantInitiativeUpdate).not.toHaveBeenCalled();
    expect(mockScheduleTrackerVisibilityRefresh).toHaveBeenCalledWith(combat);
  });

  test('GM initiative updates still apply stealth initiative handling locally', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true };
    const combatant = { id: 'combatant-1', combat };
    const updateData = { initiative: 18 };

    global.game.user.isGM = true;
    registerCombatHooks();
    const updateCombatantCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'updateCombatant')[1];

    await updateCombatantCallback(combatant, updateData);

    expect(mockHandleCombatantInitiativeUpdate).toHaveBeenCalledWith(combatant, updateData, combat);
    expect(mockRequestGMApplyEncounterStealthInitiative).not.toHaveBeenCalled();
  });

  test('player non-initiative combatant updates do not request GM stealth handling', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true };
    const combatant = { id: 'combatant-1', combat };

    mockIsInitiativeRelevantUpdate.mockReturnValue(false);
    global.game.user.isGM = false;
    registerCombatHooks();
    const updateCombatantCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'updateCombatant')[1];

    await updateCombatantCallback(combatant, { name: 'No Initiative Change' });

    expect(mockRequestGMApplyEncounterStealthInitiative).not.toHaveBeenCalled();
    expect(mockScheduleTrackerVisibilityRefresh).not.toHaveBeenCalled();
    expect(mockHandleCombatantInitiativeUpdate).not.toHaveBeenCalled();
  });
});
