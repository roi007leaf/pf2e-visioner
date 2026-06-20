/**
 * bindAutomationEvents
 * Stateless event binding for automation panel.
 */

import { notify } from '../services/infra/notifications.js';
import {
  findSeekTemplateDocument,
  getTemplateStateFromDocument,
} from '../services/preview/seek-template.js';
import { hasActiveEncounter } from '../services/infra/shared-utils.js';

export function shouldWaitForPlayerSeekTemplate({ message, pending, fallbackTemplate } = {}) {
  return !!(
    game.user.isGM &&
    game.settings.get('pf2e-visioner', 'seekUseTemplate') &&
    hasActiveEncounter() &&
    message?.author?.isGM === false &&
    !pending &&
    !fallbackTemplate
  );
}

export function applyPendingSeekTemplateToActionData(
  actionData,
  { pending = null, fallbackState = null } = {},
) {
  const center = pending?.center || fallbackState?.center;
  const radiusFeet = pending?.radiusFeet || fallbackState?.radiusFeet;
  if (!center || !radiusFeet) return false;

  actionData.seekTemplateCenter = center;
  actionData.seekTemplateRadiusFeet = radiusFeet;
  actionData.seekTemplateType = pending?.templateType || fallbackState?.templateType || 'circle';
  actionData.seekTemplateLevels = pending?.levels || fallbackState?.levels || [];

  if (pending && typeof pending.rollTotal === 'number') {
    actionData.roll = {
      total: pending.rollTotal,
      dice: [{ total: typeof pending.dieResult === 'number' ? pending.dieResult : undefined }],
    };
  }

  return true;
}

export function getDirectHideChangedOutcomes(handler, outcomes = [], actionData = {}) {
  return outcomes.filter((outcome) => {
    if (!outcome) return false;
    if (
      typeof handler?.isOutcomeActionable === 'function' &&
      handler.isOutcomeActionable(actionData, outcome) === true
    ) {
      return true;
    }
    if (outcome.changed) return true;

    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const baseOld = outcome.oldVisibility ?? outcome.currentVisibility;
    if (!effectiveNewState || baseOld == null) return false;

    const oldStateAvsControlled =
      typeof handler?.isOldStateAvsControlled === 'function' &&
      handler.isOldStateAvsControlled(outcome, actionData) === true;

    if (
      effectiveNewState === 'avs' &&
      oldStateAvsControlled &&
      outcome._calculatedNewVisibility &&
      outcome._calculatedNewVisibility !== 'avs'
    ) {
      outcome.overrideState = outcome._calculatedNewVisibility;
      return true;
    }

    if (effectiveNewState === 'avs') return false;

    return (
      effectiveNewState === baseOld &&
      oldStateAvsControlled
    );
  });
}

export function getHideDialogActionableOverrides(dialog, actionData = {}) {
  if (!dialog || !Array.isArray(dialog.outcomes)) return {};

  const dialogMessageId = dialog.actionData?.messageId;
  if (dialogMessageId && actionData?.messageId && dialogMessageId !== actionData.messageId) {
    return {};
  }

  const overrides = {};
  for (const outcome of dialog.outcomes) {
    const id = outcome?.target?.id;
    const effectiveNewState = outcome?.overrideState || outcome?.newVisibility;
    if (!id || !effectiveNewState || effectiveNewState === 'avs') continue;

    const baseOld = outcome.oldVisibility ?? outcome.currentVisibility;
    const statesMatch = effectiveNewState === baseOld;
    const avsControlled =
      typeof dialog.isOldStateAvsControlled === 'function' &&
      dialog.isOldStateAvsControlled(outcome) === true;
    const actionable =
      outcome.hasActionableChange === true ||
      effectiveNewState !== baseOld ||
      (statesMatch && avsControlled);
    if (!actionable) continue;

    overrides[id] = effectiveNewState;
  }

  return overrides;
}

export function getHideOutcomeActionableOverrides(outcomes = []) {
  const overrides = {};
  for (const outcome of outcomes || []) {
    const id = outcome?.target?.id;
    const effectiveNewState = outcome?.overrideState || outcome?.newVisibility;
    if (!id || !effectiveNewState || effectiveNewState === 'avs') continue;
    overrides[id] = effectiveNewState;
  }
  return overrides;
}

function mergeForcedHideOverrides(actionData, overrides) {
  const ids = Object.keys(overrides || {});
  if (ids.length === 0) return false;

  actionData.overrides = {
    ...(actionData.overrides || {}),
    ...overrides,
  };
  actionData.forceApplyOverrideIds = Array.from(
    new Set([...(actionData.forceApplyOverrideIds || []), ...ids]),
  );
  return true;
}

async function hydrateHideApplyOverridesFromOpenDialog(actionData) {
  try {
    const { HidePreviewDialog } = await import('../dialogs/HidePreviewDialog.js');
    const overrides = getHideDialogActionableOverrides(
      HidePreviewDialog.currentHideDialog,
      actionData,
    );
    return mergeForcedHideOverrides(actionData, overrides);
  } catch {
    return false;
  }
}

