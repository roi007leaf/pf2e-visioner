import { jest } from '@jest/globals';

function makeToken(elevation = 0, level = null, center = { x: 0, y: 0 }) {
  return {
    document: { elevation, level },
    center,
    getCenterPoint: () => center,
    losHeight: elevation,
  };
}

function makeIntegration({ isLevelsActive = false, isNativeLevelsActive = false, inferLevel = null } = {}) {
  global.canvas = {
    scene: {
      levels: { size: isNativeLevelsActive ? 1 : 0 },
    },
    dimensions: { size: 100, distance: 5 },
    inferLevelFromElevation: inferLevel ? (elev) => inferLevel(elev) : undefined,
  };

  // Reset the singleton so each test gets a fresh instance
  const mod = { LevelsIntegration: null };
  return import('../../../scripts/services/LevelsIntegration.js').then(({ LevelsIntegration }) => {
    LevelsIntegration._instance = null;
    const inst = LevelsIntegration.getInstance();
    inst._isLevelsActive = isLevelsActive;
    inst._isWallHeightActive = false;
    inst._initialized = true;
    return inst;
  });
}

describe('LevelsIntegration v14 native levels', () => {
  afterEach(() => {
    return import('../../../scripts/services/LevelsIntegration.js').then(({ LevelsIntegration }) => {
      LevelsIntegration._instance = null;
    });
  });

  describe('isNativeLevelsActive', () => {
    test('returns false when scene has no levels', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: false });
      expect(inst.isNativeLevelsActive).toBe(false);
    });

    test('returns true when scene has levels', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      expect(inst.isNativeLevelsActive).toBe(true);
    });

    test('returns false when canvas.scene is null', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: false });
      global.canvas.scene = null;
      expect(inst.isNativeLevelsActive).toBe(false);
    });
  });

  describe('isActive', () => {
    test('returns true when only native levels active', async () => {
      const inst = await makeIntegration({ isLevelsActive: false, isNativeLevelsActive: true });
      expect(inst.isActive).toBe(true);
    });

    test('returns true when only external levels active', async () => {
      const inst = await makeIntegration({ isLevelsActive: true, isNativeLevelsActive: false });
      expect(inst.isActive).toBe(true);
    });

    test('returns false when neither is active', async () => {
      const inst = await makeIntegration({ isLevelsActive: false, isNativeLevelsActive: false });
      expect(inst.isActive).toBe(false);
    });
  });

  describe('getTokenLevel', () => {
    test('returns token.document.level when set', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      const token = makeToken(0, 'level-floor-1');
      expect(inst.getTokenLevel(token)).toBe('level-floor-1');
    });

    test('falls back to canvas.inferLevelFromElevation when level is null', async () => {
      const inferLevel = (elev) => (elev >= 10 ? { id: 'level-2' } : { id: 'level-1' });
      const inst = await makeIntegration({ isNativeLevelsActive: true, inferLevel });
      const token = makeToken(15, null);
      expect(inst.getTokenLevel(token)).toBe('level-2');
    });

    test('returns null when no level and no inferLevelFromElevation', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      global.canvas.inferLevelFromElevation = undefined;
      const token = makeToken(0, null);
      expect(inst.getTokenLevel(token)).toBeNull();
    });

    test('returns null for null token', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      expect(inst.getTokenLevel(null)).toBeNull();
    });
  });

  describe('areTokensOnSameLevel', () => {
    test('returns true when both tokens have same level ID', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(0, 'floor-1');
      expect(inst.areTokensOnSameLevel(t1, t2)).toBe(true);
    });

    test('returns false when tokens have different level IDs', async () => {
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(10, 'floor-2');
      expect(inst.areTokensOnSameLevel(t1, t2)).toBe(false);
    });

    test('falls back to elevation diff when levels are null', async () => {
      global.canvas.inferLevelFromElevation = undefined;
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      const t1 = makeToken(0, null);
      const t2 = makeToken(3, null);
      expect(inst.areTokensOnSameLevel(t1, t2)).toBe(true); // diff < 5
    });

    test('elevation diff >= 5 treated as different when no level IDs', async () => {
      global.canvas.inferLevelFromElevation = undefined;
      const inst = await makeIntegration({ isNativeLevelsActive: true });
      const t1 = makeToken(0, null);
      const t2 = makeToken(10, null);
      expect(inst.areTokensOnSameLevel(t1, t2)).toBe(false);
    });
  });

  describe('hasFloorCeilingBetween (native levels)', () => {
    test('returns false for native levels (wall-based LOS handles cross-level)', async () => {
      const inst = await makeIntegration({ isLevelsActive: false, isNativeLevelsActive: true });
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(10, 'floor-2');
      expect(inst.hasFloorCeilingBetween(t1, t2)).toBe(false);
    });

    test('returns false when tokens are on same level (native path)', async () => {
      const inst = await makeIntegration({ isLevelsActive: false, isNativeLevelsActive: true });
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(0, 'floor-1');
      expect(inst.hasFloorCeilingBetween(t1, t2)).toBe(false);
    });

    test('returns false when neither external nor native levels active', async () => {
      const inst = await makeIntegration({ isLevelsActive: false, isNativeLevelsActive: false });
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(10, 'floor-2');
      expect(inst.hasFloorCeilingBetween(t1, t2)).toBe(false);
    });

    test('external Levels API takes priority when both active', async () => {
      const inst = await makeIntegration({ isLevelsActive: true, isNativeLevelsActive: true });
      // External Levels API path: api is null (no CONFIG.Levels), falls through to try/catch returning false
      global.CONFIG = { Levels: { API: null } };
      const t1 = makeToken(0, 'floor-1');
      const t2 = makeToken(10, 'floor-2');
      // External branch executes first; with null API it returns false from the try block
      expect(inst.hasFloorCeilingBetween(t1, t2)).toBe(false);
    });
  });
});
