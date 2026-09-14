import '../../setup.js';
import { TimedOverrideManager as Timers } from '../../../scripts/services/TimedOverrideManager.js';

describe('timed override authority and combat end', () => {
  let users;
  beforeEach(() => { users = game.users; });
  afterEach(() => { game.users = users; });

  function target() {
    const token = createMockToken({ id: 'target', actor: createMockActor({ type: 'npc' }), flags: {
      'pf2e-visioner': {
        'avs-override-from-observer': { state: 'hidden', source: 'manual_action',
          timedOverride: { type: 'rounds', combatId: 'combat', roundsRemaining: 3 } },
        'avs-override-from-other': { state: 'hidden',
          timedOverride: { type: 'realtime', expiresAt: Date.now() + 60000 } },
      },
    } });
    canvas.tokens.placeables = [token];
    return token;
  }

  test('ending the associated encounter removes only its timer, preserving the override', async () => {
    const token = target();
    await Timers.handleCombatEnd({ id: 'unrelated-combat' });
    expect(Timers.hasActiveTimer('observer', 'target')).toBe(true);
    await Timers.handleCombatEnd({ id: 'combat' });
    expect(Timers.hasActiveTimer('observer', 'target')).toBe(false);
    expect(token.document.getFlag('pf2e-visioner', 'avs-override-from-observer')).toMatchObject({
      state: 'hidden', source: 'manual_action', timedOverride: null,
    });
    expect(Timers.hasActiveTimer('other', 'target')).toBe(true);
  });

  test('secondary GM does not decrement, expire or convert another GM timer', async () => {
    const token = target();
    game.users = { activeGM: { id: 'another-gm' } };
    const initial = JSON.parse(JSON.stringify(token.document.flags));
    await Timers.processRoundExpirations({ id: 'combat', combatant: { actorId: 'actor' } }, { turn: 1 });
    await Timers.processRealtimeExpirations();
    await Timers.handleCombatEnd({ id: 'combat' });
    expect(token.document.flags).toEqual(initial);
  });
});
