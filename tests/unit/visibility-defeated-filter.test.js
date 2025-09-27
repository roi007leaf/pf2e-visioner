import '../setup.js';

// We import the system indirectly via the global registration path. Direct import path:
import { isDefeatedOrUnconscious } from '../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js';

// Since #isExcludedToken is private, we test behavior through a minimal scenario invoking enable() then checking which tokens are marked changed.
// We'll create a lightweight proxy to call the private method via function name mangling (not ideal but acceptable in test scope) if runtime allows.

describe('Visibility System defeated/unconscious token exclusion', () => {
  beforeEach(() => {
    // Fresh mock tokens
    const alive = createToken('alive', { hp: 10 });
    const dead = createToken('dead', { hp: 0 });
    const unconscious = createToken('unconscious', { hp: -5, conditions: [{ slug: 'unconscious' }] });

    global.canvas.tokens.placeables = [alive, dead, unconscious];

    // Simple user+GM gating
    global.game.user = { isGM: true };

    // Lazy-load system instance if module placed it somewhere; otherwise new up from class on globalThis
  });

  function createToken(id, { hp = 10, conditions = [] } = {}) {
    return {
      id,
      document: { id, hidden: false, getFlag: () => false },
      center: { x: 0, y: 0 },
      actor: {
        id: `actor-${id}`,
        hitPoints: { value: hp },
        system: { attributes: { hp: { value: hp, max: 10 } } },
        itemTypes: { condition: conditions },
        conditions,
      },
    };
  }

  test('isDefeatedOrUnconscious helper detects states', () => {
    const alive = canvas.tokens.placeables.find(t => t.id === 'alive');
    const dead = canvas.tokens.placeables.find(t => t.id === 'dead');
    const unconscious = canvas.tokens.placeables.find(t => t.id === 'unconscious');

    expect(isDefeatedOrUnconscious(alive)).toBe(false);
    expect(isDefeatedOrUnconscious(dead)).toBe(true);
    expect(isDefeatedOrUnconscious(unconscious)).toBe(true);
  });
});
