import { jest } from '@jest/globals';
import '../../setup.js';

import {
  clearDuringMoveSoundwaveState,
  installSoundwaveFilterOverride,
  observerSightContainsTarget,
  removeSoundwaveFilterOverride,
  setSoundwaveMeshVisible,
  settleSoundwaveOverrides,
  targetShouldShowSoundwave,
} from '../../../scripts/services/during-move-soundwave.js';

function observer(seesTarget) {
  return { vision: { los: { contains: () => seesTarget } } };
}
const target = { center: { x: 100, y: 100 } };
const getVisibility = (vis) => () => vis;
const notSensed = () => false;
const sensed = () => true;

describe('targetShouldShowSoundwave (during-move live decision)', () => {
  test('no soundwave when an observer sees the target (in sight)', () => {
    expect(targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'))).toBe(false);
  });

  test('no soundwave for an observed target out of sight when precisely sensed (echolocation — a ring is imprecise-only)', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false)], getVisibility('observed'), undefined, notSensed),
    ).toBe(false);
  });

  test('no soundwave for a concealed target out of sight when precisely sensed (echolocation — a ring is imprecise-only)', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false)], getVisibility('concealed'), undefined, notSensed),
    ).toBe(false);
  });

  test('soundwave for an observed target whose sight is lost mid-move but is still sensed imprecisely (heard)', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false)], getVisibility('observed'), undefined, sensed),
    ).toBe(true);
  });

  test('soundwave for a concealed target whose sight is lost mid-move but is still sensed imprecisely (heard)', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false)], getVisibility('concealed'), undefined, sensed),
    ).toBe(true);
  });

  test('still no soundwave for an in-sight observed target even when imprecisely sensed (sight wins)', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'), undefined, sensed),
    ).toBe(false);
  });

  test('soundwave for a stored-hidden target out of sight', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('hidden'))).toBe(true);
  });

  test('no soundwave for undetected target (not sensed)', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('undetected'))).toBe(false);
  });

  test('multi-observer: any observer that sees it suppresses the soundwave', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false), observer(true)], getVisibility('observed')),
    ).toBe(false);
  });

  test('no soundwave with no observers', () => {
    expect(targetShouldShowSoundwave(target, [], getVisibility('observed'))).toBe(false);
  });

  test('AVS hidden override is sticky: soundwave even when the target is in sight', () => {
    const overrideHidden = () => true;
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'), overrideHidden),
    ).toBe(true);
  });

  test('no override: in-sight target shows no soundwave', () => {
    const noOverride = () => false;
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('hidden'), noOverride),
    ).toBe(false);
  });
});

describe('tokenVision disabled (theater of mind: global sight, no move-time soundwaves)', () => {
  let savedCanvas;
  afterEach(() => {
    globalThis.canvas = savedCanvas;
  });
  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    globalThis.canvas = { scene: { tokenVision: false }, tokens: { preview: { children: [] } } };
  });

  test('observerSightContainsTarget is true when scene token vision is disabled (no los polygon)', () => {
    expect(observerSightContainsTarget({ vision: null }, target)).toBe(true);
  });

  test('no soundwave for observed target when token vision disabled', () => {
    expect(
      targetShouldShowSoundwave(target, [{ vision: null }], getVisibility('observed')),
    ).toBe(false);
  });

  test('AVS hidden override still shows soundwave even with token vision disabled', () => {
    const overrideHidden = () => true;
    expect(
      targetShouldShowSoundwave(target, [{ vision: null }], getVisibility('observed'), overrideHidden),
    ).toBe(true);
  });
});

