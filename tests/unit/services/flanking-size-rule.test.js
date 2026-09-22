import '../../setup.js';

import { MODULE_ID } from '../../../scripts/constants.js';
import {
  anyCornerPairOnOppositeSides,
  anySquarePairOnOppositeSides,
  boundsCorners,
  findFlankingPair,
  lineThroughTarget,
  pointsOnOppositeSides,
  splitBoundsIntoSquareCenters,
  wrapOnOppositeSides,
} from '../../../scripts/services/flanking/flanking-size-rule.js';

const GRID = 100;
const rect = (x, y, w, h) => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });

const target = rect(100, 200, 100, 100);
const largeAllyNW = rect(0, 0, 200, 200);
const mediumFlankerSE = rect(200, 300, 100, 100);
const mediumFlankerNE = rect(200, 0, 100, 100);
const mediumAllyW = rect(0, 200, 100, 100);
const mediumAllyN = rect(100, 100, 100, 100);
const mediumFlankerNW = rect(0, 100, 100, 100);
const mediumFlankerE = rect(200, 200, 100, 100);

function token(bounds) {
  return { mechanicalBounds: bounds };
}

describe('splitBoundsIntoSquareCenters', () => {
  test('medium token yields its single center', () => {
    expect(splitBoundsIntoSquareCenters(mediumFlankerE, GRID)).toEqual([{ x: 250, y: 250 }]);
  });

  test('large token yields four square centers', () => {
    expect(splitBoundsIntoSquareCenters(largeAllyNW, GRID)).toEqual([
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 50, y: 150 },
      { x: 150, y: 150 },
    ]);
  });

  test('tiny token yields empty list', () => {
    expect(splitBoundsIntoSquareCenters(rect(0, 0, 50, 50), GRID)).toEqual([]);
  });
});

describe('pointsOnOppositeSides', () => {
  test('large ally center vs medium flanker fails RAW geometry', () => {
    expect(pointsOnOppositeSides({ x: 100, y: 100 }, { x: 250, y: 350 }, target)).toBe(false);
  });

  test('line through opposite corners counts', () => {
    expect(pointsOnOppositeSides({ x: 50, y: 150 }, { x: 250, y: 350 }, target)).toBe(true);
  });

  test('straight line through opposite edges counts', () => {
    expect(pointsOnOppositeSides({ x: 50, y: 250 }, { x: 250, y: 250 }, target)).toBe(true);
  });
});

describe('anySquarePairOnOppositeSides', () => {
  test('large ally NW + medium flanker SE flanks', () => {
    expect(anySquarePairOnOppositeSides(mediumFlankerSE, largeAllyNW, target, GRID)).toBe(true);
  });

  test('large ally NW + medium flanker NE does not flank', () => {
    expect(anySquarePairOnOppositeSides(mediumFlankerNE, largeAllyNW, target, GRID)).toBe(false);
  });

  test('medium vs medium matches RAW', () => {
    expect(anySquarePairOnOppositeSides(mediumFlankerE, mediumAllyW, target, GRID)).toBe(true);
  });
});

describe('boundsCorners', () => {
  test('returns the four outer corners', () => {
    expect(boundsCorners(mediumFlankerE)).toEqual([
      { x: 200, y: 200 },
      { x: 300, y: 200 },
      { x: 200, y: 300 },
      { x: 300, y: 300 },
    ]);
  });
});

describe('anyCornerPairOnOppositeSides', () => {
  test('large ally NW + medium flanker SE flanks', () => {
    expect(anyCornerPairOnOppositeSides(mediumFlankerSE, largeAllyNW, target)).toBe(true);
  });

  test('medium ally N + medium flanker E flanks via opposite corners', () => {
    expect(anyCornerPairOnOppositeSides(mediumFlankerE, mediumAllyN, target)).toBe(true);
  });

  test('medium ally N + medium flanker NW does not flank', () => {
    expect(anyCornerPairOnOppositeSides(mediumFlankerNW, mediumAllyN, target)).toBe(false);
  });
});

