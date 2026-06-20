import '../../setup.js';

import { ConditionManager } from '../../../scripts/visibility/auto-visibility/ConditionManager.js';

describe('ConditionManager invisibility removal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.game.user.isGM = true;
    global.canvas.perception = { update: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('forced invisibility removal clears flags even when actor condition state is stale', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn((slug) => slug === 'invisible'),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn((slug) => slug === 'invisible') },
    };
    const token = {
      id: 'token-1',
      name: 'Token 1',
      actor,
      document: {
        id: 'token-1',
        flags: {
          'pf2e-visioner': {
            invisibility: {
              observer: { previousState: 'hidden', establishedState: 'hidden' },
            },
          },
        },
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };

    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [token];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: false,
    });

    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility');
    expect(global.canvas.perception.update).toHaveBeenCalled();
  });

  test('records observer-to-target visibility before invisibility is applied', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => false),
      system: { conditions: { invisible: { active: false } } },
      conditions: { has: jest.fn(() => false) },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: {},
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const observerSeeingTarget = {
      id: 'observer-seeing',
      actor: { id: 'observer-actor-1' },
      document: { id: 'observer-seeing' },
    };
    const observerHiddenFromTarget = {
      id: 'observer-hidden',
      actor: { id: 'observer-actor-2' },
      document: { id: 'observer-hidden' },
    };
    const api = {
      getVisibilityMap: jest.fn(() => ({
        'observer-seeing': 'undetected',
        'observer-hidden': 'undetected',
      })),
      getVisibility: jest.fn((observerId, targetId) => {
        if (targetId !== 'target') return 'observed';
        if (observerId === 'observer-seeing') return 'observed';
        if (observerId === 'observer-hidden') return 'hidden';
        return 'observed';
      }),
    };

    global.game.modules.get.mockReturnValue({ api });
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observerSeeingTarget, observerHiddenFromTarget];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
    });

    expect(api.getVisibility).toHaveBeenCalledWith('observer-seeing', 'target');
    expect(api.getVisibility).toHaveBeenCalledWith('observer-hidden', 'target');
    expect(target.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility', {
      'observer-seeing': {
        wasVisible: true,
        previousState: 'observed',
        establishedState: null,
        establishedAt: null,
      },
      'observer-hidden': {
        wasVisible: false,
        previousState: 'hidden',
        establishedState: null,
        establishedAt: null,
      },
    });
  });

  test('records canonical AVS override visibility before invisibility is applied', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => false),
      system: { conditions: { invisible: { active: false } } },
      conditions: { has: jest.fn(() => false) },
    };
    const observer = {
      id: 'observer',
      actor: { id: 'observer-actor' },
      document: { id: 'observer' },
    };
    const overrideFlag = {
      observerId: 'observer',
      targetId: 'target',
      detectionState: 'hidden',
      hasConcealment: false,
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer': overrideFlag,
          },
        },
        getFlag: jest.fn((moduleId, key) =>
          moduleId === 'pf2e-visioner' && key === 'avs-override-from-observer'
            ? overrideFlag
            : null,
        ),
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const api = {
      getVisibility: jest.fn(() => 'observed'),
    };

    global.game.modules.get.mockReturnValue({ api });
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observer];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
    });

    expect(api.getVisibility).not.toHaveBeenCalled();
    expect(target.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility', {
      observer: {
        wasVisible: false,
        previousState: 'hidden',
        establishedState: null,
        establishedAt: null,
      },
    });
  });

  test('syncs hidden override to undetected while invisibility is active', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
      itemTypes: { condition: [{ id: 'invisible-item', slug: 'invisible', isExpired: false }] },
    };
    const observerFlags = { 'pf2e-visioner': {} };
    const observer = {
      id: 'observer',
      actor: { id: 'observer-actor' },
      document: {
        id: 'observer',
        getFlag: jest.fn((moduleId, key) => observerFlags[moduleId]?.[key] ?? null),
        setFlag: jest.fn((moduleId, key, value) => {
          observerFlags[moduleId] ||= {};
          observerFlags[moduleId][key] = value;
          return Promise.resolve(true);
        }),
      },
    };
    const overrideFlag = {
      observerId: 'observer',
      targetId: 'target',
      detectionState: 'hidden',
      hasConcealment: false,
    };
    const targetFlags = {
      'pf2e-visioner': {
        'avs-override-from-observer': overrideFlag,
      },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: targetFlags,
        getFlag: jest.fn((moduleId, key) => targetFlags[moduleId]?.[key] ?? null),
        setFlag: jest.fn((moduleId, key, value) => {
          targetFlags[moduleId] ||= {};
          targetFlags[moduleId][key] = value;
          return Promise.resolve(true);
        }),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };

    global.game.modules.get.mockReturnValue({
      api: {
        getVisibility: jest.fn(() => 'observed'),
      },
    });
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observer];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
      token: target,
    });

    expect(targetFlags['pf2e-visioner'].invisibility.observer.previousState).toBe('hidden');
    expect(observerFlags['pf2e-visioner'].visibilityV2.target).toMatchObject({
      detectionState: 'undetected',
      hasConcealment: false,
    });
  });

  test('restores raw hidden override when forced invisibility removal sees stale actor condition', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
      itemTypes: { condition: [{ id: 'invisible-item', slug: 'invisible', isExpired: false }] },
    };
    const observerFlags = {
      'pf2e-visioner': {
        visibilityV2: {
          target: {
            detectionState: 'undetected',
            hasConcealment: false,
            coverState: 'none',
            detectionSense: null,
            awarenessState: null,
          },
        },
      },
    };
    const observer = {
      id: 'observer',
      actor: { id: 'observer-actor' },
      document: {
        id: 'observer',
        getFlag: jest.fn((moduleId, key) => observerFlags[moduleId]?.[key] ?? null),
        setFlag: jest.fn((moduleId, key, value) => {
          observerFlags[moduleId] ||= {};
          observerFlags[moduleId][key] = value;
          return Promise.resolve(true);
        }),
      },
    };
    const overrideFlag = {
      observerId: 'observer',
      targetId: 'target',
      detectionState: 'hidden',
      hasConcealment: false,
    };
    const targetFlags = {
      'pf2e-visioner': {
        'avs-override-from-observer': overrideFlag,
        invisibility: {
          observer: {
            previousState: 'hidden',
            conditionItemId: 'invisible-item',
          },
        },
      },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: targetFlags,
        getFlag: jest.fn((moduleId, key) => targetFlags[moduleId]?.[key] ?? null),
        setFlag: jest.fn((moduleId, key, value) => {
          targetFlags[moduleId] ||= {};
          targetFlags[moduleId][key] = value;
          return Promise.resolve(true);
        }),
        unsetFlag: jest.fn((moduleId, key) => {
          delete targetFlags[moduleId]?.[key];
          return Promise.resolve(true);
        }),
      },
    };

    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observer];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: false,
      token: target,
    });

    expect(observerFlags['pf2e-visioner'].visibilityV2.target).toMatchObject({
      detectionState: 'hidden',
      hasConcealment: false,
    });
    expect(target.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility');
  });

  test('uses the exact synthetic actor token instead of every token with the same actor id', async () => {
    const actor = {
      id: 'shared-actor',
      token: { id: 'target' },
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: {},
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const sibling = {
      id: 'sibling',
      name: 'Sibling',
      actor: {
        id: 'shared-actor',
        token: { id: 'sibling' },
      },
      document: {
        id: 'sibling',
        flags: {},
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const observer = {
      id: 'observer',
      actor: { id: 'observer-actor' },
      document: { id: 'observer' },
    };

    global.game.modules.get.mockReturnValue({
      api: {
        getVisibility: jest.fn(() => 'observed'),
      },
    });
    global.canvas.tokens.get = jest.fn((id) => (id === 'target' ? target : null));
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, sibling, observer];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
    });

    expect(target.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'invisibility',
      expect.any(Object),
    );
    expect(sibling.document.setFlag).not.toHaveBeenCalled();
  });

  test('reapplies invisibility flags after PF2E condition document updates settle', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
      itemTypes: { condition: [{ slug: 'invisible', isExpired: false }] },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      destroyed: false,
      document: {
        id: 'target',
        flags: {},
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const observer = {
      id: 'observer',
      actor: { id: 'observer-actor' },
      document: { id: 'observer' },
    };

    global.game.modules.get.mockReturnValue({
      api: {
        getVisibility: jest.fn(() => 'observed'),
      },
    });
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observer];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
      token: target,
    });

    expect(target.document.setFlag).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(150);
    expect(target.document.setFlag).toHaveBeenCalledTimes(2);
    expect(target.document.setFlag).toHaveBeenLastCalledWith(
      'pf2e-visioner',
      'invisibility',
      {
        observer: {
          wasVisible: true,
          previousState: 'observed',
          establishedState: null,
          establishedAt: null,
        },
      },
    );
  });

  test('does not overwrite pre-invisibility states when duplicate invisible handlers run', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
      itemTypes: { condition: [{ id: 'invisible-item', slug: 'invisible', isExpired: false }] },
    };
    const target = {
      id: 'target',
      name: 'Target',
      actor,
      document: {
        id: 'target',
        flags: {
          'pf2e-visioner': {
            invisibility: {
              'observer-seeing': {
                wasVisible: true,
                previousState: 'observed',
                conditionItemId: 'invisible-item',
                establishedState: 'hidden',
                establishedAt: 123,
              },
              'observer-hidden': {
                wasVisible: false,
                previousState: 'hidden',
                conditionItemId: 'invisible-item',
                establishedState: 'undetected',
                establishedAt: 123,
              },
            },
          },
        },
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };
    const observerSeeingTarget = {
      id: 'observer-seeing',
      actor: { id: 'observer-actor-1' },
      document: { id: 'observer-seeing' },
    };
    const observerHiddenFromTarget = {
      id: 'observer-hidden',
      actor: { id: 'observer-actor-2' },
      document: { id: 'observer-hidden' },
    };
    const api = {
      getVisibility: jest.fn(() => 'undetected'),
    };

    global.game.modules.get.mockReturnValue({ api });
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [target, observerSeeingTarget, observerHiddenFromTarget];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
    });

    expect(target.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'invisibility', {
      'observer-seeing': {
        wasVisible: true,
        previousState: 'observed',
        conditionItemId: 'invisible-item',
        establishedState: null,
        establishedAt: null,
      },
      'observer-hidden': {
        wasVisible: false,
        previousState: 'hidden',
        conditionItemId: 'invisible-item',
        establishedState: null,
        establishedAt: null,
      },
    });
  });

  test('refreshes token rendering after applying the invisible mesh effect', async () => {
    const actor = {
      id: 'actor-1',
      hasCondition: jest.fn(() => true),
      system: { conditions: { invisible: { active: true } } },
      conditions: { has: jest.fn(() => true) },
    };
    const token = {
      id: 'target',
      name: 'Target',
      actor,
      destroyed: false,
      _configureFilterEffect: jest.fn(),
      renderFlags: { set: jest.fn() },
      refresh: jest.fn(),
      document: {
        id: 'target',
        flags: {},
        setFlag: jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
      },
    };

    global.CONFIG = {
      ...global.CONFIG,
      specialStatusEffects: {
        ...(global.CONFIG?.specialStatusEffects || {}),
        INVISIBLE: 'invisible',
      },
    };
    global.canvas.tokens.controlled = [];
    global.canvas.tokens.placeables = [token];

    await ConditionManager.getInstance().handleInvisibilityChange(actor, {
      hasInvisibility: true,
    });
    jest.runOnlyPendingTimers();

    expect(token._configureFilterEffect).toHaveBeenCalledWith('invisible', true);
    expect(token.renderFlags.set).toHaveBeenCalledWith({
      refreshState: true,
      refreshMesh: true,
      refreshVisibility: true,
    });
    expect(token.refresh).toHaveBeenCalled();
  });
});
