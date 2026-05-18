/**
 * Tests for deafened condition handling in detection wrapper
 */

import { DetectionWrapper } from '../../../scripts/services/DetectionWrapper.js';
import { markExplicitVisiblePair } from '../../../scripts/services/ExplicitVisibilityPairs.js';
import {
    clearPendingTokenMovementPosition,
    setPendingTokenMovementPosition,
    shouldTemporarilyForceTokenInvisible,
} from '../../../scripts/services/pending-token-movement.js';

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

        test('basic sight does not let explicit observed pair bypass pending wall-blocked movement', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                scene: { id: 'movement-scene' },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };
            const basicSightWrapper = getDetectionWrapperRegistration(
                'CONFIG.Canvas.detectionModes.basicSight._canDetect',
            );
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'observed' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            global.game.pf2eVisioner = {};
            markExplicitVisiblePair(observer, target);
            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(false), { object: observer }, target)).toBe(false);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
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

        test('basic sight does not reveal a hidden target during pending wall-blocked movement', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };

            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(false);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('basic sight keeps pending hidden NPC detectable when no wall blocks sight', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
            };

            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                },
            };
            const target = {
                id: 'target',
                actor: { type: 'npc' },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('basic sight does not reveal pending undetected NPC when no wall blocks sight', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
            };

            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'undetected' }),
                },
            };
            const target = {
                id: 'target',
                actor: { type: 'npc' },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(false);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('basic sight does not reveal pending undetected NPC when wall blocks sight', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };

            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'undetected' }),
                },
            };
            const target = {
                id: 'target',
                actor: { type: 'npc' },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(false);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('basic sight blocks observed target during pending wall-blocked movement', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };

            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'observed' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)).toBe(false);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('pending wall-blocked observed visual movement blocks Foundry point visibility', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };

            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'observed' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    level: 'level-b',
                    getFlag: jest.fn().mockReturnValue(false),
                },
            };
            const basicSightInstance = {
                id: 'basicSight',
                _canDetect: jest.fn().mockReturnValue(true),
                _testPoint: jest.fn().mockReturnValue(true),
            };
            const hearingInstance = {
                id: 'hearing',
                _canDetect: jest.fn().mockReturnValue(true),
                _testPoint: jest.fn().mockReturnValue(true),
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(wrappedFunction.call(
                basicSightInstance,
                { object: observer },
                { id: 'basicSight', enabled: true },
                { ...mockConfig, object: target },
            )).toBe(false);
            expect(wrappedFunction.call(
                hearingInstance,
                { object: observer },
                { id: 'hearing', enabled: true },
                { ...mockConfig, object: target },
            )).toBe(true);
            expect(basicSightInstance._testPoint).not.toHaveBeenCalled();
            expect(hearingInstance._testPoint).toHaveBeenCalled();

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('pending force check does not probe undetected basic sight state', () => {
            const originalCanvas = global.canvas;
            const basicSightWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'CONFIG.Canvas.detectionModes.basicSight._canDetect'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'undetected' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                controlled: false,
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: { placeables: [] },
                tokens: {
                    get: jest.fn((id) => (id === 'observer' ? observer : null)),
                    placeables: [observer, target],
                },
                effects: {
                    visionSources: [{ active: true, object: observer }],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() =>
                        basicSightWrapper(jest.fn().mockReturnValue(true), { object: observer }, target)
                    ),
                },
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            expect(shouldTemporarilyForceTokenInvisible(target)).toBe(true);
            expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility test is suppressed before light sources can reveal pending wall-blocked targets', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [
                        {
                            active: true,
                            object: {
                                id: 'observer',
                                document: {
                                    id: 'observer',
                                    x: 0,
                                    y: 0,
                                    width: 1,
                                    height: 1,
                                },
                            },
                        },
                    ],
                    lightSources: [],
                },
            };
            global.canvas.effects.lightSources.push({
                active: true,
                data: { vision: true },
                object: global.canvas.effects.visionSources[0].object,
            });

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(
                global.canvas.effects.visionSources[0].object.document,
                { x: 0, y: 0 },
                [global.canvas.effects.visionSources[0].object],
            );

            const wrapped = jest.fn(() =>
                global.canvas.effects.visionSources.some(source => source.active) ||
                global.canvas.effects.lightSources.some(source => source.active)
            );

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(global.canvas.effects.visionSources[0].active).toBe(true);
            expect(global.canvas.effects.lightSources[0].active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility blocks stale vision mask from a pending wall-blocked source', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource],
                    lightSources: [],
                },
            };

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            const wrapped = jest.fn(() => true);

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(wrapped).toHaveBeenCalledTimes(1);
            expect(pendingSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility ignores ambient light when blocking a stale pending vision mask', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource],
                    lightSources: [{ active: true }],
                },
            };

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            const wrapped = jest.fn(() => true);

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(wrapped).toHaveBeenCalledTimes(1);
            expect(pendingSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility ignores blocked pending vision source but keeps other sources available', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            const otherSource = {
                active: true,
                object: {
                    id: 'other-observer',
                    document: {
                        id: 'other-observer',
                        x: 0,
                        y: 150,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource, otherSource],
                },
            };

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            const wrapped = jest.fn(() => pendingSource.active);

            setPendingTokenMovementPosition(
                pendingSource.object.document,
                { x: 0, y: 0 },
                [pendingSource.object],
            );

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(pendingSource.active).toBe(true);
            expect(otherSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility hides Visioner-hidden target from pending observer even when another source sees it', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                    },
                },
            };
            const otherSource = {
                active: true,
                object: {
                    id: 'other-observer',
                    document: {
                        id: 'other-observer',
                        x: 0,
                        y: 150,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
                effects: {
                    visionSources: [pendingSource, otherSource],
                    lightSources: [],
                },
            };

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            const wrapped = jest.fn(() => otherSource.active);

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(wrapped).toHaveBeenCalledTimes(1);
            expect(pendingSource.active).toBe(true);
            expect(otherSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('canvas visibility hides target hidden to pending observer even without blocked sources', () => {
            const originalCanvas = global.canvas;
            const pendingObserver = {
                id: 'observer',
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                },
            };
            const otherSource = {
                active: true,
                object: {
                    id: 'other-observer',
                    document: {
                        id: 'other-observer',
                        x: 0,
                        y: 150,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
                tokens: {
                    get: jest.fn((id) => (id === 'observer' ? pendingObserver : null)),
                    placeables: [pendingObserver],
                    controlled: [pendingObserver],
                },
                effects: {
                    visionSources: [otherSource],
                    lightSources: [],
                },
            };

            const canvasVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility'
            )?.[2];
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            const wrapped = jest.fn(() => otherSource.active);

            setPendingTokenMovementPosition(pendingObserver.document, { x: 0, y: 0 }, [
                pendingObserver,
            ]);

            expect(canvasVisibilityWrapper(wrapped, [{ x: 150, y: 25 }], {
                object: target,
            })).toBe(false);
            expect(wrapped).toHaveBeenCalledTimes(1);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('token refresh forces stale visible token invisible during pending wall-blocked movement', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() =>
                        global.canvas.effects.visionSources.some(source => source.active),
                    ),
                },
            };

            const tokenRefreshVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.placeables.Token.prototype._refreshVisibility'
            )?.[2];
            const target = {
                visible: true,
                renderable: true,
                controlled: false,
                mesh: { visible: true },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            tokenRefreshVisibilityWrapper.call(target, jest.fn(() => {
                target.visible = true;
                target.mesh.visible = true;
            }));

            expect(target.visible).toBe(false);
            expect(target.mesh.visible).toBe(false);
            expect(pendingSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('token refresh blocks stale canvas mask even when source active suppression is ignored', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() => true),
                },
            };

            const tokenRefreshVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.placeables.Token.prototype._refreshVisibility'
            )?.[2];
            const target = {
                visible: true,
                renderable: true,
                controlled: false,
                mesh: { visible: true },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            tokenRefreshVisibilityWrapper.call(target, jest.fn(() => {
                target.visible = true;
                target.mesh.visible = true;
            }));

            expect(target.visible).toBe(false);
            expect(target.mesh.visible).toBe(false);
            expect(global.canvas.visibility.testVisibility).not.toHaveBeenCalled();
            expect(pendingSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('token refresh keeps target visible when another active source can still see it', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                },
            };
            const otherSource = {
                active: true,
                object: {
                    id: 'other-observer',
                    document: {
                        id: 'other-observer',
                        x: 0,
                        y: 150,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
                effects: {
                    visionSources: [pendingSource, otherSource],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() => otherSource.active),
                },
            };

            const tokenRefreshVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.placeables.Token.prototype._refreshVisibility'
            )?.[2];
            const target = {
                visible: true,
                renderable: true,
                controlled: false,
                mesh: { visible: true },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            tokenRefreshVisibilityWrapper.call(target, jest.fn(() => {
                target.visible = true;
                target.mesh.visible = true;
            }));

            expect(target.visible).toBe(true);
            expect(target.mesh.visible).toBe(true);
            expect(pendingSource.active).toBe(true);
            expect(otherSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('token refresh hides Visioner-hidden target from pending observer even when another source sees it', () => {
            const originalCanvas = global.canvas;
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                    },
                },
            };
            const otherSource = {
                active: true,
                object: {
                    id: 'other-observer',
                    document: {
                        id: 'other-observer',
                        x: 0,
                        y: 150,
                        width: 1,
                        height: 1,
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
                effects: {
                    visionSources: [pendingSource, otherSource],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() => otherSource.active),
                },
            };

            const tokenRefreshVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.placeables.Token.prototype._refreshVisibility'
            )?.[2];
            const target = {
                visible: true,
                renderable: true,
                controlled: false,
                mesh: { visible: true },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            tokenRefreshVisibilityWrapper.call(target, jest.fn(() => {
                target.visible = true;
                target.mesh.visible = true;
            }));

            expect(target.visible).toBe(false);
            expect(target.mesh.visible).toBe(false);
            expect(pendingSource.active).toBe(true);
            expect(otherSource.active).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });

        test('token refresh shows Visioner-hidden NPC during pending movement for GM client when Foundry sees it', () => {
            const originalCanvas = global.canvas;
            const originalUser = global.game.user;
            global.game.user = { isGM: true };
            const pendingSource = {
                active: true,
                object: {
                    id: 'observer',
                    document: {
                        id: 'observer',
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                    },
                },
            };
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [],
                },
                effects: {
                    visionSources: [pendingSource],
                    lightSources: [],
                },
                visibility: {
                    testVisibility: jest.fn(() => true),
                },
            };

            const tokenRefreshVisibilityWrapper = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.placeables.Token.prototype._refreshVisibility'
            )?.[2];
            const target = {
                visible: true,
                renderable: true,
                controlled: false,
                actor: { type: 'npc' },
                mesh: { visible: true },
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    getVisibilityTestPoints: jest.fn().mockReturnValue([{ x: 175, y: 25 }]),
                },
            };

            setPendingTokenMovementPosition(pendingSource.object.document, { x: 0, y: 0 }, [
                pendingSource.object,
            ]);

            tokenRefreshVisibilityWrapper.call(target, jest.fn(() => {
                target.visible = true;
                target.mesh.visible = true;
            }));

            expect(target.visible).toBe(true);
            expect(target.mesh.visible).toBe(true);

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
            global.game.user = originalUser;
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

        test('hearing does not reveal a hidden target during pending wall-blocked movement', () => {
            const originalCanvas = global.canvas;
            global.canvas = {
                grid: { size: 50 },
                walls: {
                    placeables: [
                        {
                            document: {
                                id: 'wall',
                                c: [100, 0, 100, 200],
                                sight: 1,
                                door: 0,
                                ds: 0,
                            },
                        },
                    ],
                },
            };

            const wrappedFunction = mockLibWrapper.register.mock.calls.find(
                call => call[1] === 'foundry.canvas.perception.DetectionMode.prototype.testVisibility'
            )?.[2];
            const observer = {
                id: 'observer',
                actor: {},
                document: {
                    id: 'observer',
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    getFlag: jest.fn().mockReturnValue({ target: 'hidden' }),
                },
            };
            const target = {
                id: 'target',
                actor: {},
                document: {
                    id: 'target',
                    x: 150,
                    y: 0,
                    width: 1,
                    height: 1,
                    level: 'level-b',
                    getFlag: jest.fn().mockReturnValue(false),
                },
            };
            const detectionModeInstance = {
                id: 'hearing',
                _canDetect: jest.fn().mockReturnValue(true),
                _testPoint: jest.fn().mockReturnValue(true),
            };

            setPendingTokenMovementPosition(observer.document, { x: 0, y: 0 }, [observer]);

            const result = wrappedFunction.call(
                detectionModeInstance,
                { object: observer },
                { id: 'hearing', enabled: true },
                { ...mockConfig, object: target },
            );

            expect(result).toBe(false);
            expect(detectionModeInstance._testPoint).not.toHaveBeenCalled();

            clearPendingTokenMovementPosition('observer');
            global.canvas = originalCanvas;
        });
    });
});
