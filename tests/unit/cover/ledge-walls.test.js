import '../../setup.js';
import {
  buildLedgeFlagPatch,
  findLedgeCrossings,
  getLedgeElevation,
  getSceneLedgeWalls,
  invalidateLedgeWallCache,
} from '../../../scripts/cover/ledge/ledge-walls.js';

describe('ledge walls', () => {
  test('patch stores ledge flag and elevation', () => {
    expect(buildLedgeFlagPatch(true, '15')).toEqual({
      'flags.pf2e-visioner.ledge': true,
      'flags.pf2e-visioner.ledgeElevation': 15,
    });
  });

  test('patch clears elevation when blank or ledge unchecked', () => {
    expect(buildLedgeFlagPatch(true, '')['flags.pf2e-visioner.ledgeElevation']).toBeNull();
    expect(buildLedgeFlagPatch(false, '15')).toEqual({
      'flags.pf2e-visioner.ledge': false,
      'flags.pf2e-visioner.ledgeElevation': null,
    });
  });

  test('getLedgeElevation reads numeric flag or null', () => {
    expect(getLedgeElevation({ flags: { 'pf2e-visioner': { ledgeElevation: 10 } } })).toBe(10);
    expect(getLedgeElevation({ flags: { 'pf2e-visioner': { ledgeElevation: null } } })).toBeNull();
    expect(getLedgeElevation({ flags: {} })).toBeNull();
  });

  test('scene ledge walls are cached until invalidated', () => {
    const ledge = { document: { flags: { 'pf2e-visioner': { ledge: true } } } };
    const plain = { document: { flags: {} } };
    canvas.scene = { id: 'scene-1' };
    canvas.walls.placeables = [ledge, plain];
    invalidateLedgeWallCache();
    expect(getSceneLedgeWalls()).toEqual([ledge]);
    canvas.walls.placeables = [plain];
    expect(getSceneLedgeWalls()).toEqual([ledge]);
    invalidateLedgeWallCache();
    expect(getSceneLedgeWalls()).toEqual([]);
  });

  test('findLedgeCrossings returns edge position and elevation of crossed ledges only', () => {
    const ledge = {
      coords: [50, -50, 50, 50],
      document: { flags: { 'pf2e-visioner': { ledge: true, ledgeElevation: 20 } } },
    };
    const plain = { coords: [75, -50, 75, 50], document: { flags: {} } };
    const crossings = findLedgeCrossings({ x: 0, y: 0 }, { x: 100, y: 0 }, [ledge, plain]);
    expect(crossings).toEqual([{ edgeT: 0.5, elevation: 20 }]);
  });
});
