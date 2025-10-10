/**
 * Tests for asymmetric visibility with LIMITED walls
 * Verifies that Foundry's vision polygons are trusted for asymmetric LOS
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('Asymmetric Visibility with LIMITED Walls', () => {
    let visionAnalyzer;

    beforeEach(() => {
        visionAnalyzer = VisionAnalyzer.getInstance();
        visionAnalyzer.clearCache();

        global.canvas = {
            walls: { placeables: [] },
            grid: { size: 100 },
            effects: { darknessSources: [] },
        };

        global.game = {
            settings: {
                get: jest.fn(() => false),
            },
        };

        global.CONST = {
            WALL_SENSE_TYPES: {
                NONE: 0,
                LIMITED: 10,
                NORMAL: 20,
            },
        };

        global.foundry = {
            canvas: {
                geometry: {
                    Ray: jest.fn().mockImplementation((a, b) => ({ A: a, B: b })),
                },
            },
            utils: {
                lineLineIntersection: jest.fn(),
            },
        };

        global.PIXI = {
            Circle: jest.fn().mockImplementation((x, y, r) => ({ x, y, radius: r })),
        };
    });

    describe('hasLineOfSight with vision polygons', () => {
        test('should trust observer vision polygon when it exists', () => {
            const observer = {
                center: { x: 0, y: 0 },
                vision: {
                    los: {
                        points: [0, 0, 100, 0, 100, 100, 0, 100], // Has a polygon
                        intersectCircle: jest.fn(() => ({
                            points: [50, 50], // Intersection exists
                        })),
                    },
                },
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            const target = {
                center: { x: 100, y: 0 },
                externalRadius: 25,
                document: { x: 75, y: -25, width: 1, height: 1 },
            };

            const result = visionAnalyzer.hasLineOfSight(observer, target);

            expect(result).toBe(true);
            expect(observer.vision.los.intersectCircle).toHaveBeenCalled();
        });

        test('should return false when polygon shows no intersection', () => {
            const observer = {
                center: { x: 0, y: 0 },
                vision: {
                    los: {
                        points: [0, 0, 50, 0, 50, 50, 0, 50], // Limited polygon
                        intersectCircle: jest.fn(() => ({
                            points: [], // No intersection
                        })),
                    },
                },
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            const target = {
                center: { x: 200, y: 0 },
                externalRadius: 25,
                document: { x: 175, y: -25, width: 1, height: 1 },
            };

            const result = visionAnalyzer.hasLineOfSight(observer, target);

            expect(result).toBe(false);
            expect(observer.vision.los.intersectCircle).toHaveBeenCalled();
        });

        test('asymmetric case: Observer A blocked, Observer B not blocked', () => {
            // Observer A: heavily limited vision polygon (blocked by LIMITED walls)
            const observerA = {
                center: { x: 0, y: 0 },
                vision: {
                    los: {
                        points: [0, 0, 50, 0, 50, 50, 0, 50],
                        intersectCircle: jest.fn(() => ({
                            points: [], // No intersection - blocked
                        })),
                    },
                },
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            // Target B at distance
            const targetB = {
                center: { x: 200, y: 0 },
                externalRadius: 25,
                document: { x: 175, y: -25, width: 1, height: 1 },
            };

            // Observer B: larger vision polygon (can see through LIMITED walls better)
            const observerB = {
                center: { x: 200, y: 0 },
                vision: {
                    los: {
                        points: [150, -50, 250, -50, 250, 50, 150, 50],
                        intersectCircle: jest.fn(() => ({
                            points: [10, 10], // Has intersection - not blocked
                        })),
                    },
                },
                document: { x: 175, y: -25, width: 1, height: 1 },
            };

            const targetA = {
                center: { x: 0, y: 0 },
                externalRadius: 25,
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            // A -> B: blocked
            const aToB = visionAnalyzer.hasLineOfSight(observerA, targetB);
            expect(aToB).toBe(false);

            // B -> A: not blocked
            const bToA = visionAnalyzer.hasLineOfSight(observerB, targetA);
            expect(bToA).toBe(true);

            // Verify asymmetry
            expect(aToB).not.toBe(bToA);
        });
    });

    describe('hasLineOfSight without vision polygons (fallback)', () => {
        test('should use geometric calculation when no vision polygon exists', () => {
            const observer = {
                center: { x: 0, y: 0 },
                vision: null, // No vision polygon
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            const target = {
                center: { x: 100, y: 0 },
                externalRadius: 25,
                document: { x: 75, y: -25, width: 1, height: 1 },
            };

            // No walls
            global.canvas.walls.placeables = [];

            const result = visionAnalyzer.hasLineOfSight(observer, target);

            // Should return true (no walls blocking)
            expect(result).toBe(true);
        });

        test('geometric calculation is symmetric (by design)', () => {
            const tokenA = {
                center: { x: 0, y: 0 },
                vision: null,
                document: { x: -50, y: -50, width: 1, height: 1 },
            };

            const tokenB = {
                center: { x: 300, y: 0 },
                vision: null,
                document: { x: 250, y: -50, width: 1, height: 1 },
            };

            // Two LIMITED walls
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.LIMITED,
                        sight: CONST.WALL_SENSE_TYPES.LIMITED,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        door: 0,
                        ds: 0,
                        c: [100, -10, 100, 10],
                    },
                },
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.LIMITED,
                        sight: CONST.WALL_SENSE_TYPES.LIMITED,
                        sound: CONST.WALL_SENSE_TYPES.NONE,
                        door: 0,
                        ds: 0,
                        c: [200, -10, 200, 10],
                    },
                },
            ];

            // Mock all intersections
            global.foundry.utils.lineLineIntersection.mockImplementation((rayStart, rayEnd, wallStart, wallEnd) => {
                const wallX = wallStart.x;
                if (wallX === 100 || wallX === 200) {
                    return { x: wallX, y: 0, t0: wallX / 300 };
                }
                return null;
            });

            // A -> B: blocked by 2 LIMITED walls
            const aToB = visionAnalyzer.hasLineOfSight(tokenA, tokenB);
            expect(aToB).toBe(false);

            // B -> A: also blocked by 2 LIMITED walls (symmetric)
            const bToA = visionAnalyzer.hasLineOfSight(tokenB, tokenA);
            expect(bToA).toBe(false);

            // Verify symmetry in geometric calculation
            expect(aToB).toBe(bToA);
        });
    });
});
