/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

const MODULE_ID = 'pf2e-visioner';

describe('Sneak Movement Blocking (preUpdateToken hook)', () => {
    let mockTokenDoc;
    let mockActor;
    let mockGame;
    let preUpdateHook;

    beforeEach(() => {
        // Mock token document with waiting sneak flag
        mockActor = {
            itemTypes: {
                effect: []
            }
        };

        mockTokenDoc = {
            id: 'token-1',
            x: 100,
            y: 100,
            actor: mockActor,
            getFlag: jest.fn((namespace, flag) => {
                if (namespace === MODULE_ID && flag === 'waitingSneak') {
                    return true;
                }
                return undefined;
            })
        };

        // Mock game object with users
        mockGame = {
            users: {
                get: jest.fn((userId) => {
                    if (userId === 'gm-user-id') {
                        return { isGM: true };
                    }
                    return { isGM: false };
                })
            }
        };

        global.game = mockGame;
        global.ui = {
            notifications: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            }
        };

        // Simulate the preUpdateToken hook function (synchronous version)
        preUpdateHook = (tokenDoc, changes, options, userId) => {
            try {
                // Only care about positional movement
                if (!('x' in changes || 'y' in changes)) return;

                // Prevent movement while awaiting Start Sneak confirmation (MUST BE SYNCHRONOUS)
                // Allow GMs to always move
                if (!game.users?.get(userId)?.isGM) {
                    const actor = tokenDoc?.actor;
                    if (actor) {
                        // Determine waiting state either via our custom token flag or effect slug.
                        const hasWaitingFlag = tokenDoc.getFlag?.(MODULE_ID, 'waitingSneak');
                        let waitingEffect = null;
                        // Only search effects if we don't already have the flag (cheap boolean first)
                        if (!hasWaitingFlag) {
                            waitingEffect = actor.itemTypes?.effect?.find?.(
                                (e) => e?.system?.slug === 'waiting-for-sneak-start',
                            );
                        }
                        if (hasWaitingFlag || waitingEffect) {
                            // Block movement for non-GM users
                            ui.notifications?.warn?.('You cannot move until Sneak has started.');
                            return false; // Cancel update
                        }
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | preUpdateToken hook failed:', e);
            }
        };
    });

    test('blocks movement for player with waitingSneak flag', () => {
        const changes = { x: 150, y: 150 };
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'player-user-id');

        expect(result).toBe(false);
        expect(global.ui.notifications.warn).toHaveBeenCalledWith('You cannot move until Sneak has started.');
    });

    test('allows movement for GM user even with waitingSneak flag', () => {
        const changes = { x: 150, y: 150 };
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'gm-user-id');

        expect(result).toBeUndefined(); // GM bypasses check, no false returned
        expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });

    test('blocks movement when waiting-for-sneak-start effect exists', () => {
        // Remove flag, add effect instead
        mockTokenDoc.getFlag = jest.fn(() => undefined);
        mockActor.itemTypes.effect.push({
            system: { slug: 'waiting-for-sneak-start' }
        });

        const changes = { x: 150, y: 150 };
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'player-user-id');

        expect(result).toBe(false);
        expect(global.ui.notifications.warn).toHaveBeenCalledWith('You cannot move until Sneak has started.');
    });

    test('allows movement when no waiting flag or effect', () => {
        // Remove flag
        mockTokenDoc.getFlag = jest.fn(() => undefined);
        mockActor.itemTypes.effect = [];

        const changes = { x: 150, y: 150 };
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'player-user-id');

        expect(result).toBeUndefined();
        expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });

    test('ignores non-movement updates', () => {
        const changes = { rotation: 90 };
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'player-user-id');

        expect(result).toBeUndefined();
        expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });

    test('hook is synchronous and returns false immediately', () => {
        const changes = { x: 150, y: 150 };

        // Call the hook and verify it returns synchronously
        const result = preUpdateHook(mockTokenDoc, changes, {}, 'player-user-id');

        // Verify result is boolean false, not a Promise
        expect(result).toBe(false);
        expect(result).not.toBeInstanceOf(Promise);
        expect(typeof result).toBe('boolean');
    });
});
