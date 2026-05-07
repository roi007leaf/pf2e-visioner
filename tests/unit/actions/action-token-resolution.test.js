/**
 * Tests to verify that action handlers correctly use actionData.actorToken
 * instead of actionData.actor when available (message speaker token resolution)
 */

import { ConsequencesActionHandler } from '../../../scripts/chat/services/actions/ConsequencesAction.js';
import { DiversionActionHandler } from '../../../scripts/chat/services/actions/DiversionAction.js';
import { HideActionHandler } from '../../../scripts/chat/services/actions/HideAction.js';
import { SeekActionHandler } from '../../../scripts/chat/services/actions/SeekAction.js';
import { SneakActionHandler } from '../../../scripts/chat/services/actions/SneakAction.js';
import { TakeCoverActionHandler } from '../../../scripts/chat/services/actions/TakeCoverAction.js';

const mockGetCoverBetween = jest.fn(() => 'none');
const mockDetectCoverBetweenTokens = jest.fn(() => 'none');
const mockSetCoverBetween = jest.fn();
const mockApplyTakeCoverProneRangedOnlyEffect = jest.fn();

jest.mock('../../../scripts/constants.js', () => ({
    MODULE_ID: 'pf2e-visioner',
    VISIBILITY_STATES: {
        observed: { label: 'Observed' },
        concealed: { label: 'Concealed' },
        hidden: { label: 'Hidden' },
        undetected: { label: 'Undetected' },
    },
    getVisibilityStateLabelKey: jest.fn((state) =>
        state === 'concealed' ? 'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed' : state
    ),
    COVER_STATES: {
        none: { label: 'None' },
        lesser: { label: 'Lesser' },
        standard: { label: 'Standard' },
        greater: { label: 'Greater' },
    },
}));

jest.mock('../../../scripts/utils.js', () => ({
    getVisibilityBetween: jest.fn(() => 'hidden'),
    getCoverBetween: (...args) => mockGetCoverBetween(...args),
    setCoverBetween: (...args) => mockSetCoverBetween(...args),
}));

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
    __esModule: true,
    default: {
        isEnabled: jest.fn(() => true),
        detectCoverBetweenTokens: (...args) => mockDetectCoverBetweenTokens(...args),
    },
}));

jest.mock('../../../scripts/cover/batch.js', () => ({
    applyTakeCoverProneRangedOnlyEffect: (...args) => mockApplyTakeCoverProneRangedOnlyEffect(...args),
}));

