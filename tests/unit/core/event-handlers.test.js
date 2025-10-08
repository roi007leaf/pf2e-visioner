/**
 * Comprehensive tests for Event Handler classes in the auto-visibility system
 * Tests all event handlers: ActorEventHandler, EffectEventHandler, ItemEventHandler, 
 * LightingEventHandler, SceneEventHandler, TemplateEventHandler, TokenEventHandler, WallEventHandler
 */

import '../../setup.js';

// Import all event handlers to test
import { ActorEventHandler } from '../../../scripts/visibility/auto-visibility/core/ActorEventHandler.js';
import { EffectEventHandler } from '../../../scripts/visibility/auto-visibility/core/EffectEventHandler.js';
import { ItemEventHandler } from '../../../scripts/visibility/auto-visibility/core/ItemEventHandler.js';
import { LightingEventHandler } from '../../../scripts/visibility/auto-visibility/core/LightingEventHandler.js';
import { SceneEventHandler } from '../../../scripts/visibility/auto-visibility/core/SceneEventHandler.js';
import { TemplateEventHandler } from '../../../scripts/visibility/auto-visibility/core/TemplateEventHandler.js';
import { TokenEventHandler } from '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js';
import { WallEventHandler } from '../../../scripts/visibility/auto-visibility/core/WallEventHandler.js';

// Mock dependencies
const createMockSystemStateProvider = () => {
    // Internal flags to simulate SceneConfig deferral behavior
    let sceneConfigOpen = false;
    let pendingLighting = false;

    return {
        shouldProcessEvents: jest.fn(() => true),
        isEnabled: jest.fn(() => true),
        isGM: jest.fn(() => true),
        debug: jest.fn(),
        getModuleId: jest.fn(() => 'pf2e-visioner'),
        isUpdatingEffects: jest.fn(() => false),
        // New deferral APIs consumed by SceneEventHandler
        setSceneConfigOpen: jest.fn((isOpen) => { sceneConfigOpen = !!isOpen; }),
        isSceneConfigOpen: jest.fn(() => sceneConfigOpen),
        markPendingLightingChange: jest.fn(() => { pendingLighting = true; }),
        consumePendingLightingChange: jest.fn(() => { const had = pendingLighting; pendingLighting = false; return had; }),
    };
};

const createMockVisibilityStateManager = () => ({
    markTokenChangedImmediate: jest.fn(),
    markAllTokensChangedImmediate: jest.fn(),
    markAllTokensChangedThrottled: jest.fn(),
    markTokenChangedWithSpatialOptimization: jest.fn(),
    removeChangedToken: jest.fn(),
    recalculateForTokens: jest.fn(),
});

const createMockExclusionManager = () => ({
    isExcludedToken: jest.fn(() => false),
    filterExcludedTokens: jest.fn((tokens) => tokens),
});

const createMockCacheManager = () => ({
    clearAllCaches: jest.fn(),
});

const createMockSpatialAnalyzer = () => ({
    getTokensInRange: jest.fn(() => []),
    canTokensSeeEachOther: jest.fn(() => true),
    tokenEmitsLight: jest.fn(() => false),
});

const createMockOverrideValidationManager = () => ({
    queueOverrideValidation: jest.fn(),
});

const createMockPositionManager = () => ({
    storeUpdatedTokenDoc: jest.fn(),
    pinPosition: jest.fn(),
    getTokenPosition: jest.fn(() => ({ x: 100, y: 100, elevation: 0 })),
    getPinDurationMs: jest.fn(() => 2000),
});

