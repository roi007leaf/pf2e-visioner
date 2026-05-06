import '../../setup.js';
import { jest } from '@jest/globals';

const mockSetVisibilityBetween = jest.fn();
const mockGetVisibilityBetween = jest.fn();
const mockGetCoverBetween = jest.fn();
const mockSetPairOverrides = jest.fn();

jest.mock('../../../scripts/stores/cover-map.js', () => ({
  __esModule: true,
  getCoverBetween: (...args) => mockGetCoverBetween(...args),
}));

jest.mock('../../../scripts/stores/visibility-map.js', () => ({
  __esModule: true,
  getVisibilityBetween: (...args) => mockGetVisibilityBetween(...args),
  setVisibilityBetween: (...args) => mockSetVisibilityBetween(...args),
}));

jest.mock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
  __esModule: true,
  default: {
    setPairOverrides: (...args) => mockSetPairOverrides(...args),
  },
}));

function makeToken(
  id,
  {
    name = id,
    isOwner = false,
    alliance = 'party',
    disposition = 1,
    ownerUserIds = [],
    perceptionDC = 15,
  } = {},
) {
  const actor = {
    id: `${id}-actor`,
    type: 'character',
    isOwner,
    alliance,
    system: { perception: { dc: perceptionDC } },
    getStatistic: jest.fn((slug) => (slug === 'perception' ? { dc: { value: perceptionDC } } : null)),
    testUserPermission: jest.fn((user, permission) => (
      permission === 'OWNER' && ownerUserIds.includes(user?.id)
    )),
    ownership: Object.fromEntries(ownerUserIds.map((userId) => [userId, 3])),
  };
  const flags = { 'pf2e-visioner': {} };
  const document = {
    id,
    name,
    actor,
    disposition,
    hidden: false,
    flags,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key]),
    setFlag: jest.fn((moduleId, key, value) => {
      if (!flags[moduleId]) flags[moduleId] = {};
      flags[moduleId][key] = value;
      return Promise.resolve(value);
    }),
    unsetFlag: jest.fn((moduleId, key) => {
      delete flags[moduleId]?.[key];
      return Promise.resolve(true);
    }),
    update: jest.fn((changes) => {
      Object.assign(document, changes);
      return Promise.resolve(document);
    }),
  };
  return { id, name, actor, document, isOwner };
}

function makeCombatant(id, token, initiative, initiativeStatistic = 'perception', extra = {}) {
  return {
    id,
    tokenId: token.id,
    token: token.document,
    actor: token.actor,
    initiative,
    isOwner: !!token.isOwner,
    flags: {
      pf2e: {
        initiativeStatistic,
      },
    },
    ...extra,
  };
}

function makeCombat(combatants, { id = 'combat-1', started = true } = {}) {
  const collection = combatants;
  const nativeFind = Array.prototype.find.bind(combatants);
  const nativeSome = Array.prototype.some.bind(combatants);
  collection.size = combatants.length;
  collection.get = (combatantId) => nativeFind((combatant) => combatant.id === combatantId);
  collection.some = (callback) => nativeSome(callback);
  collection.find = (callback) => nativeFind(callback);

  return {
    id,
    started,
    combatants: collection,
    turns: combatants,
  };
}

function setSetting(enabled) {
  global.game.settings.set('pf2e-visioner', 'enableStealthInitiativeVisibility', enabled);
}

async function importService() {
  return import('../../../scripts/services/EncounterStealthInitiativeService.js');
}

