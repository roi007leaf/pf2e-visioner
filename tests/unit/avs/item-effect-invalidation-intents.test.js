import '../../setup.js';

import {
  effectLightEmitterUpdated,
  effectVisibilityUpdated,
  itemLightEmitterUpdated,
  itemVisibilityUpdated,
  itemVisionEquipmentUpdated,
} from '../../../scripts/visibility/auto-visibility/core/ItemEffectInvalidationIntents.js';

describe('ItemEffectInvalidationIntents', () => {
  const item = { id: 'item-1' };
  const effect = { id: 'effect-1' };
  const actor = { id: 'actor-1' };
  const tokens = [
    { document: { id: 'token-1' } },
    { document: { id: 'token-2' } },
  ];

  test('builds item visibility intents with actor and token metadata', () => {
    expect(itemVisibilityUpdated(item, { action: 'updated', actor, tokens })).toEqual({
      reason: 'item-visibility-updated',
      document: item,
      metadata: {
        action: 'updated',
        actorId: 'actor-1',
        tokenIds: ['token-1', 'token-2'],
        tokens,
      },
    });
  });

  test('builds item light emitter intents with the same metadata shape', () => {
    expect(itemLightEmitterUpdated(item, { action: 'created', actor, tokens })).toEqual({
      reason: 'item-light-emitter-updated',
      document: item,
      metadata: {
        action: 'created',
        actorId: 'actor-1',
        tokenIds: ['token-1', 'token-2'],
        tokens,
      },
    });
  });

  test('builds item vision equipment intents with change data', () => {
    const changes = { system: { equipped: true } };

    expect(itemVisionEquipmentUpdated(item, { actor, tokens, changes })).toEqual({
      reason: 'item-vision-equipment-updated',
      document: item,
      changeData: changes,
      metadata: {
        actorId: 'actor-1',
        tokenIds: ['token-1', 'token-2'],
        tokens,
      },
    });
  });

  test('builds effect visibility intents without carrying token objects', () => {
    expect(effectVisibilityUpdated(effect, { action: 'deleted', actor, tokens })).toEqual({
      reason: 'effect-visibility-updated',
      document: effect,
      metadata: {
        action: 'deleted',
        actorId: 'actor-1',
        tokenIds: ['token-1', 'token-2'],
      },
    });
  });

  test('builds effect light emitter intents without carrying token objects', () => {
    expect(effectLightEmitterUpdated(effect, { action: 'created', actor, tokens })).toEqual({
      reason: 'effect-light-emitter-updated',
      document: effect,
      metadata: {
        action: 'created',
        actorId: 'actor-1',
        tokenIds: ['token-1', 'token-2'],
      },
    });
  });
});
