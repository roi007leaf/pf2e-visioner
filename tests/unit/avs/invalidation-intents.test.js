import '../../setup.js';

import {
  actorVisibilityUpdated,
  ambientLightUpdated,
  effectVisibilityUpdated,
  itemVisibilityUpdated,
  tokenPositionUpdated,
} from '../../../scripts/visibility/auto-visibility/core/InvalidationIntents.js';

describe('InvalidationIntents', () => {
  test('exports the shared event invalidation intent interface', () => {
    const document = { id: 'doc-1' };
    const changes = { x: 10 };
    const actor = { id: 'actor-1' };
    const tokens = [{ document: { id: 'token-1' } }];
    const context = { options: { diff: true }, userId: 'user-1' };

    expect(tokenPositionUpdated(document, changes, context).reason).toBe('token-position-updated');
    expect(ambientLightUpdated(document, changes, context).reason).toBe('ambient-light-updated');
    expect(itemVisibilityUpdated(document, { action: 'updated', actor, tokens }).reason).toBe(
      'item-visibility-updated',
    );
    expect(effectVisibilityUpdated(document, { action: 'updated', actor, tokens }).reason).toBe(
      'effect-visibility-updated',
    );
    expect(actorVisibilityUpdated(actor, changes, { phase: 'update', tokens })).toEqual({
      reason: 'actor-visibility-updated',
      document: actor,
      changeData: changes,
      metadata: {
        phase: 'update',
        tokenIds: ['token-1'],
      },
    });
  });
});
