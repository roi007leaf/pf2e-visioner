import '../../setup.js';

import { isPrimaryGM } from '../../../scripts/services/gm-election.js';

describe('isPrimaryGM', () => {
  const savedUser = global.game.user;
  const savedUsers = global.game.users;

  afterEach(() => {
    global.game.user = savedUser;
    global.game.users = savedUsers;
  });

  test('false for a non-GM user', () => {
    global.game.user = { id: 'p1', isGM: false };
    global.game.users = { activeGM: { id: 'p1' } };
    expect(isPrimaryGM()).toBe(false);
  });

  test('true for the only connected GM (no activeGM election available)', () => {
    global.game.user = { id: 'gm1', isGM: true };
    global.game.users = undefined;
    expect(isPrimaryGM()).toBe(true);
  });

  test('true when this GM is the elected activeGM', () => {
    global.game.user = { id: 'gm1', isGM: true };
    global.game.users = { activeGM: { id: 'gm1' } };
    expect(isPrimaryGM()).toBe(true);
  });

  test('false for a second connected GM who is not the elected activeGM', () => {
    global.game.user = { id: 'gm2', isGM: true };
    global.game.users = { activeGM: { id: 'gm1' } };
    expect(isPrimaryGM()).toBe(false);
  });
});