describe('lineThroughTarget', () => {
  test('center line crossing target counts', () => {
    expect(lineThroughTarget(mediumFlankerSE, largeAllyNW, target)).toBe(true);
  });

  test('center line missing target does not count', () => {
    expect(lineThroughTarget(mediumFlankerNE, largeAllyNW, target)).toBe(false);
  });
});

describe('findFlankingPair', () => {
  test('anySquare returns the square centers that produced the flank', () => {
    const pair = findFlankingPair(mediumFlankerSE, largeAllyNW, target, GRID, 'anySquare');
    expect(pair.from).toEqual({ x: 250, y: 350 });
    expect([{ x: 50, y: 150 }, { x: 150, y: 150 }, { x: 50, y: 50 }]).toContainEqual(pair.to);
    expect(pointsOnOppositeSides(pair.from, pair.to, target)).toBe(true);
  });

  test('anyCorner returns corner points', () => {
    const pair = findFlankingPair(mediumFlankerE, mediumAllyN, target, GRID, 'anyCorner');
    expect(boundsCorners(mediumFlankerE)).toContainEqual(pair.from);
    expect(boundsCorners(mediumAllyN)).toContainEqual(pair.to);
  });

  test('lineThrough returns centers', () => {
    expect(findFlankingPair(mediumFlankerSE, largeAllyNW, target, GRID, 'lineThrough')).toEqual({
      from: { x: 250, y: 350 },
      to: { x: 100, y: 100 },
    });
  });

  test('returns null when no pair flanks', () => {
    expect(findFlankingPair(mediumFlankerNE, largeAllyNW, target, GRID, 'anySquare')).toBeNull();
  });

  test('raw returns null', () => {
    expect(findFlankingPair(mediumFlankerE, mediumAllyW, target, GRID, 'raw')).toBeNull();
  });
});

describe('wrapOnOppositeSides', () => {
  let wrapped;

  beforeEach(() => {
    wrapped = jest.fn(() => 'raw-result');
    global.canvas = { grid: { size: GRID, isGridless: false } };
  });

  afterEach(() => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', undefined);
  });

  test('raw setting delegates to wrapped', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'raw');
    const result = wrapOnOppositeSides(wrapped, token(mediumFlankerSE), token(largeAllyNW), token(target));
    expect(result).toBe('raw-result');
    expect(wrapped).toHaveBeenCalledWith(token(mediumFlankerSE), token(largeAllyNW), token(target));
  });

  test('anySquare setting flanks with large ally', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anySquare');
    expect(wrapOnOppositeSides(wrapped, token(mediumFlankerSE), token(largeAllyNW), token(target))).toBe(true);
    expect(wrapped).not.toHaveBeenCalled();
  });

  test('lineThrough setting flanks with large ally', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'lineThrough');
    expect(wrapOnOppositeSides(wrapped, token(mediumFlankerSE), token(largeAllyNW), token(target))).toBe(true);
    expect(wrapped).not.toHaveBeenCalled();
  });

  test('anyCorner setting flanks with perpendicular mediums', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anyCorner');
    expect(wrapOnOppositeSides(wrapped, token(mediumFlankerE), token(mediumAllyN), token(target))).toBe(true);
    expect(wrapped).not.toHaveBeenCalled();
  });

  test('gridless scene delegates to wrapped', () => {
    global.canvas.grid.isGridless = true;
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anySquare');
    expect(wrapOnOppositeSides(wrapped, token(mediumFlankerSE), token(largeAllyNW), token(target))).toBe('raw-result');
  });

  test('tiny flanker delegates to wrapped', () => {
    global.game.settings.set(MODULE_ID, 'flankingSizeRule', 'anySquare');
    const tiny = token(rect(200, 300, 50, 50));
    expect(wrapOnOppositeSides(wrapped, tiny, token(largeAllyNW), token(target))).toBe('raw-result');
  });
});
