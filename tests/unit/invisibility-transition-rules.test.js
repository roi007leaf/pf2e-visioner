/**
 * Test for PF2E invisibility transition rules
 * Specifically testing: "If you're observed when you become invisible, instead of being undetected, you only become hidden"
 */

import { jest } from '@jest/globals';
import { ConditionManager } from '../../scripts/visibility/auto-visibility/ConditionManager.js';
import { VisibilityCalculator } from '../../scripts/visibility/auto-visibility/VisibilityCalculator.js';

describe('Invisibility Transition Rules', () => {
    let visibilityCalculator;
    let conditionManager;
    let mockObserver, mockTarget;
    let mockVisionAnalyzer, mockLightingCalculator, mockConditionManager;

    beforeEach(() => {
        // Create fresh mocks for each test
        mockVisionAnalyzer = {
            getVisionCapabilities: jest.fn(() => ({ hasVision: true, hasDarkvision: false, hasGreaterDarkvision: false })),
            hasPreciseNonVisualInRange: jest.fn(),
            canSenseImprecisely: jest.fn(),
            hasLineOfSight: jest.fn(),
            determineVisibilityFromLighting: jest.fn(),
            clearVisionCache: jest.fn(),
            canDetectElevatedTarget: jest.fn(() => true),
        };

        mockLightingCalculator = {
            getLightLevelAt: jest.fn(() => ({ darknessRank: 0 })),
        };

        mockConditionManager = {
            isBlinded: jest.fn(),
            isInvisibleTo: jest.fn(),
            isDazzled: jest.fn(),
            getInvisibilityState: jest.fn(),
        };

        // Create a real VisibilityCalculator instance with mocked dependencies
        visibilityCalculator = new VisibilityCalculator();
        visibilityCalculator.initialize(
            mockLightingCalculator,
            mockVisionAnalyzer,
            mockConditionManager,
            null, // spatial analyzer
            null  // exclusion manager
        );

        // Create mock tokens with proper structure
        mockObserver = {
            name: 'Observer',
            document: {
                id: 'obs1',
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                elevation: 0,
                flags: {}
            },
            actor: { name: 'Observer Actor' },
        };

        mockTarget = {
            name: 'Target',
            document: {
                id: 'tgt1',
                x: 100,
                y: 100,
                width: 1,
                height: 1,
                elevation: 0,
                flags: {
                    'pf2e-visioner': {
                        invisibility: {
                            'obs1': { wasVisible: true } // Target was visible when it became invisible
                        }
                    }
                }
            },
            actor: { name: 'Target Actor' },
        };

        // Default behavior: normal vision conditions
        mockConditionManager.isBlinded.mockReturnValue(false);
        mockConditionManager.isDazzled.mockReturnValue(false);

        mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
        mockVisionAnalyzer.canSenseImprecisely.mockReturnValue(false);
        mockVisionAnalyzer.hasLineOfSight.mockReturnValue(true);
        mockVisionAnalyzer.determineVisibilityFromLighting.mockReturnValue('observed');
    });

    describe('PF2E Invisibility Rule: Observed → Invisible = Hidden', () => {
        test('invisible creature that was observed when it became invisible should be hidden, not undetected', async () => {
            // Set up the scenario: target is invisible, observer has no special senses
            mockConditionManager.isInvisibleTo.mockReturnValue(true);
            mockConditionManager.getInvisibilityState.mockReturnValue('hidden'); // Should return hidden due to wasVisible flag

            mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            mockVisionAnalyzer.canSenseImprecisely.mockReturnValue(false);

            const result = await visibilityCalculator.calculateVisibility(
                mockObserver,
                mockTarget
            );

            // Should be hidden, not undetected, because the target was visible when it became invisible
            expect(result).toBe('hidden');

            // Verify the condition manager's invisibility state method is called
            expect(mockConditionManager.getInvisibilityState).toHaveBeenCalledWith(
                mockObserver,
                mockTarget,
                expect.any(Function), // hasSneakOverride function
                expect.any(Boolean)   // canSeeNormally
            );
        });

        test('invisible creature that was NOT observed when it became invisible should be undetected', async () => {
            // Modify target flags - no wasVisible flag or set to false
            mockTarget.document.flags = {
                'pf2e-visioner': {
                    invisibility: {
                        'obs1': { wasVisible: false }
                    }
                }
            };

            mockConditionManager.isInvisibleTo.mockReturnValue(true);
            mockConditionManager.getInvisibilityState.mockReturnValue('undetected'); // Should return undetected

            mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            mockVisionAnalyzer.canSenseImprecisely.mockReturnValue(false);

            const result = await visibilityCalculator.calculateVisibility(
                mockObserver,
                mockTarget
            );

            expect(result).toBe('undetected');
        });

        test('invisible creature with precise non-visual sense should still be observed regardless of wasVisible flag', async () => {
            mockConditionManager.isInvisibleTo.mockReturnValue(true);
            mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(true); // Has tremorsense or similar

            const result = await visibilityCalculator.calculateVisibility(
                mockObserver,
                mockTarget
            );

            // Precise non-visual senses override invisibility completely
            expect(result).toBe('observed');

            // getInvisibilityState shouldn't be called because precise senses take precedence
            expect(mockConditionManager.getInvisibilityState).not.toHaveBeenCalled();
        });

        test('invisible creature with imprecise sense should be hidden regardless of wasVisible flag', async () => {
            mockConditionManager.isInvisibleTo.mockReturnValue(true);
            mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            mockVisionAnalyzer.canSenseImprecisely.mockReturnValue(true); // Has hearing or similar

            const result = await visibilityCalculator.calculateVisibility(
                mockObserver,
                mockTarget
            );

            // Imprecise senses make invisible creatures hidden
            expect(result).toBe('hidden');

            // getInvisibilityState shouldn't be called because imprecise senses take precedence
            expect(mockConditionManager.getInvisibilityState).not.toHaveBeenCalled();
        });

        test('invisible creature that sneaked successfully should be undetected even if wasVisible', async () => {
            mockConditionManager.isInvisibleTo.mockReturnValue(true);
            mockConditionManager.getInvisibilityState.mockReturnValue('undetected'); // Sneak succeeded

            mockVisionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            mockVisionAnalyzer.canSenseImprecisely.mockReturnValue(false);

            const result = await visibilityCalculator.calculateVisibility(
                mockObserver,
                mockTarget
            );

            // Should be undetected because sneak succeeded
            expect(result).toBe('undetected');

            expect(mockConditionManager.getInvisibilityState).toHaveBeenCalled();
        });
    });

    describe('Integration with ConditionManager', () => {
        test('ConditionManager getInvisibilityState correctly implements wasVisible logic', async () => {
            // Test the ConditionManager directly
            const realConditionManager = new ConditionManager();

            // Mock the sneak override check
            const mockHasSneakOverride = jest.fn().mockResolvedValue(false);

            // Test case 1: was visible, can see normally -> should be hidden
            let result = await realConditionManager.getInvisibilityState(
                mockObserver,
                mockTarget,
                mockHasSneakOverride,
                true // canSeeNormally
            );
            expect(result).toBe('hidden');

            // Test case 2: was visible, can see normally, but sneaked -> should be undetected  
            mockHasSneakOverride.mockResolvedValue(true);
            result = await realConditionManager.getInvisibilityState(
                mockObserver,
                mockTarget,
                mockHasSneakOverride,
                true
            );
            expect(result).toBe('undetected');

            // Test case 3: was not visible -> should be undetected
            mockTarget.document.flags = {
                'pf2e-visioner': {
                    invisibility: {} // No wasVisible flag for this observer
                }
            };
            mockHasSneakOverride.mockResolvedValue(false);
            result = await realConditionManager.getInvisibilityState(
                mockObserver,
                mockTarget,
                mockHasSneakOverride,
                false // canSeeNormally
            );
            expect(result).toBe('undetected');
        });
    });
});