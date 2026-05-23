import '../../setup.js';

import { createPendingMovementFinalVisibilityController } from '../../../scripts/services/PendingMovement/pending-movement-final-visibility.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: Object.fromEntries(
        Object.entries(map).map(([targetId, state]) => [targetId, legacyVisibilityToProfile(state)]),
      ),
    },
  };
}

describe('pending movement final visibility prediction', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.canvas = {
      ...global.canvas,
      grid: { size: 50 },
      scene: { grid: { distance: 5 } },
      walls: { placeables: [] },
    };
  });

  afterEach(() => {
    global.canvas = originalCanvas;
  });

  test('cheaply predicts observed targets become hidden when final LOS is blocked but sound remains open', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 6, y: 0 });
    observer.document.object = observer;
    target.document.object = target;

    const controller = createPendingMovementFinalVisibilityController({
      getPlaceableTokens: () => [observer, target],
      getStoredVisibilityState: (source, candidate) =>
        source?.id === 'observer' && candidate?.id === 'target' ? 'observed' : 'observed',
      hasLineOfSightToSampledToken: () => false,
    });

    const prediction = controller.predictCheapFinalVisibilityStates(observer.document, {
      x: 100,
      y: 0,
    });

    expect(prediction.finalVisibilityStatesByTargetId.get('target')).toBe('hidden');
  });

  test('cheaply predicts observed targets become undetected when final LOS and sound are blocked', () => {
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target', x: 6, y: 0 });
    observer.document.object = observer;
    target.document.object = target;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'sound-wall',
          c: [180, -100, 180, 100],
          sight: 1,
          sound: 20,
          door: 0,
          ds: 0,
        },
      },
    ];

    const controller = createPendingMovementFinalVisibilityController({
      getPlaceableTokens: () => [observer, target],
      getStoredVisibilityState: (source, candidate) =>
        source?.id === 'observer' && candidate?.id === 'target' ? 'observed' : 'observed',
      hasLineOfSightToSampledToken: () => false,
    });

    const prediction = controller.predictCheapFinalVisibilityStates(observer.document, {
      x: 100,
      y: 0,
    });

    expect(prediction.finalVisibilityStatesByTargetId.get('target')).toBe('undetected');
  });
});
