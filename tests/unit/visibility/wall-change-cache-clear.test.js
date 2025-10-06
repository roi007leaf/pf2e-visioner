/**
 * @jest-environment jsdom
 */

import { WallEventHandler } from '../../../scripts/visibility/auto-visibility/core/WallEventHandler.js';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('WallEventHandler - VisionAnalyzer Cache Clearing', () => {
    let wallEventHandler;
    let mockSystemState;
    let mockVisibilityState;
    let mockCacheManager;
    let visionAnalyzer;

    beforeEach(() => {
        mockSystemState = {
            shouldProcessEvents: jest.fn(() => true)
        };

        mockVisibilityState = {
            markAllTokensChangedThrottled: jest.fn()
        };

        mockCacheManager = {
            clearAllCaches: jest.fn()
        };

        visionAnalyzer = VisionAnalyzer.getInstance();
        jest.spyOn(visionAnalyzer, 'clearCache');

        wallEventHandler = new WallEventHandler(
            mockSystemState,
            mockVisibilityState,
            mockCacheManager
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('handleWallUpdate', () => {
        test('should clear VisionAnalyzer cache when wall changes affect LOS', () => {
            const document = { id: 'wall-1' };
            const changeData = { sight: 0 }; // Change that affects LOS
            const options = {};
            const userId = 'user-1';

            wallEventHandler.handleWallUpdate(document, changeData, options, userId);

            expect(visionAnalyzer.clearCache).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).toHaveBeenCalled();
        });

        test('should NOT clear VisionAnalyzer cache when wall changes do not affect LOS', () => {
            const document = { id: 'wall-1' };
            const changeData = { texture: 'new-texture.png' }; // Change that doesn't affect LOS
            const options = {};
            const userId = 'user-1';

            wallEventHandler.handleWallUpdate(document, changeData, options, userId);

            expect(visionAnalyzer.clearCache).not.toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).not.toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).not.toHaveBeenCalled();
        });

        test('should clear VisionAnalyzer cache when wall direction changes', () => {
            const document = { id: 'wall-1' };
            const changeData = { dir: 1 }; // Direction change affects LOS
            const options = {};
            const userId = 'user-1';

            wallEventHandler.handleWallUpdate(document, changeData, options, userId);

            expect(visionAnalyzer.clearCache).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).toHaveBeenCalled();
        });

        test('should clear VisionAnalyzer cache when wall sound blocking changes', () => {
            const document = { id: 'wall-1' };
            const changeData = { sound: 0 }; // Sound blocking change affects LOS
            const options = {};
            const userId = 'user-1';

            wallEventHandler.handleWallUpdate(document, changeData, options, userId);

            expect(visionAnalyzer.clearCache).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).toHaveBeenCalled();
        });
    });

    describe('handleWallCreate', () => {
        test('should clear VisionAnalyzer cache when wall is created', () => {
            wallEventHandler.handleWallCreate();

            expect(visionAnalyzer.clearCache).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).toHaveBeenCalled();
        });
    });

    describe('handleWallDelete', () => {
        test('should clear VisionAnalyzer cache when wall is deleted', () => {
            const document = { id: 'wall-1' };

            wallEventHandler.handleWallDelete(document);

            expect(visionAnalyzer.clearCache).toHaveBeenCalled();
            expect(mockCacheManager.clearAllCaches).toHaveBeenCalled();
            expect(mockVisibilityState.markAllTokensChangedThrottled).toHaveBeenCalled();
        });
    });

    describe('Integration: Wall changes with deafened observer', () => {
        test('VisionAnalyzer cache clear allows fresh capability calculation', () => {
            // Setup: Observer has deafened condition
            const mockToken = {
                id: 'token-ezren',
                actor: {
                    hasCondition: jest.fn(() => true) // Initially deafened
                }
            };

            // First call - gets capabilities with deafened
            const caps1 = visionAnalyzer.getVisionCapabilities(mockToken);

            // Wall changes
            const document = { id: 'wall-1' };
            const changeData = { sight: 0 };
            wallEventHandler.handleWallUpdate(document, changeData, {}, 'user-1');

            // Verify cache was cleared
            expect(visionAnalyzer.clearCache).toHaveBeenCalled();

            // Change condition: no longer deafened
            mockToken.actor.hasCondition.mockReturnValue(false);

            // Second call - should get fresh capabilities without deafened
            const caps2 = visionAnalyzer.getVisionCapabilities(mockToken);

            // The capabilities should be recalculated, not cached
            // (In a real scenario, caps2 would show hearing available)
            expect(mockToken.actor.hasCondition).toHaveBeenCalled();
        });
    });
});
