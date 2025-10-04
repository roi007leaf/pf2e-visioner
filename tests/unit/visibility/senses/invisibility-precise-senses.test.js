/**
 * @jest-environment jsdom
 */

import { ConditionManager } from '../../../../scripts/visibility/auto-visibility/ConditionManager.js';
import { VisionAnalyzer } from '../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

// Mock canvas and game globals
global.canvas = {
    grid: { size: 100 },
    scene: { grid: { distance: 5 } },
};

global.game = {
    settings: {
        get: jest.fn(() => false),
    },
};

describe('Invisibility and Precise Non-Visual Senses', () => {
    let conditionManager;
    let visionAnalyzer;
    let mockObserver;
    let mockTarget;

    beforeEach(() => {
        conditionManager = new ConditionManager();
        visionAnalyzer = new VisionAnalyzer();

        // Mock observer token with echolocation (precise, non-visual)
        mockObserver = {
            id: 'observer1',
            name: 'Observer with Echolocation',
            center: { x: 100, y: 100 },
            actor: {
                system: {
                    perception: {
                        senses: [
                            { type: 'echolocation', acuity: 'precise', range: 40 }
                        ]
                    }
                }
            }
        };

        // Mock invisible target
        mockTarget = {
            id: 'target1',
            name: 'Invisible Target',
            center: { x: 150, y: 100 }, // 25 feet away
            actor: {
                hasCondition: jest.fn((condition) => condition === 'invisible'),
                system: {
                    conditions: {
                        invisible: { active: true }
                    }
                }
            }
        };

        // Mock VisionAnalyzer methods
        jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockImplementation((observer, target) => {
            // Check if observer has precise non-visual senses in range
            const senses = observer.actor?.system?.perception?.senses || [];
            for (const sense of senses) {
                if (sense.acuity === 'precise') {
                    // Check for echolocation
                    if (sense.type === 'echolocation') {
                        // Calculate distance (simplified for test)
                        const dx = observer.center.x - target.center.x;
                        const dy = observer.center.y - target.center.y;
                        const distance = Math.sqrt(dx * dx + dy * dy) / 5; // Convert to feet
                        return distance <= sense.range;
                    }

                    // Check for see-invisibility (treated as non-visual for invisibility purposes)
                    if (sense.type === 'see-invisibility') {
                        return true; // See-invisibility always works at unlimited range
                    }
                }
            }
            return false;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('invisible target should be detected by observer with echolocation', () => {
        const isInvisible = conditionManager.isInvisibleTo(mockObserver, mockTarget);

        // Should return false because echolocation (precise, non-visual) ignores invisibility
        expect(isInvisible).toBe(false);
        expect(visionAnalyzer.hasPreciseNonVisualInRange).toHaveBeenCalledWith(mockObserver, mockTarget);
    });

    test('invisible target should remain invisible to observer with only sight', () => {
        // Observer with only normal sight
        const observerWithSight = {
            ...mockObserver,
            actor: {
                system: {
                    perception: {
                        senses: []
                    }
                }
            }
        };

        // Mock the method to return false for no precise non-visual senses
        jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(false);

        const isInvisible = conditionManager.isInvisibleTo(observerWithSight, mockTarget);

        // Should return true because observer relies only on sight
        expect(isInvisible).toBe(true);
    });

    test('target without invisibility condition should not be invisible', () => {
        // Target without invisibility
        const visibleTarget = {
            ...mockTarget,
            actor: {
                hasCondition: jest.fn(() => false),
                system: {
                    conditions: {}
                }
            }
        };

        const isInvisible = conditionManager.isInvisibleTo(mockObserver, visibleTarget);

        // Should return false because target is not invisible
        expect(isInvisible).toBe(false);
    });

    test('observer with see-invisibility should detect invisible target', () => {
        // Observer with see-invisibility
        const observerWithSeeInvisibility = {
            ...mockObserver,
            actor: {
                system: {
                    perception: {
                        senses: [
                            { type: 'see-invisibility', acuity: 'precise', range: Infinity }
                        ]
                    }
                }
            }
        };

        const isInvisible = conditionManager.isInvisibleTo(observerWithSeeInvisibility, mockTarget);

        // Should return false because see-invisibility counters invisibility
        expect(isInvisible).toBe(false);
    });

    test('invisible target should remain invisible to observer with imprecise senses only', () => {
        // Observer with only imprecise senses (like tremorsense)
        const observerWithImpreciseSenses = {
            ...mockObserver,
            actor: {
                system: {
                    perception: {
                        senses: [
                            { type: 'tremorsense', acuity: 'imprecise', range: 30 }
                        ]
                    }
                }
            }
        };

        // Mock the method to return false for no precise non-visual senses
        jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(false);

        const isInvisible = conditionManager.isInvisibleTo(observerWithImpreciseSenses, mockTarget);

        // Should return true because imprecise senses don't ignore invisibility
        expect(isInvisible).toBe(true);
    });

    test('invisible target out of precise sense range should remain invisible', () => {
        // Target far away (100 feet)
        const farTarget = {
            ...mockTarget,
            center: { x: 600, y: 100 } // 100 feet away (500 pixels / 5 = 100 feet)
        };

        // Mock the method to return false for out of range
        jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange').mockReturnValue(false);

        const isInvisible = conditionManager.isInvisibleTo(mockObserver, farTarget);

        // Should return true because echolocation is out of range (40 feet)
        expect(isInvisible).toBe(true);
    });

    test('should handle errors gracefully when VisionAnalyzer is unavailable', () => {
        // Cause VisionAnalyzer.getInstance to throw an error
        jest.spyOn(VisionAnalyzer, 'getInstance').mockImplementation(() => {
            throw new Error('VisionAnalyzer not available');
        });

        const isInvisible = conditionManager.isInvisibleTo(mockObserver, mockTarget);

        // Should return true (treat as invisible) when unable to check precise senses
        expect(isInvisible).toBe(true);
    });
});