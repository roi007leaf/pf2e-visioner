import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';

function findOutcome(app, tokenId, wallId) {
  if (wallId) return app.outcomes.find((o) => o._isWall && o.wallId === wallId);
  return app.outcomes.find((o) => o.token?.id === tokenId || o.target?.id === tokenId);
}

function getActorId(app) {
  return app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
}

function getOutcomeTargetId(outcome, fallbackId) {
  return outcome.target?.id || outcome.token?.id || fallbackId;
}

function getDirectedPair(app, targetId) {
  const actorId = getActorId(app);
  if (!actorId || !targetId) return null;
  const direction = app.getApplyDirection?.() || 'observer_to_target';
  return {
    observerId: direction === 'observer_to_target' ? actorId : targetId,
    overrideTargetId: direction === 'observer_to_target' ? targetId : actorId,
  };
}

async function removeOverrideForTarget(app, targetId, { checkExisting = false } = {}) {
  const pair = getDirectedPair(app, targetId);
  if (!pair) return false;

  const { default: AvsOverrideManager } = await import(
    '../../services/infra/AvsOverrideManager.js'
  );
  if (checkExisting) {
    const hasOverride = await AvsOverrideManager.getOverride(pair.observerId, pair.overrideTargetId);
    if (!hasOverride) return false;
  }

  await AvsOverrideManager.removeOverride(pair.observerId, pair.overrideTargetId);
  return true;
}

async function refreshTokenVisuals() {
  const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
  await updateTokenVisuals();
}

function buildActionData(app, overrides = null) {
  return {
    ...app.actionData,
    ignoreAllies: app.ignoreAllies,
    encounterOnly: app.encounterOnly,
    ...(overrides ? { overrides } : {}),
  };
}

function markOutcomeApplied(outcome, state) {
  outcome.oldVisibility = state;
  outcome.overrideState = null;
  outcome.hasActionableChange = false;
  outcome.hasRevertableChange = false;
}

function markOutcomeReverted(outcome) {
  outcome.oldVisibility = outcome.currentVisibility;
  outcome.overrideState = null;
  outcome.hasActionableChange = false;
  outcome.hasRevertableChange = false;
}

async function clearSneakActiveFlag(app, actionType) {
  if (actionType === 'Sneak' && app.sneakingToken) await app._clearSneakActiveFlag();
}

