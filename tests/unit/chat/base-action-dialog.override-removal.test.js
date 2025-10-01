/**
 * @file base-action-dialog.override-removal.test.js
 * @description Test suite for override removal during revert operations in action dialogs
 */

// Mock dependencies before importing
jest.mock('../../../scripts/chat/services/infra/avs-override-manager.js', () => ({
    __esModule: true,
    default: {
        removeOverride: jest.fn()
    }
}));

jest.mock('../../../scripts/services/visual-effects.js', () => ({
    updateTokenVisuals: jest.fn()
}));

import { BaseActionDialog } from '../../../scripts/chat/dialogs/base-action-dialog.js';

// Mock notify
global.notify = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('BaseActionDialog - Override Removal on Revert', () => {
    let mockApp, mockRemoveOverride, mockUpdateTokenVisuals;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Get mock references
        const AvsOverrideManager = (await import('../../../scripts/chat/services/infra/avs-override-manager.js')).default;
        const visualEffects = await import('../../../scripts/services/visual-effects.js');

        mockRemoveOverride = AvsOverrideManager.removeOverride;
        mockUpdateTokenVisuals = visualEffects.updateTokenVisuals;

        // Reset mock implementations
        mockRemoveOverride.mockResolvedValue(true);
        mockUpdateTokenVisuals.mockResolvedValue(true);

        mockApp = {
            actionData: {
                actor: {
                    document: { id: 'actor-123' },
                    id: 'actor-123'
                }
            },
            outcomes: [],
            updateRowButtonsToReverted: jest.fn(),
            updateChangesCount: jest.fn(),
            updateBulkActionButtons: jest.fn(),
            bulkActionState: 'applied'
        };
    });

    describe('onRevertChange', () => {
        it('should remove override when reverting non-AVS visibility change', async () => {
            const outcome = {
                oldVisibility: 'hidden', // Was set to hidden (non-AVS)
                currentVisibility: 'observed', // Original state
                target: { id: 'target-456' },
                hasActionableChange: true,
                hasRevertableChange: true
            };

            mockApp.outcomes = [outcome];

            const mockTarget = { dataset: { tokenId: 'target-456' } };
            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertChange({}, mockTarget, context);

            // Should have called removeOverride
            expect(mockRemoveOverride).toHaveBeenCalledWith('actor-123', 'target-456');
            expect(mockUpdateTokenVisuals).toHaveBeenCalled();
            expect(outcome.oldVisibility).toBe('observed');
            expect(outcome.overrideState).toBeNull();
            expect(outcome.hasActionableChange).toBe(false);
        });

        it('should not remove override when reverting AVS state', async () => {
            const outcome = {
                oldVisibility: 'avs', // Was set to AVS (no override created)
                currentVisibility: 'observed',
                target: { id: 'target-456' },
                hasActionableChange: true,
                hasRevertableChange: true
            };

            mockApp.outcomes = [outcome];

            const mockTarget = { dataset: { tokenId: 'target-456' } };
            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertChange({}, mockTarget, context);

            // Should NOT have called removeOverride
            expect(mockRemoveOverride).not.toHaveBeenCalled();
            expect(mockUpdateTokenVisuals).not.toHaveBeenCalled();
            expect(outcome.oldVisibility).toBe('observed');
        });

        it('should not remove override when no actual change occurred', async () => {
            const outcome = {
                oldVisibility: 'observed', // Same as current
                currentVisibility: 'observed',
                target: { id: 'target-456' },
                hasActionableChange: false,
                hasRevertableChange: false
            };

            mockApp.outcomes = [outcome];

            const mockTarget = { dataset: { tokenId: 'target-456' } };
            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertChange({}, mockTarget, context);

            // Should not have called removeOverride since no change occurred
            expect(mockRemoveOverride).not.toHaveBeenCalled();
            expect(global.notify.warn).toHaveBeenCalledWith(
                expect.stringContaining('No changes to revert')
            );
        });

        it('should handle missing observer ID gracefully', async () => {
            const outcome = {
                oldVisibility: 'hidden',
                currentVisibility: 'observed',
                target: { id: 'target-456' },
                hasActionableChange: true,
                hasRevertableChange: true
            };

            mockApp.outcomes = [outcome];
            mockApp.actionData = { actor: null }; // No actor

            const mockTarget = { dataset: { tokenId: 'target-456' } };
            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertChange({}, mockTarget, context);

            // Should not have called removeOverride due to missing observer ID
            expect(mockRemoveOverride).not.toHaveBeenCalled();
            expect(outcome.oldVisibility).toBe('observed'); // Still reverted UI state
        });
    });

    describe('onRevertAll', () => {
        it('should remove overrides for all non-AVS visibility changes', async () => {
            const outcomes = [
                {
                    oldVisibility: 'hidden', // Non-AVS
                    currentVisibility: 'observed',
                    target: { id: 'target-1' },
                    hasActionableChange: true
                },
                {
                    oldVisibility: 'concealed', // Non-AVS
                    currentVisibility: 'observed',
                    target: { id: 'target-2' },
                    hasActionableChange: true
                },
                {
                    oldVisibility: 'avs', // AVS - should skip
                    currentVisibility: 'observed',
                    target: { id: 'target-3' },
                    hasActionableChange: true
                }
            ];

            mockApp.outcomes = outcomes;

            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertAll({}, {}, context);

            // Should have called removeOverride for first two outcomes only
            expect(mockRemoveOverride).toHaveBeenCalledTimes(2);
            expect(mockRemoveOverride).toHaveBeenCalledWith('actor-123', 'target-1');
            expect(mockRemoveOverride).toHaveBeenCalledWith('actor-123', 'target-2');
            expect(mockUpdateTokenVisuals).toHaveBeenCalled();

            // All outcomes should be reverted
            outcomes.forEach(outcome => {
                expect(outcome.oldVisibility).toBe(outcome.currentVisibility);
                expect(outcome.overrideState).toBeNull();
                expect(outcome.hasActionableChange).toBe(false);
            });

            expect(global.notify.info).toHaveBeenCalledWith(
                expect.stringContaining('removed 2 overrides')
            );
        });

        it('should handle partial override removal failures gracefully', async () => {
            const outcomes = [
                {
                    oldVisibility: 'hidden',
                    currentVisibility: 'observed',
                    target: { id: 'target-1' },
                    hasActionableChange: true
                },
                {
                    oldVisibility: 'concealed',
                    currentVisibility: 'observed',
                    target: { id: 'target-2' },
                    hasActionableChange: true
                }
            ];

            mockApp.outcomes = outcomes;

            // Mock first call to succeed, second to fail
            mockRemoveOverride
                .mockResolvedValueOnce(true)
                .mockRejectedValueOnce(new Error('Removal failed'));

            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertAll({}, {}, context);

            // Should have attempted both removals
            expect(mockRemoveOverride).toHaveBeenCalledTimes(2);

            // Should still revert UI state for all outcomes
            outcomes.forEach(outcome => {
                expect(outcome.oldVisibility).toBe(outcome.currentVisibility);
                expect(outcome.overrideState).toBeNull();
            });

            expect(global.notify.info).toHaveBeenCalledWith(
                expect.stringContaining('removed 1 overrides')
            );
        });

        it('should warn when no applied changes exist', async () => {
            mockApp.bulkActionState = 'initial'; // Not applied
            mockApp.outcomes = [];

            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertAll({}, {}, context);

            expect(mockRemoveOverride).not.toHaveBeenCalled();
            expect(global.notify.warn).toHaveBeenCalledWith(
                expect.stringContaining('No changes to revert')
            );
        });

        it('should handle outcomes with no changes properly', async () => {
            const outcomes = [
                {
                    oldVisibility: 'observed', // Same as current - no change
                    currentVisibility: 'observed',
                    target: { id: 'target-1' }
                }
            ];

            mockApp.outcomes = outcomes;

            const context = { app: mockApp, actionType: 'Test' };

            await BaseActionDialog.onRevertAll({}, {}, context);

            expect(mockRemoveOverride).not.toHaveBeenCalled();
            expect(global.notify.warn).toHaveBeenCalledWith(
                expect.stringContaining('No applied changes found')
            );
        });
    });
});