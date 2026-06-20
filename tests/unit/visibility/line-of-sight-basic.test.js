/**
 * Basic Line of Sight Tests
 * 
 * Tests the refactored VisionAnalyzer with real lineLineIntersection implementation.
 * These tests verify that the wall filtering and intersection detection work correctly.
 * 
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { LevelsIntegration } from '../../../scripts/services/LevelsIntegration.js';

describe('VisionAnalyzer - Line of Sight (Refactored)', () => {
    let visionAnalyzer;
    let mockObserver;
    let mockTarget;

    beforeEach(() => {
        LevelsIntegration._instance = null;
        visionAnalyzer = VisionAnalyzer.getInstance();
        visionAnalyzer.clearCache();

        // Observer at (100, 100)
        mockObserver = {
            id: 'observer-1',
            center: { x: 100, y: 100 },
            document: {
                id: 'observer-doc-1',
                x: 75,
                y: 75,
                width: 1,
                height: 1,
                elevation: 0
            }
        };

        // Target at (300, 300)
        mockTarget = {
            id: 'target-1',
            center: { x: 300, y: 300 },
            document: {
                id: 'target-doc-1',
                x: 275,
                y: 275,
                width: 1,
                height: 1,
                elevation: 0
            }
        };

        // Setup CONST
        global.CONST = {
            WALL_SENSE_TYPES: {
                NONE: 0,
                LIMITED: 10,
                NORMAL: 20,
                PROXIMITY: 30,
                DISTANCE: 40
            }
        };

        global.game = {
            settings: {
                get: jest.fn(() => false)
            },
            modules: new Map([
                ['levels', { active: false }],
                ['wall-height', { active: false }]
            ])
        };

        global.CONFIG = {
            Canvas: {
                polygonBackends: {
                    sight: { testCollision: jest.fn(() => false) },
                    sound: { testCollision: jest.fn(() => false) }
                }
            }
        };

        global.PIXI = {
            Circle: jest.fn((x, y, radius) => ({ x, y, radius }))
        };

        // Setup canvas
        global.canvas = {
            walls: {
                placeables: []
            },
            grid: {
                size: 50
            }
        };
    });

    afterEach(() => {
        LevelsIntegration._instance = null;
        jest.restoreAllMocks();
    });

    describe('hasLineOfSight - No Walls', () => {
        test('should return true when no walls exist', () => {
            global.canvas.walls.placeables = [];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
        });

        test('should fall back to geometric LOS when Foundry visibility source is unavailable', () => {
            global.canvas.walls.placeables = [];
            global.canvas.visibility = { testVisibility: jest.fn(() => false) };
            mockObserver.vision = null;

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should trust Foundry point visibility when LOS polygon is unavailable', () => {
            global.canvas.walls.placeables = [];
            global.canvas.visibility = { testVisibility: jest.fn(() => false) };
            mockObserver.vision = {};

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(global.canvas.visibility.testVisibility).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        test('should use legacy canvas sight visibility when canvas visibility is unavailable', () => {
            global.canvas.walls.placeables = [];
            delete global.canvas.visibility;
            global.canvas.sight = { testVisibility: jest.fn(() => false) };
            mockObserver.vision = {};

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(global.canvas.sight.testVisibility).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        test('should trust Foundry vision polygon when it excludes the target', () => {
            global.canvas.walls.placeables = [];
            mockObserver.vision = {
                los: {
                    points: [0, 0, 200, 0, 200, 200, 0, 200],
                    intersectCircle: jest.fn(() => ({ points: [] })),
                },
            };

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(mockObserver.vision.los.intersectCircle).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        test('should trust Foundry point visibility when LOS polygon includes the target', () => {
            global.canvas.walls.placeables = [];
            global.canvas.visibility = { testVisibility: jest.fn(() => false) };
            mockObserver.vision = {
                los: {
                    points: [0, 0, 500, 0, 500, 500, 0, 500],
                    intersectCircle: jest.fn(() => ({ points: [{ x: 300, y: 300 }] })),
                },
            };

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(mockObserver.vision.los.intersectCircle).toHaveBeenCalled();
            expect(global.canvas.visibility.testVisibility).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        test('should call Foundry canvas visibility with individual points when polygon is unavailable', () => {
            global.canvas.walls.placeables = [];
            const hiddenPoint = { x: 250, y: 250, elevation: 0 };
            const visiblePoint = { x: 300, y: 300, elevation: 0 };
            mockTarget.document.getVisibilityTestPoints = jest.fn(() => [hiddenPoint, visiblePoint]);
            global.canvas.visibility = {
                testVisibility: jest.fn((point) => point === visiblePoint)
            };
            mockObserver.vision = {};

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
                hiddenPoint,
                expect.objectContaining({ object: mockTarget, source: mockObserver.vision })
            );
            expect(global.canvas.visibility.testVisibility).toHaveBeenCalledWith(
                visiblePoint,
                expect.objectContaining({ object: mockTarget, source: mockObserver.vision })
            );
            expect(result).toBe(true);
        });

        test('should return true when wall does not intersect ray', () => {
            // Wall at x=400, which is beyond the target
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [400, 0, 400, 500],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
        });
    });

    describe('hasLineOfSight - Positioned movement proxy', () => {
        test('positioned token proxy hides the live vision polygon and flags itself', () => {
            const { createPositionedTokenProxy } = require('../../../scripts/services/PendingMovement/pending-movement-observer-senses.js');
            mockObserver.vision = {
                los: {
                    points: [0, 0, 500, 0, 500, 500, 0, 500],
                    intersectCircle: jest.fn(() => ({ points: [{ x: 300, y: 300 }] })),
                },
            };

            const proxy = createPositionedTokenProxy(mockObserver, { x: 1000, y: 1000 });

            expect(proxy.vision).toBeUndefined();
            expect(proxy.isPendingMovementPositionProxy).toBe(true);
            expect(proxy.center).toEqual({ x: 1025, y: 1025, elevation: 0 });
        });

        test('hasLineOfSight uses positioned proxy coordinates, not the live vision polygon', () => {
            const { createPositionedTokenProxy } = require('../../../scripts/services/PendingMovement/pending-movement-observer-senses.js');
            mockObserver.vision = {
                los: {
                    points: [0, 0, 500, 0, 500, 500, 0, 500],
                    intersectCircle: jest.fn(() => ({ points: [{ x: 300, y: 300 }] })),
                },
            };
            global.canvas.visibility = { testVisibility: jest.fn(() => true) };
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [600, 0, 600, 1500],
                        door: 0,
                        ds: 0,
                    },
                },
            ];

            const proxy = createPositionedTokenProxy(mockObserver, { x: 1000, y: 1000 });

            expect(visionAnalyzer.hasLineOfSight(proxy, mockTarget)).toBe(false);
            expect(mockObserver.vision.los.intersectCircle).not.toHaveBeenCalled();
        });
    });

    describe('positioned movement proxy distance', () => {
        test('repositioned proxy exposes positioned mechanical bounds to native distanceTo', () => {
            const { createPositionedTokenProxy } = require('../../../scripts/services/PendingMovement/pending-movement-observer-senses.js');
            global.canvas.scene = { grid: { distance: 5 } };
            mockObserver.mechanicalBounds = { x: 75, y: 75, width: 50, height: 50 };
            mockObserver.bounds = { x: 75, y: 75, width: 50, height: 50 };
            mockObserver.distanceTo = jest.fn(function () {
                return this.mechanicalBounds.x;
            });

            const proxy = createPositionedTokenProxy(mockObserver, { x: 575, y: 175 });

            expect(proxy.distanceTo(mockTarget)).toBe(575);
            expect(proxy.bounds).toMatchObject({ x: 575, y: 175, width: 50, height: 50 });
            expect(mockObserver.distanceTo).toHaveBeenCalled();
        });

        test('proxy at the document position keeps native distanceTo result', () => {
            const { createPositionedTokenProxy } = require('../../../scripts/services/PendingMovement/pending-movement-observer-senses.js');
            global.canvas.scene = { grid: { distance: 5 } };
            mockObserver.distanceTo = jest.fn(() => 30);

            const proxy = createPositionedTokenProxy(mockObserver, { x: 75, y: 75 });

            expect(proxy.distanceTo(mockTarget)).toBe(30);
            expect(mockObserver.distanceTo).toHaveBeenCalled();
        });
    });

    describe('hasLineOfSight - Blocking Walls', () => {
        test('should return false when sight-blocking wall intersects ray', () => {
            // Vertical wall at x=200, between observer (100,100) and target (300,300)
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
        });

        test('should return false with horizontal blocking wall', () => {
            // Horizontal wall at y=200
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [0, 200, 400, 200],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
        });

        test('should not use token edge samples when core visibility point is blocked', () => {
            mockTarget.document.getVisibilityTestPoints = jest.fn(() => [mockTarget.center]);
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 190, 200, 210],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
        });
    });

    describe('hasLineOfSight - Doors', () => {
        test('should return true when door is open', () => {
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 1,
                        ds: 1 // Open
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
        });

        test('should return false when door is closed', () => {
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 1,
                        ds: 0 // Closed
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
        });

        test('should return true when a closed horizontal door is near the ray but both tokens are on the same side', () => {
            mockObserver = {
                id: 'observer-same-side-horizontal',
                center: { x: 2300, y: 4700 },
                document: {
                    id: 'observer-doc-same-side-horizontal',
                    x: 2275,
                    y: 4675,
                    width: 1,
                    height: 1,
                    elevation: 0
                }
            };

            mockTarget = {
                id: 'target-same-side-horizontal',
                center: { x: 2602, y: 3802 },
                document: {
                    id: 'target-doc-same-side-horizontal',
                    x: 2577,
                    y: 3777,
                    width: 1,
                    height: 1,
                    elevation: 0
                }
            };

            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [2013, 3800, 2388, 3800],
                        door: 1,
                        ds: 0 // Closed
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
        });

        test('should return true when a closed vertical door is near the ray but both tokens are on the same side', () => {
            mockObserver = {
                id: 'observer-same-side-vertical',
                center: { x: 3700, y: 2900 },
                document: {
                    id: 'observer-doc-same-side-vertical',
                    x: 3675,
                    y: 2875,
                    width: 1,
                    height: 1,
                    elevation: 0
                }
            };

            mockTarget = {
                id: 'target-same-side-vertical',
                center: { x: 4598, y: 2398 },
                document: {
                    id: 'target-doc-same-side-vertical',
                    x: 4573,
                    y: 2373,
                    width: 1,
                    height: 1,
                    elevation: 0
                }
            };

            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [4600, 2838, 4600, 2963],
                        door: 1,
                        ds: 0 // Closed
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
        });
    });

    describe('hasLineOfSight - Wall Filtering', () => {
        test('should ignore walls that dont block sight', () => {
            // Wall only blocks sound, not sight - should NOT block line of sight
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NONE, // Does not block sight
                        sound: CONST.WALL_SENSE_TYPES.NORMAL, // Blocks sound only
                        c: [200, 0, 200, 400],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            // Since the wall doesn't block sight, LOS should be true
            // Note: The wall IS included in blockingWalls (because it blocks sound)
            // but the LOS check only cares about sight-blocking
            expect(result).toBe(true);
        });

        test('should check multiple walls correctly', () => {
            global.canvas.walls.placeables = [
                // Wall 1: doesn't block sight
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NONE,
                        sound: CONST.WALL_SENSE_TYPES.NORMAL,
                        c: [150, 0, 150, 400],
                        door: 0,
                        ds: 0
                    }
                },
                // Wall 2: blocks sight
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
        });
    });

    describe('hasLineOfSight - Cache', () => {
        test('should use cache for repeated calls', () => {
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result1 = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            const result2 = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result1).toBe(false);
            expect(result2).toBe(false);
        });

        test('should recalculate after cache clear', () => {
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        c: [200, 0, 200, 400],
                        door: 0,
                        ds: 0
                    }
                }
            ];

            const result1 = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            expect(result1).toBe(false);

            // Clear cache and remove walls
            visionAnalyzer.clearCache();
            global.canvas.walls.placeables = [];

            const result2 = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            expect(result2).toBe(true);
        });
    });

    describe('hasLineOfSight - Levels Integration', () => {
        test('should use 3D collision results when levels integration is active', () => {
            const test3DCollision = jest.fn().mockReturnValue(true);
            jest.spyOn(LevelsIntegration, 'getInstance').mockReturnValue({
                isActive: true,
                test3DCollision
            });

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(test3DCollision).toHaveBeenCalledWith(mockObserver, mockTarget, 'sight');
            expect(result).toBe(false);
        });

        test('should fall back to geometric LOS for core Levels polygon-only collisions', () => {
            const get3DCollisionDetails = jest.fn().mockReturnValue({
                mode: 'core',
                result: true,
                surfaceCollision: false,
                polygonCollision: true,
                levelInclusionCollision: false,
                reason: 'polygon',
            });
            jest.spyOn(LevelsIntegration, 'getInstance').mockReturnValue({
                isActive: true,
                mode: 'core',
                get3DCollisionDetails,
                getTokenLevelId: () => 'defaultLevel0000',
            });
            global.canvas.walls.placeables = [];

            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            warnSpy.mockRestore();

            expect(get3DCollisionDetails).toHaveBeenCalledWith(mockObserver, mockTarget, 'sight');
            expect(result).toBe(true);
        });
    });
});
