/**
 * @jest-environment jsdom
 */

import '../setup.js';

describe('api.clearAllSneakFlags', () => {
  beforeEach(() => {
    jest.resetModules();
    // Reset notifications and scene/token mocks per test
    ui.notifications.info.mockClear();
    ui.notifications.warn.mockClear();
    ui.notifications.error.mockClear();

    // Reset canvas tokens/scene
    canvas.tokens.placeables = [];
    canvas.tokens.get.mockReset();
    canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue(true);
  });

  test('blocks non-GM users', async () => {
    game.user.isGM = false;
    const { Pf2eVisionerApi } = await import('../../scripts/api.js');

    const result = await Pf2eVisionerApi.clearAllSneakFlags();

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith('Only GMs can clear sneak flags');
    expect(canvas.scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('warns when no active scene', async () => {
    game.user.isGM = true;
  const origScene = canvas.scene;
  // Temporarily remove scene
  canvas.scene = null;

    const { Pf2eVisionerApi } = await import('../../scripts/api.js');
    const result = await Pf2eVisionerApi.clearAllSneakFlags();

    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith('No active scene.');

  // restore
  canvas.scene = origScene;
  });

  test('clears sneak-active flags and reports count', async () => {
    game.user.isGM = true;

    // Build 3 tokens, 2 with flag set
    const t1 = {
      id: 't1',
      name: 'One',
      document: {
        getFlag: jest.fn((mod, key) => (mod === 'pf2e-visioner' && key === 'sneak-active' ? true : undefined)),
      },
    };
    const t2 = {
      id: 't2',
      name: 'Two',
      document: {
        getFlag: jest.fn(() => false),
      },
    };
    const t3 = {
      id: 't3',
      name: 'Three',
      document: {
        getFlag: jest.fn((mod, key) => (mod === 'pf2e-visioner' && key === 'sneak-active' ? true : undefined)),
      },
    };

    canvas.tokens.placeables = [t1, t2, t3];

    const { Pf2eVisionerApi } = await import('../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSneakFlags();

    expect(ok).toBe(true);
    expect(canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      expect.arrayContaining([
        { _id: 't1', 'flags.pf2e-visioner.-=sneak-active': null },
        { _id: 't3', 'flags.pf2e-visioner.-=sneak-active': null },
      ]),
      { diff: false },
    );
    expect(ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining('Cleared sneak flags from 2 token(s).'),
    );
  });

  test('no updates when no tokens have flag', async () => {
    game.user.isGM = true;
    const t1 = { id: 't1', name: 'One', document: { getFlag: jest.fn(() => false) } };
    canvas.tokens.placeables = [t1];

    const { Pf2eVisionerApi } = await import('../../scripts/api.js');
    const ok = await Pf2eVisionerApi.clearAllSneakFlags();

    expect(ok).toBe(true);
    expect(canvas.scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith(
      'PF2E Visioner: No sneak flags found to clear.',
    );
  });
});
