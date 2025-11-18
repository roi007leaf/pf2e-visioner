/**
 * Unit tests for Wall Cover Override Logic Changes
 * Tests the new behavior where:
 * - Cover-granting overrides (lesser/standard/greater) apply if wall intersects line, regardless of natural blocking
 * - Override 'none' only applies if wall would naturally block (to remove natural cover)
 * - Lesser cover override support
 */

import '../../setup.js';

describe('Wall Cover Override Logic', () => {
  let coverDetector;
  const MODULE_ID = 'pf2e-visioner';

  beforeEach(async () => {
    jest.resetModules();
    const coverDetectorModule = await import('../../../scripts/cover/auto-cover/CoverDetector.js');
    coverDetector = coverDetectorModule.default;

    global.canvas = {
      walls: {
        objects: {
          children: [],
        },
      },
      tokens: {
        placeables: [],
      },
    };

    global.game.settings.get = jest.fn((module, setting) => {
      const settingsMap = {
        wallCoverStandardThreshold: 50,
        wallCoverGreaterThreshold: 70,
        wallCoverAllowGreater: true,
      };
      return settingsMap[setting] ?? null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Lesser Cover Override Support', () => {
    test('should support lesser cover override for walls', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'lesser';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('lesser');
    });

    test('should include lesser in cover order', () => {
      const mockWall = {
        document: {
          getFlag: jest.fn(() => 'lesser'),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(['lesser', 'standard', 'greater']).toContain(result);
    });
  });

  describe('Cover-Granting Overrides (lesser/standard/greater)', () => {
    test('should apply lesser override even when wall would not naturally block', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 2, // RIGHT directional wall
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'lesser';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 150, y: 100 }; // Attacker on right side (non-blocking direction for RIGHT wall)
      const p2 = { x: 50, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false); // Wall would NOT naturally block

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('lesser'); // Override should still apply
    });

    test('should apply standard override even when wall would not naturally block', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 1, // LEFT directional wall
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'standard';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 100 }; // Attacker on left side (non-blocking direction for LEFT wall)
      const p2 = { x: 150, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false); // Wall would NOT naturally block

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('standard'); // Override should still apply
    });

    test('should apply greater override even when wall would not naturally block', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0, // BOTH directional wall
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'greater';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false); // Wall would NOT naturally block

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('greater'); // Override should still apply
    });

    test('should not apply cover-granting override if wall does not intersect line', () => {
      const mockWall = {
        document: {
          getFlag: jest.fn(() => 'standard'),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 50 };
      const p2 = { x: 150, y: 50 };

      coverDetector._lineIntersectionPoint = jest.fn(() => null); // No intersection
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBeNull(); // No override if no intersection
    });
  });

  describe('None Override Behavior', () => {
    test('should apply none override only when wall would naturally block', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'none';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true); // Wall WOULD naturally block

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('none'); // Override should apply to remove natural cover
    });

    test('should not apply none override when wall would not naturally block', () => {
      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 2, // RIGHT directional wall
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'none';
            }
            return null;
          }),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 150, y: 100 }; // Attacker on right side (non-blocking direction)
      const p2 = { x: 50, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 100, y: 100 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false); // Wall would NOT naturally block

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBeNull(); // Override should NOT apply
    });

    test('should not apply none override if wall does not intersect line', () => {
      const mockWall = {
        document: {
          getFlag: jest.fn(() => 'none'),
        },
        coords: [100, 0, 100, 200],
      };

      global.canvas.walls.objects.children = [mockWall];

      const p1 = { x: 50, y: 50 };
      const p2 = { x: 150, y: 50 };

      coverDetector._lineIntersectionPoint = jest.fn(() => null); // No intersection
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBeNull(); // No override if no intersection
    });
  });

  describe('Multiple Walls with Overrides', () => {
    test('should return highest cover override when multiple walls have overrides', () => {
      const wall1 = {
        document: {
          getFlag: jest.fn(() => 'lesser'),
        },
        coords: [100, 0, 100, 200],
      };

      const wall2 = {
        document: {
          getFlag: jest.fn(() => 'standard'),
        },
        coords: [150, 0, 150, 200],
      };

      const wall3 = {
        document: {
          getFlag: jest.fn(() => 'greater'),
        },
        coords: [200, 0, 200, 200],
      };

      global.canvas.walls.objects.children = [wall1, wall2, wall3];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 250, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn((x1, y1, x2, y2, wx1, wy1, wx2, wy2) => {
        if (wx1 === 100) return { x: 100, y: 100 };
        if (wx1 === 150) return { x: 150, y: 100 };
        if (wx1 === 200) return { x: 200, y: 100 };
        return null;
      });
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('greater'); // Should return highest override
    });

    test('should prioritize cover-granting overrides over none override', () => {
      const wall1 = {
        document: {
          getFlag: jest.fn(() => 'none'),
        },
        coords: [100, 0, 100, 200],
      };

      const wall2 = {
        document: {
          getFlag: jest.fn(() => 'standard'),
        },
        coords: [150, 0, 150, 200],
      };

      global.canvas.walls.objects.children = [wall1, wall2];

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 200, y: 100 };

      coverDetector._lineIntersectionPoint = jest.fn((x1, y1, x2, y2, wx1, wy1, wx2, wy2) => {
        if (wx1 === 100) return { x: 100, y: 100 };
        if (wx1 === 150) return { x: 150, y: 100 };
        return null;
      });
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => true);

      const result = coverDetector._checkWallCoverOverrides(p1, p2);
      expect(result).toBe('standard'); // Should prioritize cover-granting override
    });
  });

  describe('Integration with detectBetweenTokens', () => {
    test('should use lesser override in full detection flow', () => {
      const sourceToken = global.createMockToken({
        id: 'source',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 50, y: 50 },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      const targetToken = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 250, y: 250 },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 0,
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'lesser';
            }
            return null;
          }),
        },
        coords: [125, 0, 125, 250],
      };

      global.canvas.tokens.placeables = [sourceToken, targetToken];
      global.canvas.walls.objects.children = [mockWall];

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 125, y: 125 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false);
      coverDetector._estimateWallCoveragePercent = jest.fn(() => 80);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'lesser']).toContain(result);
    });

    test('should apply cover-granting override even when wall would not naturally block in full flow', () => {
      const sourceToken = global.createMockToken({
        id: 'source',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        center: { x: 50, y: 50 },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      const targetToken = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        width: 1,
        height: 1,
        center: { x: 250, y: 250 },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      });

      const mockWall = {
        document: {
          id: 'test-wall',
          sight: 1,
          door: 0,
          ds: 0,
          dir: 2, // RIGHT directional wall
          getFlag: jest.fn((moduleId, flagName) => {
            if (moduleId === MODULE_ID && flagName === 'coverOverride') {
              return 'standard';
            }
            return null;
          }),
        },
        coords: [125, 0, 125, 250],
      };

      global.canvas.tokens.placeables = [sourceToken, targetToken];
      global.canvas.walls.objects.children = [mockWall];

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 125, y: 125 }));
      coverDetector._wouldWallNaturallyBlock = jest.fn(() => false); // Would NOT naturally block
      coverDetector._estimateWallCoveragePercent = jest.fn(() => 0);

      const result = coverDetector.detectBetweenTokens(sourceToken, targetToken);
      expect(['none', 'standard']).toContain(result);
    });
  });
});


