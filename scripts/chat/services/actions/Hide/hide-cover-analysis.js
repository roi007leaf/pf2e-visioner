import { COVER_STATES } from '../../../../constants.js';
import { getCoverBetween } from '../../../../utils.js';

function resolveHidingToken(actionData) {
  return actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
}

function getRollId(actionData) {
  return (
    actionData?.context?._visionerRollId ||
    actionData?.context?.rollId ||
    actionData?.message?.flags?.['pf2e-visioner']?.rollId ||
    null
  );
}

async function applyCeaselessShadowsUpgrade(actionData, coverState) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    return FeatsHandler.upgradeCoverForCreature(actionData.actor, coverState);
  } catch {
    return { state: coverState, canTakeCover: undefined };
  }
}

function buildAutoCoverDisplay({ coverState, isOverride, originalDetectedState, coverSource, canTakeCover }) {
  const coverConfig = COVER_STATES[coverState || 'none'];
  const actualStealthBonus = coverConfig?.bonusStealth || 0;

  return {
    state: coverState || 'none',
    label: game.i18n.localize(coverConfig?.label || 'None'),
    icon: coverConfig?.icon || 'fas fa-shield',
    color: coverConfig?.color || '#999',
    cssClass: coverConfig?.cssClass || '',
    bonus: actualStealthBonus,
    canTakeCover: canTakeCover || (coverState === 'standard' || coverState === 'greater' ? true : undefined),
    isOverride: isOverride && originalDetectedState !== coverState,
    source: coverSource,
    ...(isOverride && {
      overrideDetails: {
        originalState: originalDetectedState,
        originalLabel: game.i18n.localize(COVER_STATES[originalDetectedState]?.label || 'None'),
        originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
        originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
        finalState: coverState || 'none',
        finalLabel: game.i18n.localize(coverConfig?.label || 'None'),
        finalIcon: coverConfig?.icon || 'fas fa-shield',
        finalColor: coverConfig?.color || '#999',
        source: coverSource,
      },
    }),
  };
}

export async function buildHideAutoCoverData({
  actionData,
  subject,
  autoCoverSystem,
  stealthCheckUseCase,
}) {
  try {
    const hidingToken = resolveHidingToken(actionData);
    let coverState = null;
    let isOverride = false;
    let coverSource = 'none';

    try {
      const manualDetected = getCoverBetween(subject, hidingToken);
      if (manualDetected && manualDetected !== 'none') {
        coverState = manualDetected;
        coverSource = 'manual';
      } else if (autoCoverSystem?.isEnabled?.()) {
        const autoDetected = stealthCheckUseCase?._detectCover?.(subject, hidingToken);
        if (autoDetected && autoDetected !== 'none') {
          coverState = autoDetected;
          coverSource = 'automatic';
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Cover calculation failed for Hide action:', e);
    }

    let originalDetectedState = coverState || 'none';
    try {
      const rollId = getRollId(actionData);
      const storedModifier = rollId
        ? stealthCheckUseCase?.getOriginalCoverModifier?.(rollId)
        : null;

      if (storedModifier && storedModifier.isOverride) {
        originalDetectedState = coverState || 'none';
        coverState = storedModifier.finalState;
        isOverride = true;
        coverSource = storedModifier.source || 'dialog';
      } else {
        const overrideData = autoCoverSystem?.consumeCoverOverride?.(
          hidingToken,
          subject,
          rollId,
          false,
        );
        if (overrideData) {
          originalDetectedState = coverState || 'none';
          coverState = overrideData.state;
          if (originalDetectedState !== coverState) {
            isOverride = true;
            coverSource = overrideData.source;
          }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Error checking for cover override:', e);
    }

    if (!coverState && !isOverride) return undefined;

    const upgraded = await applyCeaselessShadowsUpgrade(actionData, coverState);
    coverState = upgraded.state;

    return buildAutoCoverDisplay({
      coverState,
      isOverride,
      originalDetectedState,
      coverSource,
      canTakeCover: upgraded.canTakeCover,
    });
  } catch (e) {
    console.error('PF2E Visioner | Error in cover calculation for Hide action:', e);
    return undefined;
  }
}
