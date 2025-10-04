/**
 * Integration test: Greater Darkvision feat + Rank 4 darkness
 * 
 * End-to-end test verifying that PCs with Greater Darkvision feat
 * can see through rank 4 magical darkness
 */

import { ConditionManager } from '../../scripts/visibility/auto-visibility/ConditionManager.js';
import { LightingCalculator } from '../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import { calculateVisibilityFromTokens } from '../../scripts/visibility/VisibilityCalculatorAdapter.js';

global.PIXI = {
    Polygon: {
        fromClipperPoints: function (points, options) {
            return {
                points: points.map((p) => [p.X, p.Y]).flat(),
            };
        },
    },
};

function createMockShape() {
    return {
        points: [0, 0, 10, 0, 10, 10, 0, 10],
        clone: function () {
            return createMockShape();
        },
        toClipperPoints: function (options) {
            const clipperPoints = [];
            for (let i = 0; i < this.points.length; i += 2) {
                clipperPoints.push({ X: this.points[i], Y: this.points[i + 1] });
            }
            return clipperPoints;
        },
        intersectClipper: function (clipperPoints) {
            return [clipperPoints];
        },
    };
}

describe('Integration: Greater Darkvision Feat + Rank 4 Darkness', () => {
    let origCanvas;
    let origConfig;
    let lightingCalculator;
    let visionAnalyzer;
    let conditionManager;

    beforeEach(() => {
        VisionAnalyzer.getInstance().clearCache();

        origCanvas = global.canvas;
        origConfig = global.CONFIG;

        // Mock CONST for wall sense types
        global.CONST = {
            WALL_SENSE_TYPES: {
                NONE: 0,
                LIMITED: 10,
                NORMAL: 20,
                PROXIMITY: 30,
                DISTANCE: 40,
            },
        };

        // Mock foundry utilities
        global.foundry = {
            canvas: {
                geometry: {
                    Ray: jest.fn().mockImplementation((a, b) => ({ A: a, B: b })),
                },
            },
            utils: {
                lineLineIntersection: jest.fn(() => null), // No walls intersect by default
            },
        };

        global.canvas = {
            scene: {
                environment: { darknessLevel: 0.1, globalLight: { enabled: false } },
                darkness: 0.1,
                grid: { distance: 5 },
                lights: new Map()
            },
            grid: { size: 100 },
            effects: {
                darknessSources: [
                    {
                        active: true,
                        data: { bright: 20, dim: 40 },
                        x: 500,
                        y: 500,
                        document: {
                            id: 'darkness-source-1',
                            hidden: false,
                            config: { negative: true, bright: 20, dim: 40 },
                            getFlag: (module, flag) => {
                                if (module === 'pf2e-visioner' && flag === 'darknessRank') {
                                    return 4;
                                }
                                return undefined;
                            }
                        },
                        shape: createMockShape(),
                    }
                ],
                lightSources: [],
                getDarknessLevel: () => 0.1,
            },
            lighting: {
                placeables: [
                    {
                        document: {
                            id: 'darkness-source-1',
                            hidden: false,
                            config: { negative: true, bright: 20, dim: 40 },
                            getFlag: (module, flag) => {
                                if (module === 'pf2e-visioner' && flag === 'darknessRank') {
                                    return 4;
                                }
                                return undefined;
                            }
                        },
                        emitsLight: false,
                        x: 500,
                        y: 500,
                        shape: createMockShape(),
                    }
                ],
            },
            tokens: { placeables: [] },
            regions: { placeables: [] },
            visibility: {
                testVisibility: () => true,
            },
            walls: {
                placeables: [], // No physical walls in this test
            },
        };

        canvas.scene.lights.set('darkness-source-1', canvas.lighting.placeables[0].document);

        lightingCalculator = LightingCalculator.getInstance();
        visionAnalyzer = VisionAnalyzer.getInstance();
        conditionManager = ConditionManager.getInstance();
    });

    afterEach(() => {
        global.canvas = origCanvas;
        global.CONFIG = origConfig;
    });

    test('PC with greater darkvision feat can see through rank 4 darkness', async () => {
        const observerActor = {
            type: 'character',
            name: 'PC with Greater Darkvision Feat',
            system: {
                perception: {
                    vision: true,
                    senses: {}
                }
            },
            itemTypes: {
                feat: [{ type: 'feat', system: { slug: 'greater-darkvision' } }]
            },
            items: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
            flags: {}
        };

        const targetActor = {
            type: 'character',
            name: 'Target in Darkness',
            system: { perception: { vision: true, senses: {} } },
            itemTypes: { feat: [] },
            items: [],
            flags: {}
        };

        const observer = {
            actor: observerActor,
            document: {
                id: 'observer-token',
                detectionModes: [],
                getFlag: () => undefined
            },
            center: { x: 100, y: 100 },
            shape: createMockShape(),
            x: 100,
            y: 100
        };

        const target = {
            actor: targetActor,
            document: {
                id: 'target-token',
                getFlag: () => undefined
            },
            center: { x: 500, y: 500 },
            shape: createMockShape(),
            x: 500,
            y: 500
        };

        const caps = visionAnalyzer.getVisionCapabilities(observer);
        expect(caps.hasGreaterDarkvision).toBe(true);

        const result = await calculateVisibilityFromTokens(
            observer,
            target,
            {
                lightingCalculator,
                visionAnalyzer,
                conditionManager,
                lightingRasterService: null
            }
        );

        expect(result.state).toBe('observed');
        expect(result.detection.sense).toBe('greaterDarkvision');
    });

    test('PC without greater darkvision feat is hidden in rank 4 darkness', async () => {
        const observerActor = {
            type: 'character',
            name: 'PC without Greater Darkvision',
            system: {
                perception: {
                    vision: true,
                    senses: {}
                }
            },
            itemTypes: { feat: [] },
            items: [],
            flags: {}
        };

        const targetActor = {
            type: 'character',
            name: 'Target in Darkness',
            system: { perception: { vision: true, senses: {} } },
            itemTypes: { feat: [] },
            items: [],
            flags: {}
        };

        const observer = {
            actor: observerActor,
            document: {
                id: 'observer-token-2',
                detectionModes: [],
                getFlag: () => undefined
            },
            center: { x: 100, y: 100 },
            shape: createMockShape(),
            x: 100,
            y: 100
        };

        const target = {
            actor: targetActor,
            document: {
                id: 'target-token-2',
                getFlag: () => undefined
            },
            center: { x: 500, y: 500 },
            shape: createMockShape(),
            x: 500,
            y: 500
        };

        const result = await calculateVisibilityFromTokens(
            observer,
            target,
            {
                lightingCalculator,
                visionAnalyzer,
                conditionManager,
                lightingRasterService: null
            }
        );

        expect(result.state).toBe('hidden');
    });

    test('PC with regular darkvision feat sees concealed in rank 4 darkness', async () => {
        const observerActor = {
            type: 'character',
            name: 'PC with Regular Darkvision Feat',
            system: {
                perception: {
                    vision: true,
                    senses: {}
                }
            },
            itemTypes: {
                feat: [{ type: 'feat', system: { slug: 'darkvision' } }]
            },
            items: [{ type: 'feat', system: { slug: 'darkvision' } }],
            flags: {}
        };

        const targetActor = {
            type: 'character',
            name: 'Target in Darkness',
            system: { perception: { vision: true, senses: {} } },
            itemTypes: { feat: [] },
            items: [],
            flags: {}
        };

        const observer = {
            actor: observerActor,
            document: {
                id: 'observer-token-3',
                detectionModes: [],
                getFlag: () => undefined
            },
            center: { x: 100, y: 100 },
            shape: createMockShape(),
            x: 100,
            y: 100
        };

        const target = {
            actor: targetActor,
            document: {
                id: 'target-token-3',
                getFlag: () => undefined
            },
            center: { x: 500, y: 500 },
            shape: createMockShape(),
            x: 500,
            y: 500
        };

        const caps = visionAnalyzer.getVisionCapabilities(observer);
        expect(caps.hasDarkvision).toBe(true);
        expect(caps.hasGreaterDarkvision).toBe(false);

        const result = await calculateVisibilityFromTokens(
            observer,
            target,
            {
                lightingCalculator,
                visionAnalyzer,
                conditionManager,
                lightingRasterService: null
            }
        );

        expect(result.state).toBe('concealed');
        expect(result.detection.sense).toBe('darkvision');
    });
});
