import '../../setup.js';

import { createPendingMovementDetectionFilterRenderingController } from '../../../scripts/services/PendingMovement/pending-movement-detection-filter-rendering.js';

function createController(overrides = {}) {
  return createPendingMovementDetectionFilterRenderingController({
    getHiddenDetectionFilterPreservationContext: () => ({ observerId: 'observer' }),
    tokenHasDetectionFilterVisual: (token) => !!token?.detectionFilter,
    ...overrides,
  });
}

function createTintedToken({ tint = 0x111111 } = {}) {
  const writes = [];
  const mesh = {};
  let currentTint = tint;
  Object.defineProperty(mesh, 'tint', {
    configurable: true,
    enumerable: true,
    get() {
      return currentTint;
    },
    set(next) {
      writes.push(next);
      currentTint = next;
    },
  });

  return {
    detectionFilter: { id: 'soundwave-filter' },
    document: { id: 'target' },
    mesh,
    writes,
  };
}

describe('pending movement detection filter rendering', () => {
  test('does not prime soundwave mesh for a pair with no live soundwave eligibility', () => {
    const controller = createController({
      shouldAllowSoundwaveMeshPriming: () => false,
      tokenHasDetectionFilterMeshVisual: () => false,
    });
    const token = {
      document: { id: 'target' },
      detectionFilter: null,
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    };

    expect(controller.shouldPrimePendingMovementDetectionFilterVisuals(token)).toBe(false);
    expect(controller.primePendingMovementDetectionFilterVisuals(token)).toBe(false);
    expect(token.detectionFilterMesh.visible).toBe(false);
  });

  test('still primes soundwave mesh for blocking-state or qualifying pairs', () => {
    const controller = createController({
      shouldAllowSoundwaveMeshPriming: () => true,
      tokenHasDetectionFilterMeshVisual: () => false,
    });
    const token = {
      document: { id: 'target' },
      detectionFilter: null,
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    };

    expect(controller.shouldPrimePendingMovementDetectionFilterVisuals(token)).toBe(true);
    expect(controller.primePendingMovementDetectionFilterVisuals(token)).toBe(true);
    expect(token.detectionFilterMesh.visible).toBe(true);
  });

  test('does not let core detection-filter render pulse hidden token tint white', () => {
    const controller = createController();
    const token = createTintedToken({ tint: 0 });

    let tintDuringCoreRender = null;
    controller.withStableHiddenDetectionFilterAnimation(token, () => {
      token.mesh.tint = 0xffffff;
      tintDuringCoreRender = token.mesh.tint;
      token.mesh.tint = 0;
    });

    expect(controller.shouldStabilizeHiddenDetectionFilterAnimation(token)).toBe(true);
    expect(tintDuringCoreRender).toBe(0);
    expect(token.mesh.tint).toBe(0);
    expect(token.writes).not.toContain(0xffffff);
  });

  test('allows real non-core tint changes while stabilizing hidden detection-filter render', () => {
    const controller = createController();
    const token = createTintedToken({ tint: 0 });

    controller.withStableHiddenDetectionFilterAnimation(token, () => {
      token.mesh.tint = 0x222222;
    });

    expect(token.mesh.tint).toBe(0x222222);
    expect(token.writes).toEqual([0x222222]);
  });

  test('can force-stabilize core tint pulse for render-hidden branch', () => {
    const controller = createController({
      getHiddenDetectionFilterPreservationContext: () => null,
    });
    const token = createTintedToken({ tint: 0 });

    controller.withStableHiddenDetectionFilterAnimation(
      token,
      () => {
        token.mesh.tint = 0xffffff;
      },
      { force: true },
    );

    expect(token.mesh.tint).toBe(0);
    expect(token.writes).not.toContain(0xffffff);
  });

  test('leaves core detection-filter tint behavior alone without hidden preservation context', () => {
    const controller = createController({
      getHiddenDetectionFilterPreservationContext: () => null,
    });
    const token = createTintedToken({ tint: 0 });

    controller.withStableHiddenDetectionFilterAnimation(token, () => {
      token.mesh.tint = 0xffffff;
    });

    expect(controller.shouldStabilizeHiddenDetectionFilterAnimation(token)).toBe(false);
    expect(token.mesh.tint).toBe(0xffffff);
    expect(token.writes).toEqual([0xffffff]);
  });
});
