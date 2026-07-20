import '../../setup.js';

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

jest.mock('../../../scripts/chat/services/infra/DeferredSeekManager.js', () => ({
  __esModule: true,
  default: { clearAll: jest.fn().mockResolvedValue(undefined) },
}));

const MODULE_ID = 'pf2e-visioner';

function makeCombatToken(id, flags, effects = []) {
  return {
    id,
    actor: {
      itemTypes: { effect: effects },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    },
    document: {
      id,
      name: id,
      flags: { [MODULE_ID]: flags },
      unsetFlag: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('combat-only AVS end cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
    game.settings.set(MODULE_ID, 'avsOnlyInCombat', true);
    canvas.scene = {
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };
    canvas.perception = {
      update: jest.fn().mockResolvedValue(undefined),
    };
  });

  test('clears combat-only AVS state without rendering an intermediate token frame', async () => {
    const offGuardEffect = {
      id: 'off-guard',
      flags: { [MODULE_ID]: { isEphemeralOffGuard: true } },
    };
    const first = makeCombatToken(
      'first',
      { visibilityV2: { target: { detectionState: 'hidden' } }, detection: { target: 'hidden' } },
      [offGuardEffect],
    );
    const second = makeCombatToken('second', { detection: { first: 'observed' } });
    const tokens = new Map([[first.id, first], [second.id, second]]);
    canvas.tokens.get = jest.fn((id) => tokens.get(id));

    const combat = {
      combatants: [{ tokenId: first.id }, { tokenId: second.id }],
    };
    const { handleCombatEnd } = await import('../../../scripts/hooks/combat.js');

    await handleCombatEnd(combat);

    expect(first.document.unsetFlag).not.toHaveBeenCalled();
    expect(second.document.unsetFlag).not.toHaveBeenCalled();
    expect(first.actor.deleteEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      ['off-guard'],
      { render: false },
    );
    expect(canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        {
          _id: 'first',
          [`flags.${MODULE_ID}.-=visibilityV2`]: null,
          [`flags.${MODULE_ID}.-=detection`]: null,
        },
        {
          _id: 'second',
          [`flags.${MODULE_ID}.-=detection`]: null,
        },
      ],
      { diff: false, render: false, animate: false },
    );
    expect(canvas.perception.update).toHaveBeenCalledTimes(1);
    expect(canvas.perception.update).toHaveBeenCalledWith({
      initializeVision: true,
      refreshLighting: true,
      refreshVision: true,
    });
  });
});