describe('setSoundwaveMeshVisible (live ring clear on LOS)', () => {
  function makeTarget() {
    return { detectionFilterMesh: { visible: true, renderable: true, alpha: 1 } };
  }

  test('hides the soundwave mesh when the observer gains sight (clears mid-move)', () => {
    const t = makeTarget();
    setSoundwaveMeshVisible(t, false);
    expect(t.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('shows the soundwave mesh when the target is sensed out of sight', () => {
    const t = { detectionFilterMesh: { visible: false, renderable: false, alpha: 0 } };
    setSoundwaveMeshVisible(t, true);
    expect(t.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  test('no-ops safely when the target has no detection filter mesh', () => {
    expect(() => setSoundwaveMeshVisible({}, false)).not.toThrow();
    expect(() => setSoundwaveMeshVisible(null, true)).not.toThrow();
  });
});

describe('soundwave detectionFilter override (renders the ripple through Foundry per-frame reset)', () => {
  const mockFilter = { id: 'soundwave-filter' };
  let savedConfig;
  beforeEach(() => {
    savedConfig = globalThis.CONFIG;
    globalThis.CONFIG = {
      Canvas: { detectionModes: { hearing: { constructor: { getDetectionFilter: () => mockFilter } } } },
    };
  });
  afterEach(() => {
    clearDuringMoveSoundwaveState();
    globalThis.CONFIG = savedConfig;
  });

  test('installs an accessor whose getter returns the soundwave filter and absorbs null writes', () => {
    const t = { document: { id: 'a' }, detectionFilter: null };
    expect(installSoundwaveFilterOverride(t)).toBe(true);
    expect(t.detectionFilter).toBe(mockFilter);
    t.detectionFilter = null; // Foundry's per-frame reset
    expect(t.detectionFilter).toBe(mockFilter); // still renders the ripple
  });

  test("getter prefers Foundry's own filter when one is set (genuinely-hidden target keeps its filter)", () => {
    const t = { document: { id: 'b' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    const foundryFilter = { id: 'foundry-hearing' };
    t.detectionFilter = foundryFilter;
    expect(t.detectionFilter).toBe(foundryFilter);
  });

  test('is idempotent - installing twice does not double-wrap', () => {
    const t = { document: { id: 'c' }, detectionFilter: null };
    expect(installSoundwaveFilterOverride(t)).toBe(true);
    expect(installSoundwaveFilterOverride(t)).toBe(false);
  });

  test('remove restores a plain data property carrying Foundry\'s last value', () => {
    const t = { document: { id: 'd' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    const foundryFilter = { id: 'foundry-hearing' };
    t.detectionFilter = foundryFilter;
    removeSoundwaveFilterOverride(t);
    expect(Object.getOwnPropertyDescriptor(t, 'detectionFilter').get).toBeUndefined();
    expect(t.detectionFilter).toBe(foundryFilter);
  });

  test('remove restores null for a frozen-observed target (Foundry never set a real filter)', () => {
    const t = { document: { id: 'e' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    t.detectionFilter = null;
    removeSoundwaveFilterOverride(t);
    expect(Object.getOwnPropertyDescriptor(t, 'detectionFilter').get).toBeUndefined();
    expect(t.detectionFilter).toBeNull();
  });

  test('clearDuringMoveSoundwaveState removes every override', () => {
    const t1 = { document: { id: 'f1' }, detectionFilter: null };
    const t2 = { document: { id: 'f2' }, detectionFilter: null };
    installSoundwaveFilterOverride(t1);
    installSoundwaveFilterOverride(t2);
    clearDuringMoveSoundwaveState();
    expect(Object.getOwnPropertyDescriptor(t1, 'detectionFilter')?.get).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(t2, 'detectionFilter')?.get).toBeUndefined();
  });

  test('no-ops for a target without a document id', () => {
    expect(installSoundwaveFilterOverride({})).toBe(false);
    expect(removeSoundwaveFilterOverride({})).toBe(false);
  });
});

describe('settleSoundwaveOverrides (post-move handoff without an observed flash)', () => {
  const mockFilter = { id: 'soundwave-filter' };
  let savedConfig, savedCanvas;
  beforeEach(() => {
    savedConfig = globalThis.CONFIG;
    savedCanvas = globalThis.canvas;
    globalThis.CONFIG = {
      Canvas: { detectionModes: { hearing: { constructor: { getDetectionFilter: () => mockFilter } } } },
    };
  });
  afterEach(() => {
    clearDuringMoveSoundwaveState();
    globalThis.CONFIG = savedConfig;
    globalThis.canvas = savedCanvas;
  });

  function overriddenTarget(id) {
    const t = { document: { id }, center: { x: 0, y: 0 }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    return t;
  }
  const isOverridden = (t) => !!Object.getOwnPropertyDescriptor(t, 'detectionFilter')?.get;

  test("hands off once Foundry's own recompute has produced a filter (persisted settled to hidden)", () => {
    const t = overriddenTarget('h1');
    t.detectionFilter = { id: 'foundry-hearing' }; // Foundry settled a real filter
    globalThis.canvas = { tokens: { controlled: [], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(false);
    expect(t.detectionFilter).toEqual({ id: 'foundry-hearing' }); // ripple continues, no flash
  });

  test('keeps the ripple while the target is still out of sight and Foundry has not caught up', () => {
    const t = overriddenTarget('h2');
    const observer = { document: { id: 'o' }, vision: { los: { contains: () => false } } };
    globalThis.canvas = { tokens: { controlled: [observer], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(true); // held so there is no observed flash
    expect(t.detectionFilter).toEqual(mockFilter);
  });

  test('drops the override once the target is back in an observer sight', () => {
    const t = overriddenTarget('h3');
    const observer = { document: { id: 'o' }, vision: { los: { contains: () => true } } };
    globalThis.canvas = { tokens: { controlled: [observer], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(false);
    expect(t.detectionFilter).toBeNull();
  });
});

describe('observerSightContainsTarget (live vision polygon contains the target center)', () => {
  const target = { center: { x: 500, y: 500 } };
  let savedCanvas;
  afterEach(() => {
    globalThis.canvas = savedCanvas;
  });
  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    globalThis.canvas = { tokens: { preview: { children: [] } } };
  });

  test('true when the observer vision polygon contains the target center', () => {
    const observer = { vision: { los: { contains: () => true } } };
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });

  test('false when the observer vision polygon does not contain the target center', () => {
    const observer = { vision: { los: { contains: () => false } } };
    expect(observerSightContainsTarget(observer, target)).toBe(false);
  });

  test('prefers the drag preview vision polygon when one exists', () => {
    const observer = { document: { id: 'obs' }, vision: { los: { contains: () => false } } };
    globalThis.canvas = {
      tokens: {
        preview: {
          children: [
            { _original: observer, document: { id: 'obs' }, vision: { los: { contains: () => true } } },
          ],
        },
      },
    };
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });
});

describe('refreshSoundwavesForActiveMovement (only mutates during a committed move)', () => {
  let savedCanvas;
  let nowSpy;
  let mockNow;

  async function loadWith({ pendingMovement, gmVisionBypass = false }) {
    let mod;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
        hasActivePendingTokenMovement: () => pendingMovement,
      }));
      jest.doMock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
        currentViewObservers: () => [{ document: { id: 'obs' }, vision: { los: { contains: () => false } } }],
        targetIsHardHiddenFromCurrentView: () => false,
      }));
      jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
        getVisionerVisibilityBetweenTokens: () => 'hidden',
      }));
      jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
        shouldBypassAvsForGmVision: () => gmVisionBypass,
      }));
      mod = await import('../../../scripts/services/during-move-soundwave.js');
    });
    return mod;
  }

  function makeTarget() {
    return {
      controlled: false,
      center: { x: 100, y: 100 },
      detectionFilter: 'PRE-EXISTING',
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't' },
    };
  }

  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    mockNow = 0;
    nowSpy = jest.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      mockNow += 10000;
      return mockNow;
    });
  });
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    jest.resetModules();
    nowSpy.mockRestore();
  });

  test('leaves soundwaves frozen while only hold-dragging (no pending movement)', async () => {
    const target = makeTarget();
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: false });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBe('PRE-EXISTING');
    expect(target.detectionFilterMesh.visible).toBe(false);
  });

  test('updates soundwaves during a committed move (pending movement active)', async () => {
    const target = makeTarget();
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilterMesh.visible).toBe(true);
  });

  test('GM vision bypass paints no soundwaves and clears existing ones during move', async () => {
    const target = makeTarget();
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, gmVisionBypass: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });
});

