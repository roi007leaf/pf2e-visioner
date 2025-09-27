/**
 * @jest-environment jsdom
 */

import { MODULE_ID } from '../../scripts/constants.js';
import { cleanupDeletedWallVisuals } from '../../scripts/services/visual-effects.js';

describe('Wall Deletion Cleanup', () => {
  let mockCanvas;
  let mockWallDocument;

  beforeEach(() => {
    // Reset global canvas mock
    mockCanvas = {
      effects: {
        foreground: {
          children: [],
          removeChild: jest.fn(),
        },
        children: [],
        removeChild: jest.fn(),
      },
      walls: {
        children: [],
        removeChild: jest.fn(),
        placeables: [],
      },
      interface: {
        children: [],
        removeChild: jest.fn(),
      },
      stage: {
        children: [],
        removeChild: jest.fn(),
      },
      tokens: {
        placeables: [],
      },
      scene: {
        updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      },
      perception: {
        update: jest.fn(),
      },
    };

    mockWallDocument = {
      id: 'test-wall-123',
    };

    global.canvas = mockCanvas;
    global.game = {
      user: {
        isGM: true,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('cleanupDeletedWallVisuals removes visual indicators with matching wall ID', async () => {
    // Create mock PIXI graphics objects with wall IDs
    const mockIndicator1 = {
      _pvWallId: 'test-wall-123',
      parent: mockCanvas.effects.foreground,
      destroy: jest.fn(),
    };

    const mockIndicator2 = {
      _wallDocumentId: 'test-wall-123',
      parent: mockCanvas.effects,
      destroy: jest.fn(),
    };

    const mockIndicator3 = {
      _pvWallId: 'different-wall-456',
      parent: mockCanvas.effects,
      destroy: jest.fn(),
    };

    // Add indicators to canvas layers
    mockCanvas.effects.foreground.children.push(mockIndicator1);
    mockCanvas.effects.children.push(mockIndicator2, mockIndicator3);

    // Run cleanup
    await cleanupDeletedWallVisuals(mockWallDocument);

    // Verify only indicators with matching wall ID were removed
    expect(mockCanvas.effects.foreground.removeChild).toHaveBeenCalledWith(mockIndicator1);
    expect(mockCanvas.effects.removeChild).toHaveBeenCalledWith(mockIndicator2);
    expect(mockCanvas.effects.removeChild).not.toHaveBeenCalledWith(mockIndicator3);
  });

  test('cleanupDeletedWallVisuals removes token wall flags', async () => {
    const mockTokenWithWallFlag = {
      id: 'token-with-flag',
      document: {
        getFlag: jest.fn((moduleId, flagName) => {
          if (moduleId === MODULE_ID && flagName === 'walls') {
            return {
              'test-wall-123': 'observed',
              'other-wall-456': 'hidden',
            };
          }
          return {};
        }),
      },
    };

    const mockTokenWithoutWallFlag = {
      id: 'token-without-flag',
      document: {
        getFlag: jest.fn().mockReturnValue({}),
      },
    };

    mockCanvas.tokens.placeables = [mockTokenWithWallFlag, mockTokenWithoutWallFlag];

    await cleanupDeletedWallVisuals(mockWallDocument);

    // Verify updateEmbeddedDocuments was called to clean up token flags
    expect(mockCanvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [
        {
          _id: 'token-with-flag',
          [`flags.${MODULE_ID}.walls`]: {
            'other-wall-456': 'hidden',
          },
        },
      ],
      { diff: false },
    );
  });

  test('cleanupDeletedWallVisuals handles nested containers correctly', async () => {
    const mockNestedIndicator = {
      _pvWallId: 'test-wall-123',
      parent: null,
      destroy: jest.fn(),
    };

    const mockContainer = {
      children: [mockNestedIndicator],
      removeChild: jest.fn(),
    };

    mockNestedIndicator.parent = mockContainer;
    mockCanvas.effects.children.push(mockContainer);

    await cleanupDeletedWallVisuals(mockWallDocument);

    // Verify nested indicator was found and removed
    expect(mockContainer.removeChild).toHaveBeenCalledWith(mockNestedIndicator);
    expect(mockNestedIndicator.destroy).toHaveBeenCalledWith({
      children: true,
      texture: true,
      baseTexture: true,
    });
  });

  test('cleanupDeletedWallVisuals cleans up wall references on remaining walls', async () => {
    const mockHiddenIndicator = {
      _pvWallId: 'test-wall-123',
      parent: mockCanvas.walls,
      destroy: jest.fn(),
    };

    const mockMask1 = {
      _pvWallId: 'test-wall-123',
      parent: mockCanvas.walls,
      destroy: jest.fn(),
    };

    const mockMask2 = {
      _pvWallId: 'different-wall-456',
      parent: mockCanvas.walls,
      destroy: jest.fn(),
    };

    const mockWall = {
      _pvHiddenIndicator: mockHiddenIndicator,
      _pvSeeThroughMasks: [mockMask1, mockMask2],
      _pvAnimationActive: true,
      id: 'remaining-wall-789',
      document: { id: 'remaining-wall-789' },
    };

    mockCanvas.walls.placeables = [mockWall];

    await cleanupDeletedWallVisuals(mockWallDocument);

    // Verify hidden indicator was cleaned up
    expect(mockHiddenIndicator.destroy).toHaveBeenCalled();
    expect(mockWall._pvHiddenIndicator).toBe(null);

    // Verify mask1 was destroyed (matching wall ID)
    expect(mockMask1.destroy).toHaveBeenCalled();

    // Verify only the correct see-through mask remained
    expect(mockWall._pvSeeThroughMasks).toHaveLength(1);
    expect(mockWall._pvSeeThroughMasks[0]._pvWallId).toBe('different-wall-456');

    // Animation should not be affected for different wall
    expect(mockWall._pvAnimationActive).toBe(true);
  });

  test('cleanupDeletedWallVisuals handles missing wall document gracefully', async () => {
    // Test with null wall document
    await expect(cleanupDeletedWallVisuals(null)).resolves.not.toThrow();

    // Test with wall document missing ID
    await expect(cleanupDeletedWallVisuals({})).resolves.not.toThrow();
  });

  test('cleanupDeletedWallVisuals triggers canvas perception update', async () => {
    await cleanupDeletedWallVisuals(mockWallDocument);

    expect(mockCanvas.perception.update).toHaveBeenCalledWith({
      refreshLighting: false,
      refreshVision: false,
      refreshOcclusion: false,
      refreshEffects: true,
    });
  });

  test('cleanupDeletedWallVisuals stops animation for deleted wall', async () => {
    const mockWallWithAnimation = {
      _pvAnimationActive: true,
      id: 'test-wall-123', // Same ID as deleted wall
      document: { id: 'test-wall-123' },
    };

    const mockOtherWall = {
      _pvAnimationActive: true,
      id: 'other-wall-456',
      document: { id: 'other-wall-456' },
    };

    mockCanvas.walls.placeables = [mockWallWithAnimation, mockOtherWall];

    await cleanupDeletedWallVisuals(mockWallDocument);

    // Animation should be stopped for the deleted wall
    expect(mockWallWithAnimation._pvAnimationActive).toBe(false);
    // Animation should continue for other walls
    expect(mockOtherWall._pvAnimationActive).toBe(true);
  });
});
