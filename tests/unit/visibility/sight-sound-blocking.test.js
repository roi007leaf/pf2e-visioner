/**
 * Tests for sight-blocking and sound-blocking wall detection
 * 
 * These tests verify that:
 * - Sight-blocking walls are detected correctly using polygon backends
 * - Sound-blocking walls are detected correctly using polygon backends
 * - Visual detection fails when there's no line of sight
 * - Hearing detection fails when sound is blocked
 * - Combined sight+sound blocking results in "undetected" state
 * @jest-environment jsdom
 */

import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { calculateVisibility } from '../../../scripts/visibility/StatelessVisibilityCalculator.js';

describe('Sight and Sound Blocking', () => {
    let visionAnalyzer;
    let mockObserver;
    let mockTarget;

    beforeEach(() => {
        // Reset VisionAnalyzer singleton
        visionAnalyzer = VisionAnalyzer.getInstance();
        visionAnalyzer.clearCache();

        // Mock observer token with basic senses
        mockObserver = {
            id: 'observer-1',
            name: 'Observer',
            center: { x: 100, y: 100 },
            actor: {
                system: {
                    perception: {
                        senses: [
                            { type: 'low-light-vision', range: Infinity }
                        ]
                    }
                },
                hasCondition: jest.fn(() => false)
            }
        };

        // Mock target token
        mockTarget = {
            id: 'target-1',
            name: 'Target',
            center: { x: 300, y: 300 },
            actor: {
                system: {
                    perception: {
                        senses: []
                    }
                },
                hasCondition: jest.fn(() => false)
            }
        };

        // Mock global CONFIG object
        global.CONFIG = {
            Canvas: {
                polygonBackends: {
                    sight: {
                        testCollision: jest.fn(() => false)
                    },
                    sound: {
                        testCollision: jest.fn(() => false)
                    }
                }
            }
        };

        // Mock console.log to reduce test output noise
        global.console.log = jest.fn();
        global.console.error = jest.fn();
    });

    describe('VisionAnalyzer - hasLineOfSight', () => {
        it('should return true when no sight-blocking wall', () => {
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(false);

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true);
            expect(CONFIG.Canvas.polygonBackends.sight.testCollision).toHaveBeenCalledWith(
                mockObserver.center,
                mockTarget.center,
                { type: 'sight', mode: 'any' }
            );
        });

        it('should return false when sight-blocking wall present', () => {
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(false);
            expect(CONFIG.Canvas.polygonBackends.sight.testCollision).toHaveBeenCalledWith(
                mockObserver.center,
                mockTarget.center,
                { type: 'sight', mode: 'any' }
            );
        });

        it('should return true when polygon backend not available', () => {
            CONFIG.Canvas.polygonBackends.sight = null;

            const result = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(result).toBe(true); // Fail open
        });
    });

    describe('VisionAnalyzer - isSoundBlocked', () => {
        it('should return false when no sound-blocking wall', () => {
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const result = visionAnalyzer.isSoundBlocked(mockObserver, mockTarget);

            expect(result).toBe(false);
            expect(CONFIG.Canvas.polygonBackends.sound.testCollision).toHaveBeenCalledWith(
                mockObserver.center,
                mockTarget.center,
                { type: 'sound', mode: 'any' }
            );
        });

        it('should return true when sound-blocking wall present', () => {
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(true);

            const result = visionAnalyzer.isSoundBlocked(mockObserver, mockTarget);

            expect(result).toBe(true);
            expect(CONFIG.Canvas.polygonBackends.sound.testCollision).toHaveBeenCalledWith(
                mockObserver.center,
                mockTarget.center,
                { type: 'sound', mode: 'any' }
            );
        });

        it('should return false when polygon backend not available', () => {
            CONFIG.Canvas.polygonBackends.sound = null;

            const result = visionAnalyzer.isSoundBlocked(mockObserver, mockTarget);

            expect(result).toBe(false); // Fail open
        });
    });

    describe('StatelessVisibilityCalculator - Line of Sight Blocking', () => {
        it('should block visual detection when hasLineOfSight is false', () => {
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight: false, // No line of sight
                soundBlocked: false
            };

            const result = calculateVisibility(input);

            // Visual detection should fail, but hearing should succeed
            expect(result.state).toBe('hidden'); // Hidden via hearing
            expect(result.detection?.sense).toBe('hearing');
        });

        it('should result in undetected when both sight and sound blocked', () => {
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight: false, // No line of sight
                soundBlocked: true // Sound blocked
            };

            const result = calculateVisibility(input);

            // Both visual and hearing should fail
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        it('should result in undetected when no sight and observer deafened', () => {
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: true, dazzled: false }, // Deafened
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight: false, // No line of sight
                soundBlocked: false // Sound NOT blocked, but observer is deafened
            };

            const result = calculateVisibility(input);

            // Visual fails (no LoS), hearing fails (deafened)
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });

        it('should allow detection with precise non-visual sense even without LoS', () => {
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity, tremorsense: 60 }, // Has tremorsense
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel' // On ground, not flying
                },
                hasLineOfSight: false, // No line of sight
                soundBlocked: true // Sound blocked
            };

            const result = calculateVisibility(input);

            // Tremorsense should detect despite no LoS and blocked sound
            expect(result.state).toBe('observed');
            expect(result.detection?.sense).toBe('tremorsense');
            expect(result.detection?.isPrecise).toBe(true);
        });

        it('should allow visual detection when hasLineOfSight is true', () => {
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight: true, // Has line of sight
                soundBlocked: false
            };

            const result = calculateVisibility(input);

            // Visual detection should succeed
            expect(result.state).toBe('observed');
            expect(result.detection?.isPrecise).toBe(true);
        });
    });

    describe('Cache Clearing on Condition Changes', () => {
        it('should clear cache when clearCache is called', () => {
            // First call to cache capabilities
            visionAnalyzer.getSensingCapabilities(mockObserver);

            // Verify something is cached (internal test)
            const firstCall = visionAnalyzer.getSensingCapabilities(mockObserver);

            // Clear cache
            visionAnalyzer.clearCache(mockObserver);

            // After clearing, capabilities should be recalculated
            const secondCall = visionAnalyzer.getSensingCapabilities(mockObserver);

            // Both calls should return valid capabilities
            expect(firstCall).toBeDefined();
            expect(secondCall).toBeDefined();
            expect(firstCall.imprecise).toBeDefined();
            expect(secondCall.imprecise).toBeDefined();
        });

        it('should recalculate deafened condition after cache clear', () => {
            // Initial state: not deafened
            mockObserver.actor.hasCondition.mockReturnValue(false);

            const firstCapabilities = visionAnalyzer.getSensingCapabilities(mockObserver);
            expect(firstCapabilities.imprecise.hearing).toBeDefined();

            // Change state: now deafened
            mockObserver.actor.hasCondition.mockImplementation((condition) => {
                return condition === 'deafened';
            });

            // Clear cache to force recalculation
            visionAnalyzer.clearCache(mockObserver);

            const secondCapabilities = visionAnalyzer.getSensingCapabilities(mockObserver);

            // Hearing should be removed when deafened
            expect(secondCapabilities.imprecise.hearing).toBeUndefined();
            expect(secondCapabilities.precise.hearing).toBeUndefined();
        });
    });

    describe('Integration: Full Visibility Flow', () => {
        it('should handle sight-blocking wall with hearing detection', () => {
            // Setup: Wall blocks sight, but not sound
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLineOfSight = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            const soundBlocked = visionAnalyzer.isSoundBlocked(mockObserver, mockTarget);

            expect(hasLineOfSight).toBe(false);
            expect(soundBlocked).toBe(false);

            // Calculate visibility
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight,
                soundBlocked
            };

            const result = calculateVisibility(input);

            // Should be hidden (detected by hearing only)
            expect(result.state).toBe('hidden');
            expect(result.detection?.sense).toBe('hearing');
        });

        it('should handle sight+sound blocking wall resulting in undetected', () => {
            // Setup: Wall blocks both sight and sound
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(true);

            const hasLineOfSight = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);
            const soundBlocked = visionAnalyzer.isSoundBlocked(mockObserver, mockTarget);

            expect(hasLineOfSight).toBe(false);
            expect(soundBlocked).toBe(true);

            // Calculate visibility
            const input = {
                observer: {
                    precise: { 'light-perception': Infinity },
                    imprecise: { hearing: 60 },
                    conditions: { blinded: false, deafened: false, dazzled: false },
                    lightingLevel: 'bright'
                },
                target: {
                    lightingLevel: 'bright',
                    coverLevel: 'none',
                    concealment: false,
                    auxiliary: [],
                    movementAction: 'travel'
                },
                hasLineOfSight,
                soundBlocked
            };

            const result = calculateVisibility(input);

            // Should be undetected (no visual, no hearing)
            expect(result.state).toBe('undetected');
            expect(result.detection).toBe(null);
        });
    });
});
