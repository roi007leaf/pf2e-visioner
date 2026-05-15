import '../../setup.js';

import { batchUpdateVisibilityEffects } from '../../../scripts/visibility/batch.js';

const makeActor = (id, signature, effects = []) => ({
  id,
  type: 'character',
  signature,
  itemTypes: { effect: effects },
  items: {
    get: jest.fn((itemId) => effects.find((effect) => effect.id === itemId) ?? null),
  },
  createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
  updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
  deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
});

const makeToken = (id, name, actor, flags = {}) => ({
  id,
  name,
  actor,
  document: {
    id,
    name,
    flags,
    getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key] ?? null),
  },
});

describe('batchUpdateVisibilityEffects', () => {
  test('removes legacy off-guard effects when pair becomes observed', async () => {
    const observerLegacy = {
      id: 'legacy-on-observer',
      flags: {
        'pf2e-visioner': {
          isEphemeralOffGuard: true,
          hiddenActorSignature: 'target-sig',
        },
      },
    };
    const targetLegacy = {
      id: 'legacy-on-target',
      flags: {
        'pf2e-visioner': {
          isEphemeralOffGuard: true,
          hiddenActorSignature: 'observer-sig',
        },
      },
    };
    const observerActor = makeActor('observer-actor', 'observer-sig', [observerLegacy]);
    const targetActor = makeActor('target-actor', 'target-sig', [targetLegacy]);
    const observer = makeToken('observer', 'Observer', observerActor);
    const target = makeToken('target', 'Target', targetActor);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);

    expect(observerActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      'legacy-on-observer',
    ]);
    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['legacy-on-target']);
  });

  test('keeps legacy off-guard effects when pair remains hidden', async () => {
    const targetLegacy = {
      id: 'legacy-on-target',
      flags: {
        'pf2e-visioner': {
          isEphemeralOffGuard: true,
          hiddenActorSignature: 'observer-sig',
        },
      },
    };
    const observerActor = makeActor('observer-actor', 'observer-sig', []);
    const targetActor = makeActor('target-actor', 'target-sig', [targetLegacy]);
    const observer = makeToken('observer', 'Observer', observerActor);
    const target = makeToken('target', 'Target', targetActor);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);

    expect(targetActor.deleteEmbeddedDocuments).not.toHaveBeenCalledWith('Item', [
      'legacy-on-target',
    ]);
  });

  test('does not create hidden off-guard aggregate when observer suppresses hidden off-guard', async () => {
    const observerActor = makeActor('observer-actor', 'observer-sig', []);
    const targetActor = makeActor('target-actor', 'target-sig', []);
    const observer = makeToken('observer', 'Ranger', observerActor, {
      'pf2e-visioner': {
        offGuardSuppression: {
          'blind-fight-offguard': {
            id: 'blind-fight-offguard',
            suppressedStates: ['hidden'],
          },
        },
      },
    });
    const target = makeToken('target', 'Hidden Enemy', targetActor);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);

    expect(targetActor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('removes existing hidden aggregate when observer suppresses hidden off-guard', async () => {
    const existingHiddenAggregate = {
      id: 'hidden-aggregate',
      flags: {
        'pf2e-visioner': {
          aggregateOffGuard: true,
          visibilityState: 'hidden',
          effectTarget: 'subject',
        },
      },
      system: {
        rules: [
          {
            key: 'EphemeralEffect',
            predicate: ['target:signature:observer-sig'],
          },
        ],
      },
    };
    const observerActor = makeActor('observer-actor', 'observer-sig', []);
    const targetActor = makeActor('target-actor', 'target-sig', [existingHiddenAggregate]);
    const observer = makeToken('observer', 'Ranger', observerActor, {
      'pf2e-visioner': {
        offGuardSuppression: {
          'blind-fight-offguard': {
            id: 'blind-fight-offguard',
            suppressedStates: ['hidden'],
          },
        },
      },
    });
    const target = makeToken('target', 'Hidden Enemy', targetActor);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);

    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['hidden-aggregate']);
  });
});
