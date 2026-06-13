import '../../setup.js';

import { batchUpdateVisibilityEffects } from '../../../scripts/visibility/batch.js';
import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
  shouldSuppressPendingMovementDetectionFilterVisuals,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';

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

  test('creates hidden aggregate when Blind-Fight only downgraded adjacent undetected to hidden', async () => {
    const observerActor = makeActor('observer-actor', 'observer-sig', []);
    observerActor.items = [
      {
        type: 'feat',
        slug: 'blind-fight',
        system: { slug: 'blind-fight' },
      },
    ];
    const targetActor = makeActor('target-actor', 'target-sig', []);
    const observer = makeToken('observer', 'Ranger', observerActor);
    const target = makeToken('target', 'Adjacent Enemy', targetActor);

    await batchUpdateVisibilityEffects(observer, [
      {
        target,
        state: 'hidden',
        profileMetadata: {
          visibilityReplacementSource: 'blind-fight-adjacent',
          visibilityReplacementOriginalState: 'undetected',
        },
      },
    ]);

    expect(targetActor.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Item',
      expect.arrayContaining([
        expect.objectContaining({
          flags: expect.objectContaining({
            'pf2e-visioner': expect.objectContaining({
              aggregateOffGuard: true,
              visibilityState: 'hidden',
            }),
          }),
        }),
      ]),
    );
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

  test('suppresses observed target detection filters while aggregate effects mutate', async () => {
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
    targetActor.deleteEmbeddedDocuments.mockImplementation(async () => {
      expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
      return [];
    });

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);

    expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['hidden-aggregate']);
    expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(true);
  });

  test('does not suppress observed target filters for a non-controlled observer', async () => {
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
    const controlledActor = makeActor('controlled-actor', 'controlled-sig', []);
    const targetActor = makeActor('target-actor', 'target-sig', [existingHiddenAggregate]);
    const observer = makeToken('observer', 'Observer', observerActor);
    const controlledObserver = makeToken('controlled-observer', 'Controlled', controlledActor, {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'hidden',
            hasConcealment: false,
            coverState: 'none',
          },
        },
      },
    });
    const target = makeToken('target', 'Target', targetActor);
    const originalCanvas = global.canvas;
    global.canvas = {
      ...global.canvas,
      tokens: {
        ...global.canvas.tokens,
        controlled: [controlledObserver],
        placeables: [observer, controlledObserver, target],
        get: jest.fn((id) =>
          id === 'observer'
            ? observer
            : id === 'controlled-observer'
              ? controlledObserver
              : id === 'target'
                ? target
                : null,
        ),
      },
    };

    try {
      await batchUpdateVisibilityEffects(observer, [{ target, state: 'observed' }]);

      expect(targetActor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['hidden-aggregate']);
      expect(shouldSuppressPendingMovementDetectionFilterVisuals(target)).toBe(false);
    } finally {
      global.canvas = originalCanvas;
    }
  });

  test('defers aggregate mutations while token movement is pending', async () => {
    const observerActor = makeActor('observer-actor', 'observer-sig', []);
    const targetActor = makeActor('target-actor', 'target-sig', []);
    const observer = makeToken('observer', 'Observer', observerActor);
    observer.document.x = 0;
    observer.document.y = 0;
    observer.document.width = 1;
    observer.document.height = 1;
    const target = makeToken('target', 'Hidden Enemy', targetActor);

    setPendingTokenMovementPosition(observer.document, { x: 200, y: 0 }, [observer]);

    await batchUpdateVisibilityEffects(observer, [{ target, state: 'hidden' }]);

    expect(targetActor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(targetActor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(targetActor.deleteEmbeddedDocuments).not.toHaveBeenCalled();

    clearPendingTokenMovementPosition('observer');
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
