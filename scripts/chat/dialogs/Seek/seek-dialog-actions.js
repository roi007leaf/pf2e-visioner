import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';

export async function applyAllSeekChanges(app) {
  if (!app) return;

  const filteredOutcomes = await app.getFilteredOutcomes();
  const actionableOutcomes = filteredOutcomes.filter((outcome) => outcome.hasActionableChange);

  if (actionableOutcomes.length === 0) {
    notify.info('No changes to apply');
    return;
  }

  if (app.bulkActionState === 'applied') {
    notify.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
    return;
  }

  const overrides = {};
  const wallOverrides = {};
  const avsRemovals = [];
  for (const outcome of actionableOutcomes) {
    const state = outcome?.overrideState || outcome?.newVisibility;
    if (outcome?._isWall && outcome?.wallId) {
      if (state) wallOverrides[outcome.wallId] = state;
    } else {
      const id = app.getOutcomeTokenId(outcome);
      if (id && state) {
        if (state === 'avs') {
          avsRemovals.push({
            id: outcome.target?.id,
            observer: outcome.observerToken || outcome.observer || null,
            name: outcome.target.name,
          });
        } else {
          overrides[id] = state;
        }
      }
    }
  }

  if (avsRemovals.length > 0) {
    try {
      const { default: AvsOverrideManager } = await import(
        '../../services/infra/AvsOverrideManager.js'
      );
      for (const removal of avsRemovals) {
        const observer = removal.observer || app.actionData?.actor;
        const observerId = observer?.document?.id || observer?.id;
        if (observerId && removal.id) {
          await AvsOverrideManager.removeOverride(observerId, removal.id);
        }
      }
      if (avsRemovals.length) {
        const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
        await updateTokenVisuals();
        notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
      }
    } catch (error) {
      console.warn('Failed to remove AVS overrides:', error);
      notify.info(`${MODULE_TITLE}: AVS will control visibility for ${avsRemovals.length}`);
    }
  }

  try {
    const { applyNowSeek } = await import('../../services/index.js');
    const payload = { ...app.actionData, ignoreAllies: app.ignoreAllies };
    if (!app.ignoreWalls && Object.keys(wallOverrides).length > 0) {
      payload.overrides = { ...overrides, __wall__: wallOverrides };
    } else {
      payload.overrides = overrides;
    }
    payload.seekPrecomputedOutcomes = actionableOutcomes;

    const appliedCount = await applyNowSeek(payload, { html: () => { }, attr: () => { } });
    notify.info(
      `${MODULE_TITLE}: Applied ${appliedCount ?? actionableOutcomes.length} visibility changes. Dialog remains open for additional actions.`,
    );

    app.updateRowButtonsToApplied(actionableOutcomes);
    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateChangesCount();
  } catch {
    notify.error(`${MODULE_TITLE}: Error applying changes.`);
  }
}

