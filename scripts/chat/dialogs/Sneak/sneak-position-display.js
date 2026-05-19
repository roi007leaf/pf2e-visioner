import turnSneakTracker from '../../services/TurnSneakTracker.js';

export function getSneakDisplayProperty(dialog, type, value, property) {
  if (type === 'visibility') {
    const config = dialog.visibilityConfig(value);
    if (!config) return value;
    if (property === 'class') return config.cssClass;
    return config[property] || value;
  }

  const configs = {
    visibility: {
      observed: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.OBSERVED'),
        icon: 'fas fa-eye',
        class: 'visibility-observed',
      },
      concealed: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.CONCEALED'),
        icon: 'fas fa-cloud',
        class: 'visibility-concealed',
      },
      hidden: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.HIDDEN'),
        icon: 'fas fa-user-secret',
        class: 'visibility-hidden',
      },
      undetected: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.UNDETECTED'),
        icon: 'fas fa-ghost',
        class: 'visibility-undetected',
      },
    },
    cover: {
      none: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.NO_COVER'),
        icon: 'fas fa-shield-slash',
        class: 'cover-none',
      },
      lesser: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.LESSER_COVER'),
        icon: 'fas fa-shield-alt',
        class: 'cover-lesser',
      },
      standard: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.STANDARD_COVER'),
        icon: 'fas fa-shield-alt',
        class: 'cover-standard',
      },
      greater: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.GREATER_COVER'),
        icon: 'fas fa-shield',
        class: 'cover-greater',
      },
    },
    lighting: {
      bright: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.BRIGHT_LIGHT'),
        icon: 'fas fa-sun',
        class: 'lighting-bright',
      },
      dim: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.DIM_LIGHT'),
        icon: 'fas fa-adjust',
        class: 'lighting-dim',
      },
      darkness: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.DARKNESS'),
        icon: 'fas fa-moon',
        class: 'lighting-darkness',
      },
    },
    transition: {
      improved: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.IMPROVED'),
        icon: 'fas fa-arrow-up',
        class: 'position-improved',
      },
      worsened: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.WORSENED'),
        icon: 'fas fa-arrow-down',
        class: 'position-worsened',
      },
      unchanged: {
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.UNCHANGED'),
        icon: 'fas fa-equals',
        class: 'position-unchanged',
      },
    },
  };

  const config = configs[type]?.[value];
  if (!config) {
    return property === 'label'
      ? value || 'Unknown'
      : property === 'icon'
        ? 'fas fa-question-circle'
        : `${type}-unknown`;
  }
  return config[property];
}

function fallbackPositionDisplay() {
  const unknown = {
    visibility: 'unknown',
    visibilityLabel: 'Unknown',
    visibilityIcon: 'fas fa-question-circle',
    visibilityClass: 'visibility-unknown',
    cover: 'unknown',
    coverLabel: 'Unknown',
    coverIcon: 'fas fa-question-circle',
    coverClass: 'cover-unknown',
    stealthBonus: 0,
    distance: 0,
    lighting: 'unknown',
    lightingLabel: 'Unknown',
    lightingIcon: 'fas fa-question-circle',
    qualifies: false,
  };

  return {
    hasChanged: false,
    transitionType: 'unknown',
    transitionClass: 'position-unknown',
    transitionIcon: 'fas fa-question',
    startPosition: { ...unknown },
    endPosition: { ...unknown },
    changes: {
      visibility: false,
      cover: false,
      stealthBonus: 0,
      distance: 0,
      lighting: false,
    },
  };
}

