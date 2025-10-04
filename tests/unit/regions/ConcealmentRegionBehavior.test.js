/**
 * Unit tests for ConcealmentRegionBehavior
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConcealmentRegionBehavior } from '../../../scripts/regions/ConcealmentRegionBehavior.js';
import RegionHelper from '../../../scripts/utils/region.js';

describe('ConcealmentRegionBehavior', () => {
    beforeEach(() => {
        global.foundry = {
            data: {
                regionBehaviors: {
                    RegionBehaviorType: class { }
                }
            }
        };
    });

    describe('_extractRegionBoundarySegments', () => {
        it('should extract segments from points array', () => {
            const region = {
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 100 },
                    { x: 0, y: 100 }
                ]
            };

            const segments = ConcealmentRegionBehavior._extractRegionBoundarySegments(region);

            expect(segments).toHaveLength(4);
            expect(segments[0]).toEqual({
                p1: { x: 0, y: 0 },
                p2: { x: 100, y: 0 }
            });
            expect(segments[3]).toEqual({
                p1: { x: 0, y: 100 },
                p2: { x: 0, y: 0 }
            });
        });

        it('should extract segments from array-based points', () => {
            const region = {
                points: [
                    [0, 0],
                    [100, 0],
                    [100, 100],
                    [0, 100]
                ]
            };

            const segments = ConcealmentRegionBehavior._extractRegionBoundarySegments(region);

            expect(segments).toHaveLength(4);
            expect(segments[0]).toEqual({
                p1: { x: 0, y: 0 },
                p2: { x: 100, y: 0 }
            });
        });

        it('should fallback to bounds-based segments when no points', () => {
            const mockGetBounds = jest.spyOn(RegionHelper, 'getBounds');
            mockGetBounds.mockReturnValue({
                x: 0,
                y: 0,
                width: 100,
                height: 100
            });

            const region = {};

            const segments = ConcealmentRegionBehavior._extractRegionBoundarySegments(region);

            expect(segments).toHaveLength(4);
            expect(segments[0]).toEqual({
                p1: { x: 0, y: 0 },
                p2: { x: 100, y: 0 }
            });

            mockGetBounds.mockRestore();
        });

        it('should handle region with insufficient points', () => {
            const region = {
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 }
                ]
            };

            const segments = ConcealmentRegionBehavior._extractRegionBoundarySegments(region);

            expect(segments.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('checkRayCrossesRegionBoundary', () => {
        it('should return false when region has no concealment behavior', () => {
            const region = {
                document: {
                    behaviors: []
                }
            };

            const result = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(
                region,
                { x: 0, y: 0 },
                { x: 200, y: 200 }
            );

            expect(result).toBe(false);
        });

        it('should return false when concealment behavior is disabled', () => {
            const region = {
                document: {
                    behaviors: [{
                        type: 'pf2e-visioner.Pf2eVisionerConcealment',
                        enabled: false
                    }]
                },
                points: [
                    { x: 50, y: 50 },
                    { x: 150, y: 50 },
                    { x: 150, y: 150 },
                    { x: 50, y: 150 }
                ]
            };

            const result = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(
                region,
                { x: 0, y: 0 },
                { x: 200, y: 200 }
            );

            expect(result).toBe(false);
        });

        it('should return true when ray crosses region boundary', () => {
            const region = {
                document: {
                    behaviors: [{
                        type: 'pf2e-visioner.Pf2eVisionerConcealment',
                        enabled: true
                    }]
                },
                points: [
                    { x: 50, y: 50 },
                    { x: 150, y: 50 },
                    { x: 150, y: 150 },
                    { x: 50, y: 150 }
                ]
            };

            const result = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(
                region,
                { x: 0, y: 0 },
                { x: 200, y: 200 }
            );

            expect(result).toBe(true);
        });

        it('should return false when ray does not cross region boundary', () => {
            const region = {
                document: {
                    behaviors: [{
                        type: 'pf2e-visioner.Pf2eVisionerConcealment',
                        enabled: true
                    }]
                },
                points: [
                    { x: 50, y: 50 },
                    { x: 150, y: 50 },
                    { x: 150, y: 150 },
                    { x: 50, y: 150 }
                ]
            };

            const result = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(
                region,
                { x: 0, y: 0 },
                { x: 40, y: 40 }
            );

            expect(result).toBe(false);
        });

        it('should handle region with both endpoints inside', () => {
            const region = {
                document: {
                    behaviors: [{
                        type: 'pf2e-visioner.Pf2eVisionerConcealment',
                        enabled: true
                    }]
                },
                points: [
                    { x: 0, y: 0 },
                    { x: 200, y: 0 },
                    { x: 200, y: 200 },
                    { x: 0, y: 200 }
                ]
            };

            const result = ConcealmentRegionBehavior.checkRayCrossesRegionBoundary(
                region,
                { x: 50, y: 50 },
                { x: 150, y: 150 }
            );

            expect(result).toBe(false);
        });
    });

    describe('getAllConcealmentRegions', () => {
        it('should return empty array when canvas not available', () => {
            const oldCanvas = global.canvas;
            global.canvas = undefined;

            const regions = ConcealmentRegionBehavior.getAllConcealmentRegions();

            expect(regions).toEqual([]);

            global.canvas = oldCanvas;
        });

        it('should return regions with concealment behaviors', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: [
                        {
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: true
                                }]
                            }
                        },
                        {
                            document: {
                                behaviors: []
                            }
                        },
                        {
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: false
                                }]
                            }
                        }
                    ]
                }
            };

            const regions = ConcealmentRegionBehavior.getAllConcealmentRegions();

            expect(regions).toHaveLength(1);

            global.canvas = oldCanvas;
        });
    });

    describe('doesRayHaveConcealment', () => {
        it('should return false when no regions have concealment', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: []
                }
            };

            const result = ConcealmentRegionBehavior.doesRayHaveConcealment(
                { x: 0, y: 0 },
                { x: 200, y: 200 }
            );

            expect(result).toBe(false);

            global.canvas = oldCanvas;
        });

        it('should return true when ray crosses any concealment region', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: [
                        {
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: true
                                }]
                            },
                            points: [
                                { x: 50, y: 50 },
                                { x: 150, y: 50 },
                                { x: 150, y: 150 },
                                { x: 50, y: 150 }
                            ]
                        }
                    ]
                }
            };

            const result = ConcealmentRegionBehavior.doesRayHaveConcealment(
                { x: 0, y: 0 },
                { x: 200, y: 200 }
            );

            expect(result).toBe(true);

            global.canvas = oldCanvas;
        });

        it('should return false when ray does not cross any concealment regions', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: [
                        {
                            id: 'test-region',
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: true
                                }]
                            },
                            points: [
                                { x: 50, y: 50 },
                                { x: 150, y: 50 },
                                { x: 150, y: 150 },
                                { x: 50, y: 150 }
                            ],
                            testPoint: jest.fn((point, elevation) => {
                                return point.x >= 50 && point.x <= 150 && point.y >= 50 && point.y <= 150;
                            })
                        }
                    ]
                }
            };

            const result = ConcealmentRegionBehavior.doesRayHaveConcealment(
                { x: 0, y: 0, elevation: 0 },
                { x: 40, y: 40, elevation: 0 }
            );

            expect(result).toBe(false);

            global.canvas = oldCanvas;
        });

        it('should return true when both tokens are inside the same concealment region', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: [
                        {
                            id: 'test-region',
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: true
                                }]
                            },
                            points: [
                                { x: 0, y: 0 },
                                { x: 200, y: 0 },
                                { x: 200, y: 200 },
                                { x: 0, y: 200 }
                            ],
                            testPoint: jest.fn((point, elevation) => {
                                return point.x >= 0 && point.x <= 200 && point.y >= 0 && point.y <= 200;
                            })
                        }
                    ]
                }
            };

            const result = ConcealmentRegionBehavior.doesRayHaveConcealment(
                { x: 50, y: 50, elevation: 0 },
                { x: 150, y: 150, elevation: 0 }
            );

            expect(result).toBe(true);

            global.canvas = oldCanvas;
        });

        it('should return false when both tokens are outside the concealment region and ray does not cross', () => {
            const oldCanvas = global.canvas;
            global.canvas = {
                scene: {
                    regions: [
                        {
                            id: 'test-region',
                            document: {
                                behaviors: [{
                                    type: 'pf2e-visioner.Pf2eVisionerConcealment',
                                    enabled: true
                                }]
                            },
                            points: [
                                { x: 50, y: 50 },
                                { x: 100, y: 50 },
                                { x: 100, y: 100 },
                                { x: 50, y: 100 }
                            ],
                            testPoint: jest.fn((point, elevation) => {
                                return point.x >= 50 && point.x <= 100 && point.y >= 50 && point.y <= 100;
                            })
                        }
                    ]
                }
            };

            // Both tokens are outside the region (one above, one to the left), ray doesn't cross
            const result = ConcealmentRegionBehavior.doesRayHaveConcealment(
                { x: 0, y: 0, elevation: 0 },
                { x: 20, y: 20, elevation: 0 }
            );

            expect(result).toBe(false);

            global.canvas = oldCanvas;
        });
    });
});
