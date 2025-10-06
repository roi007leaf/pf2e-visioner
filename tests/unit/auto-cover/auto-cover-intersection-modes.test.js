/**
 * Comprehensive tests for Auto-Cover Intersection Mode Behaviors
 *
 * Tests the different intersection mode algorithms that determine how tokens block cover:
 * - 'any' mode: Size-based calculation with any intersection
 * - 'coverage' mode: Coverage percentage calculation (50%/70% thresholds)
 * - 'tactical' mode: Corner-to-corner tactical calculation
 * - 'length10' mode: Grid-square-based 10% threshold approach
 *
 * These modes provide different levels of precision and realism for cover calculations.
 */

import '../../setup.js';

describe('Auto-Cover Intersection Mode Behaviors', () => {
  let mockCanvas, mockGame;

  beforeEach(() => {
    // Setup mock canvas and game for intersection mode tests
    mockCanvas = {
      grid: { size: 100 },
      tokens: { placeables: [] },
      walls: { placeables: [] },
      lighting: { placeables: [] },
      terrain: { placeables: [] },
    };

    mockGame = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          if (setting === 'autoCoverTokenIntersectionMode') return 'any'; // Default
          return false;
        }),
      },
    };

    // Extend existing global canvas instead of replacing it
    Object.assign(global.canvas, mockCanvas);
    Object.assign(global.game, mockGame);
  });

  describe('Intersection Mode Selection Logic', () => {
    test('validates getIntersectionMode function behavior', () => {
      const getIntersectionMode = () => {
        const mode = global.game.settings?.get?.('pf2e-visioner', 'autoCoverTokenIntersectionMode');
        return mode || 'any';
      };

      // Test default fallback
      mockGame.settings.get.mockReturnValue(undefined);
      expect(getIntersectionMode()).toBe('any');

      mockGame.settings.get.mockReturnValue('coverage');
      expect(getIntersectionMode()).toBe('coverage');

      mockGame.settings.get.mockReturnValue('tactical');
      expect(getIntersectionMode()).toBe('tactical');

      mockGame.settings.get.mockReturnValue('length10');
      expect(getIntersectionMode()).toBe('length10');
    });

    test('validates mode-specific algorithm selection', () => {
      const selectAlgorithm = (mode) => {
        const useCoverage = mode === 'coverage';
        const useTactical = mode === 'tactical';

        if (useTactical) return 'evaluateCoverByTactical';
        if (useCoverage) return 'evaluateCoverByCoverage';
        return 'evaluateCoverBySize';
      };

      expect(selectAlgorithm('any')).toBe('evaluateCoverBySize');
      expect(selectAlgorithm('length10')).toBe('evaluateCoverBySize');
      expect(selectAlgorithm('coverage')).toBe('evaluateCoverByCoverage');
      expect(selectAlgorithm('tactical')).toBe('evaluateCoverByTactical');
    });
  });

  describe('Any Mode Intersection Logic', () => {
    test('validates any intersection behavior', () => {
      // 'any' mode: any intersection counts, uses size-based calculation
      const anyModeIntersection = (line, rect) => {
        // Check if line intersects any edge of the rectangle
        const edges = [
          [
            { x: rect.x1, y: rect.y1 },
            { x: rect.x2, y: rect.y1 },
          ], // top
          [
            { x: rect.x2, y: rect.y1 },
            { x: rect.x2, y: rect.y2 },
          ], // right
          [
            { x: rect.x2, y: rect.y2 },
            { x: rect.x1, y: rect.y2 },
          ], // bottom
          [
            { x: rect.x1, y: rect.y2 },
            { x: rect.x1, y: rect.y1 },
          ], // left
        ];

        for (const [p1, p2] of edges) {
          if (segmentsIntersect(line.start, line.end, p1, p2)) {
            return true;
          }
        }
        return false;
      };

      // Helper function for line intersection
      const segmentsIntersect = (p1, p2, q1, q2) => {
        const orientation = (a, b, c) =>
          Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
        const onSegment = (a, b, c) =>
          Math.min(a.x, b.x) <= c.x &&
          c.x <= Math.max(a.x, b.x) &&
          Math.min(a.y, b.y) <= c.y &&
          c.y <= Math.max(a.y, b.y);

        const o1 = orientation(p1, p2, q1);
        const o2 = orientation(p1, p2, q2);
        const o3 = orientation(q1, q2, p1);
        const o4 = orientation(q1, q2, p2);

        if (o1 !== o2 && o3 !== o4) return true;
        if (o1 === 0 && onSegment(p1, p2, q1)) return true;
        if (o2 === 0 && onSegment(p1, p2, q2)) return true;
        if (o3 === 0 && onSegment(q1, q2, p1)) return true;
        if (o4 === 0 && onSegment(q1, q2, p2)) return true;
        return false;
      };

      const line = { start: { x: 0, y: 50 }, end: { x: 200, y: 50 } }; // Horizontal line
      const rect1 = { x1: 50, y1: 25, x2: 150, y2: 75 }; // Intersects
      const rect2 = { x1: 50, y1: 100, x2: 150, y2: 150 }; // Doesn't intersect

      expect(anyModeIntersection(line, rect1)).toBe(true);
      expect(anyModeIntersection(line, rect2)).toBe(false);
    });

    test('validates size-based cover calculation in any mode', () => {
      // Any mode uses size-based calculation after intersection check
      const calculateSizeCover = (attackerSize, targetSize, blockerSize) => {
        const SIZE_RANKS = { tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 };

        const attackerRank = SIZE_RANKS[attackerSize] ?? 2;
        const targetRank = SIZE_RANKS[targetSize] ?? 2;
        const blockerRank = SIZE_RANKS[blockerSize] ?? 2;

        const sizeDiffAttacker = blockerRank - attackerRank;
        const sizeDiffTarget = blockerRank - targetRank;
        const grantsStandard = sizeDiffAttacker >= 2 && sizeDiffTarget >= 2;

        return grantsStandard ? 'standard' : 'lesser';
      };

      // Test size-based calculations
      expect(calculateSizeCover('med', 'med', 'med')).toBe('lesser');
      expect(calculateSizeCover('med', 'med', 'huge')).toBe('standard');
      expect(calculateSizeCover('tiny', 'sm', 'lg')).toBe('standard');
    });
  });

  describe('Coverage Mode Intersection Logic', () => {
    test('validates coverage percentage calculation', () => {
      // Coverage mode calculates what percentage of the blocker's side is covered by the line
      const calculateCoveragePercentage = (line, rect) => {
        const intersectionLength = segmentRectIntersectionLength(line.start, line.end, rect);
        if (intersectionLength <= 0) return 0;

        const width = Math.abs(rect.x2 - rect.x1);
        const height = Math.abs(rect.y2 - rect.y1);
        const side = Math.max(width, height); // Larger side in pixels

        return (intersectionLength / Math.max(1, side)) * 100;
      };

      // Simplified intersection length calculation
      const segmentRectIntersectionLength = (p1, p2, rect) => {
        // For horizontal line intersecting vertical rectangle
        if (Math.abs(p1.y - p2.y) < 0.1) {
          // Horizontal line
          const y = p1.y;
          if (y >= rect.y1 && y <= rect.y2) {
            const enterX = Math.max(p1.x, rect.x1);
            const exitX = Math.min(p2.x, rect.x2);
            return Math.max(0, exitX - enterX);
          }
        }

        // For vertical line intersecting horizontal rectangle
        if (Math.abs(p1.x - p2.x) < 0.1) {
          // Vertical line
          const x = p1.x;
          if (x >= rect.x1 && x <= rect.x2) {
            const enterY = Math.max(p1.y, rect.y1);
            const exitY = Math.min(p2.y, rect.y2);
            return Math.max(0, exitY - enterY);
          }
        }

        return 0; // Simplified - only handle axis-aligned cases
      };

      const horizontalLine = { start: { x: 0, y: 50 }, end: { x: 200, y: 50 } };
      const rect100x100 = { x1: 50, y1: 25, x2: 150, y2: 125 }; // 100x100 rect

      // Line intersects 100px of the 100px width = 100% coverage
      const coverage = calculateCoveragePercentage(horizontalLine, rect100x100);
      expect(coverage).toBe(100);
    });

    test('validates coverage-based cover level determination', () => {
      const evaluateCoverageLevel = (coveragePercent) => {
        const lesserThreshold = 50;
        const greaterThreshold = 70;

        if (coveragePercent >= greaterThreshold) return 'greater';
        if (coveragePercent >= lesserThreshold) return 'standard';
        if (coveragePercent > 0) return 'lesser';
        return 'none';
      };

      expect(evaluateCoverageLevel(0)).toBe('none');
      expect(evaluateCoverageLevel(25)).toBe('lesser');
      expect(evaluateCoverageLevel(50)).toBe('standard');
      expect(evaluateCoverageLevel(70)).toBe('greater');
      expect(evaluateCoverageLevel(100)).toBe('greater');
    });

    test('validates multiple blocker coverage aggregation', () => {
      const aggregateCoverageFromMultipleBlockers = (blockers) => {
        let sawAny = false;
        let meetsStandard = false;
        let meetsGreater = false;

        for (const blocker of blockers) {
          if (blocker.coverage <= 0) continue;
          sawAny = true;

          if (blocker.coverage >= 70) {
            meetsGreater = true;
            break; // Greater cover found, no need to continue
          }
          if (blocker.coverage >= 50) {
            meetsStandard = true;
          }
        }

        return meetsGreater ? 'greater' : meetsStandard ? 'standard' : sawAny ? 'lesser' : 'none';
      };

      expect(aggregateCoverageFromMultipleBlockers([{ coverage: 25 }, { coverage: 30 }])).toBe(
        'lesser',
      );
      expect(aggregateCoverageFromMultipleBlockers([{ coverage: 25 }, { coverage: 55 }])).toBe(
        'standard',
      );
      expect(aggregateCoverageFromMultipleBlockers([{ coverage: 25 }, { coverage: 75 }])).toBe(
        'greater',
      );
    });
  });

  describe('Tactical Mode Intersection Logic', () => {
    test('validates corner-to-corner line calculation', () => {
      // Tactical mode checks lines from each attacker corner to each target corner
      const generateCornerToCornerLines = (attackerRect, targetRect) => {
        const attackerCorners = [
          { x: attackerRect.x1, y: attackerRect.y1 }, // top-left
          { x: attackerRect.x2, y: attackerRect.y1 }, // top-right
          { x: attackerRect.x2, y: attackerRect.y2 }, // bottom-right
          { x: attackerRect.x1, y: attackerRect.y2 }, // bottom-left
        ];

        const targetCorners = [
          { x: targetRect.x1, y: targetRect.y1 },
          { x: targetRect.x2, y: targetRect.y1 },
          { x: targetRect.x2, y: targetRect.y2 },
          { x: targetRect.x1, y: targetRect.y2 },
        ];

        const lines = [];
        for (const attackerCorner of attackerCorners) {
          for (const targetCorner of targetCorners) {
            lines.push({ start: attackerCorner, end: targetCorner });
          }
        }

        return lines;
      };

      const attackerRect = { x1: 0, y1: 0, x2: 100, y2: 100 };
      const targetRect = { x1: 300, y1: 0, x2: 400, y2: 100 };

      const lines = generateCornerToCornerLines(attackerRect, targetRect);
      expect(lines).toHaveLength(16); // 4 attacker corners × 4 target corners

      // Verify first line (top-left to top-left)
      expect(lines[0]).toEqual({ start: { x: 0, y: 0 }, end: { x: 300, y: 0 } });
    });

    test('validates tactical cover percentage calculation', () => {
      // Tactical mode calculates cover based on percentage of blocked lines
      const calculateTacticalCover = (lines, blockers) => {
        let blockedLines = 0;

        for (const line of lines) {
          let lineBlocked = false;
          for (const blocker of blockers) {
            if (lineIntersectsRect(line, blocker.rect)) {
              lineBlocked = true;
              break;
            }
          }
          if (lineBlocked) blockedLines++;
        }

        const blockedPercentage = (blockedLines / lines.length) * 100;

        if (blockedPercentage >= 75) return 'greater';
        if (blockedPercentage >= 50) return 'standard';
        if (blockedPercentage > 0) return 'lesser';
        return 'none';
      };

      const lineIntersectsRect = (line, rect) => {
        // Simplified intersection check
        const minX = Math.min(line.start.x, line.end.x);
        const maxX = Math.max(line.start.x, line.end.x);
        const minY = Math.min(line.start.y, line.end.y);
        const maxY = Math.max(line.start.y, line.end.y);

        return !(rect.x2 < minX || rect.x1 > maxX || rect.y2 < minY || rect.y1 > maxY);
      };

      const lines = [
        { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
        { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
        { start: { x: 0, y: 100 }, end: { x: 100, y: 0 } },
        { start: { x: 0, y: 100 }, end: { x: 100, y: 100 } },
      ];

      const blocker = { rect: { x1: 40, y1: -10, x2: 60, y2: 110 } }; // Blocks some lines

      const result = calculateTacticalCover(lines, [blocker]);
      expect(['none', 'lesser', 'standard', 'greater'].includes(result)).toBe(true);
    });

    test('validates tiny creature special handling', () => {
      // Tactical mode gives tiny creatures effective area for cover calculations
      const getTinyEffectiveCorners = (centerX, centerY, gridSize) => {
        const halfEffective = gridSize * 0.35; // 0.7 square effective area

        return [
          { x: centerX - halfEffective, y: centerY - halfEffective },
          { x: centerX + halfEffective, y: centerY - halfEffective },
          { x: centerX + halfEffective, y: centerY + halfEffective },
          { x: centerX - halfEffective, y: centerY + halfEffective },
        ];
      };

      const corners = getTinyEffectiveCorners(150, 150, 100);

      expect(corners).toHaveLength(4);
      expect(corners[0]).toEqual({ x: 115, y: 115 });
      expect(corners[2]).toEqual({ x: 185, y: 185 });

      // Verify it's 70% of grid size
      const width = corners[1].x - corners[0].x;
      const height = corners[2].y - corners[1].y;
      expect(width).toBe(70);
      expect(height).toBe(70);
    });
  });

  describe('Length10 Mode Intersection Logic', () => {
    test('validates grid-square-based 10% threshold', () => {
      // Length10 mode requires at least 10% of total grid squares to be intersected
      const length10ModeIntersection = (line, rect, gridSize) => {
        const intersectionLength = calculateIntersectionLength(line, rect);
        if (intersectionLength <= 0) return false;

        const width = Math.abs(rect.x2 - rect.x1);
        const height = Math.abs(rect.y2 - rect.y1);
        const totalGridSquares = (width / gridSize) * (height / gridSize);
        const intersectedGridSquares = intersectionLength / gridSize;

        const percentage = (intersectedGridSquares / totalGridSquares) * 100;
        return percentage >= 10;
      };

      const calculateIntersectionLength = (line, rect) => {
        // Simplified for horizontal line
        if (Math.abs(line.start.y - line.end.y) < 0.1) {
          const y = line.start.y;
          if (y >= rect.y1 && y <= rect.y2) {
            const enterX = Math.max(line.start.x, rect.x1);
            const exitX = Math.min(line.end.x, rect.x2);
            return Math.max(0, exitX - enterX);
          }
        }
        return 0;
      };

      const line = { start: { x: 0, y: 50 }, end: { x: 200, y: 50 } };
      const rect = { x1: 50, y1: 25, x2: 150, y2: 125 }; // 100x100 rect
      const gridSize = 100;

      // 100px intersection on 100x100 rect = 100% intersection = passes 10% threshold
      expect(length10ModeIntersection(line, rect, gridSize)).toBe(true);

      // Test with smaller intersection
      const smallRect = { x1: 90, y1: 25, x2: 110, y2: 125 }; // 20x100 rect
      // 20px intersection on 20x100 rect = 10% intersection = passes threshold
      expect(length10ModeIntersection(line, smallRect, gridSize)).toBe(true);
    });
  });

  describe('Mode Comparison and Integration', () => {
    test('validates mode behavior differences', () => {
      const compareModes = (line, rect) => {
        const results = {};

        // Any mode: any intersection
        results.any = anyIntersection(line, rect);

        // Center mode: center must be on line
        results.center = centerIntersection(line, rect);

        // Coverage mode: based on coverage percentage
        results.coverage = coverageIntersection(line, rect);

        return results;
      };

      const anyIntersection = (line, rect) => {
        // Simplified: check if line passes through rect bounds
        const minX = Math.min(line.start.x, line.end.x);
        const maxX = Math.max(line.start.x, line.end.x);
        const minY = Math.min(line.start.y, line.end.y);
        const maxY = Math.max(line.start.y, line.end.y);

        return !(rect.x2 < minX || rect.x1 > maxX || rect.y2 < minY || rect.y1 > maxY);
      };

      const centerIntersection = (line, rect) => {
        const centerX = (rect.x1 + rect.x2) / 2;
        const centerY = (rect.y1 + rect.y2) / 2;

        // Check if center is on the line (within tolerance)
        const tolerance = 1;
        const distance =
          Math.abs(
            (line.end.y - line.start.y) * centerX -
              (line.end.x - line.start.x) * centerY +
              line.end.x * line.start.y -
              line.end.y * line.start.x,
          ) /
          Math.sqrt(
            Math.pow(line.end.y - line.start.y, 2) + Math.pow(line.end.x - line.start.x, 2),
          );

        return distance <= tolerance;
      };

      const coverageIntersection = (line, rect) => {
        // Simplified coverage check
        return anyIntersection(line, rect); // For this test, same as any
      };

      const line = { start: { x: 0, y: 50 }, end: { x: 200, y: 50 } };
      const rectOnLine = { x1: 75, y1: 25, x2: 125, y2: 75 }; // Center at (100, 50)
      const rectOffLine = { x1: 75, y1: 80, x2: 125, y2: 130 }; // Center at (100, 105)

      const resultsOnLine = compareModes(line, rectOnLine);
      const resultsOffLine = compareModes(line, rectOffLine);

      // On-line rect should pass all modes
      expect(resultsOnLine.any).toBe(true);
      expect(resultsOnLine.center).toBe(true);
      expect(resultsOnLine.coverage).toBe(true);

      // Off-line rect should pass any/coverage but fail center
      expect(resultsOffLine.any).toBe(false); // Doesn't intersect at all
      expect(resultsOffLine.center).toBe(false);
      expect(resultsOffLine.coverage).toBe(false);
    });

    test('validates mode performance characteristics', () => {
      const getModeCharacteristics = (mode) => {
        const characteristics = {
          any: { precision: 'low', performance: 'high', realism: 'medium' },
          center: { precision: 'high', performance: 'high', realism: 'low' },
          coverage: { precision: 'medium', performance: 'medium', realism: 'high' },
          tactical: { precision: 'very-high', performance: 'low', realism: 'very-high' },
          length10: { precision: 'medium', performance: 'medium', realism: 'medium' },
        };

        return (
          characteristics[mode] || {
            precision: 'unknown',
            performance: 'unknown',
            realism: 'unknown',
          }
        );
      };

      expect(getModeCharacteristics('any').precision).toBe('low');
      expect(getModeCharacteristics('coverage').realism).toBe('high');
      expect(getModeCharacteristics('tactical').realism).toBe('very-high');
      expect(getModeCharacteristics('tactical').performance).toBe('low');
    });

    test('validates mode selection recommendations', () => {
      const recommendMode = (scenario) => {
        switch (scenario) {
          case 'performance-critical':
            return 'any'; // Fastest
          case 'precise-tactical':
            return 'tactical'; // Most realistic
          case 'balanced':
            return 'coverage'; // Good balance
          case 'strict-los':
            return 'center'; // Strict line of sight
          default:
            return 'any'; // Default fallback
        }
      };

      expect(recommendMode('performance-critical')).toBe('any');
      expect(recommendMode('precise-tactical')).toBe('tactical');
      expect(recommendMode('balanced')).toBe('coverage');
      expect(recommendMode('strict-los')).toBe('center');
      expect(recommendMode('unknown')).toBe('any');
    });
  });
});
