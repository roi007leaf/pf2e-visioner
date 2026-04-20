/**
 * @jest-environment jsdom
 */

var mockLogger;
const loggerProxy = {
  debug: (...args) => mockLogger?.debug?.(...args),
  info: (...args) => mockLogger?.info?.(...args),
  warn: (...args) => mockLogger?.warn?.(...args),
  error: (...args) => mockLogger?.error?.(...args),
};

jest.mock('../../../scripts/helpers/size-elevation-utils.js', () => ({
  getTokenVerticalSpanFt: jest.fn(() => ({ bottom: 0, top: 10 })),
}));

jest.mock('../../../scripts/helpers/wall-height-utils.js', () => ({
  doesWallBlockAtElevation: jest.fn(() => true),
}));

jest.mock('../../../scripts/services/LevelsIntegration.js', () => ({
  LevelsIntegration: {
    getInstance: jest.fn(() => ({
      isActive: false,
    })),
  },
}));

jest.mock('../../../scripts/utils/logger.js', () => ({
  getLogger: jest.fn(() => loggerProxy),
}));

jest.mock('../../../scripts/helpers/geometry-utils.js', () => ({
  calculateDistanceInFeet: jest.fn(() => 5),
}));

jest.mock('../../../scripts/visibility/auto-visibility/SensingCapabilitiesBuilder.js', () => ({
  SensingCapabilitiesBuilder: jest.fn(),
}));

jest.mock('../../../scripts/constants.js', () => ({
  MODULE_ID: 'pf2e-visioner',
}));

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('VisionAnalyzer door shortcut same-side handling', () => {
  let visionAnalyzer;
  let mockObserver;
  let mockTarget;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    jest.clearAllMocks();

    global.CONST = {
      WALL_SENSE_TYPES: {
        NONE: 0,
        NORMAL: 1,
        LIMITED: 2,
      },
    };

    global.foundry = {
      utils: {
        lineLineIntersection: jest.fn(() => null),
      },
      canvas: {
        geometry: {
          Ray: jest.fn().mockImplementation((from, to) => ({
            A: from,
            B: to,
          })),
        },
      },
    };

    global.PIXI = {
      Circle: jest.fn().mockImplementation((x, y, radius) => ({
        x,
        y,
        radius,
      })),
    };

    global.canvas = {
      walls: {
        placeables: [],
      },
      effects: {
        darknessSources: [],
      },
      scene: {
        grid: {
          distance: 5,
        },
      },
      grid: {
        size: 50,
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

    global.game = {
      settings: {
        get: jest.fn(() => false),
      },
    };

    visionAnalyzer = new VisionAnalyzer();

    mockObserver = {
      name: 'Observer',
      center: { x: 198, y: 100 },
      document: {
        id: 'observer',
        x: 173,
        y: 75,
        width: 1,
        height: 1,
        elevation: 0,
      },
    };

    mockTarget = {
      name: 'Target',
      center: { x: 199, y: 100 },
      document: {
        id: 'target',
        x: 174,
        y: 75,
        width: 1,
        height: 1,
        elevation: 0,
      },
    };
  });

  test('does not block when a closed door is near the ray but both points are on the same side', () => {
    global.canvas.walls.placeables = [
      {
        document: {
          c: [200, 50, 200, 150],
          sight: CONST.WALL_SENSE_TYPES.NORMAL,
          sound: CONST.WALL_SENSE_TYPES.NONE,
          door: 1,
          ds: 0,
        },
      },
    ];

    const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

    expect(result).toBe(true);
  });
});
