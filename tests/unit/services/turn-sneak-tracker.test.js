/**
 * Tests for turn-based sneak tracker (Sneaky and Very Sneaky feats)
 */

import { TurnSneakTracker } from '../../../scripts/chat/services/TurnSneakTracker.js';

describe('TurnSneakTracker', () => {
    let tracker;
    let mockToken;
    let mockObserver;
    let mockCombatant;
    let mockCombat;

    beforeEach(() => {
        // Create a new tracker instance and prevent hook registration
        tracker = new TurnSneakTracker();
        tracker._registeredHooks = true; // Prevent duplicate hook registration
        tracker.cleanup(); // Clear any existing state

        // Mock token with Sneaky feat
        mockToken = {
            id: 'token1',
            name: 'Sneaky Rogue',
            actor: {
                itemTypes: {
                    feat: [{
                        name: 'Sneaky',
                        system: { slug: 'sneaky' }
                    }]
                }
            },
            document: {
                id: 'token1',
                x: 100,
                y: 100,
                elevation: 0
            },
            center: { x: 100, y: 100 }
        };

        // Mock observer token
        mockObserver = {
            id: 'observer1',
            name: 'Guard',
            document: { id: 'observer1' }
        };

        // Mock combatant
        mockCombatant = {
            id: 'combatant1',
            token: { id: 'token1' }
        };

        // Mock global game and combat
        global.game = {
            combat: {
                round: 1,
                turn: 0,
                combatants: {
                    find: jest.fn(() => mockCombatant)
                }
            },
            user: { isGM: true }
        };

        mockCombat = global.game.combat;

        // Mock Hooks - match existing test patterns
        if (!global.Hooks) {
            global.Hooks = {
                on: jest.fn(),
                once: jest.fn(),
                off: jest.fn(),
                call: jest.fn(),
                callAll: jest.fn()
            };
        }

        // Mock console to avoid noise in tests
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        tracker.cleanup();
    });

    describe('feat detection', () => {
        test('detects Sneaky feat by name', () => {
            expect(tracker.hasSneakyFeat(mockToken)).toBe(true);
        });

        test('detects Very Sneaky feat', () => {
            mockToken.actor.itemTypes.feat[0].name = 'Very Sneaky';
            mockToken.actor.itemTypes.feat[0].system.slug = 'very-sneaky';
            expect(tracker.hasSneakyFeat(mockToken)).toBe(true);
        });

        test('does not match similar but different feats', () => {
            mockToken.actor.itemTypes.feat[0].name = 'Very, Very Sneaky';
            mockToken.actor.itemTypes.feat[0].system.slug = 'very-very-sneaky';
            expect(tracker.hasSneakyFeat(mockToken)).toBe(false);
        });

        test('returns false for token without feat', () => {
            mockToken.actor.itemTypes.feat = [];
            expect(tracker.hasSneakyFeat(mockToken)).toBe(false);
        });

        test('handles token without actor', () => {
            mockToken.actor = null;
            expect(tracker.hasSneakyFeat(mockToken)).toBe(false);
        });
    });

    describe('turn tracking', () => {
        test('starts turn sneak tracking for token with feat', () => {
            const actionData = { some: 'data' };
            const result = tracker.startTurnSneak(mockToken, actionData);

            expect(result).toBe(true);
            expect(tracker.getTurnSneakState(mockToken)).toBeTruthy();
        });

        test('does not start tracking for token without feat', () => {
            mockToken.actor.itemTypes.feat = [];
            const actionData = { some: 'data' };
            const result = tracker.startTurnSneak(mockToken, actionData);

            expect(result).toBe(false);
            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('does not start tracking outside combat', () => {
            global.game.combat = null;
            const actionData = { some: 'data' };
            const result = tracker.startTurnSneak(mockToken, actionData);

            expect(result).toBe(false);
        });

        test('records multiple sneak actions in same turn', () => {
            const actionData1 = { action: 1 };
            const actionData2 = { action: 2 };

            tracker.startTurnSneak(mockToken, actionData1);
            tracker.startTurnSneak(mockToken, actionData2);

            const state = tracker.getTurnSneakState(mockToken);
            expect(state.sneakActions).toHaveLength(2);
            expect(state.sneakActions[0].actionData).toEqual(actionData1);
            expect(state.sneakActions[1].actionData).toEqual(actionData2);
        });
    });

    describe('deferred checks', () => {
        test('should defer end position check when tracking active (consecutive sneaks)', () => {
            const actionData1 = { some: 'data1' };
            const actionData2 = { some: 'data2' };

            // First sneak - should NOT defer
            tracker.startTurnSneak(mockToken, actionData1);
            let shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(false);

            // Second sneak - should defer
            tracker.startTurnSneak(mockToken, actionData2);
            shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(true);
        });

        test('should not defer when no tracking active', () => {
            const shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(false);
        });

        test('should not defer for different round/turn', () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Change to different round
            global.game.combat.round = 2;

            const shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(false);
        });

        test('records deferred check data', () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            const positionData = {
                position: { x: 150, y: 150 },
                visibility: 'concealed',
                coverState: 'standard'
            };

            tracker.recordDeferredCheck(mockToken, mockObserver, positionData);

            const state = tracker.getTurnSneakState(mockToken);
            expect(state.deferredChecks.size).toBe(1);
            expect(state.deferredChecks.has('observer1')).toBe(true);

            const checkData = state.deferredChecks.get('observer1');
            expect(checkData.observerToken).toBe(mockObserver);
            expect(checkData.visibility).toBe('concealed');
            expect(checkData.coverState).toBe('standard');
        });
    });

    describe('end position qualification', () => {
        beforeEach(() => {
            // Mock the utility imports
            jest.doMock('../../../scripts/utils.js', () => ({
                getCoverBetween: jest.fn(() => 'standard')
            }));

            jest.doMock('../../../scripts/visibility/auto-visibility/index.js', () => ({
                optimizedVisibilityCalculator: {
                    calculateVisibility: jest.fn(() => Promise.resolve('concealed'))
                }
            }));
        });

        test('position qualifies with sufficient cover', async () => {
            const position = { x: 150, y: 150 };
            const qualifies = await tracker._checkEndPositionQualifies(mockToken, mockObserver, position);
            expect(qualifies).toBe(true);
        });

        test('position qualifies with concealment', async () => {
            // Mock cover as insufficient but visibility as concealed
            const { getCoverBetween } = require('../../../scripts/utils.js');
            getCoverBetween.mockReturnValue('none');

            const position = { x: 150, y: 150 };
            const qualifies = await tracker._checkEndPositionQualifies(mockToken, mockObserver, position);
            expect(qualifies).toBe(true);
        });

        test('position does not qualify without cover or concealment', async () => {
            const { getCoverBetween } = require('../../../scripts/utils.js');
            const { optimizedVisibilityCalculator } = require('../../../scripts/visibility/auto-visibility/index.js');

            getCoverBetween.mockReturnValue('none');
            optimizedVisibilityCalculator.calculateVisibility.mockResolvedValue('observed');

            const position = { x: 150, y: 150 };
            const qualifies = await tracker._checkEndPositionQualifies(mockToken, mockObserver, position);
            expect(qualifies).toBe(false);
        });
    });

    describe('turn end processing', () => {
        beforeEach(() => {
            // Mock visibility services
            jest.doMock('../../../scripts/stores/visibility-map.js', () => ({
                getVisibilityMap: jest.fn(() => ({})),
                setVisibilityMap: jest.fn()
            }));

            jest.doMock('../../../scripts/chat/services/infra/notifications.js', () => ({
                notify: {
                    info: jest.fn()
                }
            }));
        });

        test('processes deferred checks on turn end', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            const positionData = {
                visibility: 'concealed',
                coverState: 'none'
            };
            tracker.recordDeferredCheck(mockToken, mockObserver, positionData);

            // Mock position check to fail
            jest.spyOn(tracker, '_checkEndPositionQualifies').mockResolvedValue(false);
            jest.spyOn(tracker, '_showEndOfTurnDialog').mockResolvedValue();

            await tracker._onTurnEnd(mockCombatant, mockCombat, 'user1');

            expect(tracker._checkEndPositionQualifies).toHaveBeenCalled();
            // Penalties are no longer automatically applied - instead dialog is shown
            expect(tracker._showEndOfTurnDialog).toHaveBeenCalled();
        });

        test('cleans up turn state after processing', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            await tracker._onTurnEnd(mockCombatant, mockCombat, 'user1');

            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('cleans up turn state even without deferred checks', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Don't add any deferred checks - this is the key difference from other tests

            await tracker._onTurnEnd(mockCombatant, mockCombat, 'user1');

            // Verify turn state was cleaned up
            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('handles turn end for non-GM user', async () => {
            global.game.user.isGM = false;

            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            jest.spyOn(tracker, '_processDeferredChecks');

            await tracker._onTurnEnd(mockCombatant, mockCombat, 'differentUser');

            // Should not process since user is not GM and not the actor's user
            expect(tracker._processDeferredChecks).not.toHaveBeenCalled();
        });
    });

    describe('combat update handling', () => {
        test('cleans up stale states on turn change', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Verify state exists
            expect(tracker.getTurnSneakState(mockToken)).toBeTruthy();

            // Simulate turn change
            const updateData = { turn: 1 };
            const newCombat = { round: 1, turn: 1 };

            jest.spyOn(tracker, '_processDeferredChecks').mockResolvedValue();

            await tracker._onCombatUpdate(newCombat, updateData, {}, 'user1');

            // State should be cleaned up
            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('cleans up stale states on round change', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Simulate round change
            const updateData = { round: 2 };
            const newCombat = { round: 2, turn: 0 };

            jest.spyOn(tracker, '_processDeferredChecks').mockResolvedValue();

            await tracker._onCombatUpdate(newCombat, updateData, {}, 'user1');

            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('cleans up turn state on combat update without deferred checks', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Simulate turn change
            const updateData = { turn: 1 };
            const newCombat = { round: 1, turn: 1 };

            // Don't add any deferred checks - this is the key difference

            await tracker._onCombatUpdate(newCombat, updateData, {}, 'user1');

            // Verify turn state was cleaned up
            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('ignores updates that do not change turn or round', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            // Update that doesn't change turn/round
            const updateData = { some: 'other-field' };
            const newCombat = { round: 1, turn: 0 };

            jest.spyOn(tracker, '_processDeferredChecks');

            await tracker._onCombatUpdate(newCombat, updateData, {}, 'user1');

            // State should remain
            expect(tracker.getTurnSneakState(mockToken)).toBeTruthy();
            expect(tracker._processDeferredChecks).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        test('handles missing combatant gracefully', () => {
            global.game.combat.combatants.find.mockReturnValue(null);

            const actionData = { some: 'data' };
            const result = tracker.startTurnSneak(mockToken, actionData);

            expect(result).toBe(false);
        });

        test('handles missing token gracefully', async () => {
            await expect(tracker._onTurnEnd(null, mockCombat, 'user1')).resolves.not.toThrow();
        });

        test('handles errors in position checks gracefully', async () => {
            const actionData = { some: 'data' };
            tracker.startTurnSneak(mockToken, actionData);

            tracker.recordDeferredCheck(mockToken, mockObserver, {});

            jest.spyOn(tracker, '_checkEndPositionQualifies').mockRejectedValue(new Error('Test error'));

            // Should not throw
            await expect(tracker._onTurnEnd(mockCombatant, mockCombat, 'user1')).resolves.not.toThrow();
        });
    });

    describe('integration scenarios', () => {
        test('full workflow: start tracking, defer checks, process at turn end', async () => {
            // Start turn sneak tracking (first sneak)
            const actionData1 = { some: 'data1' };
            const trackingStarted = tracker.startTurnSneak(mockToken, actionData1);
            expect(trackingStarted).toBe(true);

            // First sneak should not defer
            let shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(false);

            // Start second sneak (consecutive)
            const actionData2 = { some: 'data2' };
            tracker.startTurnSneak(mockToken, actionData2);

            // Check that deferral is enabled for consecutive sneak
            shouldDefer = tracker.shouldDeferEndPositionCheck(mockToken, mockObserver);
            expect(shouldDefer).toBe(true);

            // Record deferred check
            const positionData = { visibility: 'concealed', coverState: 'standard' };
            tracker.recordDeferredCheck(mockToken, mockObserver, positionData);

            // Verify deferred check was recorded
            const state = tracker.getTurnSneakState(mockToken);
            expect(state.deferredChecks.size).toBe(1);

            // Mock successful end position check
            jest.spyOn(tracker, '_checkEndPositionQualifies').mockResolvedValue(true);

            // Process turn end
            await tracker._onTurnEnd(mockCombatant, mockCombat, 'user1');

            // Verify position check was called and state was cleaned up
            expect(tracker._checkEndPositionQualifies).toHaveBeenCalled();
            expect(tracker.getTurnSneakState(mockToken)).toBe(null);
        });

        test('multiple consecutive sneaks in one turn', () => {
            const actionData1 = { sneak: 1 };
            const actionData2 = { sneak: 2 };
            const actionData3 = { sneak: 3 };

            // Start multiple sneaks
            tracker.startTurnSneak(mockToken, actionData1);
            tracker.startTurnSneak(mockToken, actionData2);
            tracker.startTurnSneak(mockToken, actionData3);

            const state = tracker.getTurnSneakState(mockToken);
            expect(state.sneakActions).toHaveLength(3);
            expect(state.sneakActions[0].actionData).toEqual(actionData1);
            expect(state.sneakActions[1].actionData).toEqual(actionData2);
            expect(state.sneakActions[2].actionData).toEqual(actionData3);

            // All should defer to same end-of-turn check
            expect(tracker.shouldDeferEndPositionCheck(mockToken, mockObserver)).toBe(true);
        });
    });
});