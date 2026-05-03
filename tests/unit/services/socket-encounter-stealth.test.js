import '../../setup.js';
import { jest } from '@jest/globals';

const mockHandleCombatantInitiativeUpdate = jest.fn();

jest.mock('../../../scripts/services/EncounterStealthInitiativeService.js', () => ({
  __esModule: true,
  encounterStealthInitiativeService: {
    handleCombatantInitiativeUpdate: (...args) => mockHandleCombatantInitiativeUpdate(...args),
  },
}));

describe('encounter stealth initiative socket handling', () => {
  let socket;

  beforeEach(() => {
    jest.clearAllMocks();
    socket = {
      register: jest.fn(),
      executeAsGM: jest.fn(),
      executeForEveryone: jest.fn(),
    };
    global.socketlib.registerModule.mockReturnValue(socket);
    global.game.user.isGM = true;
    global.game.userId = 'player-user';
    global.game.combat = null;
    global.game.combats = new Map();
  });

  test('registers a GM handler and sends player requests over the encounter stealth initiative channel', async () => {
    const {
      ENCOUNTER_STEALTH_INITIATIVE_CHANNEL,
      registerSocket,
      requestGMApplyEncounterStealthInitiative,
    } = await import('../../../scripts/services/socket.js');

    registerSocket();
    requestGMApplyEncounterStealthInitiative({
      combatId: 'combat-1',
      combatantId: 'combatant-1',
      updateData: { initiative: 21 },
    });

    expect(socket.register).toHaveBeenCalledWith(
      ENCOUNTER_STEALTH_INITIATIVE_CHANNEL,
      expect.any(Function),
    );
    expect(socket.executeAsGM).toHaveBeenCalledWith(ENCOUNTER_STEALTH_INITIATIVE_CHANNEL, {
      combatId: 'combat-1',
      combatantId: 'combatant-1',
      updateData: { initiative: 21 },
      userId: 'player-user',
    });
  });

  test('GM socket handler resolves combatant and applies stealth initiative visibility', async () => {
    const { ENCOUNTER_STEALTH_INITIATIVE_CHANNEL, registerSocket } = await import('../../../scripts/services/socket.js');
    const combatant = { id: 'combatant-1' };
    const combat = {
      id: 'combat-1',
      combatants: new Map([['combatant-1', combatant]]),
    };

    global.game.combats.set('combat-1', combat);
    registerSocket();
    const handler = socket.register.mock.calls.find(([channel]) => channel === ENCOUNTER_STEALTH_INITIATIVE_CHANNEL)[1];

    await handler({
      combatId: 'combat-1',
      combatantId: 'combatant-1',
      updateData: { initiative: 21 },
    });

    expect(mockHandleCombatantInitiativeUpdate).toHaveBeenCalledWith(
      combatant,
      { initiative: 21 },
      combat,
    );
  });
});