export async function applyBaseActionChange(event, target, context) {
  const { app, applyFunction, actionType } = context;
  if (!app) {
    console.error(`[${actionType} Dialog] Could not find application instance`);
    return;
  }

  const tokenId = target.dataset.tokenId;
  const wallId = target.dataset.wallId;
  const outcome = findOutcome(app, tokenId, wallId);

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: No outcome found for this ${wallId ? 'wall' : 'token'}`);
    return;
  }

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  if (effectiveNewState === 'avs') {
    try {
      const targetId = getOutcomeTargetId(outcome, tokenId);
      const removed = await removeOverrideForTarget(app, targetId);
      if (removed) {
        await refreshTokenVisuals();
        const targetName = outcome.target?.name || outcome.token?.name || 'token';
        notify.info(`${MODULE_TITLE}: Accepted AVS change for ${targetName}`);
      }
    } catch (e) {
      console.warn('Failed to remove AVS override:', e);
    }
    app.updateRowButtonsToApplied([{ target: { id: tokenId } }]);
    app.updateChangesCount();
    return;
  }

  const isOldStateAvsControlled =
    typeof app.isOldStateAvsControlled === 'function'
      ? app.isOldStateAvsControlled(outcome)
      : false;
  const statesMatch = effectiveNewState === outcome.oldVisibility;
  const hasChange =
    effectiveNewState !== outcome.oldVisibility || (statesMatch && isOldStateAvsControlled);

  if (!hasChange) {
    notify.warn(`${MODULE_TITLE}: No changes to apply for this ${wallId ? 'wall' : 'token'}`);
    return;
  }

  try {
    if (outcome._isWall && outcome.wallId) {
      const overrides = { __wall__: { [outcome.wallId]: effectiveNewState } };
      await applyFunction(buildActionData(app, overrides), target);
      app.updateRowButtonsToApplied([{ wallId: outcome.wallId }]);
    } else {
      const rowTimerConfig = app.rowTimers?.get(tokenId);
      let timedOverride = null;
      if (rowTimerConfig) {
        const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
        timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
      }

      await applyFunction(
        buildActionData(app, { [tokenId]: { state: effectiveNewState, timedOverride } }),
        target,
      );

      markOutcomeApplied(outcome, effectiveNewState);
      if (rowTimerConfig) {
        app.rowTimers.delete(tokenId);
        app._updateRowTimerButton?.(tokenId);
      }
      app._updateOutcomeDisplayForToken?.(tokenId, outcome);
      app.updateRowButtonsToApplied?.([{ target: { id: tokenId } }]);
    }

    await clearSneakActiveFlag(app, actionType);
    app.updateChangesCount?.();
  } catch (error) {
    console.error(`[${actionType} Dialog] Error applying change:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply change - see console for details`);
  }
}

export async function applyBaseActionTimedChange(event, target, context) {
  const { app, actionType } = context;
  if (!app) {
    console.error(`[${actionType} Dialog] Could not find application instance`);
    return;
  }

  const tokenId = target.dataset.tokenId;
  if (!tokenId) {
    notify.warn(`${MODULE_TITLE}: No token found for timed apply`);
    return;
  }

  const outcome = app.outcomes?.find?.(
    (o) => o.token?.id === tokenId || o.target?.id === tokenId,
  );
  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: No outcome found for this token`);
    return;
  }

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  if (!effectiveNewState || effectiveNewState === 'avs') {
    notify.warn(`${MODULE_TITLE}: Cannot apply timed override for AVS state`);
    return;
  }

  const observer = app.actionData?.actor;
  const targetToken = outcome.target || outcome.token;
  if (!observer || !targetToken) {
    notify.warn(`${MODULE_TITLE}: Missing observer or target`);
    return;
  }

  try {
    const { TimerDurationDialog } = await import('../../../ui/TimerDurationDialog.js');
    const timerConfig = await TimerDurationDialog.prompt();
    if (!timerConfig) return;

    const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
    const success = await TimedOverrideManager.createTimedOverride(
      observer,
      targetToken,
      effectiveNewState,
      timerConfig,
      { source: `${actionType.toLowerCase()}_action` },
    );

    if (success) {
      markOutcomeApplied(outcome, effectiveNewState);
      app.updateRowButtonsToApplied?.([{ target: { id: tokenId } }]);
      app.updateChangesCount?.();
      notify.info(
        `${MODULE_TITLE}: Applied timed visibility override for ${targetToken.name || 'token'}`,
      );
    }
  } catch (error) {
    console.error(`[${actionType} Dialog] Error applying timed change:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply timed change - see console for details`);
  }
}