export function prepareSneakPositionDisplay(
  dialog,
  positionTransition,
  observerToken,
  outcome,
) {
  if (dialog.isEndOfTurnDialog && outcome && outcome.positionDisplay) {
    const preservedDisplay = { ...outcome.positionDisplay };

    if (preservedDisplay.startPosition) {
      preservedDisplay.startPosition = {
        ...preservedDisplay.startPosition,
        qualifies: dialog._startPositionQualifiesForSneak(observerToken, outcome),
      };
    }

    if (preservedDisplay.endPosition) {
      preservedDisplay.endPosition = {
        ...preservedDisplay.endPosition,
        qualifies: dialog._endPositionQualifiesForSneak(observerToken, outcome),
      };
    }

    return preservedDisplay;
  }

  if (!positionTransition) return fallbackPositionDisplay();

  const startPos = positionTransition.startPosition;
  const endPos = positionTransition.endPosition;

  return {
    hasChanged: positionTransition.hasChanged,
    transitionType: positionTransition.transitionType,
    transitionClass: dialog._getTransitionClass(positionTransition.transitionType),
    transitionIcon: dialog._getTransitionIcon(positionTransition.transitionType),
    startPosition: {
      visibility: startPos.effectiveVisibility,
      visibilityLabel: dialog._getVisibilityLabel(startPos.effectiveVisibility),
      visibilityIcon: dialog._getVisibilityIcon(startPos.effectiveVisibility),
      visibilityClass: dialog._getVisibilityClass(startPos.effectiveVisibility),
      cover: startPos.coverState,
      coverLabel: dialog._getCoverLabel(startPos.coverState),
      coverIcon: dialog._getCoverIcon(startPos.coverState),
      coverClass: dialog._getCoverClass(startPos.coverState),
      stealthBonus: startPos.stealthBonus,
      distance: Math.round(startPos.distance),
      lighting: startPos.lightingConditions,
      lightingLabel: dialog._getLightingLabel(startPos.lightingConditions),
      lightingIcon: dialog._getLightingIcon(startPos.lightingConditions),
      qualifies: (() => {
        const isCurrentlyDeferred =
          dialog._deferredChecks?.has(observerToken.id) ||
          turnSneakTracker?.isObserverDeferred?.(dialog.sneakingToken, observerToken);
        if (isCurrentlyDeferred) return true;
        if (outcome?._featPositionOverride) return !!outcome._featPositionOverride.startQualifies;
        return dialog._startPositionQualifiesForSneak(observerToken, outcome);
      })(),
    },
    endPosition: {
      visibility: endPos.effectiveVisibility,
      visibilityLabel: dialog._getVisibilityLabel(endPos.effectiveVisibility),
      visibilityIcon: dialog._getVisibilityIcon(endPos.effectiveVisibility),
      visibilityClass: dialog._getVisibilityClass(endPos.effectiveVisibility),
      cover: endPos.coverState,
      coverLabel: dialog._getCoverLabel(endPos.coverState),
      coverIcon: dialog._getCoverIcon(endPos.coverState),
      coverClass: dialog._getCoverClass(endPos.coverState),
      stealthBonus: endPos.stealthBonus,
      distance: Math.round(endPos.distance),
      lighting: endPos.lightingConditions,
      lightingLabel: dialog._getLightingLabel(endPos.lightingConditions),
      lightingIcon: dialog._getLightingIcon(endPos.lightingConditions),
      qualifies: (() => {
        if (outcome?._featPositionOverride) return !!outcome._featPositionOverride.endQualifies;
        return dialog._endPositionQualifiesForSneak(observerToken, outcome);
      })(),
    },
    changes: {
      visibility: positionTransition.avsVisibilityChanged,
      cover: positionTransition.coverStateChanged,
      stealthBonus: positionTransition.stealthBonusChange,
      distance: Math.round(endPos.distance - startPos.distance),
      lighting: startPos.lightingConditions !== endPos.lightingConditions,
    },
  };
}

export function assessSneakPositionQuality(position) {
  if (!position) return 'unknown';

  let score = 0;

  switch (position.avsVisibility) {
    case 'undetected':
      score += 4;
      break;
    case 'hidden':
      score += 3;
      break;
    case 'concealed':
      score += 2;
      break;
  }

  switch (position.coverState) {
    case 'greater':
      score += 3;
      break;
    case 'standard':
      score += 2;
      break;
    case 'lesser':
      score += 1;
      break;
  }

  switch (position.lightingConditions) {
    case 'darkness':
      score += 2;
      break;
    case 'dim':
      score += 1;
      break;
  }

  if (position.distance > 60) score += 2;
  else if (position.distance > 30) score += 1;

  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 4) return 'fair';
  if (score >= 2) return 'poor';
  return 'terrible';
}

export function sneakOutcomeQualifies(outcome) {
  if (!outcome || !outcome.positionDisplay) return false;
  const hasValidStart =
    outcome.positionDisplay.startPosition && outcome.positionDisplay.startPosition.qualifies;
  const hasValidEnd =
    outcome.positionDisplay.endPosition && outcome.positionDisplay.endPosition.qualifies;
  return hasValidStart && hasValidEnd;
}

export function sortSneakOutcomesByQualification(outcomes) {
  if (!outcomes || !Array.isArray(outcomes)) return outcomes || [];
  return outcomes.sort((a, b) => {
    const aQualifies = sneakOutcomeQualifies(a);
    const bQualifies = sneakOutcomeQualifies(b);
    if (aQualifies !== bQualifies) return bQualifies - aQualifies;
    return 0;
  });
}
