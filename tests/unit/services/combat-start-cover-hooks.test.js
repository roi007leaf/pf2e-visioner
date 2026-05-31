import '../../setup.js';
import { jest } from '@jest/globals';

const mockApplyCombatStartAutoCover = jest.fn();
const mockApplyEncounterStartVisibility = jest.fn();
const mockClearCombat = jest.fn();
const mockScheduleTrackerVisibilityRefresh = jest.fn();
const mockApplyTrackerVisibility = jest.fn();
const mockHandleCombatantInitiativeUpdate = jest.fn();
const mockIsEnabled = jest.fn();
const mockIsInitiativeRelevantUpdate = jest.fn();

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
    applyTrackerVisibility: (...args) => mockApplyTrackerVisibility(...args),
    handleCombatantInitiativeUpdate: (...args) => mockHandleCombatantInitiativeUpdate(...args),
    isEnabled: (...args) => mockIsEnabled(...args),
    isInitiativeRelevantUpdate: (...args) => mockIsInitiativeRelevantUpdate(...args),
  },
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

  test('player initiative updates refresh tracker visibility without GM stealth recalculation', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true };
    const combatant = { id: 'combatant-1', combat };
    const updateData = { initiative: 18 };

    global.game.user.isGM = false;
    registerCombatHooks();
    const updateCombatantCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'updateCombatant')[1];

    await updateCombatantCallback(combatant, updateData);

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
  });

  test('player non-initiative combatant updates do not refresh stealth tracker handling', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true };
    const combatant = { id: 'combatant-1', combat };

    mockIsInitiativeRelevantUpdate.mockReturnValue(false);
    global.game.user.isGM = false;
    registerCombatHooks();
    const updateCombatantCallback = global.Hooks.on.mock.calls.find(([event]) => event === 'updateCombatant')[1];

    await updateCombatantCallback(combatant, { name: 'No Initiative Change' });

    expect(mockScheduleTrackerVisibilityRefresh).not.toHaveBeenCalled();
    expect(mockHandleCombatantInitiativeUpdate).not.toHaveBeenCalled();
  });

  test('combat tracker render applies visibility once without delayed refresh burst', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = { id: 'combat-1', started: true, combatants: [] };

    registerCombatHooks();
    const renderCombatTrackerCallback = global.Hooks.on.mock.calls.find(
      ([event]) => event === 'renderCombatTracker',
    )[1];

    renderCombatTrackerCallback({ viewed: combat });

    expect(mockApplyTrackerVisibility).toHaveBeenCalledWith(combat);
    expect(mockScheduleTrackerVisibilityRefresh).not.toHaveBeenCalled();
  });

  test('visibility map updates ignore pairs outside active combat', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    global.game.combat = {
      id: 'combat-1',
      started: true,
      combatants: new Map([
        ['combatant-1', { id: 'combatant-1', tokenId: 'combat-token' }],
      ]),
    };

    registerCombatHooks();
    const visibilityMapCallback = global.Hooks.on.mock.calls.find(
      ([event]) => event === 'pf2e-visioner.visibilityMapUpdated',
    )[1];

    visibilityMapCallback({ observerId: 'observer-outside', targetId: 'target-outside' });

    expect(mockScheduleTrackerVisibilityRefresh).not.toHaveBeenCalled();
  });

  test('visibility map updates refresh tracker when pair touches active combat', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');
    const combat = {
      id: 'combat-1',
      started: true,
      combatants: new Map([
        ['combatant-1', { id: 'combatant-1', tokenId: 'combat-token' }],
      ]),
    };
    global.game.combat = combat;

    registerCombatHooks();
    const visibilityMapCallback = global.Hooks.on.mock.calls.find(
      ([event]) => event === 'pf2e-visioner.visibilityMapUpdated',
    )[1];

    visibilityMapCallback({ observerId: 'observer-outside', targetId: 'combat-token' });

    expect(mockScheduleTrackerVisibilityRefresh).toHaveBeenCalledWith(combat);
  });
});
