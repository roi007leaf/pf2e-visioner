/**
 * Tests for LIMITED walls blocking both sight and sound after 2+ crossings
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('LIMITED Walls - Sound and Sight Blocking', () => {
    let visionAnalyzer;

    beforeEach(() => {
        // Setup VisionAnalyzer
        visionAnalyzer = VisionAnalyzer.getInstance();
        visionAnalyzer.clearCache();

        // Mock canvas
        global.canvas = {
            walls: {
                placeables: [],
            },
            grid: {
                size: 100,
            },
            effects: {
                darknessSources: [],
            },
        };

        // Mock game settings
        global.game = {
            settings: {
                get: jest.fn(() => false),
            },
        };

        // Mock CONST
        global.CONST = {
            WALL_SENSE_TYPES: {
                NONE: 0,
                LIMITED: 10,
                NORMAL: 20,
            },
        };

        // Mock foundry utilities
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
    });

    describe('isSoundBlocked with LIMITED walls', () => {
        test('sound NOT blocked with 1 LIMITED wall', () => {
            const observer = {
                center: { x: 0, y: 0 },
                actor: {},
            };

            const target = {
                center: { x: 200, y: 0 },
                actor: {},
            };

            // One LIMITED wall crossing
            global.canvas.walls.placeables = [
                {
                    document: {
                        sound: CONST.WALL_SENSE_TYPES.LIMITED,
                        door: 0,
                        ds: 0,
                        c: [100, -10, 100, 10],
                    },
                },
            ];

            // Mock intersection at the wall
            global.foundry.utils.lineLineIntersection.mockReturnValue({
                x: 100,
                y: 0,
                t0: 0.5,
            });

            const result = visionAnalyzer.isSoundBlocked(observer, target);
            expect(result).toBe(false); // Sound should NOT be blocked (only 1 LIMITED wall)
        });

        test('sound NOT blocked with 2 LIMITED walls (they only affect vision)', () => {
            const observer = {
                center: { x: 0, y: 0 },
                actor: {},
            };

            const target = {
                center: { x: 300, y: 0 },
                actor: {},
            };

            // Two LIMITED wall crossings
            global.canvas.walls.placeables = [
                {
                    document: {
                        sound: CONST.WALL_SENSE_TYPES.LIMITED,
                        door: 0,
                        ds: 0,
                        c: [100, -10, 100, 10],
                    },
                },
                {
                    document: {
                        sound: CONST.WALL_SENSE_TYPES.LIMITED,
                        door: 0,
                        ds: 0,
                        c: [200, -10, 200, 10],
                    },
                },
            ];

            // Mock intersections at both walls
            let callCount = 0;
            global.foundry.utils.lineLineIntersection.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return { x: 100, y: 0, t0: 0.33 }; // First wall
                } else if (callCount === 2) {
                    return { x: 200, y: 0, t0: 0.66 }; // Second wall
                }
                return null;
            });

            const result = visionAnalyzer.isSoundBlocked(observer, target);
            expect(result).toBe(false); // Sound should NOT be blocked (LIMITED walls don't block sound)
        });

        test('sound IS blocked with 1 NORMAL wall', () => {
            const observer = {
                center: { x: 0, y: 0 },
                actor: {},
            };

            const target = {
                center: { x: 200, y: 0 },
                actor: {},
            };

            // One NORMAL wall crossing
            global.canvas.walls.placeables = [
                {
                    document: {
                        sound: CONST.WALL_SENSE_TYPES.NORMAL,
                        door: 0,
                        ds: 0,
                        c: [100, -10, 100, 10],
                    },
                },
            ];

            // Mock intersection at the wall
            global.foundry.utils.lineLineIntersection.mockReturnValue({
                x: 100,
                y: 0,
                t0: 0.5,
            });

            const result = visionAnalyzer.isSoundBlocked(observer, target);
            expect(result).toBe(true); // Sound SHOULD be blocked (NORMAL wall)
        });
    });

    describe('Visibility with 2+ LIMITED walls', () => {
        test('should be HIDDEN when vision blocked but hearing available with 2 LIMITED walls', () => {
            const observer = {
                center: { x: 0, y: 0 },
                document: { x: -50, y: -50, width: 1, height: 1 },
                actor: {},
            };

            const target = {
                center: { x: 300, y: 0 },
                document: { x: 250, y: -50, width: 1, height: 1 },
                actor: {},
            };

            // Two LIMITED walls (block sight but NOT sound)
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.LIMITED,
                        sight: CONST.WALL_SENSE_TYPES.LIMITED,
                        sound: CONST.WALL_SENSE_TYPES.LIMITED, // LIMITED sound doesn't block
                        door: 0,
                        ds: 0,
                        c: [100, -10, 100, 10],
                    },
                },
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.LIMITED,
                        sight: CONST.WALL_SENSE_TYPES.LIMITED,
                        sound: CONST.WALL_SENSE_TYPES.LIMITED, // LIMITED sound doesn't block
                        door: 0,
                        ds: 0,
                        c: [200, -10, 200, 10],
                    },
                },
            ];

            // Mock intersections - need to handle ALL ray checks for multi-point sampling
            // hasLineOfSight checks 25 rays (5 points per token), each ray checks 2 walls
            global.foundry.utils.lineLineIntersection.mockImplementation((rayStart, rayEnd, wallStart, wallEnd) => {
                // Check which wall this is
                const wallX = wallStart.x;

                // All rays cross both walls
                if (wallX === 100) {
                    return { x: 100, y: 0, t0: 0.33 }; // First wall
                } else if (wallX === 200) {
                    return { x: 200, y: 0, t0: 0.66 }; // Second wall
                }
                return null;
            });

            // Check hasLineOfSight
            const hasLOS = visionAnalyzer.hasLineOfSight(observer, target);
            expect(hasLOS).toBe(false); // Should be blocked by 2 LIMITED walls

            // Check isSoundBlocked
            const soundBlocked = visionAnalyzer.isSoundBlocked(observer, target);
            expect(soundBlocked).toBe(false); // Should NOT be blocked (LIMITED walls don't block sound)

            // Calculate visibility with only vision and hearing
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                    },
                    imprecise: {
                        hearing: { range: 60 },
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false,
                    },
                },
                soundBlocked: soundBlocked,
                hasLineOfSight: hasLOS,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden'); // Should be HIDDEN (hearing works through LIMITED walls)
            expect(result.detection.sense).toBe('hearing');
        });

        test('should be HIDDEN when hearing blocked by NORMAL wall but scent available', () => {
            const observer = {
                center: { x: 0, y: 0 },
                document: { x: -50, y: -50, width: 1, height: 1 },
                actor: {},
            };

            const target = {
                center: { x: 300, y: 0 },
                document: { x: 250, y: -50, width: 1, height: 1 },
                actor: {},
            };

            // One NORMAL sound-blocking wall
            global.canvas.walls.placeables = [
                {
                    document: {
                        move: CONST.WALL_SENSE_TYPES.NORMAL,
                        sight: CONST.WALL_SENSE_TYPES.NORMAL,
                        sound: CONST.WALL_SENSE_TYPES.NORMAL, // NORMAL wall blocks sound
                        door: 0,
                        ds: 0,
                        c: [150, -10, 150, 10],
                    },
                },
            ];

            // Mock intersection
            global.foundry.utils.lineLineIntersection.mockImplementation((rayStart, rayEnd, wallStart, wallEnd) => {
                const wallX = wallStart.x;

                if (wallX === 150) {
                    return { x: 150, y: 0, t0: 0.5 };
                }
                return null;
            });

            const hasLOS = visionAnalyzer.hasLineOfSight(observer, target);
            expect(hasLOS).toBe(false); // Blocked by NORMAL wall

            const soundBlocked = visionAnalyzer.isSoundBlocked(observer, target);
            expect(soundBlocked).toBe(true); // Blocked by NORMAL sound wall

            // Calculate visibility with scent (should work through walls)
            const input = {
                target: {
                    lightingLevel: 'bright',
                    concealment: false,
                    auxiliary: [],
                    traits: [],
                },
                observer: {
                    precise: {
                        vision: { range: Infinity },
                    },
                    imprecise: {
                        hearing: { range: 60 },
                        scent: { range: 30 }, // Scent works through walls
                    },
                    conditions: {
                        blinded: false,
                        deafened: false,
                        dazzled: false,
                    },
                },
                soundBlocked: soundBlocked,
                hasLineOfSight: hasLOS,
            };

            const result = calculateVisibility(input);
            expect(result.state).toBe('hidden'); // Should be HIDDEN (scent detects)
            expect(result.detection.sense).toBe('scent');
        });
    });
});
