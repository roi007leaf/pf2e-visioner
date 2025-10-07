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

jest.mock('../../../scripts/constants.js', () => ({
    MODULE_ID: 'pf2e-visioner',
    VISIBILITY_STATES: {
        observed: { label: 'Observed' },
        concealed: { label: 'Concealed' },
        hidden: { label: 'Hidden' },
        undetected: { label: 'Undetected' },
    },
}));

jest.mock('../../../scripts/utils.js', () => ({
    getVisibilityBetween: jest.fn(() => 'hidden'),
    setCoverBetween: jest.fn(),
}));

describe('Action Token Resolution Tests', () => {
    let mockActorToken;
    let mockWrongToken;
    let mockTarget;

    beforeEach(() => {
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
