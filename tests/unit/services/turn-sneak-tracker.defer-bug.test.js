import '../../setup.js';

describe('TurnSneakTracker - defer bug fix', () => {
    test('specific token deferrals do not affect other tokens in subsequent sneaks', async () => {
        // Lazy import
        const { TurnSneakTracker } = require('../../../scripts/chat/services/turn-sneak-tracker.js');

        const tracker = new TurnSneakTracker();

        // Mock combat state
        global.game = {
            ...global.game,
            combat: {
                round: 1,
                turn: 0,
                combatants: [
                    { id: 'combatant1', tokenId: 'sneaker', token: { id: 'sneaker' } }
                ]
            }
        };

        // Create sneaking token with Sneaky feat
        const sneakingToken = {
            id: 'sneaker',
            name: 'Sneaky Rogue',
            actor: {
                id: 'actor1',
                items: [{
                    type: 'feat',
                    name: 'Sneaky',
                    system: { slug: 'sneaky' }
                }]
            },
            document: {
                getFlag: jest.fn().mockReturnValue({}),
            },
        };

        // Create observer tokens
        const observer1 = {
            id: 'observer1',
            name: 'Observer 1',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        const observer2 = {
            id: 'observer2',
            name: 'Observer 2',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        const observer3 = {
            id: 'observer3',
            name: 'Observer 3',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // FIRST SNEAK: Start turn sneak tracking
        tracker.startTurnSneak(sneakingToken, { action: 'first' });

        // FIRST SNEAK: Defer only observer2
        tracker.recordDeferredCheck(sneakingToken, observer2, {
            position: { x: 100, y: 100 },
            visibility: 'observed',
            coverState: 'none'
        });

        // Verify that only observer2 is marked as deferred after first sneak
        expect(tracker.isObserverDeferred(sneakingToken, observer1)).toBe(false);
        expect(tracker.isObserverDeferred(sneakingToken, observer2)).toBe(true);
        expect(tracker.isObserverDeferred(sneakingToken, observer3)).toBe(false);

        // SECOND SNEAK: Call startTurnSneak again to simulate second sneak action
        tracker.startTurnSneak(sneakingToken, { action: 'second' });

        // SECOND SNEAK: Check defer status again 
        // The bug would cause shouldDeferEndPositionCheck to return true for ALL observers
        // but isObserverDeferred should only return true for specifically deferred ones
        expect(tracker.isObserverDeferred(sneakingToken, observer1)).toBe(false);
        expect(tracker.isObserverDeferred(sneakingToken, observer2)).toBe(true);
        expect(tracker.isObserverDeferred(sneakingToken, observer3)).toBe(false);

        // The key fix: isObserverDeferred should only return true for specifically deferred observers
        // This ensures that in the UI, only the actually deferred tokens show as deferred
    });

    test('isObserverDeferred method correctly identifies specific deferred observers', () => {
        const { TurnSneakTracker } = require('../../../scripts/chat/services/turn-sneak-tracker.js');

        const tracker = new TurnSneakTracker();

        // Mock combat state
        global.game = {
            ...global.game,
            combat: {
                round: 1,
                turn: 0,
                combatants: [
                    { id: 'combatant1', tokenId: 'sneaker', token: { id: 'sneaker' } }
                ]
            }
        };

        // Create sneaking token with Sneaky feat
        const sneakingToken = {
            id: 'sneaker',
            name: 'Sneaky Rogue',
            actor: {
                id: 'actor1',
                items: [{ type: 'feat', name: 'Sneaky', system: { slug: 'sneaky' } }]
            },
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Create observer tokens
        const observer1 = {
            id: 'observer1',
            name: 'Observer 1',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        const observer2 = {
            id: 'observer2',
            name: 'Observer 2',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Start tracking and defer only observer2
        tracker.startTurnSneak(sneakingToken, { action: 'first' });
        tracker.recordDeferredCheck(sneakingToken, observer2, {
            position: { x: 100, y: 100 },
            visibility: 'observed',
            coverState: 'none'
        });

        // Second sneak to trigger consecutive sneak state
        tracker.startTurnSneak(sneakingToken, { action: 'second' });

        // Test that the old method would have returned true for all observers
        const oldMethodWouldReturnTrue1 = tracker.shouldDeferEndPositionCheck(sneakingToken, observer1);
        const oldMethodWouldReturnTrue2 = tracker.shouldDeferEndPositionCheck(sneakingToken, observer2);

        // The old method returns true for all observers when there are consecutive sneaks
        expect(oldMethodWouldReturnTrue1).toBe(true);
        expect(oldMethodWouldReturnTrue2).toBe(true);

        // But the new method correctly identifies only specifically deferred observers
        expect(tracker.isObserverDeferred(sneakingToken, observer1)).toBe(false);
        expect(tracker.isObserverDeferred(sneakingToken, observer2)).toBe(true);

        // This is the key fix: isObserverDeferred is observer-specific, 
        // while shouldDeferEndPositionCheck was global for any consecutive sneaks
    });

    test('defer button appears when GM manually sets end position to not qualifying', () => {
        const { SneakPreviewDialog } = require('../../../scripts/chat/dialogs/sneak-preview-dialog.js');

        // Mock sneaking token with Sneaky feat
        const sneakingToken = {
            id: 'sneaker',
            name: 'Sneaky Rogue',
            actor: {
                id: 'actor1',
                items: [{ type: 'feat', name: 'Sneaky', system: { slug: 'sneaky' } }]
            },
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Mock observer token
        const observerToken = {
            id: 'observer1',
            name: 'Observer 1',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Create outcome with successful sneak but naturally qualifying end position
        const outcome = {
            token: observerToken,
            outcome: 'success', // Sneak succeeded
            positionDisplay: {
                endPosition: {
                    qualifies: true // End position naturally qualifies
                }
            },
            hasPositionData: true
        };

        // Create dialog instance
        const dialog = new SneakPreviewDialog(sneakingToken, [outcome], {}, {});

        // Mock _startPositionQualifiesForSneak to return true (start position qualifies)
        const originalStartPositionQualifies = dialog._startPositionQualifiesForSneak;
        dialog._startPositionQualifiesForSneak = jest.fn().mockReturnValue(true);

        // Initially, defer should not be available (sneak succeeded but end position qualifies)
        dialog._recalculateDeferEligibility(outcome);
        expect(outcome.canDefer).toBe(false);

        // GM manually toggles end position to "not qualifying"
        outcome.positionDisplay.endPosition.qualifies = false;

        // Recalculate defer eligibility
        dialog._recalculateDeferEligibility(outcome);

        // Now defer should be available (start position qualifies AND sneak succeeded AND end position doesn't qualify)
        expect(outcome.canDefer).toBe(true);

        // Restore original method
        dialog._startPositionQualifiesForSneak = originalStartPositionQualifies;
    });

    test('defer eligibility updates correctly when position qualifications change', () => {
        const { SneakPreviewDialog } = require('../../../scripts/chat/dialogs/sneak-preview-dialog.js');

        // Mock sneaking token with Sneaky feat
        const sneakingToken = {
            id: 'sneaker',
            name: 'Sneaky Rogue',
            actor: {
                id: 'actor1',
                items: [{ type: 'feat', name: 'Sneaky', system: { slug: 'sneaky' } }]
            },
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Mock observer token
        const observerToken = {
            id: 'observer1',
            name: 'Observer 1',
            document: { getFlag: jest.fn().mockReturnValue({}) },
        };

        // Create outcome
        const outcome = {
            token: observerToken,
            outcome: 'success',
            positionDisplay: {
                endPosition: {
                    qualifies: true // Initially qualifies
                }
            },
            hasPositionData: true
        };

        // Create dialog instance and mock UI update method
        const dialog = new SneakPreviewDialog(sneakingToken, [outcome], {}, {});
        const updateButtonSpy = jest.spyOn(dialog, '_updateDeferButtonForToken').mockImplementation(() => { });

        // Mock _startPositionQualifiesForSneak to return true
        const originalStartPositionQualifies = dialog._startPositionQualifiesForSneak;
        dialog._startPositionQualifiesForSneak = jest.fn().mockReturnValue(true);

        // Initially defer not available
        dialog._recalculateDeferEligibility(outcome);
        expect(outcome.canDefer).toBe(false);
        expect(updateButtonSpy).toHaveBeenCalledWith('observer1', false);

        // Clear the spy to focus on the next call
        updateButtonSpy.mockClear();

        // Manually change end position to not qualify (simulating GM manual change)
        outcome.positionDisplay.endPosition.qualifies = false;
        dialog._recalculateDeferEligibility(outcome);

        // Defer should now be available
        expect(outcome.canDefer).toBe(true);

        // Verify that UI update was called to show the defer button
        expect(updateButtonSpy).toHaveBeenCalledWith('observer1', true);

        // Restore original method and clean up
        dialog._startPositionQualifiesForSneak = originalStartPositionQualifies;
        updateButtonSpy.mockRestore();
    });
});