/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('API AVS cleanup integration', () => {
  beforeEach(() => {
    jest.resetModules();
    ui.notifications.info.mockClear();
    ui.notifications.warn.mockClear();
    ui.notifications.error.mockClear();

    canvas.tokens.placeables = [];
    canvas.tokens.get.mockReset();
    canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue(true);
    game.user.isGM = true;
  });

  test('clearAllSceneData calls autoVisibilitySystem.clearAllOverrides()', async () => {
    // Spy on the exported system instance
    const indexMod = await import('../../../scripts/visibility/auto-visibility/index.js');
    const clearAllSpy = jest.spyOn(indexMod.autoVisibilitySystem, 'clearAllOverrides').mockResolvedValue();

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    expect(clearAllSpy).toHaveBeenCalled();
  });

  test('clearAllSceneData does not unset disableAVS scene flag', async () => {
    canvas.scene.unsetFlag = jest.fn().mockResolvedValue(true);
    canvas.scene.flags = {
      'pf2e-visioner': {
        disableAVS: true,
        deletedEntryCache: { x: 1 },
        someOtherFlag: true,
      },
    };

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);

    const calls = canvas.scene.unsetFlag.mock.calls;
    expect(calls.some((c) => c?.[0] === 'pf2e-visioner' && c?.[1] === 'disableAVS')).toBe(false);
    expect(calls.some((c) => c?.[0] === 'pf2e-visioner' && c?.[1] === 'deletedEntryCache')).toBe(true);
  });

  test('clearAllSceneData clears visibilityV2 for rule-element tokens without deleting registry', async () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const token = global.createMockToken({
      id: 'rule-token',
      flags: {
        'pf2e-visioner': {
          ruleElementRegistry: { one: true },
          visibilityV2: { target: { detectionState: 'hidden' } },
          detection: { target: { sense: 'vision', isPrecise: true } },
        },
      },
    });

    canvas.tokens.placeables = [token];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    const update = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] ?? [])
      .find((entry) => entry._id === 'rule-token');

    expect(update['flags.pf2e-visioner.visibilityV2']).toBe(forcedDeletion);
    expect(update['flags.pf2e-visioner.detection']).toBe(forcedDeletion);
    expect(Object.prototype.hasOwnProperty.call(update, 'flags.pf2e-visioner')).toBe(false);
  });

  test('clearAllSceneData clears stale hover indicators after purge', async () => {
    const hideAllVisibilityIndicators = jest.fn();
    const hideAllCoverIndicators = jest.fn();
    jest.doMock('../../../scripts/services/HoverTooltips.js', () => ({
      hideAllVisibilityIndicators,
      hideAllCoverIndicators,
    }));

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    expect(hideAllVisibilityIndicators).toHaveBeenCalledTimes(1);
    expect(hideAllCoverIndicators).toHaveBeenCalledTimes(1);
  });

  test('clearAllSceneData synchronously unsets stubborn token flags before returning', async () => {
    const token = global.createMockToken({
      id: 'stubborn-token',
      flags: {
        'pf2e-visioner': {
          visibilityV2: { target: { detectionState: 'undetected' } },
          detection: { target: { sense: 'vision', isPrecise: true } },
        },
      },
    });
    canvas.tokens.placeables = [token];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2');
    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'detection');
    expect(token.document.flags['pf2e-visioner']).toBeUndefined();
  });

  test('clearAllSceneData explicitly removes manual cover flags from tokens without rule elements', async () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const token = {
      id: 'A',
      name: 'A',
      actor: null,
      document: {
        flags: {
          'pf2e-visioner': {
            cover: { B: 'standard' },
            visibility: { B: 'hidden' },
          },
        },
        getFlag: jest.fn((module, key) => {
          if (module !== 'pf2e-visioner') return undefined;
          if (key === 'ruleElementRegistry') return {};
          return token.document.flags['pf2e-visioner']?.[key];
        }),
      },
    };
    canvas.tokens.placeables = [token];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    const updateForToken = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] || [])
      .find((update) => update._id === 'A');

    expect(updateForToken).toEqual(expect.objectContaining({
      'flags.pf2e-visioner': forcedDeletion,
    }));
  });

  test('clearAllSceneData removes manual-cover state sources while preserving rule-element sources', async () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const token = {
      id: 'A',
      name: 'A',
      actor: null,
      document: {
        flags: {
          'pf2e-visioner': {
            ruleElementRegistry: { 'item-rule': ['stateSource'] },
            cover: { B: 'standard' },
            stateSource: {
              coverByObserver: {
                B: {
                  state: 'standard',
                  sources: [
                    { id: 'B', type: 'manual-cover' },
                    { id: 'rule-cover', type: 'rule-element', state: 'greater' },
                  ],
                },
              },
            },
          },
        },
        getFlag: jest.fn((module, key) => {
          if (module !== 'pf2e-visioner') return undefined;
          return token.document.flags['pf2e-visioner']?.[key];
        }),
      },
    };
    canvas.tokens.placeables = [token];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    const updateForToken = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] || [])
      .find((update) => update._id === 'A');

    expect(updateForToken['flags.pf2e-visioner.cover']).toBe(forcedDeletion);
    expect(updateForToken['flags.pf2e-visioner.stateSource']).toEqual({
      coverByObserver: {
        B: {
          state: 'greater',
          sources: [{ id: 'rule-cover', type: 'rule-element', state: 'greater' }],
        },
      },
    });
  });

  test('clearAllDataForSelectedTokens removes avs-override-* flags referencing purged tokens and calls removeOverride between them', async () => {
    const mkToken = (id, flags = {}) => ({
      id,
      name: id,
      actor: {},
      document: {
        id,
        getFlag: jest.fn(),
        unsetFlag: jest.fn().mockResolvedValue(true),
        flags: { 'pf2e-visioner': { ...flags } },
      },
    });

    const A = mkToken('A');
    const B = mkToken('B');
    const C = mkToken('C', {
      'avs-override-from-A': { any: 'x' },
      'avs-override-from-Z': { any: 'y' },
    });

    canvas.tokens.placeables = [A, B, C];

    // Stub autoVisibilitySystem.removeOverride
    const indexMod = await import('../../../scripts/visibility/auto-visibility/index.js');
    const removeSpy = jest
      .spyOn(indexMod.autoVisibilitySystem, 'removeOverride')
      .mockResolvedValue(true);

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllDataForSelectedTokens([A, B]);

    expect(ok).toBe(true);

    // Should attempt to remove overrides between selected tokens A<->B
    expect(removeSpy).toHaveBeenCalledWith('A', 'B');
    expect(removeSpy).toHaveBeenCalledWith('B', 'A');

    // It should attempt to cleanup flags without V14 legacy deletion keys.
    const maybeCall = canvas.scene.updateEmbeddedDocuments.mock.calls.find((c) => c[1]?.some?.((u) => u._id === 'C'));
    if (maybeCall) {
      const updateForC = maybeCall[1].find((u) => u._id === 'C');
      const keys = Object.keys(updateForC);
      expect(keys.some((k) => k.includes('.-='))).toBe(false);
      expect(
        keys.some((k) => k === 'flags.pf2e-visioner' || k.includes('flags.pf2e-visioner.avs-override')),
      ).toBe(true);
    }
  });

  test('clearAllDataForSelectedTokens clears visibilityV2 data for selected and observing tokens', async () => {
    const mkToken = (id, flags = {}) => ({
      id,
      name: id,
      actor: {},
      document: {
        id,
        getFlag: jest.fn((moduleId, key) => flags[moduleId]?.[key] ?? null),
        unsetFlag: jest.fn().mockResolvedValue(true),
        flags,
      },
    });

    const selected = mkToken('selected', {
      'pf2e-visioner': {
        visibility: { observer: 'hidden' },
        visibilityV2: { observer: { detectionState: 'hidden', hasConcealment: true } },
        detection: { observer: { sense: 'vision', isPrecise: true } },
      },
    });
    const observer = mkToken('observer', {
      'pf2e-visioner': {
        visibility: { selected: 'hidden', keep: 'concealed' },
        visibilityV2: {
          selected: { detectionState: 'hidden', hasConcealment: true },
          keep: { detectionState: 'observed', hasConcealment: true },
        },
        detection: {
          selected: { sense: 'vision', isPrecise: true },
          keep: { sense: 'hearing', isPrecise: false },
        },
      },
    });

    canvas.tokens.placeables = [selected, observer];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllDataForSelectedTokens([selected]);

    expect(ok).toBe(true);

    const selectedUpdate = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] ?? [])
      .find((update) => update._id === 'selected');
    expect(selectedUpdate).toEqual(
      expect.objectContaining({
        'flags.pf2e-visioner.visibilityV2': expect.anything(),
        'flags.pf2e-visioner.detection': expect.anything(),
      }),
    );
    expect(selectedUpdate).not.toHaveProperty('flags.pf2e-visioner.visibility');

    const observerUpdate = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] ?? [])
      .find((update) => update._id === 'observer' && update['flags.pf2e-visioner.visibilityV2']);
    expect(observerUpdate).toEqual(
      expect.objectContaining({
        'flags.pf2e-visioner.visibilityV2': {
          keep: { detectionState: 'observed', hasConcealment: true },
        },
      }),
    );

    const observerDetectionUpdate = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] ?? [])
      .find((update) => update._id === 'observer' && update['flags.pf2e-visioner.detection']);
    expect(observerDetectionUpdate).toEqual(
      expect.objectContaining({
        'flags.pf2e-visioner.detection': {
          keep: { sense: 'hearing', isPrecise: false },
        },
      }),
    );
  });

  test('clearAllDataForSelectedTokens unsets other tokens cover map when selected token was last entry', async () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const mkToken = (id, flags = {}) => ({
      id,
      name: id,
      actor: {},
      document: {
        id,
        getFlag: jest.fn((module, key) => {
          if (module !== 'pf2e-visioner') return undefined;
          return flags[key];
        }),
        unsetFlag: jest.fn().mockResolvedValue(true),
        flags: { 'pf2e-visioner': { ...flags } },
      },
    });

    const selected = mkToken('A');
    const observer = mkToken('C', {
      cover: { A: 'standard' },
      visibilityV2: { A: { detectionState: 'hidden' } },
    });
    canvas.tokens.placeables = [selected, observer];

    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllDataForSelectedTokens([selected]);

    expect(ok).toBe(true);
    const updateForObserver = canvas.scene.updateEmbeddedDocuments.mock.calls
      .flatMap((call) => call[1] || [])
      .find((update) => update._id === 'C' && update['flags.pf2e-visioner.cover']);

    expect(updateForObserver).toEqual(expect.objectContaining({
      'flags.pf2e-visioner.cover': forcedDeletion,
      'flags.pf2e-visioner.visibilityV2': forcedDeletion,
    }));
    expect(updateForObserver).not.toHaveProperty('flags.pf2e-visioner.visibility');
  });
});
