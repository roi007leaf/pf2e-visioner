import { MODULE_ID, getVisibilityStateLabelKey } from '../../../../constants.js';
import { notify } from '../../infra/notifications.js';
import { shouldFilterAlly } from '../../infra/shared-utils.js';

export function getDefaultConsequencesVisibility() {
  try {
    return game.settings.get(MODULE_ID, 'autoVisibilityEnabled') === true ? 'avs' : 'observed';
  } catch {
    return 'observed';
  }
}

function canBeConsequencesObserver(token, attacker, actionData) {
  try {
    if (!token || !token.actor) return false;
    if (attacker && token.id === attacker.id) return false;
    const type = token.actor?.type;
    if (type === 'hazard' || type === 'loot') return false;
    return !shouldFilterAlly(
      attacker,
      token,
      'enemies',
      actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
        ? actionData.ignoreAllies
        : null,
    );
  } catch {
    return false;
  }
}

export async function discoverConsequencesSubjects(actionData) {
  const tokens = canvas?.tokens?.placeables || [];
  const attacker = actionData?.actor || null;
  const visibilityBySubjectId = new Map();
  const { getVisibilityBetween } = await import('../../../../utils.js');

  const potential = tokens
    .filter((token) => canBeConsequencesObserver(token, attacker, actionData))
    .filter((subject) => {
      try {
        const visibility = getVisibilityBetween(subject, attacker);
        const isValidTarget = visibility === 'undetected' || visibility === 'hidden';
        if (isValidTarget) {
          const subjectId = subject?.document?.id || subject?.id;
          if (subjectId) visibilityBySubjectId.set(subjectId, visibility);
        }

        return isValidTarget;
      } catch (error) {
        console.warn('Error checking visibility for RAW enforcement:', error);
        return false;
      }
    });

  if (actionData) actionData._visionerConsequencesVisibility = visibilityBySubjectId;
  if (potential.length === 0) {
    notify.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_VALID_CONSEQUENCES'));
  }

  return potential;
}

export async function buildConsequencesOutcome(actionData, subject) {
  const subjectId = subject?.document?.id || subject?.id;
  let currentVisibility = actionData?._visionerConsequencesVisibility?.get?.(subjectId);
  if (!currentVisibility) {
    const { getVisibilityBetween } = await import('../../../../utils.js');
    currentVisibility = getVisibilityBetween(subject, actionData.actor);
  }

  return {
    target: subject,
    currentVisibility,
    oldVisibility: currentVisibility,
    oldVisibilityLabel:
      getVisibilityStateLabelKey(currentVisibility, { manual: true }) || currentVisibility,
    changed: currentVisibility === 'hidden' || currentVisibility === 'undetected',
    newVisibility: getDefaultConsequencesVisibility(),
  };
}