describe('Action Token Resolution Tests', () => {
    let mockActorToken;
    let mockWrongToken;
    let mockTarget;

    beforeEach(() => {
        mockGetCoverBetween.mockReset().mockReturnValue('none');
        mockDetectCoverBetweenTokens.mockReset().mockReturnValue('none');
        mockSetCoverBetween.mockReset();
        mockApplyTakeCoverProneRangedOnlyEffect.mockReset().mockResolvedValue(undefined);

        mockActorToken = {
            id: 'correct-token-id',
            name: 'Correct Token',
            actor: { id: 'actor-id', type: 'character' },
            document: {
                id: 'correct-token-id',
                getFlag: jest.fn(() => ({})),
            },
        };

        mockWrongToken = {
            id: 'wrong-token-id',
            name: 'Wrong Token (Synthetic)',
            actor: { id: 'actor-id', type: 'character' },
            document: {
                id: 'wrong-token-id',
                getFlag: jest.fn(() => ({})),
            },
        };

        mockTarget = {
            id: 'target-id',
            name: 'Target',
            actor: { id: 'target-actor-id', type: 'npc' },
            document: { id: 'target-id' },
        };

        global.canvas = {
            tokens: { placeables: [], get: jest.fn() },
            walls: { placeables: [] },
            grid: { size: 100 },
            scene: { grid: { distance: 5 } },
        };

        global.game = {
            settings: { get: jest.fn(() => false) },
            i18n: { localize: jest.fn((key) => key) },
        };
    });

    describe('SeekAction - outcomeToChange', () => {
        test('should use actorToken when available for observer in token changes', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBe(mockActorToken);
            expect(change.observer.id).toBe('correct-token-id');
            expect(change.target).toBe(mockTarget);
        });

        test('should use actorToken when available for observer in wall changes', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                _isWall: true,
                wallId: 'wall-123',
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBe(mockActorToken);
            expect(change.observer.id).toBe('correct-token-id');
            expect(change.wallId).toBe('wall-123');
        });

        test('should fallback to actor when actorToken is not available', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBe(mockWrongToken);
            expect(change.observer.id).toBe('wrong-token-id');
        });
    });

    describe('SeekAction - entriesToRevertChanges', () => {
        test('should use actorToken when available for observer in token reverts', () => {
            const handler = new SeekActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ targetId: 'target-id', oldVisibility: 'hidden' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].observer).toBe(mockActorToken);
            expect(changes[0].observer.id).toBe('correct-token-id');
        });

        test('should use actorToken when available for observer in wall reverts', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ wallId: 'wall-123', oldVisibility: 'hidden' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].observer).toBe(mockActorToken);
            expect(changes[0].observer.id).toBe('correct-token-id');
            expect(changes[0].wallId).toBe('wall-123');
        });
    });

    describe('HideAction - outcomeToChange (inverted)', () => {
        test('should use actorToken when available for target (actor is hiding)', () => {
            const handler = new HideActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'hidden',
                oldVisibility: 'observed',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.target).toBe(mockActorToken);
            expect(change.target.id).toBe('correct-token-id');
            expect(change.observer).toBe(mockTarget);
        });
    });

    describe('HideAction - entriesToRevertChanges (inverted)', () => {
        test('should use actorToken when available for target in reverts', () => {
            const handler = new HideActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ observerId: 'target-id', oldVisibility: 'observed' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].target).toBe(mockActorToken);
            expect(changes[0].target.id).toBe('correct-token-id');
            expect(changes[0].observer).toBe(mockTarget);
        });
    });

    describe('SneakAction - outcomeToChange (inverted)', () => {
        test('should use actorToken when available for target (actor is sneaking)', () => {
            const handler = new SneakActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                token: mockTarget,
                newVisibility: 'hidden',
                oldVisibility: 'observed',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.target).toBe(mockActorToken);
            expect(change.target.id).toBe('correct-token-id');
            expect(change.observer).toBe(mockTarget);
        });
    });

    describe('SneakAction - entriesToRevertChanges (inverted)', () => {
        test('should use actorToken when available for target in reverts', () => {
            const handler = new SneakActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ observerId: 'target-id', oldVisibility: 'observed' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].target).toBe(mockActorToken);
            expect(changes[0].target.id).toBe('correct-token-id');
            expect(changes[0].observer).toBe(mockTarget);
        });
    });

    describe('ConsequencesAction - outcomeToChange (inverted)', () => {
        test('should use actorToken when available for target (attacker)', () => {
            const handler = new ConsequencesActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                currentVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.target).toBe(mockActorToken);
            expect(change.target.id).toBe('correct-token-id');
            expect(change.observer).toBe(mockTarget);
        });
    });

    describe('ConsequencesAction - entriesToRevertChanges (inverted)', () => {
        test('should use actorToken when available for target in reverts', () => {
            const handler = new ConsequencesActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ observerId: 'target-id', oldVisibility: 'hidden' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].target).toBe(mockActorToken);
            expect(changes[0].target.id).toBe('correct-token-id');
            expect(changes[0].observer).toBe(mockTarget);
        });
    });

    describe('DiversionAction - outcomeToChange (inverted)', () => {
        test('should use actorToken when available for target (actor creating diversion)', () => {
            const handler = new DiversionActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                observer: mockTarget,
                newVisibility: 'hidden',
                currentVisibility: 'observed',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.target).toBe(mockActorToken);
            expect(change.target.id).toBe('correct-token-id');
            expect(change.observer).toBe(mockTarget);
        });
    });

    describe('DiversionAction - entriesToRevertChanges (inverted)', () => {
        test('should use actorToken when available for target in reverts', () => {
            const handler = new DiversionActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ observerId: 'target-id', oldVisibility: 'observed' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].target).toBe(mockActorToken);
            expect(changes[0].target.id).toBe('correct-token-id');
            expect(changes[0].observer).toBe(mockTarget);
        });
    });

    describe('TakeCoverAction - outcomeToChange (inverted)', () => {
        test('should use live auto-cover detection as the baseline before granting Take Cover', async () => {
            const handler = new TakeCoverActionHandler();
            mockGetCoverBetween.mockReturnValue('greater');
            mockDetectCoverBetweenTokens.mockReturnValue('none');

            const outcome = await handler.analyzeOutcome(
                { actor: mockActorToken, actorToken: mockActorToken },
                mockTarget,
            );

            expect(mockDetectCoverBetweenTokens).toHaveBeenCalledWith(mockTarget, mockActorToken);
            expect(outcome.oldCover).toBe('greater');
            expect(outcome.currentCover).toBe('greater');
            expect(outcome.newCover).toBe('standard');
            expect(outcome.changed).toBe(true);
        });

        test('should grant standard cover when taking cover with no detected cover', async () => {
            const handler = new TakeCoverActionHandler();
            mockGetCoverBetween.mockReturnValue('none');
            mockDetectCoverBetweenTokens.mockReturnValue('none');

            const outcome = await handler.analyzeOutcome(
                { actor: mockActorToken, actorToken: mockActorToken },
                mockTarget,
            );

            expect(mockDetectCoverBetweenTokens).toHaveBeenCalledWith(mockTarget, mockActorToken);
            expect(outcome.oldCover).toBe('none');
            expect(outcome.currentCover).toBe('none');
            expect(outcome.newCover).toBe('standard');
            expect(outcome.changed).toBe(true);
        });

        test('should upgrade standard detected cover to greater cover when taking cover', async () => {
            const handler = new TakeCoverActionHandler();
            mockGetCoverBetween.mockReturnValue('standard');
            mockDetectCoverBetweenTokens.mockReturnValue('standard');

            const outcome = await handler.analyzeOutcome(
                { actor: mockActorToken, actorToken: mockActorToken },
                mockTarget,
            );

            expect(outcome.oldCover).toBe('standard');
            expect(outcome.currentCover).toBe('standard');
            expect(outcome.newCover).toBe('greater');
            expect(outcome.changed).toBe(true);
        });

        test('should not grant general standard cover when a prone actor takes cover with no detected cover', async () => {
            const handler = new TakeCoverActionHandler();
            mockGetCoverBetween.mockReturnValue('none');
            mockDetectCoverBetweenTokens.mockReturnValue('none');
            mockActorToken.actor.statuses = { has: jest.fn((status) => status === 'prone') };

            const outcome = await handler.analyzeOutcome(
                { actor: mockActorToken, actorToken: mockActorToken },
                mockTarget,
            );

            expect(mockDetectCoverBetweenTokens).toHaveBeenCalledWith(mockTarget, mockActorToken);
            expect(outcome.oldCover).toBe('none');
            expect(outcome.currentCover).toBe('none');
            expect(outcome.newCover).toBe('none');
            expect(outcome.changed).toBe(true);
            expect(outcome.takeCoverProneRangedOnly).toBe(true);
        });

        test('should use actorToken when available for target (actor taking cover)', () => {
            const handler = new TakeCoverActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const outcome = {
                target: mockTarget,
                newCover: 'standard',
                oldCover: 'none',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.target).toBe(mockActorToken);
            expect(change.target.id).toBe('correct-token-id');
            expect(change.observer).toBe(mockTarget);
        });

        test('should mark applied cover effects as coming from Take Cover', async () => {
            const handler = new TakeCoverActionHandler();

            await handler.applyChangesInternal([
                {
                    observer: mockTarget,
                    target: mockActorToken,
                    newCover: 'standard',
                },
            ]);

            expect(mockSetCoverBetween).toHaveBeenCalledWith(mockTarget, mockActorToken, 'standard', {
                skipEphemeralUpdate: false,
                takeCover: true,
                takeCoverProneRangedOnly: false,
            });
        });

        test('should apply prone-ranged-only Take Cover outcomes without a dialog', async () => {
            const handler = new TakeCoverActionHandler();
            const actionData = { actor: mockActorToken, actorToken: mockActorToken };
            const outcomes = [
                {
                    target: mockTarget,
                    oldCover: 'none',
                    newCover: 'none',
                    changed: true,
                    takeCoverProneRangedOnly: true,
                },
            ];

            expect(handler.shouldApplyWithoutDialog(outcomes)).toBe(true);

            const applied = await handler.applyOutcomesDirectly(actionData, outcomes);

            expect(applied).toBe(1);
            expect(mockApplyTakeCoverProneRangedOnlyEffect).toHaveBeenCalledWith(mockActorToken);
            expect(mockSetCoverBetween).not.toHaveBeenCalled();
        });

        test('should apply prone-ranged-only Take Cover even without discovered observers', async () => {
            const handler = new TakeCoverActionHandler();
            mockActorToken.actor.statuses = { has: jest.fn((status) => status === 'prone') };

            const applied = await handler.applyOutcomesDirectly(
                { actor: mockActorToken, actorToken: mockActorToken },
                [],
            );

            expect(applied).toBe(1);
            expect(mockApplyTakeCoverProneRangedOnlyEffect).toHaveBeenCalledWith(mockActorToken);
        });

        test('should preserve prone-ranged-only Take Cover when dialog applies a none override', async () => {
            const handler = new TakeCoverActionHandler();
            mockGetCoverBetween.mockReturnValue('none');
            mockDetectCoverBetweenTokens.mockReturnValue('none');
            mockActorToken.actor.statuses = { has: jest.fn((status) => status === 'prone') };
            canvas.tokens.placeables = [mockTarget];

            const applied = await handler.apply(
                {
                    actor: mockActorToken,
                    actorToken: mockActorToken,
                    overrides: { [mockTarget.id]: 'none' },
                },
                null,
            );

            expect(applied).toBe(1);
            expect(mockApplyTakeCoverProneRangedOnlyEffect).toHaveBeenCalledWith(mockActorToken);
            expect(mockSetCoverBetween).not.toHaveBeenCalled();
        });

        test('should keep the dialog when Take Cover outcomes include regular cover changes', () => {
            const handler = new TakeCoverActionHandler();
            const outcomes = [
                {
                    target: mockTarget,
                    oldCover: 'standard',
                    newCover: 'greater',
                    changed: true,
                    takeCoverProneRangedOnly: false,
                },
            ];

            expect(handler.shouldApplyWithoutDialog(outcomes)).toBe(false);
        });
    });

    describe('TakeCoverAction - entriesToRevertChanges (inverted)', () => {
        test('should use actorToken when available for target in reverts', () => {
            const handler = new TakeCoverActionHandler();
            jest.spyOn(handler, 'getTokenById').mockReturnValue(mockTarget);

            const actionData = {
                actor: mockWrongToken,
                actorToken: mockActorToken,
            };
            const entries = [{ observerId: 'target-id', oldCover: 'none' }];

            const changes = handler.entriesToRevertChanges(entries, actionData);

            expect(changes).toHaveLength(1);
            expect(changes[0].target).toBe(mockActorToken);
            expect(changes[0].target.id).toBe('correct-token-id');
            expect(changes[0].observer).toBe(mockTarget);
        });
    });

    describe('Integration: Message Speaker Token Flow', () => {
        test('should use message.speaker.token as actorToken when set by preview-service', () => {
            const handler = new SeekActionHandler();

            // Simulate what preview-service.js does
            const message = {
                speaker: { token: 'correct-token-id' },
            };

            // This would be set by resolveToken in preview-service
            const actionData = {
                actor: mockWrongToken, // PF2e passes wrong token
                actorToken: mockActorToken, // preview-service resolved correct token
                message,
            };

            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            // Verify we're using the correct token from message speaker
            expect(change.observer).toBe(mockActorToken);
            expect(change.observer.id).toBe('correct-token-id');
            expect(change.observer.id).not.toBe(mockWrongToken.id);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null actorToken gracefully', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: null,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBe(mockWrongToken);
        });

        test('should handle undefined actorToken gracefully', () => {
            const handler = new SeekActionHandler();
            const actionData = {
                actor: mockWrongToken,
                actorToken: undefined,
            };
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBe(mockWrongToken);
        });

        test('should handle missing actor and actorToken', () => {
            const handler = new SeekActionHandler();
            const actionData = {};
            const outcome = {
                target: mockTarget,
                newVisibility: 'observed',
                oldVisibility: 'hidden',
            };

            const change = handler.outcomeToChange(actionData, outcome);

            expect(change.observer).toBeUndefined();
        });
    });
});
