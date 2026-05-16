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
      'flags.pf2e-visioner.cover': forcedDeletion,
      'flags.pf2e-visioner.visibility': forcedDeletion,
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
      visibility: { A: 'hidden' },
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
      'flags.pf2e-visioner.visibility': forcedDeletion,
    }));
  });
});
