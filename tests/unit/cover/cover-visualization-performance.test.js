/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import '../../setup.js';

const mockGetVisibilityBetween = jest.fn();

jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityBetween: (...args) => mockGetVisibilityBetween(...args),
}));

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {
    detectCoverBetweenTokens: jest.fn(() => 'none'),
  },
}));

describe('CoverVisualization occupancy performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.canvas.grid = { size: 50 };
    global.canvas.tokens.placeables = [];
  });

  function makeToken(id, { x = 0, y = 0, type = 'npc', size = 'med', hidden = false } = {}) {
    return {
      id,
      actor: {
        type,
        system: {
          traits: {
            size: { value: size },
          },
        },
      },
      document: {
        id,
        x,
        y,
        width: 1,
        height: 1,
        hidden,
      },
    };
  }

  test('precomputes blocking token rectangles once for cover grid occupancy checks', async () => {
    const { CoverVisualization } = await import('../../../scripts/cover/CoverVisualization.js');
    const visualization = new CoverVisualization();

    const selected = makeToken('selected');
    const blockingNpc = makeToken('blocking-npc', { x: 100 });
    const undetectedNpc = makeToken('undetected-npc', { x: 200 });
    const hiddenNpc = makeToken('hidden-npc', { x: 300, hidden: true });
    const loot = makeToken('loot', { x: 400, type: 'loot' });
    global.canvas.tokens.placeables = [selected, blockingNpc, undetectedNpc, hiddenNpc, loot];

    mockGetVisibilityBetween.mockImplementation((_, target) =>
      target.id === 'undetected-npc' ? 'undetected' : 'observed',
    );

    const blockers = visualization.buildPositionOccupancyBlockers(selected, global.canvas);

    expect(blockers).toEqual([
      {
        x1: 100,
        y1: 0,
        x2: 150,
        y2: 50,
        size: 'med',
      },
    ]);
    expect(mockGetVisibilityBetween).toHaveBeenCalledTimes(2);

    mockGetVisibilityBetween.mockClear();

    expect(
      visualization.isPositionOccupied(125, 25, selected, global.canvas, blockers),
    ).toBe(true);
    expect(
      visualization.isPositionOccupied(225, 25, selected, global.canvas, blockers),
    ).toBe(false);
    expect(mockGetVisibilityBetween).not.toHaveBeenCalled();

    visualization.cleanup();
  });
});
