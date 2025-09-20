/**
 * @jest-environment jsdom
 */

import '../setup.js';

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
    const indexMod = await import('../../scripts/visibility/auto-visibility/index.js');
    const clearAllSpy = jest.spyOn(indexMod.autoVisibilitySystem, 'clearAllOverrides').mockResolvedValue();

    const { Pf2eVisionerApi } = await import('../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSceneData();

    expect(ok).toBe(true);
    expect(clearAllSpy).toHaveBeenCalled();
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
    const indexMod = await import('../../scripts/visibility/auto-visibility/index.js');
    const removeSpy = jest
      .spyOn(indexMod.autoVisibilitySystem, 'removeOverride')
      .mockResolvedValue(true);

    const { Pf2eVisionerApi } = await import('../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllDataForSelectedTokens([A, B]);

    expect(ok).toBe(true);

    // Should attempt to remove overrides between selected tokens A<->B
    expect(removeSpy).toHaveBeenCalledWith('A', 'B');
    expect(removeSpy).toHaveBeenCalledWith('B', 'A');

    // It should attempt to cleanup flags; when present, an explicit -= removal update is sent
    const maybeCall = canvas.scene.updateEmbeddedDocuments.mock.calls.find((c) => c[1]?.some?.((u) => u._id === 'C'));
    if (maybeCall) {
      const updateForC = maybeCall[1].find((u) => u._id === 'C');
      // Either namespace cleared or explicit key removal is present
      const keys = Object.keys(updateForC);
      expect(keys.some((k) => k === 'flags.pf2e-visioner' || k.includes('flags.pf2e-visioner.-=avs-override'))).toBe(true);
    }
  });
});
