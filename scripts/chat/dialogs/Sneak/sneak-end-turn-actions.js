export async function applySneakEndTurnResults(app) {
  if (!app || !app.isEndOfTurnDialog) return;

  try {
    let appliedCount = 0;

    for (const outcome of app.outcomes) {
      if (outcome.needsApplication && !outcome.positionQualified) {
        try {
          const { getVisibilityMap, setVisibilityMap } = await import(
            '../../../stores/visibility-map.js'
          );

          const observerVisibilityMap = getVisibilityMap(outcome.token);
          observerVisibilityMap[app.sneakingToken.document.id] = 'observed';
          await setVisibilityMap(outcome.token, observerVisibilityMap);
          appliedCount++;
        } catch {
          /* Continue applying other end-turn outcomes */
        }
      }
    }

    if (appliedCount > 0) {
      try {
        const { eventDrivenVisibilitySystem } = await import(
          '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
        );
        if (eventDrivenVisibilitySystem?.refreshVisibilityForTokens) {
          await eventDrivenVisibilitySystem.refreshVisibilityForTokens([app.sneakingToken]);
        }
      } catch {
        /* Visual refresh is best-effort */
      }

      ui.notifications?.info?.(
        `Applied ${appliedCount} end-of-turn visibility change${appliedCount !== 1 ? 's' : ''} for ${app.sneakingToken.name}`,
      );
    } else {
      ui.notifications?.info?.(
        `No visibility changes needed - ${app.sneakingToken.name} maintains stealth positions`,
      );
    }

    app.close();
  } catch {
    ui.notifications?.error?.(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.END_TURN_FAILED'));
  }
}

export async function processSneakEndTurnValidation(app, DialogClass) {
  if (!app || app.isEndOfTurnDialog) return;

  if (!app._deferredChecks || app._deferredChecks.size === 0) {
    ui.notifications?.warn?.(
      game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_DEFERRED_POSITIONS'),
    );
    return;
  }

  try {
    const deferredTokenIds = Array.from(app._deferredChecks);
    const deferredOutcomes = app.outcomes.filter((outcome) =>
      deferredTokenIds.includes(outcome.token?.id),
    );

    if (deferredOutcomes.length === 0) {
      ui.notifications?.warn?.(
        game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_DEFERRED_OUTCOMES'),
      );
      return;
    }

    const endOfTurnDialog = new DialogClass(
      app.sneakingToken,
      deferredOutcomes,
      app.changes,
      app.sneakData,
      {
        isEndOfTurnDialog: true,
        title: game.i18n.format('PF2E_VISIONER.DIALOG_TITLES.END_TURN_POSITION', {
          name: app.sneakingToken.name,
        }),
        deferredFromDialog: app,
      },
    );

    endOfTurnDialog.render(true);
    ui.notifications?.info?.(
      `Processing ${deferredOutcomes.length} deferred position check${deferredOutcomes.length !== 1 ? 's' : ''} for end-of-turn validation.`,
    );
  } catch {
    ui.notifications?.error?.(
      game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.VALIDATION_FAILED'),
    );
  }
}
