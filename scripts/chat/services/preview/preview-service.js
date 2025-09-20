// Unified preview dispatcher for chat automation actions
import { MODULE_ID } from '../../../constants.js';

// Flag to prevent multiple seek actions from being processed simultaneously
let isProcessingSeek = false;

export async function previewActionResults(actionData) {
  const type = actionData.actionType;
  const { log } = await import('../infra/notifications.js');

  try {
    switch (type) {
      case 'seek': {
        // Prevent multiple seek actions from being processed simultaneously
        if (isProcessingSeek) {
          log.warn('Seek action already in progress, skipping duplicate request');
          return;
        }

        isProcessingSeek = true;

        try {
          // Helper to robustly resolve a Token from various actor/token shapes
          const resolveToken = (tokenOrActor) => {
            try {
              if (!tokenOrActor) return null;
              if (tokenOrActor.isToken || tokenOrActor.center) return tokenOrActor;
              if (tokenOrActor.object?.isToken || tokenOrActor.object?.center)
                return tokenOrActor.object;
              if (tokenOrActor.document?.object?.isToken) return tokenOrActor.document.object;
              const actor = tokenOrActor.actor || tokenOrActor.document?.actor || tokenOrActor;
              if (actor?.getActiveTokens) {
                const tokens = actor.getActiveTokens(true);
                if (tokens?.length) return tokens[0];
              }
            } catch { }
            return null;
          };
          const seekerToken = resolveToken(actionData?.actor);

          // No gating by precise sense: PF2e allows Seek with imprecise senses; outcomes are capped elsewhere

          // Prevent duplicate seek dialogs by closing any existing one first
          try {
            const { SeekPreviewDialog } = await import('../../dialogs/seek-preview-dialog.js');
            // Check if there's already a seek dialog open and close it
            if (SeekPreviewDialog.currentSeekDialog) {
              await SeekPreviewDialog.currentSeekDialog.close();
              // Small delay to ensure the dialog is fully closed
              await new Promise((resolve) => setTimeout(resolve, 100));
            } else {
            }
          } catch {
            // Ignore errors when closing existing dialog
          }

          const { SeekActionHandler } = await import('../actions/seek-action.js');
          const { SeekPreviewDialog } = await import('../../dialogs/seek-preview-dialog.js');
          const handler = new SeekActionHandler();
          await handler.ensurePrerequisites(actionData);

          // RAW enforcement gate: check if there are valid seek targets
          try {
            const { checkForValidTargets } = await import('../infra/target-checker.js');
            const canSeek = checkForValidTargets({ ...actionData, actionType: 'seek' });
            if (!canSeek) {
              const { notify } = await import('../infra/notifications.js');
              notify.warn(
                'No valid Seek targets found. According to RAW, you can only Seek targets that are Undetected or Hidden from you.',
              );
              return;
            }
          } catch { }

          // Do NOT pre-filter allies at discovery time; let the dialog control it live
          const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
          const outcomes = await Promise.all(
            subjects.map((s) => handler.analyzeOutcome(actionData, s)),
          );
          const changes = outcomes.filter((o) => o && o.changed);

          // Validate actor before creating dialog
          if (!actionData.actor) {
            const { notify } = await import('../infra/notifications.js');
            notify.error('Cannot perform Seek action: No valid actor found');
            return;
          }

          // Pass the current desired per-dialog ignoreAllies default
          new SeekPreviewDialog(seekerToken || actionData.actor, outcomes, changes, {
            ...actionData,
            ignoreAllies: actionData?.ignoreAllies ?? game.settings.get(MODULE_ID, 'ignoreAllies'),
          }).render(true);
          return;
        } finally {
          // Always reset the flag, even if there's an error
          isProcessingSeek = false;
        }
      }
      case 'point-out': {
        const { PointOutActionHandler } = await import('../actions/point-out-action.js');
        const { PointOutPreviewDialog } = await import('../../dialogs/point-out-preview-dialog.js');
        const handler = new PointOutActionHandler();
        const subjects = await handler.discoverSubjects(actionData);

        // If no subjects found (e.g., no target selected), don't open the dialog
        if (!subjects || subjects.length === 0) {
          return;
        }

        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new PointOutPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case 'hide': {
        const { HideActionHandler } = await import('../actions/hide-action.js');
        const { HidePreviewDialog } = await import('../../dialogs/hide-preview-dialog.js');
        const handler = new HideActionHandler();
        await handler.ensurePrerequisites(actionData);
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canHide = checkForValidTargets({ ...actionData, actionType: 'hide' });
          if (!canHide) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'The creature hiding should be Concealed from, or have Standard or Greater Cover from, at least one observed.',
            );
            return;
          }
        } catch { }
        // Do NOT pre-filter allies; let dialog control it
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new HidePreviewDialog(actionData.actor, outcomes, changes, {
          ...actionData,
          ignoreAllies: actionData?.ignoreAllies ?? game.settings.get(MODULE_ID, 'ignoreAllies'),
        }).render(true);
        return;
      }
      case 'sneak': {
        const { SneakActionHandler } = await import('../actions/sneak-action.js');
        const { SneakPreviewDialog } = await import('../../dialogs/sneak-preview-dialog.js');
        const handler = new SneakActionHandler();
        // Ensure roll and any needed context are present (mirrors other actions)
        await handler.ensurePrerequisites(actionData);
        // If a Check Modifiers dialog is open, copy its rollId into actionData.context for override consumption
        try {
          const stealthDialog = Object.values(ui.windows).find(
            (w) => w?.constructor?.name === 'CheckModifiersDialog',
          );
          const rollId = stealthDialog?._pvRollId || stealthDialog?.context?._visionerRollId;
          if (rollId) {
            actionData.context = actionData.context || {};
            actionData.context._visionerRollId = rollId;
          }
        } catch { }
        // RAW enforcement gate: do not open dialog if prerequisites fail
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canSneak = checkForValidTargets({ ...actionData, actionType: 'sneak' });
          if (!canSneak) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'You can attempt Sneak only against creatures you were Hidden or Undetected from at the start.',
            );
            return;
          }
        } catch { }
        // Do NOT pre-filter allies; let dialog control it
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        // Get the token from the actor
        const token = actionData.actor?.token || actionData.actor;
        if (!token) {
          console.error('PF2E Visioner | No token found for sneak action');
          return;
        }

        // Try to retrieve start states for sneak action
        let startStates = {};
        try {
          // Check message flags for start states
          if (actionData.message?.flags?.['pf2e-visioner']?.startStates) {
            startStates = actionData.message.flags['pf2e-visioner'].startStates;
          }
          // Check token flags as backup
          else if (token?.document?.flags?.['pf2e-visioner']?.startStates) {
            startStates = token.document.flags['pf2e-visioner'].startStates;
          }
        } catch (error) {
          console.error('PF2E Visioner | Could not retrieve start states in preview service:', error);
        }

        // Create dialog with start states included
        new SneakPreviewDialog(token, outcomes, changes, {
          ...actionData,
          startStates
        }).render(true);
        return;
      }
      case 'create-a-diversion': {
        const { DiversionActionHandler } = await import('../actions/diversion-action.js');
        const { CreateADiversionPreviewDialog } = await import(
          '../../dialogs/create-a-diversion-preview-dialog.js'
        );
        const handler = new DiversionActionHandler();
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new CreateADiversionPreviewDialog(actionData.actor, outcomes, changes, actionData).render(
          true,
        );
        return;
      }
      case 'take-cover': {
        const { TakeCoverActionHandler } = await import('../actions/take-cover-action.js');
        const { TakeCoverPreviewDialog } = await import(
          '../../dialogs/take-cover-preview-dialog.js'
        );
        const handler = new TakeCoverActionHandler();
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new TakeCoverPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case 'consequences': {
        const { ConsequencesActionHandler } = await import('../actions/consequences-action.js');
        const { ConsequencesPreviewDialog } = await import(
          '../../dialogs/consequences-preview-dialog.js'
        );
        const handler = new ConsequencesActionHandler();

        // RAW enforcement gate: check if there are valid targets for consequences
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canShowConsequences = checkForValidTargets({
            ...actionData,
            actionType: 'consequences',
          });
          if (!canShowConsequences) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'No valid targets found for Attack Consequences. you can only see consequences if you are Hidden or Undetected from at least one observer.',
            );
            return;
          }
        } catch { }

        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new ConsequencesPreviewDialog(
          actionData.actor,
          outcomes,
          changes,
          actionData.attackData || {},
          actionData,
        ).render(true);
        return;
      }
      default:
        log.warn(`Unknown action type: ${type}`);
        return;
    }
  } catch (error) {
    log.error(`Error in previewActionResults for ${type}:`, error);
  }
}