describe('ensureDuringMoveSoundwaveRefresh (avsOnlyInCombat gate)', () => {
  async function loadWith({ avsActiveGivenCombatGate }) {
    let mod;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
        hasActivePendingTokenMovement: () => false,
      }));
      jest.doMock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
        currentViewObservers: () => [],
        targetIsHardHiddenFromCurrentView: () => false,
      }));
      jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
        getVisionerVisibilityBetweenTokens: () => 'observed',
        isAvsActiveGivenCombatGate: () => avsActiveGivenCombatGate,
      }));
      jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
        shouldBypassAvsForGmVision: () => false,
      }));
      mod = await import('../../../scripts/services/during-move-soundwave.js');
    });
    return mod;
  }

  afterEach(() => {
    jest.resetModules();
  });

  test('does not start the soundwave render loop when out of the combat gate', async () => {
    const raf = jest.fn();
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf;

    const mod = await loadWith({ avsActiveGivenCombatGate: false });
    mod.ensureDuringMoveSoundwaveRefresh();

    expect(raf).not.toHaveBeenCalled();
    globalThis.requestAnimationFrame = savedRaf;
  });

  test('starts the soundwave render loop when the combat gate is active', async () => {
    const raf = jest.fn();
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf;

    const mod = await loadWith({ avsActiveGivenCombatGate: true });
    mod.ensureDuringMoveSoundwaveRefresh();

    expect(raf).toHaveBeenCalledTimes(1);
    globalThis.requestAnimationFrame = savedRaf;
  });
});
