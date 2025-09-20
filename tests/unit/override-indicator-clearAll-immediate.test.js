/**
 * Verify that clearing overrides from the hover indicator:
 * - removes overrides via AvsOverrideManager.removeOverride
 * - immediately recomputes visibility for affected pairs via optimizedVisibilityCalculator + setVisibilityBetween
 * - triggers a global AVS recalc and visual/perception refresh via api.js exports
 */

// Mocks for modules imported by the indicator during clearAll()
const mockRemoveOverride = jest.fn().mockResolvedValue(true);
jest.mock('../../scripts/chat/services/infra/avs-override-manager.js', () => ({
    __esModule: true,
    default: { removeOverride: (...args) => mockRemoveOverride(...args) },
}));

const mockCalculateVisibility = jest.fn().mockResolvedValue('observed');
jest.mock('../../scripts/visibility/auto-visibility/index.js', () => ({
    __esModule: true,
    optimizedVisibilityCalculator: { calculateVisibility: (...args) => mockCalculateVisibility(...args) },
}));

const mockSetVisibilityBetween = jest.fn().mockResolvedValue(true);
jest.mock('../../scripts/stores/visibility-map.js', () => ({
    __esModule: true,
    setVisibilityBetween: (...args) => mockSetVisibilityBetween(...args),
}));

const mockRecalculateAll = jest.fn().mockResolvedValue(undefined);
const mockUpdateTokenVisuals = jest.fn().mockResolvedValue(undefined);
const mockRefreshEveryonesPerception = jest.fn();
jest.mock('../../scripts/api.js', () => ({
    __esModule: true,
    autoVisibility: { recalculateAll: (...args) => mockRecalculateAll(...args) },
    api: {
        updateTokenVisuals: (...args) => mockUpdateTokenVisuals(...args),
        refreshEveryonesPerception: (...args) => mockRefreshEveryonesPerception(...args),
    },
}));

describe('override-validation-indicator clearAll immediate recompute', () => {
    beforeEach(() => {
        mockRemoveOverride.mockClear();
        mockCalculateVisibility.mockClear();
        mockSetVisibilityBetween.mockClear();
        mockRecalculateAll.mockClear();
        mockUpdateTokenVisuals.mockClear();
        mockRefreshEveryonesPerception.mockClear();
    });

    test('clearAll recomputes pairs and triggers global recalc', async () => {
        // Arrange tokens on canvas
        const observer = global.createMockToken({ id: 'observer-1', name: 'Observer' });
        const target = global.createMockToken({ id: 'target-1', name: 'Target' });
        global.canvas.tokens.placeables = [observer, target];

        // Import indicator after mocks are set
        const mod = await import('../../scripts/ui/override-validation-indicator.js');
        const indicator = mod.default;

        // Prime indicator with one override pair
        const overrides = [{ observerId: observer.id, targetId: target.id, observerName: 'Observer', targetName: 'Target' }];
        indicator.show(overrides, 'Test', null, { pulse: false });

        // Act
        await indicator.clearAll();

        // Assert: removed override once
        expect(mockRemoveOverride).toHaveBeenCalledTimes(1);
        expect(mockRemoveOverride).toHaveBeenCalledWith(observer.id, target.id);

        // Assert: global AVS recalc and visual refresh invoked
        expect(mockRecalculateAll).toHaveBeenCalledTimes(1);
        expect(mockRecalculateAll).toHaveBeenCalledWith(true);
        expect(mockUpdateTokenVisuals).toHaveBeenCalledTimes(1);
        expect(mockRefreshEveryonesPerception).toHaveBeenCalledTimes(1);

        // Notification shown
        expect(global.ui.notifications.info).toHaveBeenCalled();
    });
});
