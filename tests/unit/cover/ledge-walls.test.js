import '../../setup.js';
import {
  buildLedgeFlagPatch,
  findLedgeCrossings,
  getInheritedLedgeElevation,
  getLedgeElevation,
  getSceneLedgeWalls,
  invalidateLedgeWallCache,
  resolveLedgeElevation,
} from '../../../scripts/cover/ledge/ledge-walls.js';

describe('ledge walls', () => {
  test('patch stores ledge flag and elevation and clears sight, light and sound blocking', () => {
    expect(buildLedgeFlagPatch(true, '15')).toEqual({
      'flags.pf2e-visioner.ledge': true,
      'flags.pf2e-visioner.ledgeElevation': 15,
      sight: 0,
      light: 0,
      sound: 0,
    });
  });

  test('patch never touches movement blocking', () => {
    expect(buildLedgeFlagPatch(true, '15')).not.toHaveProperty('move');
    expect(buildLedgeFlagPatch(false, '15')).not.toHaveProperty('move');
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

  describe('ledge elevation fallback chain', () => {
    const levels = new Map([
      ['down', { elevation: { bottom: 0, top: 10 } }],
      ['up', { elevation: { bottom: 10, top: 20 } }],
      ['roof', { elevation: { bottom: null, top: 30 } }],
    ]);

    function wallDoc({ ledgeElevation, wallHeight, levelIds = [] } = {}) {
      return {
        flags: {
          'pf2e-visioner': { ledge: true, ledgeElevation },
          ...(wallHeight ? { 'wall-height': wallHeight } : {}),
        },
        levels: new Set(levelIds),
        parent: { levels },
      };
    }

    beforeEach(() => {
      game.modules = new Map([['wall-height', { active: true }]]);
    });

    test('explicit ledge elevation wins', () => {
      const doc = wallDoc({ ledgeElevation: 5, wallHeight: { bottom: 0, top: 15 }, levelIds: ['up'] });
      expect(resolveLedgeElevation(doc)).toBe(5);
      expect(getInheritedLedgeElevation(doc)).toBe(15);
    });

    test('wall height top is used when no explicit elevation', () => {
      expect(resolveLedgeElevation(wallDoc({ wallHeight: { bottom: 0, top: 15 }, levelIds: ['up'] }))).toBe(15);
    });

    test('wall height is ignored when the module is inactive', () => {
      game.modules = new Map([['wall-height', { active: false }]]);
      expect(resolveLedgeElevation(wallDoc({ wallHeight: { bottom: 0, top: 15 }, levelIds: ['up'] }))).toBe(10);
    });

    test('highest scene level floor is used when there is no wall height', () => {
      expect(resolveLedgeElevation(wallDoc({ levelIds: ['down', 'up'] }))).toBe(10);
    });

    test('levels with an unbounded floor are skipped', () => {
      expect(resolveLedgeElevation(wallDoc({ levelIds: ['roof', 'up'] }))).toBe(10);
    });

    test('the base level floor is not a ledge height', () => {
      expect(resolveLedgeElevation(wallDoc({ levelIds: ['down'] }))).toBeNull();
    });

    test('a single default scene level is ignored', () => {
      const doc = {
        flags: { 'pf2e-visioner': { ledge: true } },
        levels: new Set(['only']),
        parent: { levels: new Map([['only', { elevation: { bottom: 0, top: 20 } }]]) },
      };
      expect(resolveLedgeElevation(doc)).toBeNull();
    });

    test('nothing to inherit leaves elevation unresolved', () => {
      expect(resolveLedgeElevation(wallDoc())).toBeNull();
      expect(getInheritedLedgeElevation(wallDoc())).toBeNull();
    });

    test('crossings use the resolved elevation', () => {
      const doc = { ...wallDoc({ levelIds: ['up'] }), c: [50, -50, 50, 50] };
      const crossings = findLedgeCrossings({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ coords: doc.c, document: doc }]);
      expect(crossings).toEqual([{ edgeT: 0.5, elevation: 10 }]);
    });
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
