import {
  TokenSenseSignatureCache,
  buildTokenSensesCacheKey,
} from '../../../scripts/visibility/auto-visibility/core/TokenSenseSignatureCache.js';

function token(id, actor = {}) {
  return {
    document: { id, elevation: 0, width: 1, height: 1 },
    actor: {
      id: `${id}-actor`,
      type: 'character',
      itemTypes: {},
      conditions: [],
      system: {},
      ...actor,
    },
  };
}

describe('TokenSenseSignatureCache', () => {
  test('keeps public key stable and reuses unchanged token entries', () => {
    global.canvas.scene = { id: 'scene-cache' };
    const cache = new TokenSenseSignatureCache();
    const observer = token('observer', {
      system: { senses: [{ type: 'darkvision', range: 60 }] },
    });

    const firstEntry = cache.getEntry(observer);
    const secondEntry = cache.getEntry(observer);

    expect(secondEntry).toBe(firstEntry);
    expect(buildTokenSensesCacheKey([observer], cache)).toContain('darkvision');
  });

  test('invalidates cached entry when nested sense data changes', () => {
    const cache = new TokenSenseSignatureCache();
    const observer = token('observer', {
      system: { senses: [{ type: 'darkvision', range: 60 }] },
    });
    const firstEntry = cache.getEntry(observer);

    observer.actor.system.senses[0].range = 120;

    expect(cache.getEntry(observer)).not.toBe(firstEntry);
  });

  test('changes public key when active scene hearing range changes', () => {
    const cache = new TokenSenseSignatureCache();
    const observer = token('observer');
    const previousScene = global.canvas.scene;
    global.canvas.scene = {
      id: 'scene-cache',
      flags: { pf2e: { hearingRange: 20 } },
    };

    try {
      const firstKey = buildTokenSensesCacheKey([observer], cache);
      global.canvas.scene.flags.pf2e.hearingRange = 40;

      expect(buildTokenSensesCacheKey([observer], cache)).not.toBe(firstKey);
    } finally {
      global.canvas.scene = previousScene;
    }
  });
});
