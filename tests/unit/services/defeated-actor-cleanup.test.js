import '../../setup.js';

import {
  cleanupAvsOverridesForDefeatedActor,
  handleDefeatEffectCreated,
  isDefeatEffect,
} from '../../../scripts/services/defeated-actor-cleanup.js';

function makeToken(id, actorId = 'actor-1', flags = {}) {
  return {
    id,
    name: id,
    actor: actorId ? { id: actorId } : null,
    document: {
      id,
      getFlag: jest.fn((moduleId, key) => flags[key]),
      unsetFlag: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('defeated actor cleanup service', () => {
  test('recognizes death-related effects by slug or name', () => {
    expect(isDefeatEffect({ system: { slug: 'unconscious' }, name: 'Condition' })).toBe(true);
    expect(isDefeatEffect({ slug: 'dying', name: 'Condition' })).toBe(true);
    expect(isDefeatEffect({ name: 'Dead-ish condition' })).toBe(true);
    expect(isDefeatEffect({ system: { slug: 'frightened' }, name: 'Frightened' })).toBe(false);
  });

  test('does nothing when the actor has no active scene tokens', async () => {
    const removeAllOverridesInvolving = jest.fn();
    const requestTakeCoverExpirationForToken = jest.fn();
    const perceptionUpdate = jest.fn();

    await cleanupAvsOverridesForDefeatedActor(
      { id: 'missing-actor' },
      {
        getTokens: () => [makeToken('other', 'other-actor')],
        getAllTokens: () => [makeToken('other', 'other-actor')],
        loadAvsOverrideManager: async () => ({ removeAllOverridesInvolving }),
        loadTakeCoverExpirationService: async () => ({ requestTakeCoverExpirationForToken }),
        updatePerception: perceptionUpdate,
      },
    );

    expect(requestTakeCoverExpirationForToken).not.toHaveBeenCalled();
    expect(removeAllOverridesInvolving).not.toHaveBeenCalled();
    expect(perceptionUpdate).not.toHaveBeenCalled();
  });

  test('expires take-cover and removes all AVS overrides involving defeated tokens', async () => {
    const defeatedA = makeToken('defeated-a');
    const defeatedB = makeToken('defeated-b');
    const removeAllOverridesInvolving = jest.fn().mockResolvedValue(undefined);
    const requestTakeCoverExpirationForToken = jest.fn().mockResolvedValue(undefined);
    const perceptionUpdate = jest.fn();

    await cleanupAvsOverridesForDefeatedActor(
      { id: 'actor-1' },
      {
        getTokens: () => [defeatedA, defeatedB],
        getAllTokens: () => [defeatedA, defeatedB],
        loadAvsOverrideManager: async () => ({ removeAllOverridesInvolving }),
        loadTakeCoverExpirationService: async () => ({ requestTakeCoverExpirationForToken }),
        updatePerception: perceptionUpdate,
      },
    );

    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(defeatedA, 'unconscious');
    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(defeatedB, 'unconscious');
    expect(removeAllOverridesInvolving).toHaveBeenCalledWith('defeated-a');
    expect(removeAllOverridesInvolving).toHaveBeenCalledWith('defeated-b');
    expect(perceptionUpdate).toHaveBeenCalledWith({ initializeVision: true, refreshLighting: true });
  });

  test('clears vision-sharing flags that point at defeated tokens', async () => {
    const defeated = makeToken('defeated');
    const observer = makeToken('observer', 'observer-actor', {
      visionMasterTokenId: 'defeated',
    });

    await cleanupAvsOverridesForDefeatedActor(
      { id: 'actor-1' },
      {
        getTokens: () => [defeated],
        getAllTokens: () => [defeated, observer],
        loadAvsOverrideManager: async () => ({
          removeAllOverridesInvolving: jest.fn().mockResolvedValue(undefined),
        }),
        loadTakeCoverExpirationService: async () => ({
          requestTakeCoverExpirationForToken: jest.fn().mockResolvedValue(undefined),
        }),
        updatePerception: jest.fn(),
      },
    );

    expect(observer.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visionMasterTokenId',
    );
    expect(observer.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visionMasterActorUuid',
    );
    expect(observer.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'visionSharingMode');
    expect(observer.document.unsetFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visionSharingSources',
    );
  });

  test('still removes overrides when take-cover expiration fails', async () => {
    const defeated = makeToken('defeated');
    const removeAllOverridesInvolving = jest.fn().mockResolvedValue(undefined);

    await cleanupAvsOverridesForDefeatedActor(
      { id: 'actor-1' },
      {
        getTokens: () => [defeated],
        getAllTokens: () => [defeated],
        loadAvsOverrideManager: async () => ({ removeAllOverridesInvolving }),
        loadTakeCoverExpirationService: async () => ({
          requestTakeCoverExpirationForToken: jest.fn().mockRejectedValue(new Error('boom')),
        }),
        updatePerception: jest.fn(),
      },
    );

    expect(removeAllOverridesInvolving).toHaveBeenCalledWith('defeated');
  });

  test('skips defeat cleanup for non-GM clients', async () => {
    const cleanupAvsOverridesForDefeatedActor = jest.fn();

    const result = await handleDefeatEffectCreated(
      { system: { slug: 'unconscious' }, parent: { id: 'actor-1' } },
      {
        isCurrentUserGm: () => false,
        isAvsEnabled: () => true,
        cleanupAvsOverridesForDefeatedActor,
      },
    );

    expect(result).toEqual({ cleaned: false, reason: 'not-gm' });
    expect(cleanupAvsOverridesForDefeatedActor).not.toHaveBeenCalled();
  });

  test('skips defeat cleanup when AVS is disabled', async () => {
    const cleanupAvsOverridesForDefeatedActor = jest.fn();

    const result = await handleDefeatEffectCreated(
      { system: { slug: 'unconscious' }, parent: { id: 'actor-1' } },
      {
        isCurrentUserGm: () => true,
        isAvsEnabled: () => false,
        cleanupAvsOverridesForDefeatedActor,
      },
    );

    expect(result).toEqual({ cleaned: false, reason: 'avs-disabled' });
    expect(cleanupAvsOverridesForDefeatedActor).not.toHaveBeenCalled();
  });

  test('cleans AVS overrides when a defeat effect is created for an actor', async () => {
    const actor = { id: 'actor-1' };
    const cleanupAvsOverridesForDefeatedActor = jest.fn().mockResolvedValue(undefined);

    const result = await handleDefeatEffectCreated(
      { system: { slug: 'unconscious' }, parent: actor },
      {
        isCurrentUserGm: () => true,
        isAvsEnabled: () => true,
        cleanupAvsOverridesForDefeatedActor,
      },
    );

    expect(result).toEqual({ cleaned: true });
    expect(cleanupAvsOverridesForDefeatedActor).toHaveBeenCalledWith(actor);
  });

  test('skips non-defeat effects even when AVS is enabled', async () => {
    const cleanupAvsOverridesForDefeatedActor = jest.fn();

    const result = await handleDefeatEffectCreated(
      { system: { slug: 'frightened' }, parent: { id: 'actor-1' } },
      {
        isCurrentUserGm: () => true,
        isAvsEnabled: () => true,
        cleanupAvsOverridesForDefeatedActor,
      },
    );

    expect(result).toEqual({ cleaned: false, reason: 'not-defeat-effect' });
    expect(cleanupAvsOverridesForDefeatedActor).not.toHaveBeenCalled();
  });

  test('warns and returns error status when defeat cleanup dispatch fails', async () => {
    const failure = new Error('cleanup failed');
    const warn = jest.fn();

    const result = await handleDefeatEffectCreated(
      { system: { slug: 'dead' }, parent: { id: 'actor-1' } },
      {
        isCurrentUserGm: () => true,
        isAvsEnabled: () => true,
        cleanupAvsOverridesForDefeatedActor: jest.fn().mockRejectedValue(failure),
        warn,
      },
    );

    expect(result).toEqual({ cleaned: false, reason: 'error' });
    expect(warn).toHaveBeenCalledWith('PF2E Visioner | Error handling ActiveEffect creation:', failure);
  });
});
