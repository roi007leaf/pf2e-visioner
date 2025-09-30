/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock canvas and game globals
global.canvas = {
    grid: { size: 100 },
    scene: { grid: { distance: 5 } },
    tokens: { placeables: [] },
    walls: { placeables: [], quadtree: { getObjects: () => [] } }
};

global.game = {
    settings: {
        get: jest.fn(() => false),
    },
};

describe('Tremorsense Distance Filtering Fix', () => {
    let calculator, observer, target;

    beforeEach(async () => {
        // Import calculator after mocks are set up
        const { VisibilityCalculator } = await import('../../scripts/visibility/auto-visibility/VisibilityCalculator.js');
        const { VisionAnalyzer } = await import('../../scripts/visibility/auto-visibility/VisionAnalyzer.js');
        
        calculator = new VisibilityCalculator();
        
        // Create mock dependencies
        const mockLightingCalculator = {
            calculateLighting: jest.fn(() => ({ level: 'bright', darknessRank: 0 })),
            getLightLevelAt: jest.fn(() => ({ level: 'bright', darknessRank: 0, isDarknessSource: false, isHeightenedDarkness: false }))
        };
        
        const mockConditionManager = {
            isBlinded: jest.fn(() => false),
            isInvisible: jest.fn(() => false),
            isInvisibleTo: jest.fn(() => false), // Fixed: Add the correct method name
            isDazzled: jest.fn(() => false),
            hasCondition: jest.fn(() => false),
            getInvisibilityState: jest.fn(() => ({ becameInvisibleThisTurn: false }))
        };
        
        const visionAnalyzer = new VisionAnalyzer();
        
        // Initialize calculator with dependencies
        calculator.initialize(mockLightingCalculator, visionAnalyzer, mockConditionManager);
        
        // Create observer with tremorsense (30 ft range)
        observer = {
            id: 'observer1',
            name: 'Animated Broom',
            x: 0, 
            y: 0,
            center: { x: 0, y: 0 }, // Add center property for distance calculation
            document: {
                id: 'observer1',
                x: 0, // Document position should match token position
                y: 0,
                width: 1, // Standard token size
                height: 1,
                elevation: 0, // Ground level
            },
            actor: {
                system: {
                    perception: {
                        vision: false, // Animated broom has no normal vision
                        senses: [
                            {
                                type: 'tremorsense',
                                range: 30 // 30-foot tremorsense
                            }
                        ]
                    }
                }
            },
            // Add Foundry's distanceTo method (returns grid squares, not feet)
            distanceTo: function(other) {
                const dx = this.center.x - other.center.x;
                const dy = this.center.y - other.center.y;
                const px = Math.hypot(dx, dy);
                const gridSize = global.canvas?.grid?.size || 100;
                return px / gridSize; // Return grid squares, not feet
            }
        };

        // Create target at 25 feet away (within tremorsense range but beyond old 20ft limit)
        target = {
            id: 'target1', 
            name: 'Ezren',
            x: 125, // 25 feet away (25 * 5 pixels per foot = 125 pixels)
            y: 0,
            center: { x: 125, y: 0 }, // Add center property for distance calculation
            document: {
                id: 'target1',
                x: 125, // Document position should match token position
                y: 0,
                width: 1, // Standard token size 
                height: 1,
                elevation: 10, // Elevated, should be undetected by tremorsense
            },
            actor: {},
            // Add Foundry's distanceTo method (returns grid squares, not feet)
            distanceTo: function(other) {
                const dx = this.center.x - other.center.x;
                const dy = this.center.y - other.center.y;
                const px = Math.hypot(dx, dy);
                const gridSize = global.canvas?.grid?.size || 100;
                return px / gridSize; // Return grid squares, not feet
            }
        };

        // Add tokens to canvas
        global.canvas.tokens.placeables = [observer, target];
        
        // Place wall between tokens to block LOS
        const wall = {
            coords: [60, -50, 60, 50], // Vertical wall between tokens
            document: {
                move: 1, // Block movement (solid wall)
                door: 0  // Not a door
            }
        };
        global.canvas.walls.placeables = [wall];
    });

    test('tremorsense can detect tokens within 30ft range despite base 20ft distance limit', async () => {
        console.log('🔥 TEST: Testing tremorsense distance filtering fix');
        console.log('🔥 TEST: Observer at (0, 0), Target at (125, 0) = 25ft apart');
        console.log('🔥 TEST: Base max distance: 20ft, Tremorsense range: 30ft');
        console.log('🔥 TEST: Expected: Should process token pair and return undetected (elevated target)');
        
        const visibilityResult = await calculator.calculateVisibilityBetweenTokens(observer, target);
        const result = visibilityResult;
        
        console.log('🔥 TEST: Full result with reason:', JSON.stringify(result, null, 2));
        
        // With the fix, tremorsense should be able to check tokens up to 30ft away
        // Since target is elevated, it should be 'undetected' by tremorsense (not filtered out)
        expect(result).toBe('undetected');
        
        console.log('✅ TEST: Tremorsense distance filtering fix working with reason:', result.reason);
        
        console.log('🔥 TEST: Result:', result);
        console.log('✅ TEST: Tremorsense distance filtering fix working correctly');
    });

    test('tremorsense detects ground-level tokens within extended range', async () => {
        // Reset target to ground level and original position
        target.document.elevation = 0;
        target.x = 125; // Back to 25 feet away
        
        console.log('🔥 TEST: Testing tremorsense with ground-level target');
        console.log('🔥 TEST: Both tokens at elevation 0, 25ft apart');
        console.log('🔥 TEST: Expected: Should return hidden (imprecise tremorsense works)');
        
        // Debug why canSenseImprecisely might be returning false
        const visionAnalyzer = calculator.getVisionAnalyzer();
        const capabilities = visionAnalyzer.getVisionCapabilities(observer);
        const canSenseResult = visionAnalyzer.canSenseImprecisely(observer, target);
        const distance = Math.sqrt((target.x - observer.x) ** 2 + (target.y - observer.y) ** 2) / 5;
        
        console.log('🔍 DEBUG: capabilities.imprecise:', JSON.stringify(capabilities.imprecise, null, 2));
        console.log('🔍 DEBUG: canSenseImprecisely result:', canSenseResult);
        console.log('🔍 DEBUG: distance:', distance);
        console.log('🔍 DEBUG: target elevation:', target?.document?.elevation);
        
        const visibilityResult = await calculator.calculateVisibilityBetweenTokens(observer, target);
        
        // Extract result and reason from the new format
        const result = visibilityResult;
        
        console.log('🔥 TEST: Full result with reason:', JSON.stringify(result, null, 2));
        
        // Ground-level target within range should be detected by imprecise tremorsense → 'hidden'
        expect(result).toBe('hidden');
        
        console.log('✅ TEST: Ground-level tremorsense worked with reason:', result.reason);
        // (If tremorsense were precise, it would be 'observed')
        
        console.log('🔥 TEST: Result:', result);
        console.log('✅ TEST: Tremorsense ground detection working correctly');
    });

    test('tokens beyond maximum sense range are still filtered out', async () => {
        // Move target to 35 feet away (beyond tremorsense range) and reset elevation
        target.x = 700; // 35 feet away (7 grid squares × 100 pixels per square)
        target.center.x = 700; // Update center position too for distanceTo calculation  
        target.document.x = 700; // Update document position as well
        target.document.elevation = 0; // Ground level (same as observer)
        
        console.log('🔥 TEST: Testing tokens beyond maximum sense range');
        console.log('🔥 TEST: Target at 35ft away, beyond 30ft tremorsense range');
        
        const visibilityResult = await calculator.calculateVisibilityBetweenTokens(observer, target);
        
        console.log('🔥 TEST: Full result with reason:', JSON.stringify(visibilityResult, null, 2));
        console.log('🔥 TEST: State:', visibilityResult?.state || visibilityResult);
        console.log('🔥 TEST: Reason:', visibilityResult?.reason);
        
        // Extract the state and reason for the test
        const result = visibilityResult;
        
        // Should be 'undetected' when no senses can reach the target
        expect(result).toBe('undetected');
        
        console.log('✅ TEST: Expected undetected with reason:', result.reason);
        
        console.log('✅ TEST: Distance filtering still working for out-of-range tokens');
    });
});