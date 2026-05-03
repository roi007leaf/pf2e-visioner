import '../../setup.js';
import { jest } from '@jest/globals';

const mockDetectCoverBetweenTokens = jest.fn();
const mockSetCoverBetween = jest.fn();

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  __esModule: true,
  default: {
    detectCoverBetweenTokens: (...args) => mockDetectCoverBetweenTokens(...args),
    setCoverBetween: (...args) => mockSetCoverBetween(...args),
  },
}));

function makeToken(
  id,
  {
    alliance = 'party',
    disposition = 1,
    type = 'character',
  } = {},
) {
  const actor = {
    id: `${id}-actor`,
    alliance,
    type,
    itemTypes: { effect: [] },
  };
  const flags = { 'pf2e-visioner': {} };
  const document = {
    id,
    actor,
    disposition,
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
  };
  return { id, actor, document };
}

function makeCombatant(id, token, initiativeStatistic = 'perception') {
  return {
    id,
    tokenId: token.id,
    token: token.document,
    actor: token.actor,
    flags: {
      pf2e: {
        initiativeStatistic,
      },
    },
  };
}

function makeCombat(combatants, { id = 'combat-cover', started = true } = {}) {
  const collection = combatants;
  collection.size = combatants.length;
  return {
    id,
    started,
    combatants: collection,
    turns: combatants,
  };
}

function setCombatStartCoverSetting(enabled) {
  global.game.settings.set('pf2e-visioner', 'computeCoverAtCombatStart', enabled);
}

async function importService() {
  return import('../../../scripts/services/CombatStartCoverService.js');
}

describe('CombatStartCoverService', () => {
  let party;
  let ally;
  let enemy;
  let tokensById;

  beforeEach(() => {
    jest.clearAllMocks();
    setCombatStartCoverSetting(false);
    global.game.user.isGM = true;

    party = makeToken('party', { alliance: 'party', disposition: 1 });
    ally = makeToken('ally', { alliance: 'party', disposition: 1 });
    enemy = makeToken('enemy', { alliance: 'opposition', disposition: -1 });
    tokensById = new Map([party, ally, enemy].map((token) => [token.id, token]));
    global.canvas.tokens.get = jest.fn((id) => tokensById.get(id));

    mockDetectCoverBetweenTokens.mockImplementation((observer, target) => {
      if (observer.id === 'party' && target.id === 'enemy') return 'standard';
      if (observer.id === 'enemy' && target.id === 'party') return 'lesser';
      return 'none';
    });
    mockSetCoverBetween.mockResolvedValue(true);
  });

  test('does nothing when combat-start cover setting is disabled', async () => {
    const { combatStartCoverService } = await importService();
    const combat = makeCombat([
      makeCombatant('party', party),
      makeCombatant('enemy', enemy),
    ]);

    await combatStartCoverService.applyCombatStartAutoCover(combat);

    expect(mockDetectCoverBetweenTokens).not.toHaveBeenCalled();
    expect(mockSetCoverBetween).not.toHaveBeenCalled();
  });

  test('computes cover for all non-allied combatant pairs regardless of initiative statistic', async () => {
    setCombatStartCoverSetting(true);
    const { combatStartCoverService } = await importService();
    const combat = makeCombat([
      makeCombatant('party', party, 'perception'),
      makeCombatant('ally', ally, 'perception'),
      makeCombatant('enemy', enemy, 'perception'),
    ]);

    await combatStartCoverService.applyCombatStartAutoCover(combat);

    expect(mockDetectCoverBetweenTokens).toHaveBeenCalledTimes(4);
    expect(mockSetCoverBetween).toHaveBeenCalledWith(party, enemy, 'standard', {
      skipEphemeralUpdate: false,
    });
    expect(mockSetCoverBetween).toHaveBeenCalledWith(enemy, party, 'lesser', {
      skipEphemeralUpdate: false,
    });
    expect(mockSetCoverBetween).toHaveBeenCalledWith(ally, enemy, 'none', {
      skipEphemeralUpdate: false,
    });
    expect(mockSetCoverBetween).toHaveBeenCalledWith(enemy, ally, 'none', {
      skipEphemeralUpdate: false,
    });
    expect(mockDetectCoverBetweenTokens).not.toHaveBeenCalledWith(party, ally, expect.anything());
    expect(mockDetectCoverBetweenTokens).not.toHaveBeenCalledWith(ally, party, expect.anything());
  });
});
