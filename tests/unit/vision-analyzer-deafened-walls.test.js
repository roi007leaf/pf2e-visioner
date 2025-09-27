/**
 * Tests for deafened condition handling in VisionAnalyzer wall collision checks
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

// Mock the logger
jest.mock('../../scripts/utils/logger.js', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        enabled: jest.fn(() => false)
    }))
}));

// Mock constants
jest.mock('../../scripts/constants.js', () => ({
    MODULE_ID: 'pf2e-visioner'
}));

// Mock Foundry globals
global.CONFIG = {
    Canvas: {
        polygonBackends: {
            sight: {
                testCollision: jest.fn()
            },
            sound: {
                testCollision: jest.fn()
            }
        }
    }
};

global.canvas = {
    walls: {
        checkCollision: jest.fn()
    }
};

global.foundry = {
    canvas: {
        geometry: {
            Ray: class MockRay {
                constructor(start, end) {
                    this.A = start;
                    this.B = end;
                }
            }
        }
    }
};

describe('VisionAnalyzer Wall Collision with Deafened Condition', () => {
    let visionAnalyzer;
    let mockObserver;
    let mockTarget;

    beforeEach(() => {
        jest.clearAllMocks();
        visionAnalyzer = VisionAnalyzer.getInstance();

        // Mock observer token with deafened condition and various senses
        mockObserver = {
            name: 'Observer',
            center: { x: 0, y: 0 },
            actor: {
                hasCondition: jest.fn(),
                system: {
                    perception: {
                        vision: true, // Observer has vision capabilities
                        senses: {}
                    }
                }
            },
            document: { id: 'test-deafened-observer' },
            vision: {
                shape: null // Force fallback to wall collision
            }
        };

        // Mock target token
        mockTarget = {
            name: 'Target',
            center: { x: 100, y: 100 },
            actor: {
                type: 'character'
            },
            shape: null
        };
    });

    describe('Line of Sight with Deafened Condition', () => {
        test('should block LOS when deafened observer has no other imprecise senses and sight is blocked', () => {
            // Setup: Observer is deafened with no other imprecise senses
            mockObserver.actor.hasCondition.mockImplementation((condition) => condition === 'deafened'); // only deafened, not blinded
            mockObserver.actor.system.perception.senses = {}; // no other senses

            // Sight is blocked but sound is not
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLOS = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(hasLOS).toBe(false); // Should be blocked (undetected)
            expect(CONFIG.Canvas.polygonBackends.sight.testCollision).toHaveBeenCalled();
        });

        test('should block visual LOS when deafened observer has tremorsense and sight is blocked', () => {
            // Setup: Observer is deafened but has tremorsense
            mockObserver.actor.hasCondition.mockImplementation((condition) => condition === 'deafened'); // only deafened, not blinded
            mockObserver.actor.system.perception.senses = {
                tremorsense: { acuity: 'imprecise', range: 30 }
            };

            // Sight is blocked but sound is not
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLOS = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            // Line of sight specifically refers to visual sight, which is blocked
            // The observer can still detect via tremorsense, but that's handled by detection logic
            expect(hasLOS).toBe(false);
            expect(CONFIG.Canvas.polygonBackends.sight.testCollision).toHaveBeenCalled();
        });

        test('should block visual LOS when deafened observer has scent and sight is blocked', () => {
            // Setup: Observer is deafened but has scent  
            mockObserver.actor.hasCondition.mockImplementation((condition) => condition === 'deafened'); // only deafened, not blinded
            mockObserver.actor.system.perception.senses = {
                scent: { acuity: 'imprecise', range: 30 }
            };      // Sight is blocked but sound is not
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLOS = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            // Line of sight specifically refers to visual sight, which is blocked
            // The observer can still detect via scent, but that's handled by detection logic  
            expect(hasLOS).toBe(false);
        });

        test('should work normally when not deafened regardless of other senses', () => {
            // Setup: Observer is not deafened
            mockObserver.actor.hasCondition.mockReturnValue(false); // not deafened

            // Sight is blocked but sound is not
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(true);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLOS = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(hasLOS).toBe(false); // Normal sight blocking applies
        });

        test('should allow LOS when neither sight nor sound is blocked', () => {
            // Setup: Observer is deafened with no other senses but still has normal vision
            mockObserver.actor.hasCondition.mockImplementation((condition) => condition === 'deafened'); // only deafened, not blinded
            mockObserver.actor.system.perception.senses = {}; // no other senses

            // Neither sight nor sound is blocked
            CONFIG.Canvas.polygonBackends.sight.testCollision.mockReturnValue(false);
            CONFIG.Canvas.polygonBackends.sound.testCollision.mockReturnValue(false);

            const hasLOS = visionAnalyzer.hasLineOfSight(mockObserver, mockTarget);

            expect(hasLOS).toBe(true); // Should allow detection (no walls blocking)
        });
    });

    describe('Sensing Summary Integration', () => {
        test('should correctly identify non-hearing imprecise senses', () => {
            // Setup observer with various senses
            mockObserver.actor.hasCondition.mockReturnValue(true); // deafened
            mockObserver.actor.system.perception.senses = {
                hearing: { acuity: 'imprecise', range: 30 }, // Should be excluded when deafened
                tremorsense: { acuity: 'imprecise', range: 30 }, // Should be included
                scent: { acuity: 'imprecise', range: 15 } // Should be included
            };

            const summary = visionAnalyzer.getSensingSummary(mockObserver);

            // Hearing should be excluded due to deafened condition
            expect(summary.hearing).toBeNull();

            // Other imprecise senses should be included
            expect(summary.imprecise).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ type: 'tremorsense', range: 30 }),
                    expect.objectContaining({ type: 'scent', range: 15 })
                ])
            );

            // Should not include hearing in imprecise array when deafened
            expect(summary.imprecise).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ type: 'hearing' })
                ])
            );
        });
    });
});