describe('Event Handler Tests', () => {
    let mockCanvas, mockHooks, originalCanvas, originalHooks;

    beforeEach(() => {
        // Setup mock canvas
        mockCanvas = {
            tokens: {
                placeables: [],
                get: jest.fn(),
            },
            grid: {
                size: 100,
            },
            scene: {
                createEmbeddedDocuments: jest.fn(),
                updateEmbeddedDocuments: jest.fn(),
                deleteEmbeddedDocuments: jest.fn(),
            },
            walls: {
                placeables: [],
                quadtree: {
                    getObjects: jest.fn(() => []),
                },
            },
            app: {
                renderer: {
                    screen: { width: 1920, height: 1080 },
                },
            },
            stage: {
                worldTransform: {
                    applyInverse: jest.fn(() => ({ x: 0, y: 0 })),
                },
            },
        };

        // Setup mock Hooks
        mockHooks = {
            on: jest.fn(),
            off: jest.fn(),
            call: jest.fn(),
        };

        // Setup mock foundry
        global.foundry = {
            utils: {
                hasProperty: jest.fn((obj, path) => {
                    return path.split('.').reduce((current, key) => current && current[key] !== undefined, obj);
                }),
            },
        };

        // Store originals
        originalCanvas = global.canvas;
        originalHooks = global.Hooks;

        // Set mocks
        global.canvas = mockCanvas;
        global.Hooks = mockHooks;
    }); afterEach(() => {
        // Restore originals
        global.canvas = originalCanvas;
        global.Hooks = originalHooks;
        jest.clearAllMocks();
    });

    describe('ActorEventHandler', () => {
        let actorHandler;
        let mockSystemState, mockVisibilityState, mockExclusionManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockExclusionManager = createMockExclusionManager();

            actorHandler = new ActorEventHandler(mockSystemState, mockVisibilityState, mockExclusionManager);
        });

        test('should initialize hooks correctly', () => {
            actorHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('preUpdateActor', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('updateActor', expect.any(Function));
        }); test('should handle actor updates that affect visibility', () => {
            const mockActor = {
                id: 'actor1',
                name: 'Test Actor',
                system: { attributes: { hp: { value: 50, max: 100 } } },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            actorHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateActor')[1];

            updateHandler(mockActor);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });

        test('should skip processing when system state says not to process events', () => {
            mockSystemState.shouldProcessEvents.mockReturnValue(false);

            const mockActor = { id: 'actor1', name: 'Test Actor' };
            const changes = { 'system.attributes.hp.value': 0 };

            actorHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateActor')[1];

            updateHandler(mockActor, changes);

            expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();
        });

        test('should handle preUpdate actor changes', () => {
            const mockActor = { id: 'actor1', name: 'Test Actor' };
            const changes = { system: { conditions: { invisible: true } } };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            actorHandler.initialize();
            const preUpdateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'preUpdateActor')[1];

            preUpdateHandler(mockActor, changes);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });
    });

    describe('EffectEventHandler', () => {
        let effectHandler;
        let mockSystemState, mockVisibilityState, mockExclusionManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockExclusionManager = createMockExclusionManager();

            effectHandler = new EffectEventHandler(mockSystemState, mockVisibilityState, mockExclusionManager);
        });

        test('should initialize hooks correctly', () => {
            effectHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('createActiveEffect', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('updateActiveEffect', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteActiveEffect', expect.any(Function));
        });

        test('should handle visibility-affecting effects', () => {
            const mockEffect = {
                name: 'Invisible',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            effectHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createActiveEffect')[1];

            createHandler(mockEffect);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });

        test('should handle light-emitting effects with global recalculation', () => {
            const mockEffect = {
                name: 'Torch',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            effectHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createActiveEffect')[1];

            createHandler(mockEffect);

            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should ignore non-visibility effects', () => {
            const mockEffect = {
                name: 'Strength Boost',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            effectHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createActiveEffect')[1];

            createHandler(mockEffect);

            expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
        });
    });

    describe('ItemEventHandler', () => {
        let itemHandler;
        let mockSystemState, mockVisibilityState, mockExclusionManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockExclusionManager = createMockExclusionManager();

            itemHandler = new ItemEventHandler(mockSystemState, mockVisibilityState, mockExclusionManager);
        });

        test('should initialize hooks correctly', () => {
            itemHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('createItem', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('updateItem', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteItem', expect.any(Function));
        });

        test('should handle visibility-affecting items', () => {
            jest.useFakeTimers();

            const mockItem = {
                name: 'See Invisibility',
                type: 'spell',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            itemHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createItem')[1];

            createHandler(mockItem);

            // Visibility-affecting items have a 300ms delay
            expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');

            jest.useRealTimers();
        });

        test('should handle equipment changes', () => {
            const mockItem = {
                name: 'Darkvision Goggles',
                type: 'equipment',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };
            const changes = { 'system.equipped': true };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            itemHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateItem')[1];

            updateHandler(mockItem, changes);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });

        test('should handle echolocation effect item', () => {
            jest.useFakeTimers();

            const mockItem = {
                name: 'Effect: Echolocation',
                type: 'effect',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            itemHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createItem')[1];

            createHandler(mockItem);

            // Visibility-affecting items have a 300ms delay
            expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');

            jest.useRealTimers();
        });

        test('should handle special sense effect items (tremorsense, scent, lifesense)', () => {
            const specialSenses = ['Tremorsense', 'Scent', 'Lifesense', 'Blindsight', 'Thoughtsense'];

            specialSenses.forEach((senseName) => {
                jest.useFakeTimers();
                jest.clearAllMocks();

                const mockItem = {
                    name: `Effect: ${senseName}`,
                    type: 'effect',
                    parent: {
                        documentName: 'Actor',
                        id: 'actor1',
                    },
                };

                mockCanvas.tokens.placeables = [
                    { actor: { id: 'actor1' }, document: { id: 'token1' } },
                ];

                itemHandler.initialize();
                const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createItem')[1];

                createHandler(mockItem);

                // Visibility-affecting items have a 300ms delay
                expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

                jest.advanceTimersByTime(300);

                expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');

                jest.useRealTimers();
            });
        });

        test('should handle visibility-affecting feat changes (Petal Step)', () => {
            jest.useFakeTimers();

            const mockFeat = {
                name: 'Petal Step',
                type: 'feat',
                system: { slug: 'petal-step' },
                slug: 'petal-step',
                parent: {
                    documentName: 'Actor',
                    id: 'actor1',
                },
            };

            mockCanvas.tokens.placeables = [
                { actor: { id: 'actor1' }, document: { id: 'token1' } },
            ];

            itemHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createItem')[1];

            createHandler(mockFeat);

            // Visibility-affecting feats have a 300ms delay
            expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

            jest.advanceTimersByTime(300);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');

            jest.useRealTimers();
        });

        test('should handle visibility-affecting feat changes (Ceaseless Shadows, Legendary Sneak)', () => {
            const visibilityFeats = [
                { name: 'Ceaseless Shadows', slug: 'ceaseless-shadows' },
                { name: 'Legendary Sneak', slug: 'legendary-sneak' },
                { name: 'Terrain Stalker', slug: 'terrain-stalker' },
            ];

            visibilityFeats.forEach(({ name, slug }) => {
                jest.useFakeTimers();
                jest.clearAllMocks();

                const mockFeat = {
                    name,
                    type: 'feat',
                    system: { slug },
                    slug,
                    parent: {
                        documentName: 'Actor',
                        id: 'actor1',
                    },
                };

                mockCanvas.tokens.placeables = [
                    { actor: { id: 'actor1' }, document: { id: 'token1' } },
                ];

                itemHandler.initialize();
                const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createItem')[1];

                createHandler(mockFeat);

                // Visibility-affecting feats have a 300ms delay
                expect(mockVisibilityState.markTokenChangedImmediate).not.toHaveBeenCalled();

                jest.advanceTimersByTime(300);

                expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');

                jest.useRealTimers();
            });
        });
    });

    describe('LightingEventHandler', () => {
        let lightingHandler;
        let mockSystemState, mockVisibilityState, mockAvsInstance, mockCacheManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockCacheManager = createMockCacheManager();

            lightingHandler = new LightingEventHandler(mockSystemState, mockVisibilityState, mockCacheManager);
        });

        test('should initialize hooks correctly', () => {
            lightingHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('updateAmbientLight', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('createAmbientLight', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteAmbientLight', expect.any(Function));
        });

        test('should handle light updates that affect visibility', async () => {
            const mockLight = { id: 'light1' };
            const changes = { config: { bright: 20 } };

            // Mock hasProperty to return true for config.bright specifically
            global.foundry.utils.hasProperty.mockImplementation((obj, path) => {
                // Check for the exact path and ensure the property exists
                const keys = path.split('.');
                let current = obj;
                for (const key of keys) {
                    if (current && typeof current === 'object' && key in current) {
                        current = current[key];
                    } else {
                        return false;
                    }
                }
                return true;
            });

            // Ensure shouldProcessEvents returns true
            mockSystemState.shouldProcessEvents.mockReturnValue(true);

            lightingHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateAmbientLight')[1];

            await updateHandler(mockLight, changes, {}, 'user1');

            // Add debugging
            expect(mockSystemState.shouldProcessEvents).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should ignore light updates that do not affect visibility', () => {
            const mockLight = { id: 'light1' };
            const changes = { some: { other: { property: 'value' } } };

            lightingHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateAmbientLight')[1];

            updateHandler(mockLight, changes, {}, 'user1');

            expect(mockCacheManager.clearAllCaches).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();
        });

        test('should always handle light creation', async () => {
            const mockLight = { id: 'light1' };

            lightingHandler.initialize();
            const createHandler = mockHooks.on.mock.calls.find(call => call[0] === 'createAmbientLight')[1];

            await createHandler(mockLight, {}, 'user1');

            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });
    });

    describe('SceneEventHandler', () => {
        let sceneHandler;
        let mockSystemState, mockVisibilityState, mockCacheManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockCacheManager = createMockCacheManager();

            sceneHandler = new SceneEventHandler(mockSystemState, mockVisibilityState, mockCacheManager);
        });

        test('should initialize hooks correctly', () => {
            sceneHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('updateScene', expect.any(Function));
        });

        test('should handle darkness level changes', () => {
            const mockScene = { id: 'scene1', name: 'Test Scene' };
            const changes = { darkness: 0.5 };

            sceneHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateScene')[1];

            updateHandler(mockScene, changes);

            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should handle environment changes', () => {
            const mockScene = { id: 'scene1', name: 'Test Scene' };
            const changes = { environment: { darknessLevel: 0.8 } };

            // Mock hasProperty to return true for environment.darknessLevel specifically
            global.foundry.utils.hasProperty.mockImplementation((obj, path) => {
                if (path === 'environment.darknessLevel' && obj.environment && obj.environment.darknessLevel !== undefined) {
                    return true;
                }
                return false;
            });

            // Ensure shouldProcessEvents returns true
            mockSystemState.shouldProcessEvents.mockReturnValue(true);

            sceneHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateScene')[1];

            updateHandler(mockScene, changes);

            // Add debugging
            expect(mockSystemState.shouldProcessEvents).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should ignore non-visibility scene changes', () => {
            const mockScene = { id: 'scene1', name: 'Test Scene' };
            const changes = { name: 'New Scene Name' };

            sceneHandler.initialize();
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateScene')[1];

            updateHandler(mockScene, changes);

            expect(mockCacheManager.clearAllCaches).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
        });

        test('should defer lighting updates while SceneConfig is open', () => {
            const mockScene = { id: 'scene1', name: 'Test Scene' };
            const changes = { environment: { darknessLevel: 0.4 } };

            sceneHandler.initialize();

            // Find and call renderSceneConfigPF2e handler (PF2e subclass emits this)
            const openHandler = mockHooks.on.mock.calls.find(call => call[0] === 'renderSceneConfigPF2e')[1];
            openHandler();

            // Now simulate an update while config is open
            const updateHandler = mockHooks.on.mock.calls.find(call => call[0] === 'updateScene')[1];
            updateHandler(mockScene, changes, {});

            // No immediate recalculation should occur while open
            expect(mockCacheManager.clearAllCaches).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();

            // Close the config (PF2e-specific hook) and ensure a single flush happens
            const closeHandler = mockHooks.on.mock.calls.find(call => call[0] === 'closeSceneConfigPF2e')[1];
            closeHandler();
        });
    });

    describe('TemplateEventHandler', () => {
        let templateHandler;
        let mockSystemState, mockVisibilityState;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();

            templateHandler = new TemplateEventHandler(mockSystemState, mockVisibilityState);
        });

        test('should initialize hooks correctly', () => {
            templateHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('createMeasuredTemplate', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('updateMeasuredTemplate', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteMeasuredTemplate', expect.any(Function));
        });

        test('should handle light-affecting template creation', () => {
            const mockTemplate = {
                x: 100,
                y: 100,
                distance: 20,
                flags: {
                    pf2e: {
                        item: { name: 'Light' },
                    },
                },
            };

            templateHandler.handleTemplateCreate(mockTemplate);

            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should handle darkness template creation', () => {
            const mockTemplate = {
                x: 100,
                y: 100,
                distance: 20,
                flags: {
                    pf2e: {
                        item: { name: 'Darkness', slug: 'darkness' },
                    },
                },
                getFlag: jest.fn(),
                setFlag: jest.fn(),
            };

            templateHandler.handleTemplateCreate(mockTemplate);

            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
            expect(mockCanvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith('AmbientLight', expect.any(Array));
        });

        test('should ignore non-light templates', () => {
            const mockTemplate = {
                x: 100,
                y: 100,
                distance: 20,
                flags: {
                    pf2e: {
                        item: { name: 'Fireball' },
                    },
                },
            };

            templateHandler.handleTemplateCreate(mockTemplate);

            expect(mockVisibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
        });
    });

    describe('TokenEventHandler', () => {
        let tokenHandler;
        let mockSystemState, mockVisibilityState, mockSpatialAnalyzer;
        let mockExclusionManager, mockOverrideValidationManager, mockPositionManager, mockCacheManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockSpatialAnalyzer = createMockSpatialAnalyzer();
            mockExclusionManager = createMockExclusionManager();
            mockOverrideValidationManager = createMockOverrideValidationManager();
            mockPositionManager = createMockPositionManager();
            mockCacheManager = createMockCacheManager();

            tokenHandler = new TokenEventHandler(
                mockSystemState,
                mockVisibilityState,
                mockSpatialAnalyzer,
                mockExclusionManager,
                mockOverrideValidationManager,
                mockPositionManager,
                mockCacheManager
            );
        });

        test('should initialize hooks correctly', () => {
            tokenHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('updateToken', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('createToken', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteToken', expect.any(Function));
        });

        test('should handle light changes with global recalculation', () => {
            const mockTokenDoc = {
                id: 'token1',
                name: 'Test Token',
                hidden: false,
            };
            const changes = { light: { enabled: true, bright: 20 } };

            tokenHandler.handleTokenUpdate(mockTokenDoc, changes);

            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should handle movementAction changes for tremorsense detection', () => {
            const mockTokenDoc = {
                id: 'token1',
                name: 'Test Token',
                x: 100,
                y: 100,
                width: 1,
                height: 1,
                hidden: false,
            };
            const changes = { movementAction: 'fly' };

            tokenHandler.handleTokenUpdate(mockTokenDoc, changes);

            // Movement action affects tremorsense, should clear caches and trigger recalculation
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });

        test('should handle hidden flag changes', () => {
            const mockTokenDoc = {
                id: 'token1',
                name: 'Test Token',
            };
            const changes = { hidden: true };

            mockCanvas.tokens.placeables = [{ document: { id: 'token1' } }];

            tokenHandler.handleTokenUpdate(mockTokenDoc, changes);

            expect(mockVisibilityState.recalculateForTokens).toHaveBeenCalledWith(['token1']);
        });

        test('should handle token creation', () => {
            const mockTokenDoc = {
                id: 'token1',
                name: 'Test Token',
            };

            mockCanvas.tokens.get = jest.fn(() => ({
                document: { id: 'token1' },
                actor: { id: 'actor1' },
            }));

            tokenHandler.handleTokenCreate(mockTokenDoc);

            expect(mockVisibilityState.markTokenChangedImmediate).toHaveBeenCalledWith('token1');
        });

        test('should handle token deletion', () => {
            const mockTokenDoc = {
                id: 'token1',
                name: 'Test Token',
            };

            tokenHandler.handleTokenDelete(mockTokenDoc);

            expect(mockVisibilityState.removeChangedToken).toHaveBeenCalledWith('token1');
        });
    });

    describe('WallEventHandler', () => {
        let wallHandler;
        let mockSystemState, mockVisibilityState, mockCacheManager;

        beforeEach(() => {
            mockSystemState = createMockSystemStateProvider();
            mockVisibilityState = createMockVisibilityStateManager();
            mockCacheManager = createMockCacheManager();

            wallHandler = new WallEventHandler(mockSystemState, mockVisibilityState, mockCacheManager);
        });

        test('should initialize hooks correctly', () => {
            wallHandler.initialize();

            expect(mockHooks.on).toHaveBeenCalledWith('updateWall', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('createWall', expect.any(Function));
            expect(mockHooks.on).toHaveBeenCalledWith('deleteWall', expect.any(Function));
        });

        test('should handle wall updates that affect line of sight', () => {
            const mockWall = { id: 'wall1' };
            const changes = { c: [0, 0, 100, 100] }; // coordinates change

            wallHandler.handleWallUpdate(mockWall, changes);

            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should ignore wall updates that do not affect line of sight', () => {
            const mockWall = { id: 'wall1' };
            const changes = { 'some.other.property': 'value' };

            wallHandler.handleWallUpdate(mockWall, changes);

            expect(mockCacheManager.clearAllCaches).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).not.toHaveBeenCalled();
        });

        test('should always handle wall creation', () => {
            const mockWall = { id: 'wall1' };

            wallHandler.handleWallCreate(mockWall);

            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });

        test('should always handle wall deletion', () => {
            const mockWall = { id: 'wall1' };

            wallHandler.handleWallDelete(mockWall);

            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedImmediate).toHaveBeenCalled();
        });
    });
});