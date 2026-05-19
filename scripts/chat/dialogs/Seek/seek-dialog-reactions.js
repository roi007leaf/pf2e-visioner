import { REACTIONS } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';

export function getAvailableSeekReactions(app, outcomes) {
  const actor = app.actorToken?.actor;
  if (!actor) return [];

  const context = { actor, outcomes, dialog: app };
  const availableReactions = [];

  for (const [key, reaction] of Object.entries(REACTIONS)) {
    try {
      if (reaction.isAvailable && reaction.isAvailable(context)) {
        availableReactions.push({
          ...reaction,
          key,
          applied: app._appliedReactions?.has?.(key) || false,
        });
      }
    } catch (error) {
      console.warn(`Error checking availability for reaction ${key}:`, error);
    }
  }

  return availableReactions;
}

export async function applySeekReaction(app, reactionKey) {
  const reaction = REACTIONS[reactionKey];
  if (!reaction) {
    console.error(`Unknown reaction: ${reactionKey}`);
    return;
  }

  if (!app._appliedReactions) {
    app._appliedReactions = new Set();
  }

  if (app._appliedReactions.has(reactionKey)) {
    notify.info(`${game.i18n.localize(reaction.name)} has already been applied.`);
    return;
  }

  try {
    const context = {
      actor: app.actorToken?.actor,
      outcomes: app.outcomes,
      dialog: app,
    };

    const result = await reaction.apply(context);

    if (result.success) {
      app._appliedReactions.add(reactionKey);
      await app.getFilteredOutcomes().then((reprocessedOutcomes) => {
        app.outcomes = reprocessedOutcomes;
      });
      await app.render({ force: true });
      app.updateReactionButton(reactionKey, true);
      app.updateReactionsToggleButton();
      notify.info(result.message);
    } else {
      notify.warn(result.message);
    }
  } catch (error) {
    console.error(`Error applying reaction ${reactionKey}:`, error);
    notify.error(`Error applying ${game.i18n.localize(reaction.name)}.`);
  }
}

export function updateSeekReactionButton(app, reactionKey, applied) {
  const button = app.element?.querySelector(`[data-reaction="${reactionKey}"]`);
  if (!button) return;

  if (applied) {
    button.classList.add('applied');
    button.disabled = true;

    const reaction = REACTIONS[reactionKey];
    const appliedText = game.i18n.localize(reaction.applied || reaction.name);
    button.innerHTML = `<i class="fas fa-check-circle"></i><span class="button-label">${appliedText}</span>`;
    button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.9';
  }
}

export function updateSeekReactionsToggleButton(app) {
  const toggleButton = app.element?.querySelector('.reactions-toggle-button');
  if (!toggleButton) return;

  const availableReactions = app.getAvailableReactions(app.outcomes);
  const hasAvailableReactions = availableReactions.some((reaction) => !reaction.applied);

  if (hasAvailableReactions) {
    toggleButton.classList.add('has-available');
  } else {
    toggleButton.classList.remove('has-available');
  }
}

export function updateSeekOutcomeRows(app, affectedOutcomes) {
  for (const outcome of affectedOutcomes) {
    const targetId = outcome.target?.id;
    if (!targetId) continue;

    const row = app.element?.querySelector(`tr[data-target-id="${targetId}"]`);
    if (!row) continue;

    const visibilityCell = row.querySelector('.visibility-change');
    if (visibilityCell) {
      visibilityCell.textContent = game.i18n.localize('PF2E_VISIONER.VISIBILITY_STATES.hidden');
      visibilityCell.className = 'visibility-change hidden';
    }

    const outcomeCell = row.querySelector('.outcome');
    if (outcomeCell) {
      outcomeCell.textContent = game.i18n.localize('PF2E_VISIONER.UI.HIDDEN_REACTION_LABEL');
      outcomeCell.className = 'outcome hidden';
    }
  }
}

function findFailedUndetectedOutcomes(outcomes = []) {
  return outcomes.filter(
    (outcome) =>
      (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
      outcome.currentVisibility === 'undetected',
  );
}

function markSenseUnseenApplied(outcomes = [], targetIds = []) {
  const targetIdSet = targetIds instanceof Set ? targetIds : new Set(targetIds);

  for (const outcome of outcomes) {
    if (!targetIdSet.has(outcome.target?.id)) continue;
    outcome.newVisibility = 'hidden';
    outcome.changed = true;
    outcome.senseUnseenApplied = true;
    outcome.hasActionableChange = true;
    outcome.overrideState = 'hidden';
  }
}

function markSenseUnseenButtonApplied(app, appliedText) {
  const button = app.element?.querySelector('button[data-action="applySenseUnseen"]');
  const section = app.element?.querySelector('.sense-unseen-section');

  if (button) {
    button.classList.add('applied');
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-check-circle"></i><span class="button-label">${appliedText}</span>`;
    button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.9';

    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    newButton.style.background =
      'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
    newButton.style.cursor = 'not-allowed';
    newButton.style.opacity = '0.9';
    newButton.addEventListener('click', (event) => {
      event.preventDefault();
      notify.info(`${appliedText} - This feat has already been used for this seek action.`);
    });
  }

  section?.classList.add('applied');
}

function updateSenseUnseenRows(app, outcomes = []) {
  for (const outcome of outcomes) {
    const targetId = outcome.target?.id;
    if (!targetId) continue;

    const row = app.element?.querySelector(`tr[data-target-id="${targetId}"]`);
    if (!row) continue;

    const visibilityCell = row.querySelector('.visibility-change');
    if (visibilityCell) {
      visibilityCell.textContent = game.i18n.localize('PF2E_VISIONER.VISIBILITY_STATES.hidden');
      visibilityCell.className = 'visibility-change hidden';
    }

    const outcomeCell = row.querySelector('.outcome');
    if (outcomeCell) {
      outcomeCell.textContent = game.i18n.localize(
        'PF2E_VISIONER.UI.HIDDEN_SENSE_UNSEEN_LABEL',
      );
      outcomeCell.className = 'outcome hidden';
    }
  }
}

export async function applySenseUnseenForSeek(app) {
  try {
    const failedUndetectedOutcomes = findFailedUndetectedOutcomes(app.outcomes);

    if (failedUndetectedOutcomes.length === 0) {
      notify.warn('No failed outcomes with undetected targets found.');
      return;
    }

    const targetIds = new Set(
      failedUndetectedOutcomes.map((outcome) => outcome.target?.id).filter(Boolean),
    );
    markSenseUnseenApplied(failedUndetectedOutcomes, targetIds);

    if (Array.isArray(app._originalOutcomes)) {
      markSenseUnseenApplied(app._originalOutcomes, targetIds);
    }

    app.outcomes = await app.getFilteredOutcomes();

    const appliedText = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SENSE_UNSEEN_APPLIED');
    markSenseUnseenButtonApplied(app, appliedText);

    app.bulkActionState = 'initial';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `Applied Sense the Unseen to ${failedUndetectedOutcomes.length} failed outcome(s). Undetected targets will be Hidden after applying.`,
    );

    updateSenseUnseenRows(app, failedUndetectedOutcomes);
  } catch (error) {
    console.error('Error applying Sense the Unseen:', error);
    notify.error('Error applying Sense the Unseen feat.');
  }
}
