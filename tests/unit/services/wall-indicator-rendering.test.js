import { jest } from '@jest/globals';

import {
  buildWallIndicatorPolygon,
  clearWallSeeThroughMasks,
  createHiddenWallIndicator,
  createWallSeeThroughMask,
  getWallIndicatorColor,
  getWallSegment,
  replaceHiddenWallIndicator,
} from '../../../scripts/services/Walls/wall-indicator-rendering.js';

function makeDisplayObject() {
  return {
    children: [],
    parent: null,
    scale: { set: jest.fn() },
    addChild: jest.fn(function addChild(child) {
      child.parent = this;
      this.children.push(child);
    }),
    removeChild: jest.fn(function removeChild(child) {
      child.parent = null;
      this.children = this.children.filter((candidate) => candidate !== child);
    }),
    destroy: jest.fn(),
    clear: jest.fn(),
    lineStyle: jest.fn(),
    beginFill: jest.fn(),
    drawPolygon: jest.fn(),
    drawCircle: jest.fn(),
    endFill: jest.fn(),
  };
}

function makePixiMock() {
  return {
    Graphics: jest.fn(function Graphics() {
      return makeDisplayObject();
    }),
    Container: jest.fn(function Container() {
      return makeDisplayObject();
    }),
  };
}

describe('wall indicator rendering helpers', () => {
  test('builds wall segment geometry from document coords', () => {
    const segment = getWallSegment({ x: 0, y: 0, x2: 100, y2: 0 });

    expect(segment).toMatchObject({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      dx: 100,
      dy: 0,
      nx: -0,
      ny: 1,
    });
    expect(buildWallIndicatorPolygon(segment, 10)).toEqual([0, 10, 100, 10, 100, -10, 0, -10]);
  });

  test('returns null for invalid wall geometry', () => {
    expect(getWallSegment({ x: 0, y: 0, x2: 'bad', y2: 0 })).toBeNull();
  });

  test('uses door color for doors and wall color otherwise', () => {
    expect(getWallIndicatorColor({ door: 1 })).toBe(0xffd166);
    expect(getWallIndicatorColor({ door: 0 })).toBe(0x9b59b6);
  });

  test('creates static hidden wall indicator and assigns wall ownership markers', () => {
    const pixi = makePixiMock();
    const parent = makeDisplayObject();
    const wall = { document: { id: 'wall', c: [0, 0, 100, 0], door: 0 } };

    const indicator = createHiddenWallIndicator({
      wall,
      half: 10,
      pixi,
      parent,
      animated: false,
    });

    expect(indicator).toBeTruthy();
    expect(indicator._pvWallId).toBe('wall');
    expect(indicator._wallDocumentId).toBe('wall');
    expect(indicator.drawPolygon).toHaveBeenCalledWith([0, 10, 100, 10, 100, -10, 0, -10]);
    expect(parent.addChild).toHaveBeenCalledWith(indicator);
    expect(wall._pvHiddenIndicator).toBe(indicator);
  });

  test('replaceHiddenWallIndicator removes old indicator before creating new one', () => {
    const pixi = makePixiMock();
    const parent = makeDisplayObject();
    const oldIndicator = makeDisplayObject();
    oldIndicator.parent = parent;
    const wall = {
      document: { id: 'wall', c: [0, 0, 100, 0], door: 0 },
      _pvHiddenIndicator: oldIndicator,
    };

    const nextIndicator = replaceHiddenWallIndicator({
      wall,
      half: 10,
      pixi,
      parent,
      animated: false,
    });

    expect(parent.removeChild).toHaveBeenCalledWith(oldIndicator);
    expect(oldIndicator.destroy).toHaveBeenCalledTimes(1);
    expect(wall._pvHiddenIndicator).toBe(nextIndicator);
  });

  test('animated wall indicator creates configured sparkles and schedules animation', () => {
    const pixi = makePixiMock();
    const parent = makeDisplayObject();
    const wall = { document: { id: 'wall', c: [0, 0, 100, 0], door: 0 } };
    const cancelAnimation = jest.fn();
    const scheduleFrame = jest.fn(() => cancelAnimation);

    const indicator = createHiddenWallIndicator({
      wall,
      half: 10,
      pixi,
      parent,
      sparkleCount: 3,
      includeInnerHighlight: false,
      scheduleFrame,
      random: () => 0.5,
    });

    expect(indicator.children).toHaveLength(1);
    const effectContainer = indicator.children[0];
    expect(effectContainer.children).toHaveLength(4);
    expect(effectContainer.children.every((child) => child._pvWallId === 'wall')).toBe(true);
    expect(scheduleFrame).toHaveBeenCalledWith(expect.any(Function), true);
    expect(indicator._pvAnimationFrameId).toBe(cancelAnimation);
    expect(wall._pvAnimationActive).toBe(true);
  });

  test('creates and clears see-through masks through one lifecycle helper', () => {
    const pixi = makePixiMock();
    const parent = makeDisplayObject();
    const wall = { document: { id: 'wall', c: [0, 0, 100, 0], door: 1 } };

    const mask = createWallSeeThroughMask({
      wall,
      half: 3,
      pixi,
      parent,
    });

    expect(mask._pvWallId).toBe('wall');
    expect(mask.zIndex).toBe(999);
    expect(wall._pvSeeThroughMasks).toEqual([mask]);

    clearWallSeeThroughMasks(wall);

    expect(parent.removeChild).toHaveBeenCalledWith(mask);
    expect(wall._pvSeeThroughMasks).toEqual([]);
  });
});
