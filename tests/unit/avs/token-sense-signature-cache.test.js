import {
  buildPreparedSensesSignature,
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

function preparedSense(type, { acuity = 'imprecise', range = 60 } = {}) {
  const sense = { key: type };
  Object.defineProperty(sense, 'value', {
    configurable: true,
    enumerable: false,
    value: { type, acuity, range, source: null },
  });
  Object.defineProperty(sense, 'source', {
    configurable: true,
    enumerable: false,
    value: { type, acuity, range, source: null },
  });
  return sense;
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

  test('invalidates cached entry when prepared sense acuity or range changes', () => {
    const cache = new TokenSenseSignatureCache();
    const observer = token('observer', {
      perception: {
        senses: [{ type: 'tremorsense', acuity: 'precise', range: 60 }],
      },
    });
    const firstEntry = cache.getEntry(observer);

    observer.actor.perception.senses[0].acuity = 'imprecise';
    const impreciseEntry = cache.getEntry(observer);
    expect(impreciseEntry).not.toBe(firstEntry);

    observer.actor.perception.senses[0].range = 30;
    expect(cache.getEntry(observer)).not.toBe(impreciseEntry);
  });

  test('invalidates cached entry when PF2e prepared Sense.value acuity or range changes', () => {
    const cache = new TokenSenseSignatureCache();
    const tremorsense = preparedSense('tremorsense', { acuity: 'precise', range: 60 });
    const observer = token('observer', {
      perception: {
        senses: new Map([['tremorsense', tremorsense]]),
      },
    });
    const firstEntry = cache.getEntry(observer);

    tremorsense.value.acuity = 'imprecise';
    const impreciseEntry = cache.getEntry(observer);
    expect(impreciseEntry).not.toBe(firstEntry);

    tremorsense.value.range = 30;
    expect(cache.getEntry(observer)).not.toBe(impreciseEntry);
  });

  test('builds prepared sense signatures from PF2e Sense.value data', () => {
    const tremorsense = preparedSense('tremorsense', { acuity: 'precise', range: 60 });

    expect(buildPreparedSensesSignature({ perception: { senses: new Map([['tremorsense', tremorsense]]) } }))
      .toContain('"acuity":"precise"');

    tremorsense.value.acuity = 'imprecise';
    tremorsense.value.range = 30;

    expect(buildPreparedSensesSignature({ perception: { senses: new Map([['tremorsense', tremorsense]]) } }))
      .toContain('"range":30');
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
