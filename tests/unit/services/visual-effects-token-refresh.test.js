import '../../setup.js';

import {
  updateWallVisuals,
  updateSpecificTokenPairs,
  updateTokenVisuals,
} from '../../../scripts/services/visual-effects.js';
import { updateWallVisuals as updateOptimizedWallVisuals } from '../../../scripts/services/optimized-visual-effects.js';

describe('visual-effects updateTokenVisuals', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    const inView = createMockToken({ id: 'in-view', x: 100, y: 100 });
    const offscreen = createMockToken({ id: 'offscreen', x: 5000, y: 5000 });
    inView.center = { x: 150, y: 150 };
    offscreen.center = { x: 5050, y: 5050 };
    inView.sprite = {};
    inView.mesh = {};
    inView.refresh = jest.fn();
    offscreen.sprite = {};
    offscreen.mesh = {};
    offscreen.refresh = jest.fn();

    global.canvas = {
      ...global.canvas,
      app: {
        renderer: {
          screen: { width: 1000, height: 1000 },
        },
      },
      stage: {
        worldTransform: {
          applyInverse: jest.fn((point) => ({ x: point.x, y: point.y })),
        },
      },
      perception: {
        update: jest.fn(),
      },
      scene: {
        updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      },
      tokens: {
        placeables: [inView, offscreen],
        get: jest.fn((id) => [inView, offscreen].find((token) => token.id === id)),
        controlled: [],
      },
      walls: {
        placeables: [],
      },
    };

    global.game.user.isGM = true;
    global.game.settings.get.mockImplementation((moduleId, key) => {
      if (key === 'hiddenWallsEnabled') return true;
      return false;
    });
  });

  afterEach(() => {
    global.canvas = originalCanvas;
  });

  test('skips offscreen tokens during broad visual refreshes', async () => {
    const [inView, offscreen] = global.canvas.tokens.placeables;

    await updateTokenVisuals();

    expect(inView.refresh).toHaveBeenCalledTimes(1);
    expect(offscreen.refresh).not.toHaveBeenCalled();
  });

  test('skips offscreen tokens during pair-specific visual refreshes', async () => {
    const [inView, offscreen] = global.canvas.tokens.placeables;

    await updateSpecificTokenPairs([{ observerId: 'in-view', targetId: 'offscreen' }]);

    expect(inView.refresh).toHaveBeenCalledTimes(1);
    expect(offscreen.refresh).not.toHaveBeenCalled();
  });

  test('skips token refreshes when viewport geometry is not available yet', async () => {
    const [inView, offscreen] = global.canvas.tokens.placeables;
    global.canvas.stage = {};

    await updateTokenVisuals();
    await updateSpecificTokenPairs([{ observerId: 'in-view', targetId: 'offscreen' }]);

    expect(inView.refresh).not.toHaveBeenCalled();
    expect(offscreen.refresh).not.toHaveBeenCalled();
  });

  test('skips offscreen tokens during wall visual forced refreshes', async () => {
    const [inView, offscreen] = global.canvas.tokens.placeables;
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'wall-1',
          sight: 0,
          getFlag: jest.fn((moduleId, key) => (key === 'originalSight' ? 1 : false)),
        },
      },
    ];

    await updateWallVisuals();

    expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Wall',
      [{ _id: 'wall-1', sight: 1, 'flags.pf2e-visioner.originalSight': null }],
      { diff: false },
    );
    expect(inView.refresh).toHaveBeenCalledTimes(1);
    expect(offscreen.refresh).not.toHaveBeenCalled();
  });

  test('skips offscreen tokens during optimized wall visual forced refreshes', async () => {
    const [inView, offscreen] = global.canvas.tokens.placeables;
    global.canvas.tokens.controlled = [inView];
    global.canvas.walls.placeables = [
      {
        document: {
          id: 'wall-1',
          sight: 0,
          getFlag: jest.fn((moduleId, key) => (key === 'originalSight' ? 1 : false)),
        },
      },
    ];

    await updateOptimizedWallVisuals();

    expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Wall',
      [{ _id: 'wall-1', sight: 1, 'flags.pf2e-visioner.originalSight': null }],
      { diff: false },
    );
    expect(inView.refresh).toHaveBeenCalledTimes(1);
    expect(offscreen.refresh).not.toHaveBeenCalled();
  });
});