export async function revertAllSeekChanges(app) {
  if (!app) return;

  try {
    const filteredOutcomes = await app.getFilteredOutcomes();
    const changedOutcomes = filteredOutcomes.filter(
      (outcome) => outcome.changed && outcome.hasActionableChange,
    );

    const { revertNowSeek } = await import('../../services/index.js');
    await revertNowSeek(
      { ...app.actionData, ignoreAllies: app.ignoreAllies },
      { html: () => { }, attr: () => { } },
    );

    app.updateRowButtonsToReverted(changedOutcomes);
    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateChangesCount();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error reverting changes:`, error);
    notify.error(`${MODULE_TITLE}: Error reverting changes.`);
  }
}

function findSeekOutcome(app, { tokenId, wallId }) {
  if (wallId) return app.outcomes.find((outcome) => outcome._isWall && outcome.wallId === wallId);
  return app.outcomes.find((outcome) => app.getOutcomeTokenId(outcome) === tokenId);
}

export async function applySeekChange(app, button) {
  if (!app) return;

  const tokenId = button.dataset.tokenId;
  const wallId = button.dataset.wallId;
  const outcome = findSeekOutcome(app, { tokenId, wallId });

  if (!outcome || !outcome.hasActionableChange) {
    notify.warn(`${MODULE_TITLE}: No change to apply for this ${wallId ? 'wall' : 'token'}`);
    return;
  }

  try {
    const { applyNowSeek } = await import('../../services/index.js');
    const actionData = {
      ...app.actionData,
      ignoreAllies: app.ignoreAllies,
      encounterOnly: app.encounterOnly,
    };
    delete actionData.seekTemplateCenter;
    delete actionData.seekTemplateRadiusFeet;

    if (outcome._isWall && outcome.wallId) {
      const overrides = {
        __wall__: { [outcome.wallId]: outcome.overrideState || outcome.newVisibility },
      };
      await applyNowSeek(
        { ...actionData, overrides, seekPrecomputedOutcomes: [outcome] },
        { html: () => { }, attr: () => { } },
      );
      app.updateRowButtonsToApplied([{ wallId: outcome.wallId }]);
    } else {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;

      if (effectiveNewState === 'avs') {
        try {
          const { default: AvsOverrideManager } = await import(
            '../../services/infra/AvsOverrideManager.js'
          );
          const observer = outcome.observerToken || outcome.observer || app.actionData?.actor;
          const observerId = observer?.document?.id || observer?.id;
          if (observerId) {
            await AvsOverrideManager.removeOverride(observerId, outcome.target.id);
            const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
            await updateTokenVisuals();
            notify.info(`${MODULE_TITLE}: Accepted AVS change for ${outcome.target.name}`);
          }
        } catch (error) {
          console.warn('Failed to remove AVS override:', error);
          notify.info(`${MODULE_TITLE}: AVS will control visibility for ${outcome.target.name}`);
        }
        app.updateRowButtonsToApplied([{ target: { id: app.getOutcomeTokenId(outcome) } }]);
      } else {
        const rowTimerConfig = app.rowTimers?.get(tokenId);
        let overrideValue = effectiveNewState;

        if (rowTimerConfig) {
          try {
            const { TimedOverrideManager } = await import(
              '../../../services/TimedOverrideManager.js'
            );
            const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
            overrideValue = { state: effectiveNewState, timedOverride };
          } catch (error) {
            console.error('PF2E Visioner | Seek row apply: Failed to build timer:', error);
          }
        }

        const overrides = { [app.getOutcomeTokenId(outcome)]: overrideValue };
        await applyNowSeek(
          { ...actionData, overrides, seekPrecomputedOutcomes: [outcome] },
          { html: () => { }, attr: () => { } },
        );

        if (rowTimerConfig) {
          app.rowTimers.delete(tokenId);
          app._updateRowTimerButton?.(tokenId);
        }

        app.updateRowButtonsToApplied([{ target: { id: app.getOutcomeTokenId(outcome) } }]);
      }
    }

    app.updateChangesCount();
  } catch {
    notify.error(`${MODULE_TITLE}: Error applying change.`);
  }
}

export async function applyTimedSeekChange(app, button) {
  if (!app) return;

  const tokenId = button.dataset.tokenId;
  if (!tokenId) {
    notify.warn(`${MODULE_TITLE}: No token found for timed apply`);
    return;
  }

  const outcome = app.outcomes.find((candidate) => app.getOutcomeTokenId(candidate) === tokenId);
  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: No outcome found for this token`);
    return;
  }

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  if (!effectiveNewState || effectiveNewState === 'avs') {
    notify.warn(`${MODULE_TITLE}: Cannot apply timed override for AVS state`);
    return;
  }

  const observer = outcome.observerToken || outcome.observer || app.actorToken;
  const targetToken = outcome.target;
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
      { source: 'seek_action' },
    );

    if (success) {
      outcome.hasActionableChange = false;
      outcome.hasRevertableChange = false;
      app.updateRowButtonsToApplied([{ target: { id: tokenId } }]);
      app.updateChangesCount();
      notify.info(
        `${MODULE_TITLE}: Applied timed visibility override for ${targetToken.name || 'token'}`,
      );
    }
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error applying timed change:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply timed change`);
  }
}

export async function revertSeekChange(app, button) {
  if (!app) return;

  const tokenId = button.dataset.tokenId;
  const wallId = button.dataset.wallId;
  const outcome = findSeekOutcome(app, { tokenId, wallId });

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: ${wallId ? 'Wall' : 'Token'} not found`);
    return;
  }

  try {
    if (!outcome._isWall) {
      try {
        const { default: AvsOverrideManager } = await import(
          '../../services/infra/AvsOverrideManager.js'
        );
        const observer = outcome.observerToken || outcome.observer || app.actionData?.actor;
        const observerId = observer?.document?.id || observer?.id;
        if (observerId && outcome.target?.id) {
          const hasOverride = await AvsOverrideManager.getOverride(observerId, outcome.target.id);
          if (hasOverride) {
            await AvsOverrideManager.removeOverride(observerId, outcome.target.id);
            const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
            await updateTokenVisuals();
          }
        }
      } catch (error) {
        console.warn('Failed to remove AVS override during revert:', error);
      }
    }

    if (outcome._isWall) {
      const { updateWallVisuals } = await import('../../../services/visual-effects.js');
      await updateWallVisuals(outcome.wall, outcome.oldVisibility || 'observed');
    } else {
      const revertVisibility = outcome.oldVisibility || outcome.currentVisibility;
      const observer = outcome.observerToken || outcome.observer || app.actionData?.actor;
      if (observer) {
        const { applyVisibilityChanges } = await import('../../services/infra/shared-utils.js');
        const changes = [{ target: outcome.target, newVisibility: revertVisibility }];

        await applyVisibilityChanges(observer, changes, {
          direction: 'observer_to_target',
        });
      } else {
        const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
        const { setVisibilityBetween } = await import('../../../utils.js');
        const fallbackObserver =
          canvas.tokens.controlled[0] || game.user.character?.getActiveTokens()[0];

        if (fallbackObserver) {
          await setVisibilityBetween(fallbackObserver, outcome.target, revertVisibility, {
            direction: 'observer_to_target',
          });
        }

        await updateTokenVisuals(outcome.target);
      }
    }

    app.updateRowButtonsToReverted([
      { target: { id: outcome._isWall ? null : app.getOutcomeTokenId(outcome) }, wallId },
    ]);
    app.updateChangesCount();
  } catch {
    notify.error(`${MODULE_TITLE}: Error reverting change.`);
  }
}
