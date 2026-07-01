import { jest } from '@jest/globals';
import '../../setup.js';

import {
  observerSightContainsTarget,
  setSoundwaveMeshVisible,
  targetShouldShowSoundwave,
} from '../../../scripts/services/during-move-soundwave.js';

function observer(seesTarget) {
  return { vision: { los: { contains: () => seesTarget } } };
}
const target = { center: { x: 100, y: 100 } };
const getVisibility = (vis) => () => vis;

describe('targetShouldShowSoundwave (during-move live decision)', () => {
  test('no soundwave when an observer sees the target (in sight)', () => {
    expect(targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'))).toBe(false);
  });

  test('no soundwave for an observed target out of sight (precisely sensed, e.g. echolocation — a ring is imprecise-only)', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('observed'))).toBe(false);
  });

  test('no soundwave for a concealed target out of sight (concealed is a seen state, not imprecise)', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('concealed'))).toBe(false);
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
  });
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    jest.resetModules();
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
