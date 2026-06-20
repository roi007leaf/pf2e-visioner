import { applySeekChangesInternal } from '../../../scripts/chat/services/actions/Seek/seek-change-application.js';

describe('seek change application', () => {
  test('groups token changes by observer and applies visibility changes', async () => {
    const observer = { id: 'observer' };
    const target = { id: 'target' };
    const change = { observer, target, newVisibility: 'observed', timedOverride: 3 };
    const applyVisibilityChanges = jest.fn().mockResolvedValue(undefined);

    await applySeekChangesInternal([change], {
      groupChangesByObserver: jest.fn(() => [{ observer, items: [change] }]),
      getApplyDirection: jest.fn(() => 'observer-to-target'),
      applyVisibilityChanges,
    });

    expect(applyVisibilityChanges).toHaveBeenCalledWith(
      observer,
      [{ target, newVisibility: 'observed', timedOverride: 3 }],
      { direction: 'observer-to-target', source: 'seek_action' },
    );
  });

  test('persists wall changes with connected wall ids and refreshes visuals once per observer', async () => {
    const setFlag = jest.fn().mockResolvedValue(undefined);
    const observer = {
      id: 'observer',
      document: {
        getFlag: jest.fn(() => ({ existing: 'hidden' })),
        setFlag,
      },
    };
    const updateWallVisuals = jest.fn().mockResolvedValue(undefined);

    await applySeekChangesInternal(
      [
        { observer, wallId: 'wall-a', newWallState: 'observed' },
        { observer, wallId: 'wall-b', newWallState: 'undetected' },
      ],
      {
        groupChangesByObserver: jest.fn(),
        getApplyDirection: jest.fn(),
        expandWallIdWithConnected: jest.fn((id) => [id, `${id}-linked`]),
        updateWallVisuals,
      },
    );

    expect(setFlag).toHaveBeenCalledWith('pf2e-visioner', 'walls', {
      existing: 'hidden',
      'wall-a': 'observed',
      'wall-a-linked': 'observed',
      'wall-b': 'hidden',
      'wall-b-linked': 'hidden',
    });
    expect(updateWallVisuals).toHaveBeenCalledWith('observer');
  });

  test('routes actor-search prepared changes to prepared actor persistence helpers', async () => {
    const seeker = { _isActorSearchSeeker: true, actor: { id: 'actor' } };
    const target = { id: 'target' };
    const setPreparedActorTokenVisibility = jest.fn().mockResolvedValue(undefined);
    const setPreparedActorWallVisibility = jest.fn().mockResolvedValue(undefined);

    await applySeekChangesInternal(
      [
        { observer: seeker, target, newVisibility: 'hidden' },
        { observer: seeker, wallId: 'wall-a', newWallState: 'observed' },
      ],
      {
        groupChangesByObserver: jest.fn(),
        getApplyDirection: jest.fn(),
        setPreparedActorTokenVisibility,
        setPreparedActorWallVisibility,
      },
    );

    expect(setPreparedActorTokenVisibility).toHaveBeenCalledWith(seeker.actor, target, 'hidden');
    expect(setPreparedActorWallVisibility).toHaveBeenCalledWith(seeker.actor, 'wall-a', 'observed');
  });

  test('falls back to base change application when injected dependency throws', async () => {
    const changes = [{ target: { id: 'target' }, newVisibility: 'observed' }];
    const applyBaseChanges = jest.fn().mockResolvedValue('fallback');

    await expect(
      applySeekChangesInternal(changes, {
        groupChangesByObserver: jest.fn(() => {
          throw new Error('boom');
        }),
        getApplyDirection: jest.fn(),
        applyBaseChanges,
      }),
    ).resolves.toBe('fallback');

    expect(applyBaseChanges).toHaveBeenCalledWith(changes);
  });
});
