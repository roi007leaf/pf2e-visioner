import { jest } from '@jest/globals';

import {
  clearHiddenTokenEchoes,
  drawHiddenTokenEcho,
  removeHiddenTokenEcho,
  segmentIntersectsWall,
  segmentsIntersect,
  updateHiddenTokenEchoes,
} from '../../../scripts/services/hidden-token-echoes.js';

function makeGraphics() {
  return {
    parent: null,
    clear: jest.fn(),
    lineStyle: jest.fn(),
    drawCircle: jest.fn(),
    destroy: jest.fn(),
  };
}

describe('hidden token echoes', () => {
  test('detects segment intersections and wall intersections', () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ),
    ).toBe(true);
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ),
    ).toBe(false);
    expect(
      segmentIntersectsWall({ x: 0, y: 0 }, { x: 10, y: 10 }, { document: { c: [0, 10, 10, 0] } }),
    ).toBe(true);
  });

  test('draws and removes echo graphics through token lifecycle', () => {
    const graphics = makeGraphics();
    const pixi = {
      Graphics: jest.fn(() => graphics),
    };
    const tokenLayer = {
      addChild: jest.fn((child) => {
        child.parent = tokenLayer;
      }),
      removeChild: jest.fn((child) => {
        child.parent = null;
      }),
    };
    const token = { center: { x: 50, y: 75 } };

    drawHiddenTokenEcho(token, {
      canvasLayer: { tokens: tokenLayer },
      pixi,
    });

    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.lineStyle).toHaveBeenCalledWith(2, 0xffa500, 0.9);
    expect(graphics.drawCircle).toHaveBeenCalledWith(50, 75, 12);
    expect(graphics.drawCircle).toHaveBeenCalledWith(50, 75, 18);
    expect(graphics.drawCircle).toHaveBeenCalledWith(50, 75, 24);
    expect(tokenLayer.addChild).toHaveBeenCalledWith(graphics);

    removeHiddenTokenEcho(token);

    expect(tokenLayer.removeChild).toHaveBeenCalledWith(graphics);
    expect(graphics.destroy).toHaveBeenCalledTimes(1);
    expect(token._pvHiddenEcho).toBeNull();
  });

  test('disabled update clears existing token echoes', async () => {
    const echo = makeGraphics();
    const token = { _pvHiddenEcho: echo };
    const canvasLayer = { tokens: { placeables: [token] } };

    clearHiddenTokenEchoes([token]);
    expect(token._pvHiddenEcho).toBeNull();

    token._pvHiddenEcho = echo;
    await updateHiddenTokenEchoes({ id: 'observer' }, { canvasLayer });

    expect(token._pvHiddenEcho).toBeNull();
  });
});
