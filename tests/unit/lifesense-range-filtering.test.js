/**
 * Test: Lifesense Range Filtering
 * 
 * Verifies that imprecise senses (lifesense, scent, tremorsense) are properly
 * filtered by range before being passed to the visibility calculator.
 * 
 * Bug: Invisible creatures beyond lifesense range were incorrectly detected as "hidden"
 * instead of "undetected" because range checks weren't being performed.
 * 
 * Fix: Range filtering now happens in VisibilityCalculatorAdapter before passing
 * senses to StatelessVisibilityCalculator.
 */

import { jest } from '@jest/globals';

describe('Lifesense Range Filtering', () => {
    let tokenStateToInput;
    let calculateVisibility;
    let mockCanvas;
    let mockObserver;
    let mockTarget;
    let mockLightingCalculator;
    let mockVisionAnalyzer;
    let mockConditionManager;
    let mockLightingRasterService;

    beforeEach(async () => {
        // Mock canvas
        mockCanvas = {
            grid: { size: 100 },
            dimensions: { distance: 5 }, // 1 grid = 5 feet
            perception: {
                update: jest.fn()
            }
        };
        global.canvas = mockCanvas;

        // Import modules
        const adapterModule = await import('../../scripts/visibility/VisibilityCalculatorAdapter.js');
        tokenStateToInput = adapterModule.tokenStateToInput;

        const calculatorModule = await import('../../scripts/visibility/StatelessVisibilityCalculator.js');
        calculateVisibility = calculatorModule.calculateVisibility;

        // Mock observer token (Ezren with greater darkvision + lifesense 10 ft)
        mockObserver = {
            name: 'Ezren',
            id: 'observer-1',
            document: {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                elevation: 0
            },
            actor: {
                system: {
                    perception: {
                        senses: []
                    }
                }
            }
        };

        // Mock target token (invisible creature)
        mockTarget = {
            name: 'Invisible Creature',
            id: 'target-1',
            document: {
                x: 300, // Will be adjusted per test
                y: 0,
                width: 1,
                height: 1,
                elevation: 0,
                flags: {
                    'pf2e-visioner': {}
                }
            },
            actor: {
                system: {
                    traits: {
                        value: [] // Living creature (not undead/construct)
                    }
                },
                conditions: []
            }
        };

        // Mock lighting calculator
        mockLightingCalculator = {
            getLightLevelAt: jest.fn().mockReturnValue({
                level: 'bright',
                darknessRank: 0,
                isDarknessSource: false
            })
        };

        // Mock vision analyzer with lifesense 10 ft (NO scent to avoid priority issues)
        mockVisionAnalyzer = {
            getVisionCapabilities: jest.fn().mockReturnValue({
                hasVision: true,
                hasGreaterDarkvision: true,
                darkvisionRange: Infinity,
                sensingSummary: {
                    precise: [
                        { type: 'greater-darkvision', range: Infinity },
                        { type: 'vision', range: Infinity }
                    ],
                    imprecise: [
                        { type: 'lifesense', range: 10 } // 10 ft range
                    ],
                    hearing: { range: Infinity }
                }
            }),
            hasLineOfSight: jest.fn().mockReturnValue(true),
            isSoundBlocked: jest.fn().mockReturnValue(false)
        };

        // Mock condition manager
        mockConditionManager = {
            isBlinded: jest.fn().mockReturnValue(false),
            isDazzled: jest.fn().mockReturnValue(false),
            isDeafened: jest.fn().mockReturnValue(false)
        };

        // Mock lighting raster service
        mockLightingRasterService = {
            checkRayDarkness: jest.fn().mockResolvedValue({
                passesThroughDarkness: false,
                rank: 0
            })
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Invisible creature beyond lifesense range', () => {
        test('should be undetected when 15 ft away (beyond 10 ft lifesense range)', async () => {
            // Position target 15 ft away (3 grid units * 5 ft = 15 ft)
            mockTarget.document.x = 300; // 3 grid units from origin

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense was filtered out (not in imprecise object)
            expect(input.observer.imprecise.lifesense).toBeUndefined();

            // Verify hearing is still present (infinite range)
            expect(input.observer.imprecise.hearing).toBeDefined();
            expect(input.observer.imprecise.hearing.range).toBe(Infinity);

            // Add invisible condition to target
            input.target.auxiliary = ['invisible'];

            // Calculate visibility
            const result = calculateVisibility(input);

            // Should be undetected (hearing + invisible = undetected)
            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });

        test('should be undetected when 20 ft away (far beyond lifesense range)', async () => {
            // Position target 20 ft away (4 grid units * 5 ft = 20 ft)
            mockTarget.document.x = 400;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense was filtered out
            expect(input.observer.imprecise.lifesense).toBeUndefined();

            // Add invisible condition
            input.target.auxiliary = ['invisible'];

            const result = calculateVisibility(input);

            expect(result.state).toBe('undetected');
            expect(result.detection).toBeNull();
        });

        test('should be hidden when 11 ft away (rounds down to 10 ft, within lifesense range)', async () => {
            // Position target 11 ft away (2.2 grid units * 5 ft = 11 ft)
            // In PF2e, 11 ft rounds down to 10 ft, so it's within lifesense range 10
            mockTarget.document.x = 220;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense is included (11 ft rounds down to 10 ft)
            expect(input.observer.imprecise.lifesense).toBeDefined();
            expect(input.observer.imprecise.lifesense.range).toBe(10);

            input.target.auxiliary = ['invisible'];
            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
        });

        test('should be undetected when 15+ ft away (beyond 10 ft lifesense range)', async () => {
            // Position target 15 ft away (3 grid units * 5 ft = 15 ft)
            // In PF2e, 15 ft rounds down to 15 ft, beyond lifesense range 10
            mockTarget.document.x = 300;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense was filtered out (15 ft > 10 ft range)
            expect(input.observer.imprecise.lifesense).toBeUndefined();

            input.target.auxiliary = ['invisible'];
            const result = calculateVisibility(input);

            expect(result.state).toBe('undetected');
        });
    });

    describe('Invisible creature within lifesense range', () => {
        test('should be hidden when 8 ft away (within 10 ft lifesense range)', async () => {
            // Position target 8 ft away (1.6 grid units * 5 ft = 8 ft)
            mockTarget.document.x = 160;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense is present (within range)
            expect(input.observer.imprecise.lifesense).toBeDefined();
            expect(input.observer.imprecise.lifesense.range).toBe(10);

            // Add invisible condition
            input.target.auxiliary = ['invisible'];

            const result = calculateVisibility(input);

            // Should be hidden (lifesense bypasses invisibility)
            expect(result.state).toBe('hidden');
            expect(result.detection).toBeDefined();
            expect(result.detection.sense).toBe('lifesense');
            expect(result.detection.isPrecise).toBe(false);
        });

        test('should be hidden when 5 ft away (well within range)', async () => {
            // Position target 5 ft away (1 grid unit * 5 ft = 5 ft)
            mockTarget.document.x = 100;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            expect(input.observer.imprecise.lifesense).toBeDefined();

            input.target.auxiliary = ['invisible'];
            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
        });

        test('should be hidden when exactly 10 ft away (at range boundary)', async () => {
            // Position target exactly 10 ft away (2 grid units * 5 ft = 10 ft)
            mockTarget.document.x = 200;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Verify lifesense is present (exactly at range)
            expect(input.observer.imprecise.lifesense).toBeDefined();

            input.target.auxiliary = ['invisible'];
            const result = calculateVisibility(input);

            expect(result.state).toBe('hidden');
            expect(result.detection.sense).toBe('lifesense');
        });
    });

    describe('Other imprecise senses range filtering', () => {
        test('scent should be filtered when beyond 30 ft range', async () => {
            // Position target 40 ft away (8 grid units * 5 ft = 40 ft)
            mockTarget.document.x = 800;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Both lifesense and scent should be filtered out
            expect(input.observer.imprecise.lifesense).toBeUndefined();
            expect(input.observer.imprecise.scent).toBeUndefined();

            // Only hearing should remain
            expect(input.observer.imprecise.hearing).toBeDefined();
        });

        test('scent should be present when within 30 ft range', async () => {
            // Add scent 30 ft to vision capabilities
            mockVisionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: true,
                sensingSummary: {
                    precise: [{ type: 'vision', range: Infinity }],
                    imprecise: [
                        { type: 'lifesense', range: 10 },
                        { type: 'scent', range: 30 }
                    ],
                    hearing: { range: Infinity }
                }
            });

            // Position target 25 ft away (5 grid units * 5 ft = 25 ft)
            mockTarget.document.x = 500;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Lifesense filtered (25 > 10), scent present (25 < 30)
            expect(input.observer.imprecise.lifesense).toBeUndefined();
            expect(input.observer.imprecise.scent).toBeDefined();
            expect(input.observer.imprecise.scent.range).toBe(30);
        });

        test('tremorsense range filtering', async () => {
            // Add tremorsense 20 ft to vision capabilities
            mockVisionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: true,
                hasGreaterDarkvision: true,
                darkvisionRange: Infinity,
                sensingSummary: {
                    precise: [
                        { type: 'greater-darkvision', range: Infinity }
                    ],
                    imprecise: [
                        { type: 'tremorsense', range: 20 }
                    ],
                    hearing: { range: Infinity }
                }
            });

            // Target at 25 ft (beyond tremorsense range)
            mockTarget.document.x = 500;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Tremorsense should be filtered out
            expect(input.observer.imprecise.tremorsense).toBeUndefined();
        });
    });

    describe('Precise senses are not affected by range filtering', () => {
        test('greater darkvision should always be present (infinite range)', async () => {
            // Position target very far away
            mockTarget.document.x = 2000; // 100 grid units = 500 ft

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Precise senses with infinite range should be present
            expect(input.observer.precise['greater-darkvision']).toBeDefined();
            expect(input.observer.precise.vision).toBeDefined();
        });
    });

    describe('Hearing always present unless deafened', () => {
        test('hearing should be present regardless of distance', async () => {
            // Position target extremely far away
            mockTarget.document.x = 5000; // 250 grid units = 1250 ft

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Hearing has infinite range by default
            expect(input.observer.imprecise.hearing).toBeDefined();
            expect(input.observer.imprecise.hearing.range).toBe(Infinity);
        });
    });

    describe('Edge cases', () => {
        test('handles canvas.dimensions undefined gracefully', async () => {
            // Simulate test environment where canvas.dimensions is undefined
            delete mockCanvas.dimensions;

            // Position target 10 ft away (should use fallback of 5 ft per grid)
            mockTarget.document.x = 200;

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // Should still work with fallback
            expect(input.observer.imprecise.lifesense).toBeDefined();
        });

        test('multiple imprecise senses filtered independently', async () => {
            // Add multiple imprecise senses with different ranges
            mockVisionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: true,
                sensingSummary: {
                    precise: [{ type: 'vision', range: Infinity }],
                    imprecise: [
                        { type: 'lifesense', range: 10 },
                        { type: 'scent', range: 30 },
                        { type: 'tremorsense', range: 60 }
                    ],
                    hearing: { range: Infinity }
                }
            });

            // Target at 40 ft
            mockTarget.document.x = 800; // 8 grid units = 40 ft

            const input = await tokenStateToInput(
                mockObserver,
                mockTarget,
                mockLightingCalculator,
                mockVisionAnalyzer,
                mockConditionManager,
                mockLightingRasterService
            );

            // lifesense (10) and scent (30) filtered, tremorsense (60) present
            expect(input.observer.imprecise.lifesense).toBeUndefined();
            expect(input.observer.imprecise.scent).toBeUndefined();
            expect(input.observer.imprecise.tremorsense).toBeDefined();
            expect(input.observer.imprecise.hearing).toBeDefined();
        });
    });
});