export async function revertBaseActionChange(event, target, context) {
  const { app, actionType } = context;
  if (!app) {
    console.error(`[${actionType} Dialog] Could not find application instance`);
    return;
  }

  const tokenId = target.dataset.tokenId;
  const wallId = target.dataset.wallId;
  const outcome = findOutcome(app, tokenId, wallId);

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: No outcome found for this ${wallId ? 'wall' : 'token'}`);
    return;
  }

  if (outcome.oldVisibility === outcome.newVisibility) {
    notify.warn(`${MODULE_TITLE}: No changes to revert for this ${wallId ? 'wall' : 'token'}`);
    return;
  }

  try {
    if (!wallId) {
      try {
        const targetId = getOutcomeTargetId(outcome, tokenId);
        const removed = await removeOverrideForTarget(app, targetId, { checkExisting: true });
        if (removed) await refreshTokenVisuals();
      } catch (e) {
        console.warn('Failed to remove AVS override during revert:', e);
      }
    }

    markOutcomeReverted(outcome);
    app._updateOutcomeDisplayForToken?.(tokenId, outcome);
    app.updateRowButtonsToReverted?.([outcome]);
    app.updateChangesCount?.();
  } catch (error) {
    console.error(`[${actionType} Dialog] Error reverting change:`, error);
    notify.error(`${MODULE_TITLE}: Failed to revert change - see console for details`);
  }
}

async function getSourceOutcomes(app) {
  try {
    if (typeof app.getFilteredOutcomes === 'function') return await app.getFilteredOutcomes();
    return Array.isArray(app.outcomes) ? app.outcomes : [];
  } catch {
    return Array.isArray(app.outcomes) ? app.outcomes : [];
  }
}

async function getTimedOverrideManager(app) {
  if (!(app.rowTimers?.size > 0)) return null;
  try {
    const module = await import('../../../services/TimedOverrideManager.js');
    return module.TimedOverrideManager;
  } catch (e) {
    console.error('PF2E Visioner | Failed to import TimedOverrideManager:', e);
    return null;
  }
}

export async function applyAllBaseActionChanges(event, target, context) {
  const { app, applyFunction, actionType } = context;
  if (!app) {
    console.error(`[${actionType} Dialog] Could not find application instance`);
    return;
  }

  if (app.bulkActionState === 'applied') {
    notify.warn(
      `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
    );
    return;
  }

  const sourceOutcomes = await getSourceOutcomes(app);
  const outcomesWithChanges = sourceOutcomes.filter((o) => o.hasActionableChange);

  if (outcomesWithChanges.length === 0) {
    notify.warn(`${MODULE_TITLE}: No changes to apply`);
    return;
  }

  try {
    const overrides = {};
    const avsRemovals = [];
    const TimedOverrideManager = await getTimedOverrideManager(app);

    for (const outcome of outcomesWithChanges) {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const tokenId = outcome.token?.id || outcome.target?.id;
      if (!tokenId) continue;

      if (effectiveNewState === 'avs') {
        const tokenName = outcome.token?.name || outcome.target?.name || 'token';
        avsRemovals.push({ id: tokenId, name: tokenName });
        continue;
      }

      const rowTimerConfig = app.rowTimers?.get(tokenId);
      if (rowTimerConfig && TimedOverrideManager) {
        try {
          const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
          overrides[tokenId] = { state: effectiveNewState, timedOverride };
        } catch (e) {
          console.error('PF2E Visioner | Apply All: Failed to build timer:', e);
          overrides[tokenId] = effectiveNewState;
        }
      } else {
        overrides[tokenId] = effectiveNewState;
      }
    }

    if (avsRemovals.length > 0) {
      try {
        let removed = 0;
        for (const removal of avsRemovals) {
          if (await removeOverrideForTarget(app, removal.id)) removed++;
        }
        if (removed > 0) await refreshTokenVisuals();
        notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
      } catch (e) {
        console.warn('Failed to remove AVS overrides:', e);
      }
    }

    if (Object.keys(overrides).length > 0) {
      await applyFunction(buildActionData(app, overrides), target);

      outcomesWithChanges.forEach((outcome) => {
        const tokenId = outcome.token?.id || outcome.target?.id;
        if (tokenId && app.rowTimers?.has(tokenId)) {
          app.rowTimers.delete(tokenId);
          app._updateRowTimerButton?.(tokenId);
        }
      });
    }

    outcomesWithChanges.forEach((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      markOutcomeApplied(outcome, effectiveNewState);
    });

    app.bulkActionState = 'applied';
    app.updateRowButtonsToApplied?.(outcomesWithChanges);
    app.updateChangesCount?.();
    app.updateBulkActionButtons?.();
    await clearSneakActiveFlag(app, actionType);

    notify.info(
      `${MODULE_TITLE}: Applied ${actionType.toLowerCase()} results for ${outcomesWithChanges.length} tokens`,
    );
  } catch (error) {
    console.error(`[${actionType} Dialog] Error applying all changes:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply changes - see console for details`);
  }
}

export async function revertAllBaseActionChanges(event, target, context) {
  const { app, actionType } = context;
  if (!app) {
    console.error(`[${actionType} Dialog] Could not find application instance`);
    return;
  }

  if (app.bulkActionState !== 'applied') {
    notify.warn(`${MODULE_TITLE}: No changes to revert. Apply changes first.`);
    return;
  }

  try {
    const appliedOutcomes = app.outcomes.filter((o) => o.oldVisibility !== o.currentVisibility);

    if (appliedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No applied changes found to revert`);
      return;
    }

    let removedOverrides = 0;
    if (getActorId(app)) {
      try {
        for (const outcome of appliedOutcomes) {
          const effectiveOldState = outcome.oldVisibility;
          if (
            !effectiveOldState ||
            effectiveOldState === 'avs' ||
            effectiveOldState === outcome.currentVisibility
          ) {
            continue;
          }

          const targetId = outcome.target?.id || outcome.token?.id;
          if (!targetId) continue;
          try {
            await removeOverrideForTarget(app, targetId);
            removedOverrides++;
          } catch (e) {
            console.warn(`Failed to remove AVS override for ${targetId}:`, e);
          }
        }

        if (removedOverrides > 0) await refreshTokenVisuals();
      } catch (e) {
        console.warn('Failed to remove AVS overrides during revert all:', e);
      }
    }

    appliedOutcomes.forEach(markOutcomeReverted);
    app.bulkActionState = 'initial';
    app.updateRowButtonsToReverted?.(appliedOutcomes);
    app.updateChangesCount?.();
    app.updateBulkActionButtons?.();
  } catch (error) {
    console.error(`[${actionType} Dialog] Error reverting all changes:`, error);
    notify.error(`${MODULE_TITLE}: Failed to revert changes - see console for details`);
  }
}
