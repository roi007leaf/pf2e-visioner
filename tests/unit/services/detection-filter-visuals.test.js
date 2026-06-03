import '../../setup.js';

import {
  capturePendingMovementDetectionFilterVisualState,
  restorePendingMovementDetectionFilterVisualState,
} from '../../../scripts/services/PendingMovement/pending-movement-detection-filter-visuals.js';

describe('detection filter visual state helpers', () => {
  test('does not rewrite unchanged detection filter during visual restore', () => {
    const filter = { id: 'soundwave-filter' };
    const token = {};
    let currentFilter = filter;
    const writes = [];
    Object.defineProperty(token, 'detectionFilter', {
      configurable: true,
      get() {
        return currentFilter;
      },
      set(value) {
        writes.push(value);
        currentFilter = value;
      },
    });

    const state = capturePendingMovementDetectionFilterVisualState(token);

    expect(restorePendingMovementDetectionFilterVisualState(token, state)).toBe(true);
    expect(writes).toHaveLength(0);
    expect(token.detectionFilter).toBe(filter);
  });
});