export function bindAutomationEvents(panel, message, actionData) {
  panel.on('click', '[data-action]', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const action = event.currentTarget.dataset.action;
    const button = $(event.currentTarget);

    if (button.hasClass('processing')) return;

    try {
      button.addClass('processing').prop('disabled', true);
      const {
        previewActionResults,
        applyNowSeek,
        applyNowPointOut,
        applyNowHide,
        applyNowSneak,
        applyNowDiversion,
        applyNowConsequences,
        applyNowTakeCover,
        revertNowSeek,
        revertNowPointOut,
        revertNowHide,
        revertNowSneak,
        revertNowDiversion,
        revertNowConsequences,
        revertNowTakeCover,
        setupSeekTemplate,
        removeSeekTemplate,
        injectAutomationUI,
      } = await import('../services/index.js');

      // Declarative apply/revert handlers by action string
      const applyHandlers = {
        'apply-now-seek': applyNowSeek,
        'apply-now-point-out': applyNowPointOut,
        'apply-now-hide': applyNowHide,
        'apply-now-sneak': applyNowSneak,
        'apply-now-diversion': applyNowDiversion,
        'apply-now-consequences': applyNowConsequences,
        'apply-now-take-cover': applyNowTakeCover,
        'start-sneak': async (actionData, buttonEl) => {
          const { SneakDialogService } = await import('../services/dialogs/SneakDialogService.js');
          const service = new SneakDialogService();
          return service.startSneak(actionData, buttonEl);
        },
        'open-sneak-results': async (actionData) => {
          const { SneakDialogService } = await import('../services/dialogs/SneakDialogService.js');
          return SneakDialogService.openSneakResults(actionData);
        },
      };
      const revertHandlers = {
        'revert-now-seek': revertNowSeek,
        'revert-now-point-out': revertNowPointOut,
        'revert-now-hide': revertNowHide,
        'revert-now-sneak': revertNowSneak,
        'revert-now-diversion': revertNowDiversion,
        'revert-now-consequences': revertNowConsequences,
        'revert-now-take-cover': revertNowTakeCover,
      };

      if (action === 'setup-seek-template' && actionData.actionType === 'seek') {
        const skipDialog = event.shiftKey || false;
        await setupSeekTemplate(actionData, skipDialog);
      } else if (action === 'remove-seek-template' && actionData.actionType === 'seek') {
        await removeSeekTemplate(actionData);
        try {
          const parent = button.closest('.pf2e-visioner-automation-panel');
          if (parent?.length) {
            const messageId = parent.data('message-id');
            const message = game.messages.get(messageId);
            if (message) {
              const html = $(message.element);
              parent.remove();
              injectAutomationUI(message, html, actionData);

              // Update button state after UI re-injection to ensure it's properly set
              const { updateSeekTemplateButton } = await import(
                '../services/preview/seek-template.js'
              );
              updateSeekTemplateButton(actionData, false);
            }
          }
        } catch {}
      } else if (action === 'open-seek-results' && actionData.actionType === 'seek') {
        if (actionData.searchExploration) {
          await previewActionResults({
            ...actionData,
            ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
          });
          return;
        }

        let msg = game.messages.get(actionData.messageId);
        let pending = msg?.flags?.['pf2e-visioner']?.seekTemplate;
        // If authored by a player but flags haven't arrived yet, wait briefly and retry
        if (!pending && game.user.isGM && msg?.author && msg.author.isGM === false) {
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 200));
            msg = game.messages.get(actionData.messageId);
            pending = msg?.flags?.['pf2e-visioner']?.seekTemplate;
            if (pending) break;
          }
        }
        // Fallback: if flags are still missing, try to read an on-scene template tagged for this message/actor from the player
        let fallbackTemplate = null;
        if (!pending && game.user.isGM && msg?.author && msg.author.isGM === false) {
          try {
            fallbackTemplate = findSeekTemplateDocument({
              messageId: actionData.messageId,
              actorId: actionData.actor.id,
              userId: msg.author.id,
            });
          } catch {}
        }
        if ((pending || fallbackTemplate) && game.user.isGM) {
          const fallbackState = fallbackTemplate
            ? getTemplateStateFromDocument(fallbackTemplate)
            : null;
          applyPendingSeekTemplateToActionData(actionData, { pending, fallbackState });
          // If we used a fallback scene template and flags are missing, best-effort to write them now
          if (!pending && fallbackTemplate) {
            try {
              const center = actionData.seekTemplateCenter;
              const radiusFeet = actionData.seekTemplateRadiusFeet;
              await msg.update({
                ['flags.pf2e-visioner.seekTemplate']: {
                  center,
                  radiusFeet,
                  templateType:
                    actionData.seekTemplateType || fallbackState?.templateType || 'circle',
                  levels: actionData.seekTemplateLevels || fallbackState?.levels || [],
                  actorTokenId: actionData.actor.id,
                  rollTotal: actionData.roll?.total ?? null,
                  dieResult:
                    actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                  fromUserId: msg.author.id,
                  hasTargets: true,
                },
              });
            } catch {}
          }
        } else if (shouldWaitForPlayerSeekTemplate({ message: msg, pending, fallbackTemplate })) {
          // Still no template data: avoid opening unfiltered results
          notify.warn(
            "Waiting for the player's Seek template. Please click again once it appears.",
          );
          return;
        }
        await previewActionResults({
          ...actionData,
          ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
        });
      } else if (action === 'open-point-out-results' && actionData.actionType === 'point-out') {
        if (game.user.isGM) {
          const { enrichPointOutActionDataForGM } = await import('../services/index.js');
          await enrichPointOutActionDataForGM(actionData);
        }
        await previewActionResults(actionData);
      } else if (typeof action === 'string' && action.startsWith('open-')) {
        await previewActionResults({
          ...actionData,
          ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
        });
      } else if (applyHandlers[action]) {
        if (action === 'apply-now-seek') {
          try {
            const msg = game.messages.get(actionData.messageId);
            const pending = msg?.flags?.['pf2e-visioner']?.seekTemplate;
            let fallbackState = null;
            if (!pending && game.user.isGM) {
              const fallbackTemplate = findSeekTemplateDocument({
                messageId: actionData.messageId,
                actorId: actionData.actor?.id,
                userId: msg?.author?.id || game.userId,
              });
              fallbackState = fallbackTemplate ? getTemplateStateFromDocument(fallbackTemplate) : null;
            }
            applyPendingSeekTemplateToActionData(actionData, { pending, fallbackState });
          } catch {
            /* Template hydration is best-effort; SeekAction still validates normally. */
          }
        }

        // For Point Out, ping the pointed target when applying from the chat panel
        try {
          if (action === 'apply-now-point-out' && game.user.isGM) {
            // Prefer resolved outcomes from handler if available via preview, otherwise flags
            let token = null;
            try {
              const dialog = ui.windows?.find?.((w) =>
                w?.options?.classes?.includes?.('point-out-preview-dialog'),
              );
              const first = dialog?.outcomes?.[0]?.targetToken;
              if (first) token = first;
            } catch {}
            if (!token) {
              const msg = game.messages.get(actionData?.messageId);
              const pointOutFlags = msg?.flags?.['pf2e-visioner']?.pointOut;
              const targetTokenId =
                pointOutFlags?.targetTokenId ||
                actionData?.context?.target?.token ||
                msg?.flags?.pf2e?.target?.token;
              if (targetTokenId) token = canvas.tokens.get(targetTokenId) || null;
            }
            if (token) {
              const { pingTokenCenter } = await import('../services/gm-ping.js');
              try {
                pingTokenCenter(token, 'Point Out Target');
              } catch {}
            }
          }
        } catch {}

        // For Hide: if there are no actionable changes (respecting default encounter filter),
        // show a no-changes notification and skip applying
        if (action === 'apply-now-hide') {
          try {
            const hasDialogOverrides = await hydrateHideApplyOverridesFromOpenDialog(actionData);
            const { HideActionHandler } = await import('../services/actions/HideAction.js');
            const { filterOutcomesByEncounter } = await import('../services/infra/shared-utils.js');
            const handler = new HideActionHandler();
            await handler.ensurePrerequisites(actionData);
            const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
            const outcomes = await Promise.all(
              subjects.map((s) => handler.analyzeOutcome(actionData, s)),
            );
            const encounterOnly = game.settings.get('pf2e-visioner', 'defaultEncounterFilter');
            const directChanged = getDirectHideChangedOutcomes(handler, outcomes, actionData);
            const hasPreflightOverrides = mergeForcedHideOverrides(
              actionData,
              getHideOutcomeActionableOverrides(directChanged),
            );
            let changed = directChanged;
            changed = filterOutcomesByEncounter(changed, encounterOnly, 'target');
            if (changed.length === 0 && !hasDialogOverrides && !hasPreflightOverrides) {
              notify.info('No changes to apply');
              return;
            }
          } catch (hideValidationErr) {
            console.warn(
              'PF2E Visioner | Hide validation failed, blocking apply:',
              hideValidationErr,
            );
            notify.warn('Unable to validate Hide targets');
            return;
          }
        }
        // Seek: validation and LOS deferral are handled inside SeekAction.apply()
        await applyHandlers[action](actionData, button);
      } else if (action === 'start-sneak') {
        // Special case: ensure we pass the actual button element so the service can refresh the UI
        await applyHandlers[action](actionData, button);
      } else if (revertHandlers[action]) {
        await revertHandlers[action](actionData, button);
      }
    } finally {
      button.removeClass('processing').prop('disabled', false);
    }
  });
}
