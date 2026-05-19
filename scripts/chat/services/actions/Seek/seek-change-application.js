import { MODULE_ID } from '../../../../constants.js';

function splitSeekChanges(changes) {
  const tokenChanges = [];
  const actorPreparedTokenChanges = [];
  const actorPreparedWallChanges = [];
  const wallChangesByObserver = new Map();

  for (const change of changes) {
    if (change?.wallId) {
      if (change?.observer?._isActorSearchSeeker) {
        actorPreparedWallChanges.push(change);
        continue;
      }

      const observerId = change?.observer?.id;
      if (!observerId) continue;
      if (!wallChangesByObserver.has(observerId)) {
        wallChangesByObserver.set(observerId, { observer: change.observer, walls: new Map() });
      }
      wallChangesByObserver.get(observerId).walls.set(change.wallId, change.newWallState);
      continue;
    }

    if (change?.observer?._isActorSearchSeeker) {
      actorPreparedTokenChanges.push(change);
      continue;
    }

    tokenChanges.push(change);
  }

  return {
    tokenChanges,
    actorPreparedTokenChanges,
    actorPreparedWallChanges,
    wallChangesByObserver,
  };
}

async function applyPreparedActorChanges(tokenChanges, wallChanges, deps) {
  if (tokenChanges.length === 0 && wallChanges.length === 0) return;

  const prepared =
    deps.setPreparedActorTokenVisibility && deps.setPreparedActorWallVisibility
      ? deps
      : await import('../../../../services/initial-scene-hidden-setup.js');

  for (const change of tokenChanges) {
    await prepared.setPreparedActorTokenVisibility(
      change.observer?.actor,
      change.target,
      change.overrideState || change.newVisibility,
    );
  }

  for (const change of wallChanges) {
    await prepared.setPreparedActorWallVisibility(
      change.observer?.actor,
      change.wallId,
      change.overrideState || change.newWallState,
    );
  }
}

async function applyTokenChanges(tokenChanges, deps) {
  if (tokenChanges.length === 0) return;

  const applyVisibilityChanges =
    deps.applyVisibilityChanges ||
    (await import('../../infra/shared-utils.js')).applyVisibilityChanges;
  const groups = deps.groupChangesByObserver(tokenChanges);
  const direction = deps.getApplyDirection();

  for (const group of groups) {
    await applyVisibilityChanges(
      group.observer,
      group.items.map((item) => ({
        target: item.target,
        newVisibility: item.newVisibility,
        timedOverride: item.timedOverride,
      })),
      { direction, source: 'seek_action' },
    );
  }
}

function normalizeWallState(state) {
  const effective = typeof state === 'string' ? state : 'observed';
  return effective === 'undetected' || effective === 'hidden' ? 'hidden' : 'observed';
}

async function applyWallChanges(wallChangesByObserver, deps) {
  if (wallChangesByObserver.size === 0) return;

  const expandWallIdWithConnected =
    deps.expandWallIdWithConnected ||
    (await import('../../../../services/Walls/connected-walls.js')).expandWallIdWithConnected;

  let updateWallVisuals = deps.updateWallVisuals;
  if (!updateWallVisuals) {
    try {
      updateWallVisuals = (await import('../../../../services/visual-effects.js')).updateWallVisuals;
    } catch {
      updateWallVisuals = null;
    }
  }

  for (const { observer, walls } of wallChangesByObserver.values()) {
    try {
      const doc = observer?.document;
      if (!doc) continue;
      const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
      const next = { ...current };

      for (const [wallId, state] of walls.entries()) {
        const applied = normalizeWallState(state);
        for (const id of expandWallIdWithConnected(wallId)) {
          next[id] = applied;
        }
      }

      await doc.setFlag?.(MODULE_ID, 'walls', next);

      try {
        await updateWallVisuals?.(observer.id);
      } catch { }
    } catch {
      /* ignore per-observer wall errors */
    }
  }
}

export async function applySeekChangesInternal(changes, deps = {}) {
  try {
    const {
      tokenChanges,
      actorPreparedTokenChanges,
      actorPreparedWallChanges,
      wallChangesByObserver,
    } = splitSeekChanges(changes);

    await applyPreparedActorChanges(actorPreparedTokenChanges, actorPreparedWallChanges, deps);
    await applyTokenChanges(tokenChanges, deps);
    await applyWallChanges(wallChangesByObserver, deps);
  } catch {
    return deps.applyBaseChanges?.(changes);
  }
}
