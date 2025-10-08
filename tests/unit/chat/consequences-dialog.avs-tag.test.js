import { jest } from '@jest/globals';

describe('ConsequencesPreviewDialog - AVS Tag Display', () => {
    let ConsequencesPreviewDialog;
    let mockGame;
    let MODULE_ID;

    beforeEach(async () => {
        MODULE_ID = 'pf2e-visioner';

        mockGame = {
            settings: {
                get: jest.fn((module, key) => {
                    if (module === MODULE_ID && key === 'autoVisibilityEnabled') return true;
                    return false;
                }),
            },
            i18n: {
                localize: (key) => key,
            },
        };
        global.game = mockGame;

        const dialogModule = await import('../../../scripts/chat/dialogs/ConsequencesPreviewDialog.js');
        ConsequencesPreviewDialog = dialogModule.ConsequencesPreviewDialog;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('isOldStateAvsControlled', () => {
        it('should return false when observer has an override on the attacker', () => {
            const observerId = 'observer-123';
            const attackerId = 'attacker-456';

            const mockObserver = {
                id: observerId,
                document: { id: observerId },
            };

            const mockAttacker = {
                id: attackerId,
                document: {
                    id: attackerId,
                    getFlag: jest.fn((moduleId, flagKey) => {
                        if (moduleId === MODULE_ID && flagKey === `avs-override-from-${observerId}`) {
                            return {
                                state: 'hidden',
                                timestamp: Date.now(),
                                observerId,
                                targetId: attackerId,
                            };
                        }
                        return undefined;
                    }),
                },
            };

            const outcome = {
                target: mockObserver,
                currentVisibility: 'hidden',
            };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            const isAvsControlled = dialog.isOldStateAvsControlled(outcome);

            expect(isAvsControlled).toBe(false);
        });

        it('should return true when no override exists (AVS is controlling)', () => {
            const observerId = 'observer-123';
            const attackerId = 'attacker-456';

            const mockObserver = {
                id: observerId,
                document: { id: observerId },
            };

            const mockAttacker = {
                id: attackerId,
                document: {
                    id: attackerId,
                    getFlag: jest.fn(() => undefined),
                },
            };

            const outcome = {
                target: mockObserver,
                currentVisibility: 'hidden',
            };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            const isAvsControlled = dialog.isOldStateAvsControlled(outcome);

            expect(isAvsControlled).toBe(true);
        });

        it('should check the attacker token (not the observer) for the override flag', () => {
            const observerId = 'observer-123';
            const attackerId = 'attacker-456';

            const mockObserver = {
                id: observerId,
                document: {
                    id: observerId,
                    getFlag: jest.fn(() => {
                        throw new Error('Should not check observer token for override');
                    }),
                },
            };

            const mockAttacker = {
                id: attackerId,
                document: {
                    id: attackerId,
                    getFlag: jest.fn(() => undefined),
                },
            };

            const outcome = {
                target: mockObserver,
                currentVisibility: 'hidden',
            };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            dialog.isOldStateAvsControlled(outcome);

            expect(mockAttacker.document.getFlag).toHaveBeenCalledWith(
                MODULE_ID,
                `avs-override-from-${observerId}`,
            );
            expect(mockObserver.document.getFlag).not.toHaveBeenCalled();
        });

        it('should return false when AVS is disabled', () => {
            mockGame.settings.get.mockReturnValue(false);

            const outcome = {
                target: { id: 'observer-123', document: { id: 'observer-123' } },
                currentVisibility: 'hidden',
            };

            const mockAttacker = { id: 'attacker-456', document: { id: 'attacker-456' } };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            const isAvsControlled = dialog.isOldStateAvsControlled(outcome);

            expect(isAvsControlled).toBe(false);
        });
    });

    describe('Manual override with same state', () => {
        it('should allow applying when state matches but old is AVS-controlled', () => {
            const observerId = 'observer-123';
            const attackerId = 'attacker-456';

            const mockObserver = {
                id: observerId,
                document: { id: observerId },
            };

            const mockAttacker = {
                id: attackerId,
                document: {
                    id: attackerId,
                    getFlag: jest.fn(() => undefined),
                },
            };

            const outcome = {
                target: mockObserver,
                currentVisibility: 'hidden',
                overrideState: 'hidden',
            };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            const hasActionableChange = dialog.calculateHasActionableChange(outcome);

            expect(hasActionableChange).toBe(true);
        });

        it('should not allow applying when state matches and there is already a manual override', () => {
            const observerId = 'observer-123';
            const attackerId = 'attacker-456';

            const mockObserver = {
                id: observerId,
                document: { id: observerId },
            };

            const mockAttacker = {
                id: attackerId,
                document: {
                    id: attackerId,
                    getFlag: jest.fn((moduleId, flagKey) => {
                        if (moduleId === MODULE_ID && flagKey === `avs-override-from-${observerId}`) {
                            return { state: 'hidden', timestamp: Date.now() };
                        }
                        return undefined;
                    }),
                },
            };

            const outcome = {
                target: mockObserver,
                currentVisibility: 'hidden',
                overrideState: 'hidden',
            };

            const dialog = new ConsequencesPreviewDialog(
                mockAttacker,
                [outcome],
                [],
                {},
                { actionData: { actor: mockAttacker } },
            );

            const hasActionableChange = dialog.calculateHasActionableChange(outcome);

            expect(hasActionableChange).toBe(false);
        });
    });
});
