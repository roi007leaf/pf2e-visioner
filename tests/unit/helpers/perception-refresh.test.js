import '../../setup.js';

import {
  clearScheduledCanvasPerceptionUpdate,
  sanitizePerceptionUpdateFlags,
  scheduleCanvasPerceptionUpdate,
  updateCanvasPerception,
} from '../../../scripts/helpers/perception-refresh.js';

describe('perception-refresh helper', () => {
  beforeEach(() => {
    global.canvas.perception = { update: jest.fn() };
  });

  afterEach(() => {
    clearScheduledCanvasPerceptionUpdate();
    jest.useRealTimers();
  });

  test('drops obsolete refreshTiles flag when supported flags are unavailable', () => {
    const result = sanitizePerceptionUpdateFlags({
      refreshVision: true,
      refreshOcclusion: true,
      refreshTiles: true,
    });

    expect(result).toEqual({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('filters against supported render flags when available', () => {
    global.canvas.perception = {
      update: jest.fn(),
      constructor: {
        RENDER_FLAGS: {
          refreshVision: {},
          refreshOcclusion: {},
          refreshSounds: {},
        },
      },
    };

    updateCanvasPerception({
      refreshVision: true,
      refreshOcclusion: true,
      refreshTiles: true,
    });

    expect(global.canvas.perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('merges scheduled perception refresh intents into one canvas update', () => {
    jest.useFakeTimers();

    scheduleCanvasPerceptionUpdate({ refreshVision: true });
    scheduleCanvasPerceptionUpdate({ refreshOcclusion: true });

    expect(global.canvas.perception.update).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();

    expect(global.canvas.perception.update).toHaveBeenCalledTimes(1);
    expect(global.canvas.perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
  });

  test('scheduled perception refresh sanitizes merged flags once', () => {
    jest.useFakeTimers();
    global.canvas.perception = {
      update: jest.fn(),
      constructor: {
        RENDER_FLAGS: {
          refreshVision: {},
          refreshLighting: {},
        },
      },
    };

    scheduleCanvasPerceptionUpdate({ refreshVision: true, refreshTiles: true });
    scheduleCanvasPerceptionUpdate({ refreshLighting: true, refreshOcclusion: true });
    jest.runOnlyPendingTimers();

    expect(global.canvas.perception.update).toHaveBeenCalledTimes(1);
    expect(global.canvas.perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshLighting: true,
    });
  });

  test('scheduled perception refresh can target an injected perception adapter', () => {
    jest.useFakeTimers();
    const perception = {
      update: jest.fn(),
      constructor: {
        RENDER_FLAGS: {
          refreshVision: {},
        },
      },
    };

    scheduleCanvasPerceptionUpdate(
      { refreshVision: true, refreshOcclusion: true },
      { perception },
    );
    jest.runOnlyPendingTimers();

    expect(perception.update).toHaveBeenCalledTimes(1);
    expect(perception.update).toHaveBeenCalledWith({ refreshVision: true });
    expect(global.canvas.perception.update).not.toHaveBeenCalled();
  });

  test('switching scheduled perception adapter clears the old timer', () => {
    jest.useFakeTimers();
    const firstPerception = {
      update: jest.fn(),
    };
    const secondPerception = {
      update: jest.fn(),
    };

    scheduleCanvasPerceptionUpdate(
      { refreshVision: true },
      { perception: firstPerception, delayMs: 100 },
    );

    jest.advanceTimersByTime(50);

    scheduleCanvasPerceptionUpdate(
      { refreshLighting: true },
      { perception: secondPerception, delayMs: 100 },
    );

    expect(firstPerception.update).toHaveBeenCalledWith({ refreshVision: true });
    expect(secondPerception.update).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(secondPerception.update).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(secondPerception.update).toHaveBeenCalledWith({ refreshLighting: true });
  });
});
