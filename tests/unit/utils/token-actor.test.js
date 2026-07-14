import '../../setup.js';
import { isPartyActorToken } from '../../../scripts/utils/token-actor.js';

describe('isPartyActorToken', () => {
  let originalActors;

  beforeEach(() => {
    originalActors = global.game.actors;
  });

  afterEach(() => {
    global.game.actors = originalActors;
  });

  test('identifies literal Party actor token', () => {
    expect(isPartyActorToken({
      document: { id: 'party-token', actorId: 'party-actor' },
      actor: { id: 'party-actor', type: 'party' },
    })).toBe(true);
  });

  test.each(['character', 'familiar', 'npc', 'loot', 'hazard'])(
    'does not identify %s as Party actor token',
    (type) => expect(isPartyActorToken({ document: {}, actor: { type } })).toBe(false),
  );

  test('does not infer Party status from alliance', () => {
    expect(isPartyActorToken({
      document: {},
      actor: { type: 'character', alliance: 'party', hasPlayerOwner: true },
    })).toBe(false);
  });

  test('uses world actor lookup before reading a throwing document actor', () => {
    global.game.actors = { get: jest.fn(() => ({ type: 'party' })) };
    const document = { actorId: 'party-actor' };
    Object.defineProperty(document, 'actor', { get: () => { throw new Error('unavailable'); } });

    expect(isPartyActorToken(document)).toBe(true);
  });

  test('falls back to a safe document actor read', () => {
    const document = { actor: { type: 'party' } };

    expect(isPartyActorToken(document)).toBe(true);
  });

  test.each([null, undefined, {}, { document: {} }, { actor: null }])(
    'returns false for unresolved input %p',
    (token) => expect(isPartyActorToken(token)).toBe(false),
  );
});
