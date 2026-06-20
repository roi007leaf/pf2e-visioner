import { jest } from '@jest/globals';
import {
  buildTokenWallFlagCleanupUpdates,
  cleanupAllWallReferences,
  cleanupDeletedWallReferences,
  displayObjectBelongsToWall,
  isWallIndicatorDisplayObject,
  refreshCanvasEffects,
  removeAllWallIndicatorDisplayObjects,
  removeMatchingDisplayObjects,
  removeWallIndicatorsForWall,
} from '../../../scripts/services/Walls/wall-indicator-cleanup.js';

describe('wall indicator cleanup helpers', () => {
  function makeContainer(children = []) {
    const container = {
      children,
      removeChild: jest.fn(),
    };
    for (const child of children) {
      child.parent = container;
    }
    return container;
  }

  test('detects display objects owned by a deleted wall', () => {
    expect(displayObjectBelongsToWall({ _pvWallId: 'wall' }, 'wall')).toBe(true);
    expect(displayObjectBelongsToWall({ _wallDocumentId: 'wall' }, 'wall')).toBe(true);
    expect(displayObjectBelongsToWall({ _associatedWallId: 'wall' }, 'wall')).toBe(true);
    expect(displayObjectBelongsToWall({ _pvWallId: 'other' }, 'wall')).toBe(false);
  });

  test('removes matching nested display objects', () => {
    const target = { _pvWallId: 'wall', destroy: jest.fn() };
    const other = { _pvWallId: 'other', destroy: jest.fn() };
    const nested = makeContainer([target]);
    const root = makeContainer([nested, other]);

    expect(removeMatchingDisplayObjects(root, (child) => child._pvWallId === 'wall')).toBe(1);
    expect(nested.removeChild).toHaveBeenCalledWith(target);
    expect(target.destroy).toHaveBeenCalledWith({
      children: true,
      texture: true,
      baseTexture: true,
    });
    expect(other.destroy).not.toHaveBeenCalled();
  });

  test('removes wall indicators across canvas layers', () => {
    const target = { _pvWallId: 'wall', destroy: jest.fn() };
    const other = { _pvWallId: 'other', destroy: jest.fn() };
    const foreground = makeContainer([target]);
    const effects = makeContainer([other]);

    expect(removeWallIndicatorsForWall({ effects: { foreground, ...effects } }, 'wall')).toBe(1);
    expect(foreground.removeChild).toHaveBeenCalledWith(target);
    expect(effects.removeChild).not.toHaveBeenCalledWith(other);
  });

  test('detects global wall indicators by marker properties and text style', () => {
    class Text {}
    const text = new Text();
    text.style = { stroke: 0x000000, strokeThickness: 4 };

    expect(isWallIndicatorDisplayObject({ name: 'wall-indicator-label' })).toBe(true);
    expect(isWallIndicatorDisplayObject({ _pvIndicatorType: 'wall' })).toBe(true);
    expect(isWallIndicatorDisplayObject({ _tooltip: true, _coverText: 'Cover' })).toBe(true);
    expect(isWallIndicatorDisplayObject(text, { Text })).toBe(true);
  });

  test('removes all wall-looking indicators across layers', () => {
    const indicator = { name: 'wall-indicator-label', destroy: jest.fn() };
    const unrelated = { name: 'other', destroy: jest.fn() };
    const stage = makeContainer([indicator, unrelated]);

    expect(removeAllWallIndicatorDisplayObjects({ stage })).toBe(1);
    expect(stage.removeChild).toHaveBeenCalledWith(indicator);
    expect(unrelated.destroy).not.toHaveBeenCalled();
  });

  test('cleans deleted wall references while preserving other masks', () => {
    const hidden = { _pvWallId: 'wall', destroy: jest.fn() };
    const removedMask = { _wallDocumentId: 'wall', destroy: jest.fn() };
    const keptMask = { _pvWallId: 'other', destroy: jest.fn() };
    const wall = {
      id: 'other',
      document: { id: 'other' },
      _pvHiddenIndicator: hidden,
      _pvSeeThroughMasks: [removedMask, keptMask],
      _pvAnimationActive: true,
    };

    cleanupDeletedWallReferences([wall], 'wall');

    expect(wall._pvHiddenIndicator).toBeNull();
    expect(wall._pvSeeThroughMasks).toEqual([keptMask]);
    expect(hidden.destroy).toHaveBeenCalled();
    expect(removedMask.destroy).toHaveBeenCalled();
    expect(wall._pvAnimationActive).toBe(true);
  });

  test('cleans all wall references and stops animations', () => {
    const wall = {
      _pvHiddenIndicator: { destroy: jest.fn() },
      _pvSeeThroughMasks: [{ destroy: jest.fn() }],
      _pvCoverIcon: { destroy: jest.fn() },
      _pvIdLabel: { destroy: jest.fn() },
      _pvAnimationActive: true,
    };

    cleanupAllWallReferences([wall]);

    expect(wall._pvHiddenIndicator).toBeNull();
    expect(wall._pvSeeThroughMasks).toEqual([]);
    expect(wall._pvCoverIcon).toBeUndefined();
    expect(wall._pvIdLabel).toBeUndefined();
    expect(wall._pvAnimationActive).toBe(false);
  });

  test('builds token flag cleanup updates', () => {
    const token = {
      id: 'token',
      document: {
        getFlag: jest.fn(() => ({ wall: 'observed', other: 'hidden' })),
      },
    };

    expect(buildTokenWallFlagCleanupUpdates([token], 'wall', 'pf2e-visioner')).toEqual([
      {
        _id: 'token',
        'flags.pf2e-visioner.walls': { other: 'hidden' },
      },
    ]);
  });

  test('refreshes canvas effects only', () => {
    const canvasRef = { perception: { update: jest.fn() } };

    refreshCanvasEffects(canvasRef);

    expect(canvasRef.perception.update).toHaveBeenCalledWith({
      refreshLighting: false,
      refreshVision: false,
      refreshOcclusion: false,
      refreshEffects: true,
    });
  });
});
