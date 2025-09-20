/**
 * bindAutomationEvents
 * Stateless event binding for automation panel.
 */

import { notify } from '../services/infra/notifications.js';

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
          const { SneakDialogService } = await import('../services/dialogs/sneak-dialog-service.js');
          const service = new SneakDialogService();
          return service.startSneak(actionData, buttonEl);
        },
        'open-sneak-results': async (actionData) => {
          const { SneakDialogService } = await import('../services/dialogs/sneak-dialog-service.js');
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
        await setupSeekTemplate(actionData);
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
            fallbackTemplate =
              canvas.scene?.templates?.find?.((t) => {
                const f = t?.flags?.['pf2e-visioner'];
                return (
                  f?.seekPreviewManual === true &&
                  f?.messageId === actionData.messageId &&
                  f?.actorTokenId === actionData.actor.id &&
                  t?.user?.id === msg.author.id
                );
              }) || null;
          } catch {}
        }
        if ((pending || fallbackTemplate) && game.user.isGM) {
          const center =
            pending?.center ||
            (fallbackTemplate ? { x: fallbackTemplate.x, y: fallbackTemplate.y } : undefined);
          const radiusFeet =
            pending?.radiusFeet ||
            (fallbackTemplate ? Number(fallbackTemplate.distance) || 0 : undefined);
          if (center && radiusFeet) {
            actionData.seekTemplateCenter = center;
            actionData.seekTemplateRadiusFeet = radiusFeet;
          }
          if (pending && typeof pending.rollTotal === 'number') {
            actionData.roll = {
              total: pending.rollTotal,
              dice: [
                { total: typeof pending.dieResult === 'number' ? pending.dieResult : undefined },
              ],
            };
          }
          // If we used a fallback scene template and flags are missing, best-effort to write them now
          if (!pending && fallbackTemplate) {
            try {
              await msg.update({
                ['flags.pf2e-visioner.seekTemplate']: {
                  center,
                  radiusFeet,
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
        } else if (game.user.isGM && game.settings.get('pf2e-visioner', 'seekUseTemplate')) {
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
            const { HideActionHandler } = await import('../services/actions/hide-action.js');
            const { filterOutcomesByEncounter } = await import('../services/infra/shared-utils.js');
            const handler = new HideActionHandler();
            await handler.ensurePrerequisites(actionData);
            const subjects = await handler.discoverSubjects(actionData);
            const outcomes = await Promise.all(
              subjects.map((s) => handler.analyzeOutcome(actionData, s)),
            );
            const encounterOnly = game.settings.get('pf2e-visioner', 'defaultEncounterFilter');
            let changed = outcomes.filter((o) => o && o.changed);
            changed = filterOutcomesByEncounter(changed, encounterOnly, 'target');
            if (changed.length === 0) {
              try {
                notify.info('No changes to apply');
              } catch {
                try {
                  notify.info('No changes to apply');
                } catch {}
              }
              return;
            }
          } catch {}
        }
        // For Seek: respect distance and template limits when applying directly from panel
        if (action === 'apply-now-seek') {
          try {
            const { SeekActionHandler } = await import('../services/actions/seek-action.js');
            const {
              filterOutcomesByEncounter,
              filterOutcomesBySeekDistance,
              filterOutcomesByTemplate,
            } = await import('../services/infra/shared-utils.js');
            const handler = new SeekActionHandler();
            await handler.ensurePrerequisites(actionData);
            const subjects = await handler.discoverSubjects(actionData);
            const outcomes = await Promise.all(
              subjects.map((s) => handler.analyzeOutcome(actionData, s)),
            );
            const encounterOnly = game.settings.get('pf2e-visioner', 'defaultEncounterFilter');
            let actionable = outcomes.filter((o) => o && o.changed);
            actionable = filterOutcomesByEncounter(actionable, encounterOnly, 'target');
            actionable = filterOutcomesBySeekDistance(actionable, actionData.actor, 'target');
            // Apply template filter if present (flags or fallback on-scene template)
            const msg = game.messages.get(actionData.messageId);
            const pending = msg?.flags?.['pf2e-visioner']?.seekTemplate;
            let tplCenter = pending?.center;
            let tplRadius = pending?.radiusFeet;
            if (
              (!tplCenter || !tplRadius) &&
              game.user.isGM &&
              msg?.author &&
              msg.author.isGM === false
            ) {
              try {
                const t = canvas.scene?.templates?.find?.((t) => {
                  const f = t?.flags?.['pf2e-visioner'];
                  return (
                    f?.seekPreviewManual === true &&
                    f?.messageId === actionData.messageId &&
                    f?.actorTokenId === actionData.actor.id &&
                    t?.user?.id === msg.author.id
                  );
                });
                if (t) {
                  tplCenter = { x: t.x, y: t.y };
                  tplRadius = Number(t.distance) || 0;
                }
              } catch {}
            }
            if (tplCenter && tplRadius) {
              actionable = filterOutcomesByTemplate(actionable, tplCenter, tplRadius, 'target');
            }
            if (actionable.length === 0) {
              notify.info('No changes to apply');
              return;
            }
          } catch {}
        }
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
