/**
 * Tests for LightingCalculator sourceId lookup functionality
 * Ensures PointDarknessSource can read darknessRank from linked document lights
 */

import { MODULE_ID } from '../../scripts/constants.js';
import { LightingCalculator } from '../../scripts/visibility/auto-visibility/LightingCalculator.js';

// Mock canvas and scene
const mockCanvas = {
  scene: {
    lights: new Map(),
  },
  effects: {
    darknessSources: [],
    getDarknessLevel: () => 0.8,
  },
  grid: {
    size: 100,
  },
  tokens: {
    controlled: [],
    placeables: [],
  },
};

// Mock light document with flags
const mockLightDocument = {
  id: 'test-light-123',
  getFlag: jest.fn((moduleId, flagName) => {
    if (moduleId === MODULE_ID && flagName === 'darknessRank') {
      return 4;
    }
    return undefined;
  }),
};

// Mock PointDarknessSource without document but with sourceId
const mockPointDarknessSource = {
  active: true,
  x: 1600,
  y: 1100,
  document: null, // No document
  sourceId: 'AmbientLight.test-light-123', // Links to mockLightDocument
  data: {
    bright: 400,
    dim: 400,
  },
  constructor: {
    name: 'PointDarknessSource',
  },
};

// Mock token
const mockToken = {
  document: {
    x: 1550,
    y: 1050,
    width: 1,
    height: 1,
    elevation: 0,
  },
  center: { x: 1600, y: 1100 },
  shape: {
    clone: () => ({
      points: [1550, 1050, 1650, 1050, 1650, 1150, 1550, 1150],
    }),
  },
};

describe('LightingCalculator sourceId Lookup', () => {
  let lightingCalculator;
  let originalCanvas;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Store original canvas
    originalCanvas = global.canvas;

    // Setup global canvas mock
    global.canvas = mockCanvas;

    // Setup scene lights collection
    mockCanvas.scene.lights.clear();
    mockCanvas.scene.lights.set('test-light-123', mockLightDocument);

    // Setup darkness sources
    mockCanvas.effects.darknessSources = [mockPointDarknessSource];

    lightingCalculator = new LightingCalculator();
  });

  afterEach(() => {
    // Restore original canvas
    global.canvas = originalCanvas;
  });

  test('should read darknessRank from source document via sourceId', () => {
    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: true,
      darknessRank: 4,
    });

    // Verify the source document was queried
    expect(mockLightDocument.getFlag).toHaveBeenCalledWith(MODULE_ID, 'darknessRank');
  });

  test('should handle PointDarknessSource without sourceId', () => {
    // Remove sourceId
    const pointDarknessWithoutSourceId = {
      ...mockPointDarknessSource,
      sourceId: null,
    };
    mockCanvas.effects.darknessSources = [pointDarknessWithoutSourceId];

    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: false,
      darknessRank: 0,
    });
  });

  test('should handle invalid sourceId format', () => {
    // Invalid sourceId format
    const pointDarknessWithInvalidSourceId = {
      ...mockPointDarknessSource,
      sourceId: 'invalid-format',
    };
    mockCanvas.effects.darknessSources = [pointDarknessWithInvalidSourceId];

    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: false,
      darknessRank: 0,
    });
  });

  test('should handle missing source document', () => {
    // SourceId points to non-existent document
    const pointDarknessWithMissingSource = {
      ...mockPointDarknessSource,
      sourceId: 'AmbientLight.non-existent-id',
    };
    mockCanvas.effects.darknessSources = [pointDarknessWithMissingSource];

    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: false,
      darknessRank: 0,
    });
  });

  test('should prefer document flags over sourceId lookup', () => {
    // PointDarknessSource with both document and sourceId
    const pointDarknessWithDocument = {
      ...mockPointDarknessSource,
      document: {
        id: 'direct-doc',
        getFlag: jest.fn(() => 2), // Returns rank 2
      },
    };
    mockCanvas.effects.darknessSources = [pointDarknessWithDocument];

    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: false,
      darknessRank: 2,
    });

    // Should use direct document, not sourceId lookup
    expect(pointDarknessWithDocument.document.getFlag).toHaveBeenCalled();
    expect(mockLightDocument.getFlag).not.toHaveBeenCalled();
  });

  test('should handle non-AmbientLight sourceId types', () => {
    // SourceId for different document type
    const pointDarknessWithTokenSourceId = {
      ...mockPointDarknessSource,
      sourceId: 'Token.some-token-id',
    };
    mockCanvas.effects.darknessSources = [pointDarknessWithTokenSourceId];

    const position = { x: 1600, y: 1100, elevation: 0 };

    const result = lightingCalculator.getLightLevelAt(position, mockToken);

    expect(result).toEqual({
      level: 'darkness',
      illumination: 0,
      lightIllumination: 0,
      isDarknessSource: true,
      isHeightenedDarkness: false,
      darknessRank: 0,
    });

    // Should not attempt lookup for non-AmbientLight types
    expect(mockLightDocument.getFlag).not.toHaveBeenCalled();
  });
});
