import '../../setup.js';

import { batchUpdateVisibilityEffects, batchUpdateVisibilityEffectsForObservers } from '../../../scripts/visibility/batch.js';
import { createEphemeralEffectRule } from '../../../scripts/helpers/visibility-helpers.js';
import { BatchOrchestrator } from '../../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js';

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
  let originalGameUser;

  beforeEach(() => {
    originalGameUser = global.game.user;
    global.game.user = { isGM: true };
  });

  afterEach(() => {
    global.game.user = originalGameUser;
  });

  test('linked targets returning to the same aggregate rules cause no Item writes', async () => {
    const effect = {
      id: 'shared-hidden',
      flags: { 'pf2e-visioner': { aggregateOffGuard: true, visibilityState: 'hidden', effectTarget: 'subject' } },
      system: { rules: [createEphemeralEffectRule('observer-sig')] },
    };
    const actor = makeActor('shared-actor', 'shared-sig', [effect]);
    const observer = makeToken('observer', 'Observer', makeActor('observer-actor', 'observer-sig'));
    await batchUpdateVisibilityEffects(observer, [
      { target: makeToken('linked-1', 'First linked token', actor), state: 'observed' },
      { target: makeToken('linked-2', 'Second linked token', actor), state: 'hidden' },
    ]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(effect.system.rules).toEqual([createEphemeralEffectRule('observer-sig')]);
  });

  test('AVS combines linked observers before mutating their shared receiver effect', async () => {
    const effect = {
      id: 'existing-hidden',
      flags: { 'pf2e-visioner': { aggregateOffGuard: true, visibilityState: 'hidden', effectTarget: 'subject' } },
      system: { rules: [createEphemeralEffectRule('shared-observer')] },
    };
    const effects = [effect];
    const actor = makeActor('receiver', 'receiver-sig', effects);
    actor.deleteEmbeddedDocuments.mockImplementation(async (_type, ids) => {
      for (const id of ids) effects.splice(effects.findIndex(e => e.id === id), 1);
      return [];
    });
    const source = makeActor('source', 'shared-observer');
    const target = makeToken('target', 'Target', actor);
    await BatchOrchestrator.prototype._syncEphemeralEffectsForUpdates.call({ _isHazardOrLoot: () => false }, [
      { observer: makeToken('observer-1', 'First observer', source), target, visibility: 'observed' },
      { observer: makeToken('observer-2', 'Second observer', source), target, visibility: 'hidden' },
    ]);
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(effects).toEqual([effect]);
  });

  test('combines distinct observer signatures into one actor write and yields preparation work', async () => {
    const actor = makeActor('receiver', 'receiver-sig');
    const target = makeToken('target', 'Target', actor);
    let browserTaskRan = false;
    const timer = setTimeout(() => { browserTaskRan = true; }, 0);
    actor.createEmbeddedDocuments.mockImplementation(async () => {
      expect(browserTaskRan).toBe(true);
      return [];
    });
    let time = 0;
    const clock = jest.spyOn(performance, 'now').mockImplementation(() => time += 10);
    try {
      await batchUpdateVisibilityEffectsForObservers(['one', 'two'].map(signature => ({
        observer: makeToken(signature, signature, makeActor(signature, signature)),
        targets: [{ target, state: 'hidden' }],
      })));
      expect(browserTaskRan).toBe(true);
      expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
      expect(actor.createEmbeddedDocuments.mock.calls[0][1][0].system.rules).toEqual([
        createEphemeralEffectRule('one'), createEphemeralEffectRule('two'),
      ]);
    } finally {
      clock.mockRestore();
      clearTimeout(timer);
    }
  });

  test('does not combine synthetic receiving actors sharing the same base actor id', async () => {
    const first = makeActor('shared-base', 'first');
    const second = makeActor('shared-base', 'second');
    first.uuid = 'Scene.test.Token.first.Actor.shared-base';
    second.uuid = 'Scene.test.Token.second.Actor.shared-base';
    const observer = makeToken('observer', 'Observer', makeActor('observer', 'observer-sig'));
    await batchUpdateVisibilityEffects(observer, [
      { target: makeToken('first', 'First', first), state: 'hidden' },
      { target: makeToken('second', 'Second', second), state: 'undetected' },
    ]);
    expect(first.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(second.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(first.createEmbeddedDocuments.mock.calls[0][1][0].flags['pf2e-visioner'].visibilityState).toBe('hidden');
    expect(second.createEmbeddedDocuments.mock.calls[0][1][0].flags['pf2e-visioner'].visibilityState).toBe('undetected');
  });

  test('updates independent receiving actors with bounded concurrency', async () => {
    const observer = makeToken('observer', 'Observer', makeActor('observer', 'observer-sig'));
    let active = 0;
    let maximumActive = 0;
    const targets = Array.from({ length: 8 }, (_, index) => {
      const actor = makeActor(`actor-${index}`, `target-${index}`);
      actor.createEmbeddedDocuments.mockImplementation(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 0));
        active -= 1;
        return [];
      });
      return { target: makeToken(`target-${index}`, `Target ${index}`, actor), state: 'hidden' };
    });

    await batchUpdateVisibilityEffects(observer, targets);

    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(4);
  });

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

  test('coalesces legacy cleanup into one actor deletion for a relationship batch', async () => {
    const observerA = makeToken('observer-a', 'Observer A', makeActor('observer-a-actor', 'sig-a'));
    const observerB = makeToken('observer-b', 'Observer B', makeActor('observer-b-actor', 'sig-b'));
    const legacyA = {
      id: 'legacy-a',
      flags: {
        'pf2e-visioner': { isEphemeralOffGuard: true, hiddenActorSignature: 'sig-a' },
      },
    };
    const legacyB = {
      id: 'legacy-b',
      flags: {
        'pf2e-visioner': { isEphemeralOffGuard: true, hiddenActorSignature: 'sig-b' },
      },
    };
    const targetActor = makeActor('target-actor', 'target-sig', [legacyA, legacyB]);
    const target = makeToken('target', 'Target', targetActor);

    await batchUpdateVisibilityEffectsForObservers([
      { observer: observerA, targets: [{ target, state: 'observed' }] },
      { observer: observerB, targets: [{ target, state: 'observed' }] },
    ]);

    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      'legacy-a',
      'legacy-b',
    ]);
  });

  test('removes legacy hidden off-guard effects when pair becomes undetected', async () => {
    const targetLegacy = {
      id: 'legacy-hidden-on-target',
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

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'undetected' }]);

    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      'legacy-hidden-on-target',
    ]);
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

  test('does not mutate aggregate effects on a player client', async () => {
    global.game.user = { isGM: false };
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
    const observer = makeToken('observer', 'Observer', observerActor);
    const target = makeToken('target', 'Target', targetActor);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);

    expect(targetActor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(targetActor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(targetActor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
