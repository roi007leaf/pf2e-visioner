import '../../setup.js';

import {
  clearPendingTokenMovementPosition,
  setPendingTokenMovementPosition,
} from '../../../scripts/services/PendingMovement/pending-token-movement.js';
import { wrapCanvasPerceptionUpdate } from '../../../scripts/services/Detection/detection-perception-update.js';

describe('detection perception update wrapper', () => {
  let originalCanvas;
  let performanceNowSpy;
  let now;

  beforeEach(() => {
    originalCanvas = global.canvas;
    now = 100000;
    performanceNowSpy = jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
    global.canvas = originalCanvas;
    performanceNowSpy.mockRestore();
  });

  test('throttles repeated vision perception updates during pending movement', () => {
    const observer = createMockToken({ id: 'observer' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
    };
    const wrapped = jest.fn();

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    wrapCanvasPerceptionUpdate(wrapped, { refreshVision: true, refreshLighting: true });
    now += 30;
    wrapCanvasPerceptionUpdate(wrapped, { refreshVision: true, refreshLighting: true });
    now += 50;
    wrapCanvasPerceptionUpdate(wrapped, { refreshVision: true, refreshLighting: true });

    expect(wrapped).toHaveBeenCalledTimes(2);
  });

  test('does not throttle perception initialization during pending movement', () => {
    const observer = createMockToken({ id: 'observer' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : null)),
        controlled: [observer],
        placeables: [observer],
      },
    };
    const wrapped = jest.fn();

    setPendingTokenMovementPosition(observer.document, { x: 100, y: 0 }, [observer]);

    wrapCanvasPerceptionUpdate(wrapped, { initializeVision: true, refreshVision: true });
    now = 10;
    wrapCanvasPerceptionUpdate(wrapped, { initializeVision: true, refreshVision: true });

    expect(wrapped).toHaveBeenCalledTimes(2);
  });
});
