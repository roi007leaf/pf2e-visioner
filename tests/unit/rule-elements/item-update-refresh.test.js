import '../../setup.js';

import * as itemUpdateRefresh from '../../../scripts/rule-elements/item-update-refresh.js';

const {
  buildRuleElementRegistryValues,
  refreshVisionerRuleElementItem,
  scheduleVisionerRuleElementItemRefresh,
} = itemUpdateRefresh;

function makeToken(id, actorId = 'actor-1', registry = {}) {
  return {
    id,
    actor: { id: actorId },
    document: {
      id,
      getFlag: jest.fn((moduleId, key) => {
        if (moduleId === 'pf2e-visioner' && key === 'ruleElementRegistry') return registry;
        return undefined;
      }),
      update: jest.fn().mockResolvedValue(undefined),
      setFlag: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeItem({ id = 'item-1', actorId = 'actor-1', operations = [], rules = null } = {}) {
  return {
    id,
    parent: { id: actorId },
    system: {
      rules:
        rules ??
        [
          {
            key: 'PF2eVisionerEffect',
            slug: 'effect',
            operations,
          },
        ],
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
  return sense;
}

function makeOperationClasses() {
  return {
    VisibilityOverride: {
      removeVisibilityOverride: jest.fn().mockResolvedValue(undefined),
      applyVisibilityOverride: jest.fn().mockResolvedValue(undefined),
    },
    DistanceBasedVisibility: {
      removeDistanceBasedVisibility: jest.fn().mockResolvedValue(undefined),
      applyDistanceBasedVisibility: jest.fn().mockResolvedValue(undefined),
    },
    CoverOverride: {
      removeCoverOverride: jest.fn().mockResolvedValue(undefined),
      removeProvideCover: jest.fn().mockResolvedValue(undefined),
      applyCoverOverride: jest.fn().mockResolvedValue(undefined),
      applyProvideCover: jest.fn().mockResolvedValue(undefined),
    },
    SenseModifier: {
      restoreSenses: jest.fn().mockResolvedValue(undefined),
      applySenseModifications: jest.fn().mockResolvedValue(undefined),
    },
    DetectionModeModifier: {
      restoreDetectionModes: jest.fn().mockResolvedValue(undefined),
      applyDetectionModeModifications: jest.fn().mockResolvedValue(undefined),
    },
    ActionQualifier: {
      removeActionQualifications: jest.fn().mockResolvedValue(undefined),
      applyActionQualifications: jest.fn().mockResolvedValue(undefined),
    },
    LightingModifier: {
      removeLightingModification: jest.fn().mockResolvedValue(undefined),
      applyLightingModification: jest.fn().mockResolvedValue(undefined),
    },
    OffGuardSuppression: {
      removeOffGuardSuppression: jest.fn().mockResolvedValue(undefined),
      applyOffGuardSuppression: jest.fn().mockResolvedValue(undefined),
    },
    AuraVisibility: {
      removeAuraVisibility: jest.fn().mockResolvedValue(undefined),
      applyAuraVisibility: jest.fn().mockResolvedValue(undefined),
    },
    ShareVision: {
      removeShareVision: jest.fn().mockResolvedValue(undefined),
      applyShareVision: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('rule-element item update refresh', () => {
  test('handles updateItem hooks by scheduling rule-element refreshes', () => {
    const item = makeItem({ operations: [{ type: 'overrideVisibility' }] });
    const changes = { system: { rules: [] } };
    const scheduleVisionerRuleElementItemRefresh = jest.fn(() => true);
    const warn = jest.fn();

    const result = itemUpdateRefresh.handleVisionerRuleElementItemUpdate(item, changes, {}, 'gm-1', {
      scheduleVisionerRuleElementItemRefresh,
      warn,
    });

    expect(result).toEqual({ scheduled: true });
    expect(scheduleVisionerRuleElementItemRefresh).toHaveBeenCalledWith(item, changes, {
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('contains updateItem hook failures inside the rule-element module', () => {
    const item = makeItem({ operations: [{ type: 'overrideVisibility' }] });
    const error = new Error('scheduler failed');
    const scheduleVisionerRuleElementItemRefresh = jest.fn(() => {
      throw error;
    });
    const warn = jest.fn();

    const result = itemUpdateRefresh.handleVisionerRuleElementItemUpdate(item, {}, {}, 'gm-1', {
      scheduleVisionerRuleElementItemRefresh,
      warn,
    });

    expect(result).toEqual({ scheduled: false, reason: 'error' });
    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to handle item update for rule elements:',
      error,
    );
  });

  test('maps operations back into rule-element registry flag names', () => {
    expect(
      buildRuleElementRegistryValues([
        { type: 'distanceBasedVisibility' },
        { type: 'overrideVisibility' },
        { type: 'conditionalState' },
        { type: 'overrideCover' },
        { type: 'provideCover' },
        { type: 'modifySenses' },
        { type: 'modifyDetectionModes' },
        { type: 'modifyActionQualification' },
        { type: 'modifyLighting', source: 'torch' },
        { type: 'modifyLighting' },
        { type: 'offGuardSuppression' },
        { type: 'auraVisibility' },
        { type: 'shareVision' },
        { type: 'unsupported' },
      ]),
    ).toEqual([
      'distanceBasedVisibility',
      'visibilityReplacement',
      'conditionalState',
      'overrideCover',
      'providesCover',
      'originalSenses',
      'originalDetectionModes',
      'actionQualifications',
      'lightingModification.torch',
      'lightingModification.lighting',
      'offGuardSuppression',
      'auraVisibility',
      'visionSharing',
    ]);
  });

  test('schedules relevant item updates after PF2e has processed the rules', async () => {
    const token = makeToken('token-1');
    const item = makeItem({ operations: [{ type: 'overrideVisibility' }] });
    let scheduledCallback;
    const refreshVisionerRuleElementItem = jest.fn().mockResolvedValue(undefined);
    const scheduler = jest.fn((callback, delayMs) => {
      scheduledCallback = callback;
      return 123;
    });

    const scheduled = scheduleVisionerRuleElementItemRefresh(item, { system: { rules: [] } }, {
      isGM: () => true,
      getTokensForActor: () => [token],
      refreshVisionerRuleElementItem,
      scheduler,
    });

    expect(scheduled).toBe(true);
    expect(scheduler).toHaveBeenCalledWith(expect.any(Function), 500);

    await scheduledCallback();

    expect(refreshVisionerRuleElementItem).toHaveBeenCalledWith(item, [token], expect.any(Object));
  });

  test('does not schedule irrelevant item updates', () => {
    const scheduler = jest.fn();
    const item = makeItem({ operations: [{ type: 'overrideVisibility' }] });

    expect(
      scheduleVisionerRuleElementItemRefresh(item, { system: { name: 'New' } }, {
        isGM: () => true,
        getTokensForActor: () => [makeToken('token-1')],
        scheduler,
      }),
    ).toBe(false);

    expect(scheduler).not.toHaveBeenCalled();
  });

  test('schedules AVS recalculation when native sense rule range or acuity changes', async () => {
    const token = makeToken('token-1');
    const item = {
      id: 'sense-item',
      parent: { id: 'actor-1' },
      system: {
        rules: [{ key: 'Sense', type: 'tremorsense', acuity: 'precise', range: 60 }],
      },
    };
    const changes = {
      system: {
        rules: [{ key: 'Sense', type: 'tremorsense', acuity: 'imprecise', range: 30 }],
      },
    };
    let scheduledCallback;
    const scheduler = jest.fn((callback, delayMs) => {
      scheduledCallback = callback;
      return 123;
    });
    const recalculateTokenIds = jest.fn().mockResolvedValue(undefined);

    expect(
      itemUpdateRefresh.scheduleActorSenseChangeAvsRefresh(item, changes, {
        isGM: () => true,
        getTokensForActor: () => [token],
        scheduler,
        recalculateTokenIds,
      }),
    ).toBe(true);
    expect(scheduler).toHaveBeenCalledWith(expect.any(Function), 500);

    await scheduledCallback();

    expect(recalculateTokenIds).toHaveBeenCalledWith(['token-1']);
  });

  test('schedules AVS recalculation when prepared actor Sense.value changes', async () => {
    const token = makeToken('token-1');
    const tremorsense = preparedSense('tremorsense', { acuity: 'precise', range: 60 });
    const actor = {
      id: 'actor-1',
      perception: {
        senses: new Map([['tremorsense', tremorsense]]),
      },
    };
    let scheduledCallback;
    const scheduler = jest.fn((callback) => {
      scheduledCallback = callback;
      return 123;
    });
    const recalculateTokenIds = jest.fn().mockResolvedValue(undefined);

    itemUpdateRefresh.captureActorPreparedSenseSnapshot(actor, { isGM: () => true });

    tremorsense.value.acuity = 'imprecise';
    tremorsense.value.range = 30;

    expect(
      itemUpdateRefresh.scheduleActorPreparedSensesAvsRefresh(actor, {}, {
        isGM: () => true,
        getTokensForActor: () => [token],
        scheduler,
        recalculateTokenIds,
      }),
    ).toBe(true);

    await scheduledCallback();

    expect(recalculateTokenIds).toHaveBeenCalledWith(['token-1']);
  });

  test('schedules AVS recalculation when prepared actor sense is mutated directly', async () => {
    const token = makeToken('token-1');
    const tremorsense = { type: 'tremorsense', acuity: 'imprecise', range: 60 };
    const actor = {
      id: 'actor-1',
      perception: {
        senses: new Map([['tremorsense', tremorsense]]),
      },
    };
    let scheduledCallback;
    const scheduler = jest.fn((callback) => {
      scheduledCallback = callback;
      return 123;
    });
    const recalculateTokenIds = jest.fn().mockResolvedValue(undefined);
    const clearVisionCacheForTokenIds = jest.fn();

    expect(
      itemUpdateRefresh.watchActorPreparedSenses(actor, {
        isGM: () => true,
        getTokensForActor: () => [token],
        scheduler,
        recalculateTokenIds,
        clearVisionCacheForTokenIds,
      }),
    ).toBe(true);

    tremorsense.acuity = 'precise';

    expect(clearVisionCacheForTokenIds).toHaveBeenCalledWith(['token-1']);
    expect(scheduler).toHaveBeenCalledWith(expect.any(Function), 500);
    await scheduledCallback();

    expect(recalculateTokenIds).toHaveBeenCalledWith(['token-1']);
  });

  test('does not schedule AVS recalculation for unrelated item rule updates', () => {
    const scheduler = jest.fn();
    const item = {
      id: 'non-sense-item',
      parent: { id: 'actor-1' },
      system: {
        rules: [{ key: 'FlatModifier', selector: 'perception', value: 1 }],
      },
    };

    expect(
      itemUpdateRefresh.scheduleActorSenseChangeAvsRefresh(
        item,
        { system: { rules: [{ key: 'FlatModifier', selector: 'perception', value: 2 }] } },
        {
          isGM: () => true,
          getTokensForActor: () => [makeToken('token-1')],
          scheduler,
        },
      ),
    ).toBe(false);
    expect(scheduler).not.toHaveBeenCalled();
  });

  test('removes old operations, clears registry flags, reapplies current operations, and refreshes AVS once', async () => {
    const operations = [
      { type: 'overrideVisibility' },
      { type: 'modifySenses', senseModifications: [{ sense: 'darkvision' }], predicate: ['self'] },
      { type: 'modifyLighting', source: 'torch' },
      { type: 'provideCover' },
    ];
    const item = makeItem({ operations });
    const token = makeToken('token-1', 'actor-1', {
      'item-item-1': ['visibilityReplacement', 'oldFlag'],
    });
    const operationClasses = makeOperationClasses();
    const loadOperationClass = jest.fn(async (className) => operationClasses[className]);
    const recalculateTokenIds = jest.fn().mockResolvedValue(undefined);

    await refreshVisionerRuleElementItem(item, [token], {
      loadOperationClass,
      recalculateTokenIds,
      warn: jest.fn(),
    });

    expect(operationClasses.VisibilityOverride.removeVisibilityOverride).toHaveBeenCalledWith(
      { type: 'overrideVisibility', source: 'item-1-effect' },
      token,
      'item-1-effect',
    );
    expect(operationClasses.CoverOverride.removeProvideCover).toHaveBeenCalledWith(token);
    expect(token.document.update).toHaveBeenCalledWith({
      'flags.pf2e-visioner.visibilityReplacement': null,
      'flags.pf2e-visioner.oldFlag': null,
    });
    expect(operationClasses.VisibilityOverride.applyVisibilityOverride).toHaveBeenCalledWith(
      { type: 'overrideVisibility', source: 'item-1-effect' },
      token,
    );
    expect(operationClasses.SenseModifier.applySenseModifications).toHaveBeenCalledWith(
      token,
      [{ sense: 'darkvision' }],
      'item-1-effect',
      ['self'],
    );
    expect(operationClasses.LightingModifier.applyLightingModification).toHaveBeenCalledWith(
      { type: 'modifyLighting', source: 'torch' },
      token,
    );
    expect(token.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'ruleElementRegistry', {
      'item-item-1': [
        'visibilityReplacement',
        'originalSenses',
        'lightingModification.torch',
        'providesCover',
      ],
    });
    expect(recalculateTokenIds).toHaveBeenCalledWith(['token-1']);
    expect(
      operationClasses.VisibilityOverride.removeVisibilityOverride.mock.invocationCallOrder[0],
    ).toBeLessThan(
      operationClasses.VisibilityOverride.applyVisibilityOverride.mock.invocationCallOrder[0],
    );
  });

  test('reapplies every supported Visioner rule-element operation type after item updates', async () => {
    const operations = [
      { type: 'conditionalState', condition: 'invisible', thenState: 'concealed' },
      { type: 'overrideCover', state: 'standard' },
      { type: 'provideCover', state: 'lesser' },
      { type: 'modifyDetectionModes', modeModifications: { hearing: { range: 20 } } },
      { type: 'modifyActionQualification', qualifications: { seek: { ignoreCover: true } } },
    ];
    const item = makeItem({ operations });
    const token = makeToken('token-1');
    const operationClasses = makeOperationClasses();
    operationClasses.VisibilityOverride.applyConditionalState = jest.fn().mockResolvedValue(undefined);
    const loadOperationClass = jest.fn(async (className) => operationClasses[className]);

    await refreshVisionerRuleElementItem(item, [token], {
      loadOperationClass,
      recalculateTokenIds: jest.fn().mockResolvedValue(undefined),
      warn: jest.fn(),
    });

    const ruleElementContext = expect.objectContaining({
      item,
      slug: 'effect',
      ruleElementId: 'item-1-effect',
    });

    expect(operationClasses.VisibilityOverride.applyConditionalState).toHaveBeenCalledWith(
      { ...operations[0], source: 'item-1-effect' },
      token,
    );
    expect(operationClasses.CoverOverride.applyCoverOverride).toHaveBeenCalledWith(
      { ...operations[1], source: 'item-1-effect' },
      token,
      ruleElementContext,
    );
    expect(operationClasses.CoverOverride.applyProvideCover).toHaveBeenCalledWith(
      { ...operations[2], source: 'item-1-effect' },
      token,
      ruleElementContext,
    );
    expect(operationClasses.DetectionModeModifier.applyDetectionModeModifications).toHaveBeenCalledWith(
      token,
      operations[3].modeModifications,
      'item-1-effect',
      undefined,
    );
    expect(operationClasses.ActionQualifier.applyActionQualifications).toHaveBeenCalledWith(
      { ...operations[4], source: 'item-1-effect' },
      token,
    );
    expect(token.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'ruleElementRegistry', {
      'item-item-1': [
        'conditionalState',
        'overrideCover',
        'providesCover',
        'originalDetectionModes',
        'actionQualifications',
      ],
    });
  });
});
