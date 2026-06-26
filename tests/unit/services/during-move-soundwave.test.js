import '../../setup.js';

let mockPendingPosition = null;
jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: () => false,
  getPendingTokenMovementPosition: () => mockPendingPosition,
}));

import {
  observerDestinationCenter,
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

  test('soundwave when observed target is out of every observer sight', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('observed'))).toBe(true);
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

describe('observerSightContainsTarget (drag uses live geometric LOS, not stale vision.los)', () => {
  const target = { center: { x: 500, y: 500 } };
  let savedCanvas;
  let savedConfig;

  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    savedConfig = globalThis.CONFIG;
  });
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    globalThis.CONFIG = savedConfig;
  });

  function setup({ previewCenter = null, sightBlocked = false } = {}) {
    const observer = { document: { id: 'obs' }, center: { x: 0, y: 0 }, vision: { los: { contains: () => false } } };
    const previews = previewCenter
      ? [{ _original: observer, document: { id: 'obs' }, center: previewCenter, vision: { los: { contains: () => false } } }]
      : [];
    globalThis.canvas = { tokens: { preview: { children: previews } } };
    globalThis.CONFIG = {
      Canvas: { polygonBackends: { sight: { testCollision: () => sightBlocked } } },
    };
    return observer;
  }

  test('committed move (no preview): falls back to the observer vision polygon', () => {
    const observer = setup({ previewCenter: null });
    observer.vision.los.contains = () => true;
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });

  test('drag: sees the target via geometric LOS from the live preview position even though the original vision.los is stale', () => {
    const observer = setup({ previewCenter: { x: 480, y: 480 }, sightBlocked: false });
    // original + preview vision.los both say false (stale), geometry says clear
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });

  test('drag: keeps the soundwave when geometry is wall-blocked from the live preview position', () => {
    const observer = setup({ previewCenter: { x: 480, y: 480 }, sightBlocked: true });
    expect(observerSightContainsTarget(observer, target)).toBe(false);
  });
});

describe('observerSightContainsTarget on commit uses the recorded destination (no reappear)', () => {
  let savedCanvas;
  let savedConfig;

  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    savedConfig = globalThis.CONFIG;
    mockPendingPosition = null;
  });
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    globalThis.CONFIG = savedConfig;
    mockPendingPosition = null;
  });

  test('observerDestinationCenter prefers the recorded pending destination', () => {
    globalThis.canvas = { grid: { size: 100 } };
    mockPendingPosition = { x: 1000, y: 2000 };
    const observer = { document: { id: 'o', width: 1, height: 1 }, center: { x: 0, y: 0 } };
    expect(observerDestinationCenter(observer)).toEqual({ x: 1050, y: 2050 });
  });

  test('observerDestinationCenter falls back to the live center with no pending move', () => {
    globalThis.canvas = { grid: { size: 100 } };
    mockPendingPosition = null;
    const observer = { document: { id: 'o', width: 1, height: 1 }, center: { x: 7, y: 9 } };
    expect(observerDestinationCenter(observer)).toEqual({ x: 7, y: 9 });
  });

  test('commit checks LOS from the destination, not the still-animating origin', () => {
    const destCenter = { x: 1050, y: 1050 };
    globalThis.canvas = { grid: { size: 100 }, tokens: { preview: { children: [] } } };
    mockPendingPosition = { x: 1000, y: 1000 };
    globalThis.CONFIG = {
      Canvas: {
        polygonBackends: {
          sight: {
            // blocked from everywhere except the destination center
            testCollision: (origin) => !(origin.x === destCenter.x && origin.y === destCenter.y),
          },
        },
      },
    };
    const observer = {
      document: { id: 'o', width: 1, height: 1 },
      center: { x: 0, y: 0 },
      vision: { los: { contains: () => false } },
    };
    const target = { center: { x: 1200, y: 1200 } };
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });
});
