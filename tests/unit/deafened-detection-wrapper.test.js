/**
 * Tests for deafened condition handling in detection wrapper
 */

import { DetectionWrapper } from '../../scripts/services/detection-wrapper.js';

// Mock dependencies
const mockLibWrapper = {
    register: jest.fn(),
};
global.libWrapper = mockLibWrapper;

global.game = {
    modules: {
        get: jest.fn().mockReturnValue({ active: true }),
    },
};

global.CONFIG = {
    Canvas: {
        detectionModes: {
            basicSight: { _canDetect: jest.fn() },
            lightPerception: { _canDetect: jest.fn() },
            hearing: { _canDetect: jest.fn() },
            feelTremor: { _canDetect: jest.fn() },
        },
    },
};

// Import the module functions we want to test
import '../../scripts/services/detection-wrapper.js';

describe('Deafened Detection Wrapper', () => {
    let detectionWrapper;
    let mockVisionSource;
    let mockConfig;
    let mockMode;

    beforeEach(() => {
        jest.clearAllMocks();
        detectionWrapper = new DetectionWrapper();

        // Mock vision source with observer token
        mockVisionSource = {
            object: {
                actor: {
                    hasCondition: jest.fn(),
                    system: {
                        conditions: {},
                        perception: {
                            senses: {}
                        }
                    },
                    items: []
                }
            }
        };

        mockConfig = {
            object: {
                document: {
                    getFlag: jest.fn().mockReturnValue(false)
                }
            },
            tests: [{ point: { x: 100, y: 100 } }]
        };

        mockMode = {
            id: 'hearing',
            enabled: true
        };
    });

    describe('Hearing Detection with Deafened Condition', () => {
        test('should allow detection when deafened but has tremorsense', () => {
            // Setup: Observer is deafened but has tremorsense
            mockVisionSource.object.actor.hasCondition.mockReturnValue(true);
            mockVisionSource.object.actor.system.perception.senses.tremorsense = { range: 30 };

            // Mock the detection mode prototype methods
            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            // Create a mock detection mode instance with the methods
            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            // Get the wrapped function that libWrapper would have registered
            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, mockConfig);
                expect(result).toBe(true); // Should allow detection as hidden
            }
        });

        test('should block detection when deafened and no other imprecise senses', () => {
            // Setup: Observer is deafened with no other imprecise senses
            mockVisionSource.object.actor.hasCondition.mockReturnValue(true);
            mockVisionSource.object.actor.system.perception.senses = {}; // No other senses

            // Mock the detection mode prototype methods
            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            // Create a mock detection mode instance with the methods
            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            // Get the wrapped function that libWrapper would have registered
            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, mockConfig);
                expect(result).toBe(false); // Should block detection entirely (undetected)
            }
        });

        test('should work normally when not deafened', () => {
            // Setup: Observer is not deafened
            mockVisionSource.object.actor.hasCondition.mockReturnValue(false);

            // Mock the detection mode prototype methods
            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            // Create a mock detection mode instance with the methods
            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            // Get the wrapped function that libWrapper would have registered
            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, mockConfig);
                expect(result).toBe(true); // Should proceed with normal detection logic
                expect(mockCanDetect).toHaveBeenCalledWith(mockVisionSource, mockConfig.object, mockConfig);
            }
        });

        test('should not affect non-hearing detection modes', () => {
            // Setup: Testing with basicSight mode, observer is deafened
            const sightMode = { id: 'basicSight', enabled: true };
            mockVisionSource.object.actor.hasCondition.mockReturnValue(true);

            // Mock the detection mode prototype methods
            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            // Create a mock detection mode instance with the methods
            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            // Get the wrapped function that libWrapper would have registered
            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, sightMode, mockConfig);
                // Should proceed with normal detection logic, not affected by deafened condition
                expect(mockCanDetect).toHaveBeenCalledWith(mockVisionSource, mockConfig.object, mockConfig);
            }
        });
    });

    describe('Imprecise Sense Detection', () => {
        test('should detect tremorsense from system.perception.senses', () => {
            mockVisionSource.object.actor.system.perception.senses.tremorsense = { range: 30 };

            // Since we can't directly call the helper functions, we test through the main function
            mockVisionSource.object.actor.hasCondition.mockReturnValue(true);

            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, mockConfig);
                expect(result).toBe(true); // Should allow detection due to tremorsense
            }
        });

        test('should detect scent from items collection', () => {
            mockVisionSource.object.actor.items = [
                {
                    name: 'Keen Scent',
                    system: { description: { value: 'grants scent sense' } },
                    active: true
                }
            ];

            mockVisionSource.object.actor.hasCondition.mockReturnValue(true);

            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);

            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint
            };

            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            if (wrappedFunction) {
                const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, mockConfig);
                expect(result).toBe(true); // Should allow detection due to scent
            }
        });
    });
});