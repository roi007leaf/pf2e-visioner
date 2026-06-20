import '../../setup.js';

import { clearDetectionFilterVisuals } from '../../../scripts/services/PendingMovement/pending-movement-detection-filter-visuals.js';

describe('clearDetectionFilterVisuals hidden-override guard', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
  });

  afterEach(() => {
    global.canvas = originalCanvas;
  });

  function makeTarget(overrideObserverId) {
    return {
      document: {
        id: 'target',
        flags: {
          'pf2e-visioner': {
            [`avs-override-from-${overrideObserverId}`]: {
              state: 'hidden',
              source: 'manual_action',
            },
          },
        },
      },
      detectionFilter: { id: 'soundwave-filter' },
      detectionFilterMesh: { visible: true, renderable: true, alpha: 1 },
    };
  }

  test('clears visuals when the hidden override belongs to a non-view observer', () => {
    const viewObserver = { document: { id: 'view-observer' }, id: 'view-observer' };
    global.canvas = {
      ...global.canvas,
      tokens: {
        ...global.canvas.tokens,
        _draggedToken: null,
        controlled: [viewObserver],
      },
    };
    const target = makeTarget('someone-else');

    clearDetectionFilterVisuals(target);

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toMatchObject({ visible: false, alpha: 0 });
  });

  test('keeps visuals when the hidden override belongs to a current-view observer', () => {
    const viewObserver = { document: { id: 'view-observer' }, id: 'view-observer' };
    global.canvas = {
      ...global.canvas,
      tokens: {
        ...global.canvas.tokens,
        _draggedToken: null,
        controlled: [viewObserver],
      },
    };
    const target = makeTarget('view-observer');

    clearDetectionFilterVisuals(target);

    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({ visible: true, alpha: 1 });
  });

  test('keeps visuals for any hidden override when no observer is selected', () => {
    global.canvas = {
      ...global.canvas,
      tokens: {
        ...global.canvas.tokens,
        _draggedToken: null,
        controlled: [],
      },
    };
    const target = makeTarget('someone-else');

    clearDetectionFilterVisuals(target);

    expect(target.detectionFilter).toEqual({ id: 'soundwave-filter' });
  });
});
