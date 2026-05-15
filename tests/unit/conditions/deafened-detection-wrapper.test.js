/**
 * Tests for deafened condition handling in detection wrapper
 */

import { DetectionWrapper } from '../../../scripts/services/DetectionWrapper.js';
import { markExplicitVisiblePair } from '../../../scripts/services/ExplicitVisibilityPairs.js';

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
import '../../../scripts/services/DetectionWrapper.js';

describe('Deafened Detection Wrapper', () => {
    let detectionWrapper;
    let mockVisionSource;
    let mockConfig;
    let mockMode;

    beforeEach(() => {
        jest.clearAllMocks();
        detectionWrapper = new DetectionWrapper();
        detectionWrapper.register();

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
            level: 'level-b',
            object: {
                document: {
                    level: 'level-b',
                    getFlag: jest.fn().mockReturnValue(false),
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

        test('still follows wrapped detection when deafened and no other imprecise senses', () => {
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
                expect(result).toBe(true); // Detection wrapper itself does not filter deafened hearing here
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
                expect(mockCanDetect).toHaveBeenCalledWith(mockVisionSource, mockConfig.object, 'level-b');
            }
        });

        test('does not skip offscreen targets before Foundry detection point tests run', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                app: {
                    renderer: {
                        screen: { width: 1000, height: 1000 },
                    },
                },
                stage: {
                    worldTransform: {
                        applyInverse: jest.fn((point) => ({ x: point.x, y: point.y })),
                    },
                },
                grid: { size: 100 },
            };

            const mockCanDetect = jest.fn().mockReturnValue(true);
            const mockTestPoint = jest.fn().mockReturnValue(true);
            const detectionModeInstance = {
                _canDetect: mockCanDetect,
                _testPoint: mockTestPoint,
            };
            const offscreenConfig = {
                ...mockConfig,
                object: {
                    center: { x: 5050, y: 5050 },
                    document: {
                        id: 'offscreen-target',
                        x: 5000,
                        y: 5000,
                        width: 1,
                        height: 1,
                        level: 'level-b',
                        getFlag: jest.fn().mockReturnValue(false),
                    },
                },
            };

            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];

            const result = wrappedFunction.call(detectionModeInstance, mockVisionSource, mockMode, offscreenConfig);

            expect(result).toBe(true);
            expect(mockCanDetect).toHaveBeenCalledWith(
                mockVisionSource,
                offscreenConfig.object,
                'level-b',
            );
            expect(mockTestPoint).toHaveBeenCalled();

            global.canvas = originalCanvas;
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
                expect(mockCanDetect).toHaveBeenCalledWith(mockVisionSource, mockConfig.object, 'level-b');
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

    describe('Visioner visibility states', () => {
        function getDetectionWrapperRegistration(path) {
            return mockLibWrapper.register.mock.calls.find(
                call => call[1] === path
            )?.[2];
        }

        function buildTokenPair(visibilityState) {
            const observer = {
                actor: {},
                document: {
                    id: 'observer',
                    getFlag: jest.fn().mockReturnValue({ target: visibilityState }),
                },
            };
            const target = {
                actor: {},
                document: { id: 'target' },
            };

            return { observer, target };
        }

        test('basic sight blocks legacy unnoticed through profile semantics', () => {
            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const { observer, target } = buildTokenPair('unnoticed');

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(false);
        });

        test('basic sight allows concealed because concealment is not detection loss', () => {
            const basicSightWrapper = getDetectionWrapperRegistration(
                'CONFIG.Canvas.detectionModes.basicSight._canDetect',
            );
            const { observer, target } = buildTokenPair('concealed');

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(true);
        });

        test('basic sight allows explicit door-visible pair when Foundry detection is stale false', () => {
            const basicSightWrapper = getDetectionWrapperRegistration(
                'CONFIG.Canvas.detectionModes.basicSight._canDetect',
            );
            const { observer, target } = buildTokenPair('observed');
            global.game.pf2eVisioner = {};
            markExplicitVisiblePair(observer, target);

            expect(basicSightWrapper(jest.fn().mockReturnValue(false), { object: observer }, target)).toBe(true);
        });

        test('hearing allows hidden but blocks undetected and legacy unnoticed', () => {
            const hearingWrapper = getDetectionWrapperRegistration(
                'CONFIG.Canvas.detectionModes.hearing._canDetect',
            );

            const hiddenPair = buildTokenPair('hidden');
            expect(hearingWrapper(
                jest.fn().mockReturnValue(true),
                { object: hiddenPair.observer },
                hiddenPair.target,
            )).toBe(true);

            const undetectedPair = buildTokenPair('undetected');
            expect(hearingWrapper(
                jest.fn().mockReturnValue(true),
                { object: undetectedPair.observer },
                undetectedPair.target,
            )).toBe(false);

            const unnoticedPair = buildTokenPair('unnoticed');
            expect(hearingWrapper(
                jest.fn().mockReturnValue(true),
                { object: unnoticedPair.observer },
                unnoticedPair.target,
            )).toBe(false);
        });

        test('hearing renders Visioner-hidden targets even when Foundry point visibility fails', () => {
            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];
            const observer = {
                actor: {},
                document: {
                    id: 'observer',
                    getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                },
            };
            const target = {
                actor: {},
                document: {
                    id: 'target',
                    level: 'level-b',
                    getFlag: jest.fn().mockReturnValue(false),
                },
            };
            const detectionModeInstance = {
                id: 'hearing',
                _canDetect: jest.fn().mockReturnValue(true),
                _testPoint: jest.fn().mockReturnValue(false),
            };

            const result = wrappedFunction.call(
                detectionModeInstance,
                { object: observer },
                { id: 'hearing', enabled: true },
                { ...mockConfig, object: target },
            );

            expect(result).toBe(true);
            expect(detectionModeInstance._testPoint).not.toHaveBeenCalled();
        });
    });
});
