import '../../../setup.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { VisionAnalyzer } from '../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { LevelsIntegration } from '../../../../scripts/services/LevelsIntegration.js';

describe('VisionAnalyzer peek constraints', () => {
  beforeEach(() => {
    LevelsIntegration._instance = null;

    global.CONST = {
      WALL_SENSE_TYPES: {
        NONE: 0,
        LIMITED: 10,
        NORMAL: 20,
        PROXIMITY: 30,
        DISTANCE: 40,
      },
    };

    global.CONFIG = {
      Canvas: {
        polygonBackends: {
          sight: { testCollision: jest.fn(() => false) },
          sound: { testCollision: jest.fn(() => false) },
        },
      },
    };

    global.PIXI = {
      Circle: jest.fn((x, y, radius) => ({ x, y, radius })),
    };

    canvas.walls.placeables = [];
  });

  afterEach(() => {
    peekRegistry.clearAll();
    LevelsIntegration._instance = null;
    jest.restoreAllMocks();
  });

  function makePair() {
    const observer = createMockToken({ id: 'obs', x: 0, y: 0, width: 1, height: 1 });
    const target = createMockToken({ id: 'tgt', x: 1000, y: 0, width: 1, height: 1 });
    return { observer, target };
  }

  function makeClearLosPair() {
    const observer = {
      id: 'observer-clear',
      center: { x: 100, y: 100 },
      document: {
        id: 'observer-clear-doc',
        x: 75,
        y: 75,
        width: 1,
        height: 1,
        elevation: 0,
      },
    };
    const target = {
      id: 'target-clear',
      center: { x: 300, y: 300 },
      document: {
        id: 'target-clear-doc',
        x: 275,
        y: 275,
        width: 1,
        height: 1,
        elevation: 0,
      },
    };
    return { observer, target };
  }

  function directionToward(origin, target) {
    return Math.atan2(target.center.y - origin.y, target.center.x - origin.x);
  }

  test('clear LOS baseline returns true with no peek', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    expect(va.hasLineOfSight(observer, target)).toBe(true);
  });

  test('in-cone peek does not block an otherwise clear LOS', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      { origin, direction: directionToward(origin, target), fov: 120, ignoredWallIds: [] },
      1000,
    );
    expect(va.hasLineOfSight(observer, target)).toBe(true);
  });

  test('in-cone target beyond peek range flips clear LOS to false', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      { origin, direction: directionToward(origin, target), fov: 120, range: 10, ignoredWallIds: [] },
      1000,
    );
    expect(va.hasLineOfSight(observer, target)).toBe(false);
  });

  test('range 0 (unlimited) skips the range check for an in-cone target', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      { origin, direction: directionToward(origin, target), fov: 120, range: 0, ignoredWallIds: [] },
      1000,
    );
    expect(va.hasLineOfSight(observer, target)).toBe(true);
  });

  test('out-of-cone peek flips an otherwise clear LOS to false', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      {
        origin,
        direction: directionToward(origin, target) + Math.PI,
        fov: 60,
        ignoredWallIds: [],
      },
      1000,
    );
    expect(va.hasLineOfSight(observer, target)).toBe(false);
  });

  test('corner peek (fov null) skips the cone gate: full sight from the offset origin', () => {
    const va = new VisionAnalyzer();
    va.clearCache();
    const { observer, target } = makeClearLosPair();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      { origin, direction: directionToward(origin, target) + Math.PI, fov: null, range: 0, ignoredWallIds: [] },
      1000,
    );
    expect(va.hasLineOfSight(observer, target)).toBe(true);
  });

  test('returns false when target is outside the peek cone', () => {
    const va = new VisionAnalyzer();
    const { observer, target } = makePair();
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: Math.PI, fov: 60, ignoredWallIds: [] }, 1000);
    expect(va.hasLineOfSight(observer, target)).toBe(false);
  });

  test('excluded wall id is not in the wall set used for the ray', () => {
    const va = new VisionAnalyzer();
    const wall = createMockWall({ id: 'door1' });
    const all = [wall];
    const filtered = va._applyPeekWallExclusion('obs', all);
    peekRegistry.set('obs', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: ['door1'] }, 1000);
    const filtered2 = va._applyPeekWallExclusion('obs', all);
    expect(filtered).toEqual(all);
    expect(filtered2.find((w) => w.document.id === 'door1')).toBeUndefined();
  });

  test('GM computing LOS for a non-controlled peeking observer still sees through the peeked door', () => {
    // Simulates the GM's client evaluating LOS for a player's peeking token: the observer's
    // vision source is not active on this client, so an on-demand sight polygon is used. That
    // polygon doesn't know about the peek's excluded door wall (only the peeking player's own
    // client unblocked it), but the peek-aware geometric raycast (which reads ignoredWallIds
    // from the shared peekRegistry) correctly excludes it.
    global.CONFIG.Canvas.polygonBackends.sight.create = jest.fn(() => ({
      points: [0, 0, 1, 1, 2, 2],
      intersectCircle: jest.fn(() => ({ points: [] })),
    }));

    const observer = {
      id: 'peeking-observer',
      center: { x: 100, y: 100 },
      document: { id: 'peeking-observer-doc', x: 75, y: 75, width: 1, height: 1, elevation: 0 },
    };
    const target = {
      id: 'target-in-slit',
      center: { x: 300, y: 100 },
      document: { id: 'target-in-slit-doc', x: 275, y: 75, width: 1, height: 1, elevation: 0 },
    };
    const door = createMockWall({ id: 'peeked-door', c: [200, 50, 200, 150], door: 1, ds: 0 });
    canvas.walls.placeables = [door];

    const va = new VisionAnalyzer();
    va.clearCache();
    const origin = { x: observer.center.x, y: observer.center.y };
    peekRegistry.set(
      observer.document.id,
      { origin, direction: 0, fov: 120, range: 0, ignoredWallIds: ['peeked-door'] },
      1000,
    );

    expect(va.hasLineOfSight(observer, target)).toBe(true);
  });
});
