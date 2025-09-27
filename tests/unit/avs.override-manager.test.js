/**
 * @jest-environment jsdom
 */

import '../setup.js';

describe('AvsOverrideManager (AVS overrides lifecycle)', () => {
  function mkToken(id, name = id) {
    return {
      id,
      name,
      actor: {},
      document: {
        id,
        name,
        setFlag: jest.fn().mockResolvedValue(true),
        getFlag: jest.fn(),
        unsetFlag: jest.fn().mockResolvedValue(true),
        flags: { 'pf2e-visioner': {} },
      },
    };
  }

  beforeEach(() => {
    jest.resetModules();
    ui.notifications.info.mockClear();
    ui.notifications.warn.mockClear();
    ui.notifications.error.mockClear();
    Hooks.call.mockClear();

    // Reset canvas tokens registry
    canvas.tokens.placeables = [];
    canvas.tokens.get.mockReset();
  });

  test('applyOverrides creates one way overrides (non-sneak)', async () => {
    const A = mkToken('A', 'Observer');
    const B = mkToken('B', 'Target');

    canvas.tokens.get.mockImplementation((id) => ({ A, B }[id] || null));

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyOverrides(
      A,
      [{ target: B, state: 'hidden' }],
      { source: 'manual_action' },
    );

    expect(ok).toBe(true);

    // Flags stored on each target for each direction
    expect(B.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-A',
      expect.objectContaining({ observerId: 'A', targetId: 'B', state: 'hidden' }),
    );

    // Visibility applied both ways
    expect(mockedSetVisibility).toHaveBeenCalledWith(
      A,
      B,
      'hidden',
      expect.objectContaining({ isAutomatic: true, source: 'avs_override' }),
    );

    // Hook fired for each direction
    expect(Hooks.call).toHaveBeenCalledWith(
      'pf2e-visioner.visibilityChanged',
      'A',
      'B',
      'hidden',
    );
  });

  test('applyOverrides creates one-way for hide_action', async () => {
    const A = mkToken('A', 'Observer');
    const B = mkToken('B', 'Target');

    canvas.tokens.get.mockImplementation((id) => ({ A, B }[id] || null));

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyOverrides(
      A,
      [{ target: B, state: 'hidden' }],
      { source: 'hide_action' },
    );

    expect(ok).toBe(true);

    // Only one direction flag
    expect(B.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-A',
      expect.objectContaining({ observerId: 'A', targetId: 'B', state: 'hidden' }),
    );
    expect(A.document.setFlag).not.toHaveBeenCalled();

    // Only one visibility application (A -> B)
    expect(mockedSetVisibility).toHaveBeenCalledTimes(1);
    expect(mockedSetVisibility).toHaveBeenCalledWith(
      A,
      B,
      'hidden',
      expect.objectContaining({ isAutomatic: true, source: 'avs_override' }),
    );
  });

  test('applyOverrides creates one-way for diversion_action', async () => {
    const A = mkToken('A', 'Observer');
    const B = mkToken('B', 'Target');

    canvas.tokens.get.mockImplementation((id) => ({ A, B }[id] || null));

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyOverrides(
      A,
      [{ target: B, state: 'hidden' }],
      { source: 'diversion_action' },
    );

    expect(ok).toBe(true);
    expect(B.document.setFlag).toHaveBeenCalledTimes(1);
    expect(A.document.setFlag).not.toHaveBeenCalled();
    expect(mockedSetVisibility).toHaveBeenCalledTimes(1);
  });

  test('applyOverrides creates one-way for seek_action', async () => {
    const A = mkToken('A', 'Seeker');
    const B = mkToken('B', 'Target');

    canvas.tokens.get.mockImplementation((id) => ({ A, B }[id] || null));

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyOverrides(
      A,
      [{ target: B, state: 'observed' }],
      { source: 'seek_action' },
    );

    expect(ok).toBe(true);
    expect(B.document.setFlag).toHaveBeenCalledTimes(1);
    expect(A.document.setFlag).not.toHaveBeenCalled();
    expect(mockedSetVisibility).toHaveBeenCalledTimes(1);
  });

  test('applyOverrides creates one-way for point_out_action', async () => {
    const Ally = mkToken('Ally', 'Pointer');
    const Target = mkToken('Target', 'Pointed');

    canvas.tokens.get.mockImplementation((id) => ({ Ally, Target }[id] || null));

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyOverrides(
      Ally,
      [{ target: Target, state: 'hidden' }],
      { source: 'point_out_action' },
    );

    expect(ok).toBe(true);
    expect(Target.document.setFlag).toHaveBeenCalledTimes(1);
    expect(Ally.document.setFlag).not.toHaveBeenCalled();
    expect(mockedSetVisibility).toHaveBeenCalledTimes(1);
  });

  test('applyForSneak enforces one-way overrides', async () => {
    const A = mkToken('A', 'Observer');
    const B = mkToken('B', 'SneakingTarget');

    let AvsOverrideManager, mockedSetVisibility;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../scripts/utils.js', () => ({
        __esModule: true,
        setVisibilityBetween: jest.fn().mockResolvedValue(true),
      }));
      AvsOverrideManager = (await import('../../scripts/chat/services/infra/avs-override-manager.js')).default;
      mockedSetVisibility = (await import('../../scripts/utils.js')).setVisibilityBetween;
    });

    const ok = await AvsOverrideManager.applyForSneak(A, { target: B, state: 'hidden' });
    expect(ok).toBe(true);

    // Only B (target) gets a flag from A (observer)
    expect(B.document.setFlag).toHaveBeenCalledTimes(1);
    expect(B.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-A',
      expect.objectContaining({ observerId: 'A', targetId: 'B', state: 'hidden' }),
    );
    expect(A.document.setFlag).not.toHaveBeenCalled();

    // Only one visibility application (A -> B)
    expect(mockedSetVisibility).toHaveBeenCalledTimes(1);
    expect(mockedSetVisibility).toHaveBeenCalledWith(
      A,
      B,
      'hidden',
      expect.objectContaining({ isAutomatic: true, source: 'avs_override' }),
    );
  });

  test('removeOverride unsets flag on target and returns true', async () => {
    // Observer id is used as a string; we only need the target token mocked here
    const B = mkToken('B');
    // B holds a flag indicating override from A
    B.document.getFlag.mockImplementation((mod, key) => mod === 'pf2e-visioner' && key === 'avs-override-from-A' ? { some: 'data' } : undefined);
    canvas.tokens.get.mockImplementation((id) => (id === 'B' ? B : null));

    const { default: AvsOverrideManager } = await import(
      '../../scripts/chat/services/infra/avs-override-manager.js'
    );

    const result = await AvsOverrideManager.removeOverride('A', 'B');
    expect(result).toBe(true);
    expect(B.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'avs-override-from-A');
  });

  test('removeOverride returns false when target missing or flag absent', async () => {
    const { default: AvsOverrideManager } = await import(
      '../../scripts/chat/services/infra/avs-override-manager.js'
    );

    canvas.tokens.get.mockReturnValue(null);
    await expect(AvsOverrideManager.removeOverride('X', 'Y')).resolves.toBe(false);

    // Target exists but flag missing
    const T = mkToken('T');
    T.document.getFlag.mockReturnValue(undefined);
    canvas.tokens.get.mockImplementation(() => T);
    await expect(AvsOverrideManager.removeOverride('O', 'T')).resolves.toBe(false);
  });

  test('clearAllOverrides removes all avs-override-from-* flags from all tokens', async () => {
    const T1 = mkToken('T1');
    const T2 = mkToken('T2');
    // T1 has two flags, one relevant and one unrelated
    T1.document.flags['pf2e-visioner'] = {
      'avs-override-from-X': { any: 'value' },
      'unrelated-flag': true,
    };
    // T2 has one relevant flag
    T2.document.flags['pf2e-visioner'] = {
      'avs-override-from-Y': { any: 'value' },
    };

    canvas.tokens.placeables = [T1, T2];

    const { default: AvsOverrideManager } = await import(
      '../../scripts/chat/services/infra/avs-override-manager.js'
    );

    await AvsOverrideManager.clearAllOverrides();

    expect(T1.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-X',
    );
    expect(T1.document.unsetFlag).not.toHaveBeenCalledWith(
      'pf2e-visioner',
      'unrelated-flag',
    );
    expect(T2.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-Y',
    );
  });
});
