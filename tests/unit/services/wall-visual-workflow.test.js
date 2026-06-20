import { jest } from '@jest/globals';

import {
  resolveStrictWallVisualObserver,
  runWallVisualWorkflow,
  shouldRenderControlledWallIndicator,
} from '../../../scripts/services/Walls/wall-visual-workflow.js';

function makeDisplayObject() {
  return {
    children: [],
    parent: null,
    addChild: jest.fn(function addChild(child) {
      child.parent = this;
      this.children.push(child);
    }),
    removeChild: jest.fn(function removeChild(child) {
      child.parent = null;
      this.children = this.children.filter((candidate) => candidate !== child);
    }),
    destroy: jest.fn(),
    lineStyle: jest.fn(),
    beginFill: jest.fn(),
    drawPolygon: jest.fn(),
    endFill: jest.fn(),
  };
}

function makePixiMock() {
  return {
    Graphics: jest.fn(function Graphics() {
      return makeDisplayObject();
    }),
  };
}

describe('wall visual workflow', () => {
  test('standard workflow applies hidden-wall sight restore through update application Module', async () => {
    const updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);
    const perception = { update: jest.fn() };
    const refreshTokens = jest.fn();
    const wall = {
      document: {
        id: 'wall',
        sight: 0,
        getFlag: jest.fn((moduleId, flagName) => (flagName === 'originalSight' ? 1 : false)),
      },
    };
    const canvasLayer = {
      scene: { updateEmbeddedDocuments },
      perception,
      tokens: { placeables: [], controlled: [] },
      walls: { placeables: [wall] },
    };
    const gameRef = {
      user: { isGM: true },
      settings: { get: jest.fn(() => true) },
    };

    const result = await runWallVisualWorkflow({
      canvasLayer,
      gameRef,
      refreshTokens,
      getConnectedWallDocsBySourceId: async () => () => [],
    });

    expect(result).toEqual({ processed: 1, updates: 1 });
    expect(updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Wall',
      [{ _id: 'wall', sight: 1, 'flags.pf2e-visioner.originalSight': null }],
      { diff: false },
    );
    expect(perception.update).toHaveBeenCalledWith({
      refreshVision: true,
      refreshOcclusion: true,
    });
    expect(refreshTokens).toHaveBeenCalledWith([]);
  });

  test('strict workflow clears stale indicators when no controlled observer exists', async () => {
    const oldIndicator = makeDisplayObject();
    const parent = makeDisplayObject();
    oldIndicator.parent = parent;
    const wall = {
      _pvHiddenIndicator: oldIndicator,
      document: {
        id: 'wall',
        getFlag: jest.fn(() => true),
      },
    };

    const result = await runWallVisualWorkflow({
      canvasLayer: {
        tokens: { placeables: [], controlled: [] },
        walls: { placeables: [wall] },
      },
      gameRef: {
        user: { isGM: false },
        settings: { get: jest.fn(() => true) },
      },
      resolveObserver: resolveStrictWallVisualObserver,
    });

    expect(result).toEqual({ skipped: 'observer' });
    expect(parent.removeChild).toHaveBeenCalledWith(oldIndicator);
    expect(oldIndicator.destroy).toHaveBeenCalled();
    expect(wall._pvHiddenIndicator).toBeNull();
  });

  test('strict workflow renders controlled-token wall indicators with adapter render options', async () => {
    const pixi = makePixiMock();
    const parent = makeDisplayObject();
    const controlledToken = {
      id: 'observer',
      document: {
        testUserPermission: jest.fn(() => true),
        getFlag: jest.fn((moduleId, flagName) =>
          flagName === 'walls' ? { wall: 'observed' } : {},
        ),
      },
    };
    const wall = {
      document: {
        id: 'wall',
        c: [0, 0, 100, 0],
        getFlag: jest.fn((moduleId, flagName) => flagName === 'hiddenWall'),
      },
    };

    const result = await runWallVisualWorkflow({
      canvasLayer: {
        scene: { getFlag: jest.fn(() => 10) },
        tokens: { placeables: [controlledToken], controlled: [controlledToken] },
        walls: { placeables: [wall] },
      },
      gameRef: {
        user: { isGM: false },
        settings: { get: jest.fn(() => true) },
      },
      resolveObserver: resolveStrictWallVisualObserver,
      shouldRenderIndicator: shouldRenderControlledWallIndicator,
      renderOptions: { pixi, parent, animated: false },
      applySightUpdates: false,
      updateEchoes: false,
      getConnectedWallDocsBySourceId: async () => () => [],
    });

    expect(result).toEqual({ processed: 1, updates: 0 });
    expect(parent.addChild).toHaveBeenCalledWith(wall._pvHiddenIndicator);
    expect(wall._pvHiddenIndicator._pvWallId).toBe('wall');
  });
});