describe('EncounterStealthInitiativeService', () => {
  let observerLow;
  let observerEqual;
  let observerHigh;
  let perceptionRoller;
  let stealther;
  let tokensById;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    setSetting(false);
    global.game.user.isGM = true;
    global.game.users = [];

    observerLow = makeToken('observer-low', { alliance: 'party', disposition: 1 });
    observerEqual = makeToken('observer-equal', { alliance: 'party', disposition: 1 });
    observerHigh = makeToken('observer-high', { alliance: 'party', disposition: 1 });
    perceptionRoller = makeToken('perception-roller', { alliance: 'party', disposition: 1 });
    stealther = makeToken('stealther', { alliance: 'opposition', disposition: -1 });
    tokensById = new Map(
      [observerLow, observerEqual, observerHigh, perceptionRoller, stealther].map((token) => [
        token.id,
        token,
      ]),
    );
    global.canvas.tokens.get = jest.fn((id) => tokensById.get(id));
    global.canvas.tokens.placeables = Array.from(tokensById.values());
    global.canvas.tokens.controlled = [];

    mockSetVisibilityBetween.mockResolvedValue(true);
    mockSetPairOverrides.mockResolvedValue(true);
    mockGetVisibilityBetween.mockReturnValue('undetected');
    mockGetCoverBetween.mockReturnValue('none');
  });

  test('setting defaults to disabled for PF2e Avoid Notice compatibility', async () => {
    const { DEFAULT_SETTINGS } = await import('../../../scripts/constants.js');

    expect(DEFAULT_SETTINGS.enableStealthInitiativeVisibility).toMatchObject({
      scope: 'world',
      type: Boolean,
      default: false,
      restricted: true,
    });
    expect(DEFAULT_SETTINGS.computeCoverAtCombatStart).toMatchObject({
      scope: 'world',
      type: Boolean,
      default: false,
      restricted: true,
    });
  });

  test('does nothing when the feature setting is disabled', async () => {
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).not.toHaveBeenCalled();
  });

  test('stealth initiative state uses Perception DC and observer initiative', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 18;
    observerEqual.actor.system.perception.dc = 21;
    observerHigh.actor.system.perception.dc = 25;
    perceptionRoller.actor.system.perception.dc = 25;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('equal', observerEqual, 20),
      makeCombatant('high', observerHigh, 30),
      makeCombatant('perception', perceptionRoller, 40, 'perception'),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(4);
    expect(mockSetPairOverrides).toHaveBeenCalledWith(
      observerLow,
      expect.any(Map),
      expect.objectContaining({
        source: 'encounter_stealth_initiative',
      }),
    );
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'unnoticed',
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      hasConcealment: false,
      coverState: 'none',
    });
    const equalChangesByTarget = mockSetPairOverrides.mock.calls.find(([observer]) => observer === observerEqual)[1];
    expect(equalChangesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'observed',
      detectionState: 'observed',
      awarenessState: 'noticed',
    });
    const highChangesByTarget = mockSetPairOverrides.mock.calls.find(([observer]) => observer === observerHigh)[1];
    expect(highChangesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'observed',
    });
    const perceptionChangesByTarget = mockSetPairOverrides.mock.calls.find(([observer]) => observer === perceptionRoller)[1];
    expect(perceptionChangesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'observed',
    });
  });

  test('writes unnoticed as encounter awareness metadata over undetected detection', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 18;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'unnoticed',
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      hasConcealment: false,
      coverState: 'none',
      detectionSense: null,
    });
  });

  test('writes undetected without unnoticed awareness when observer initiative is equal or higher', async () => {
    setSetting(true);
    observerEqual.actor.system.perception.dc = 20;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('equal', observerEqual, 20),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'noticed',
      hasConcealment: false,
      coverState: 'none',
      detectionSense: null,
    });
  });

  test('failed Perception DC by 10 or less creates observed without cover or concealment', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 31;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 30, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'observed',
    });
  });

  test('failed Perception DC by 10 or less creates hidden with standard or greater cover', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 31;
    mockGetCoverBetween.mockReturnValue('standard');
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 30, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'hidden',
      detectionState: 'hidden',
      awarenessState: 'noticed',
      hasCover: true,
      hasConcealment: false,
      coverState: 'standard',
    });
  });

  test('failed Perception DC by 10 or less creates hidden when the stealther is concealed', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 31;
    mockGetVisibilityBetween.mockReturnValue('concealed');
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 30, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'hidden',
      detectionState: 'hidden',
      awarenessState: 'noticed',
      hasConcealment: true,
      coverState: 'none',
    });
  });

  test('failed Perception DC by more than 10 creates observed when observer initiative is not beaten', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 31;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 30),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'observed',
    });
  });

  test('missing stealth initiative or Perception DC falls back to observed even with cover', async () => {
    setSetting(true);
    mockGetCoverBetween.mockReturnValue('standard');
    const { encounterStealthInitiativeService } = await importService();
    const observerCombatant = makeCombatant('low', observerLow, 10);
    const stealthCombatant = makeCombatant('stealth', stealther, null, 'stealth');

    expect(
      encounterStealthInitiativeService._getStealthInitiativeState(
        stealthCombatant,
        observerCombatant,
        observerLow,
        stealther,
      ),
    ).toBe('observed');

    stealther.initiative = 20;
    observerLow.actor.system.perception.dc = null;
    observerLow.actor.getStatistic.mockReturnValue(null);

    expect(
      encounterStealthInitiativeService._getStealthInitiativeState(
        makeCombatant('stealth', stealther, 20, 'stealth'),
        observerCombatant,
        observerLow,
        stealther,
      ),
    ).toBe('observed');
  });

  test('combat start uses the latest edited initiative value to determine encounter stealth state', async () => {
    setSetting(true);
    observerLow.actor.system.perception.dc = 18;
    const { encounterStealthInitiativeService } = await importService();
    const stealtherCombatant = makeCombatant('stealth', stealther, 10, 'stealth');
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      stealtherCombatant,
    ]);

    stealtherCombatant.initiative = 20;
    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat, {
      requireStarted: false,
    });

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'unnoticed',
    });
  });

  test('combat start unhides GM-hidden stealth combatants before applying encounter stealth overrides', async () => {
    setSetting(true);
    stealther.document.hidden = true;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(stealther.document.update).toHaveBeenCalledWith({ hidden: false });
    expect(stealther.document.hidden).toBe(false);
    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'unnoticed',
    });
  });

  test('undetected without unnoticed is visible in the player tracker', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    observerLow.actor.system.perception.dc = 31;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'undetected',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 30, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'undetected-not-unnoticed-visible',
    });

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('active tracker hiding keys off encounter unnoticed awareness metadata', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 30, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'metadata-unnoticed-hides-tracker',
    });

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(true);
  });

  test('masks undetected stealth initiative combatant details until the encounter override is removed', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    observerLow.actor.system.perception.dc = 31;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'undetected',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 30, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'undetected-details-masked',
    });
    document.body.innerHTML = `
      <ol id="combat-tracker">
        <li class="combatant" data-combatant-id="stealth">
          <img class="token-image" src="kobold.webp" alt="Kobold Warrior">
          <div class="token-name"><h4>Kobold Warrior</h4></div>
          <div class="token-initiative">30</div>
        </li>
      </ol>
    `;

    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const row = document.querySelector('[data-combatant-id="stealth"]');
    const name = row.querySelector('.token-name h4');
    expect(row.hidden).toBe(false);
    expect(row.dataset.pf2eVisionerStealthMasked).toBe('true');
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-masked')).toBe(true);
    expect(name.textContent).toBe('Undetected Combatant');
    expect(name.dataset.pf2eVisionerOriginalHtml).toBe('Kobold Warrior');

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    expect(row.dataset.pf2eVisionerStealthMasked).toBeUndefined();
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-masked')).toBe(false);
    expect(name.textContent).toBe('Kobold Warrior');
    expect(name.dataset.pf2eVisionerOriginalHtml).toBeUndefined();
  });

  test('metadata-shaped undetected unnoticed is hidden rather than masked', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 30, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'metadata-unnoticed-hidden-not-masked',
    });

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(true);
    expect(encounterStealthInitiativeService.shouldMaskCombatantDetailsFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('mixed owned unnoticed and noticed undetected observers show masked tracker details', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    observerEqual.isOwner = true;
    observerEqual.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerEqual.id}`] = {
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'noticed',
      source: 'encounter_stealth_initiative',
      observerId: observerEqual.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const equalCombatant = makeCombatant('equal', observerEqual, 20, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 30, 'stealth');
    const combat = makeCombat([lowCombatant, equalCombatant, stealthCombatant], {
      id: 'mixed-owned-unnoticed-undetected-mask',
    });
    document.body.innerHTML = `
      <ol id="combat-tracker">
        <li class="combatant" data-combatant-id="stealth">
          <div class="token-name"><h4>Kobold Warrior</h4></div>
        </li>
      </ol>
    `;

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
    expect(encounterStealthInitiativeService.shouldMaskCombatantDetailsFromCurrentUser(stealthCombatant, combat)).toBe(true);

    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const row = document.querySelector('[data-combatant-id="stealth"]');
    expect(row.hidden).toBe(false);
    expect(row.dataset.pf2eVisionerStealthMasked).toBe('true');
    expect(row.querySelector('.token-name h4').textContent).toBe('Undetected Combatant');
  });

  test('restores a pre-existing AVS override when the encounter stealth override is removed', async () => {
    setSetting(true);
    global.game.user.isGM = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'hidden',
      source: 'manual_action',
      observerId: observerLow.id,
      targetId: stealther.id,
      hasCover: true,
      hasConcealment: false,
      expectedCover: 'standard',
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10);
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'restore-previous-override',
    });

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(stealther.document.getFlag(
      'pf2e-visioner',
      `encounter-stealth-previous-from-${observerLow.id}`,
    )).toMatchObject({
      state: 'hidden',
      source: 'manual_action',
      observerId: observerLow.id,
      targetId: stealther.id,
    });

    mockSetPairOverrides.mockClear();
    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];

    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledWith(
      observerLow,
      expect.any(Map),
      expect.objectContaining({ source: 'manual_action' }),
    );
    const restoredChanges = mockSetPairOverrides.mock.calls[0][1];
    expect(restoredChanges.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'hidden',
      hasCover: true,
      hasConcealment: false,
      expectedCover: 'standard',
    });
    expect(stealther.document.getFlag(
      'pf2e-visioner',
      `encounter-stealth-previous-from-${observerLow.id}`,
    )).toBeUndefined();
  });

  test('meeting Perception DC with tied initiative makes the stealther undetected', async () => {
    setSetting(true);
    observerEqual.actor.system.perception.dc = 20;
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('equal', observerEqual, 20),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).toHaveBeenCalledWith(
      observerEqual,
      expect.any(Map),
      expect.objectContaining({
        source: 'encounter_stealth_initiative',
      }),
    );
    const changesByTarget = mockSetPairOverrides.mock.calls[0][1];
    expect(changesByTarget.get(stealther.id)).toMatchObject({
      target: stealther,
      state: 'undetected',
      detectionState: 'undetected',
      awarenessState: 'noticed',
    });
  });

  test('does not create initial stealth overrides between allies', async () => {
    setSetting(true);
    const allyStealther = makeToken('ally-stealther', { alliance: 'party', disposition: 1 });
    tokensById.set(allyStealther.id, allyStealther);
    global.canvas.tokens.placeables = Array.from(tokensById.values());
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('ally-stealth', allyStealther, 20, 'stealth'),
    ]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(mockSetPairOverrides).not.toHaveBeenCalled();
  });

  test('tracker visibility ignores owned same-side allies of the stealther', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    const stealtherAllyObserver = makeToken('stealther-ally-observer', {
      alliance: 'opposition',
      disposition: -1,
      isOwner: true,
    });
    tokensById.set(stealtherAllyObserver.id, stealtherAllyObserver);
    global.canvas.tokens.placeables = Array.from(tokensById.values());
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const alliedCombatant = makeCombatant('allied-low', observerLow, 10, 'perception', {
      isOwner: true,
    });
    const stealtherAllyCombatant = makeCombatant(
      'stealther-ally-high',
      stealtherAllyObserver,
      30,
      'perception',
      { isOwner: true },
    );
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');

    expect(
      encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(
        stealthCombatant,
        makeCombat([stealtherAllyCombatant, stealthCombatant], {
          id: 'stealther-ally-only-perspective',
        }),
      ),
    ).toBe(false);
    expect(
      encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(
        stealthCombatant,
        makeCombat([alliedCombatant, stealtherAllyCombatant, stealthCombatant], {
          id: 'enemy-and-stealther-ally-perspective',
        }),
      ),
    ).toBe(true);
  });

  test('owned token perspective is permissive for tracker visibility', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    observerHigh.isOwner = true;
    observerHigh.actor.isOwner = true;
    observerHigh.actor.system.perception.dc = 25;
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const highCombatant = makeCombatant('high', observerHigh, 25, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, highCombatant, stealthCombatant]);

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('hides and shows PF2e HUD tracker rows by combatant id', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], { id: 'hud-row-override-gated' });
    document.body.innerHTML = `
      <section id="pf2e-hud-tracker">
        <ol class="combatants">
          <li class="combatant" data-combatant-id="stealth"></li>
        </ol>
      </section>
    `;

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const row = document.querySelector('#pf2e-hud-tracker li.combatant[data-combatant-id="stealth"]');
    expect(row.hidden).toBe(true);
    expect(row.dataset.pf2eVisionerStealthHidden).toBe('true');
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-hidden')).toBe(true);

    mockGetVisibilityBetween.mockReturnValue('hidden');
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    expect(row.hidden).toBe(true);
    expect(row.dataset.pf2eVisionerStealthHidden).toBe('true');
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-hidden')).toBe(true);

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    expect(row.hidden).toBe(false);
    expect(row.dataset.pf2eVisionerStealthHidden).toBeUndefined();
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-hidden')).toBe(false);
  });

  test('keeps active stealther tracker row forcibly hidden until the initial override is removed', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], {
      id: 'active-stealther-stays-hidden',
    });
    document.body.innerHTML = `
      <ol id="combat-tracker">
        <li class="combatant active" data-combatant-id="stealth" style="display: flex;"></li>
      </ol>
    `;

    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const row = document.querySelector('[data-combatant-id="stealth"]');
    expect(row.hidden).toBe(true);
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-hidden')).toBe(true);
    expect(row.dataset.pf2eVisionerStealthHidden).toBe('true');

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    expect(row.hidden).toBe(false);
    expect(row.classList.contains('pf2e-visioner-stealth-tracker-hidden')).toBe(false);
    expect(row.dataset.pf2eVisionerStealthHidden).toBeUndefined();
  });

  test('initial tracker hiding is not recreated after later undetected states', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], { id: 'no-rehide-after-override-removal' });

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat);
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(true);

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    mockGetVisibilityBetween.mockReturnValue('hidden');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);

    mockGetVisibilityBetween.mockReturnValue('undetected');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('player tracker hiding can derive initial record from encounter AVS override flag', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], { id: 'player-client-combat' });

    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(true);

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    mockGetVisibilityBetween.mockReturnValue('hidden');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);

    mockGetVisibilityBetween.mockReturnValue('undetected');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('keeps tracker row hidden until the encounter AVS override is removed', async () => {
    setSetting(true);
    global.game.user.isGM = false;
    observerLow.isOwner = true;
    observerLow.actor.isOwner = true;
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: observerLow.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', observerLow, 10, 'perception', { isOwner: true });
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, stealthCombatant], { id: 'override-removal-gates-reveal' });

    mockGetVisibilityBetween.mockReturnValue('hidden');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(true);

    delete stealther.document.flags['pf2e-visioner'][`avs-override-from-${observerLow.id}`];
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);

    mockGetVisibilityBetween.mockReturnValue('undetected');
    expect(encounterStealthInitiativeService.shouldHideCombatantFromCurrentUser(stealthCombatant, combat)).toBe(false);
  });

  test('adds a neutral tracker marker for combatants who rolled Stealth initiative', async () => {
    setSetting(true);
    global.game.user.isGM = true;
    global.game.users = [
      { id: 'gm', name: 'GM', isGM: true, active: true },
      { id: 'low-user', name: 'Low Player', isGM: false, active: true, color: '#ff0000' },
      { id: 'high-user', name: 'High Player', isGM: false, active: true, color: '#00aaff' },
      { id: 'spectator', name: 'Spectator', isGM: false, active: true, color: '#aaaaaa' },
    ];
    const lowOwned = makeToken('low-owned', {
      alliance: 'party',
      disposition: 1,
      ownerUserIds: ['low-user'],
    });
    const highOwned = makeToken('high-owned', {
      alliance: 'party',
      disposition: 1,
      ownerUserIds: ['high-user'],
      perceptionDC: 25,
    });
    tokensById.set(lowOwned.id, lowOwned);
    tokensById.set(highOwned.id, highOwned);
    global.canvas.tokens.placeables = Array.from(tokensById.values());
    stealther.document.flags['pf2e-visioner'][`avs-override-from-${lowOwned.id}`] = {
      state: 'unnoticed',
      source: 'encounter_stealth_initiative',
      observerId: lowOwned.id,
      targetId: stealther.id,
    };
    const { encounterStealthInitiativeService } = await importService();
    const lowCombatant = makeCombatant('low', lowOwned, 10);
    const highCombatant = makeCombatant('high', highOwned, 25);
    const stealthCombatant = makeCombatant('stealth', stealther, 20, 'stealth');
    const combat = makeCombat([lowCombatant, highCombatant, stealthCombatant], {
      id: 'stealth-initiative-marker',
    });
    document.body.innerHTML = `
      <ol id="combat-tracker">
        <li class="combatant" data-combatant-id="low">
          <div class="token-name"><h4>Valeros</h4></div>
        </li>
        <li class="combatant" data-combatant-id="stealth">
          <div class="token-name">
            <h4>Kobold Warrior</h4>
          </div>
          <div class="token-initiative" data-combatant-id="stealth">23</div>
        </li>
      </ol>
    `;

    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const markers = Array.from(document.querySelectorAll('[data-pf2e-visioner-stealth-initiative-marker]'));
    expect(markers).toHaveLength(1);
    expect(markers[0].dataset.tooltip).toBe('PF2E_VISIONER.ENCOUNTER_STEALTH.STEALTH_INITIATIVE_TOOLTIP');
    expect(markers[0].getAttribute('aria-label')).toBe(
      'PF2E_VISIONER.ENCOUNTER_STEALTH.STEALTH_INITIATIVE_TOOLTIP',
    );
    expect(markers[0].querySelector('i')?.className).toContain('fa-user-secret');
    expect(document.querySelector('[data-combatant-id="low"] [data-pf2e-visioner-stealth-initiative-marker]')).toBeNull();
    expect(document.querySelector('.token-name h4 [data-pf2e-visioner-stealth-initiative-marker]')).toBeTruthy();
    expect(document.querySelector('.combatant > [data-pf2e-visioner-stealth-initiative-marker]')).toBeNull();
    expect(document.querySelector('.token-initiative [data-pf2e-visioner-stealth-initiative-marker]')).toBeNull();

    stealthCombatant.flags.pf2e.initiativeStatistic = 'perception';
    encounterStealthInitiativeService.applyTrackerVisibility(combat);

    const updatedMarkers = Array.from(document.querySelectorAll('[data-pf2e-visioner-stealth-initiative-marker]'));
    expect(updatedMarkers).toHaveLength(0);
  });

  test('combat hooks register tracker refresh integration points', async () => {
    const { registerCombatHooks } = await import('../../../scripts/hooks/combat.js');

    registerCombatHooks();

    expect(global.Hooks.on).toHaveBeenCalledWith('combatStart', expect.any(Function));
    expect(global.Hooks.on).toHaveBeenCalledWith('combatEnd', expect.any(Function));
    expect(global.Hooks.on).toHaveBeenCalledWith('updateCombatant', expect.any(Function));
    expect(global.Hooks.on).toHaveBeenCalledWith('renderCombatTracker', expect.any(Function));
    expect(global.Hooks.on).toHaveBeenCalledWith(
      'pf2e-visioner.visibilityMapUpdated',
      expect.any(Function),
    );
  });

  test('does not apply encounter stealth setup from initiative updates after combat has started', async () => {
    setSetting(true);
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat([
      makeCombatant('low', observerLow, 10),
      makeCombatant('stealth', stealther, 20, 'stealth'),
    ]);
    global.game.combat = combat;

    await encounterStealthInitiativeService.handleCombatantInitiativeUpdate(
      combat.combatants.get('stealth'),
      { initiative: 20, flags: { pf2e: { initiativeStatistic: 'stealth' } } },
      combat,
    );

    expect(mockSetPairOverrides).not.toHaveBeenCalled();
    expect(document.querySelector('[data-pf2e-visioner-stealth-initiative-marker]')).toBeNull();
  });

  test('combat-start setup can run from the start hook before the passed combat object is marked started', async () => {
    setSetting(true);
    const { encounterStealthInitiativeService } = await importService();
    const combat = makeCombat(
      [
        makeCombatant('low', observerLow, 10),
        makeCombatant('stealth', stealther, 20, 'stealth'),
      ],
      { id: 'combat-start-not-yet-flagged', started: false },
    );

    await encounterStealthInitiativeService.applyEncounterStartVisibility(combat, {
      requireStarted: false,
    });

    expect(mockSetPairOverrides).toHaveBeenCalledTimes(1);
    expect(mockSetPairOverrides).toHaveBeenCalledWith(
      observerLow,
      expect.any(Map),
      expect.objectContaining({
        source: 'encounter_stealth_initiative',
      }),
    );
  });
});
