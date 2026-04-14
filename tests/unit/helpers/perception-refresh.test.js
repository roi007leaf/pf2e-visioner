import '../../setup.js';

import {
  sanitizePerceptionUpdateFlags,
  updateCanvasPerception,
} from '../../../scripts/helpers/perception-refresh.js';

describe('perception-refresh helper', () => {
  beforeEach(() => {
    global.canvas.perception = { update: jest.fn() };
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
});
