import { COVER_STATES } from '../../../../constants.js';
import { getCoverBetween } from '../../../../utils.js';

function resolveSneakingToken(actionData) {
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

function buildAutoCoverDisplay({ coverState, isOverride, originalDetectedState, coverSource }) {
  const coverConfig = COVER_STATES[coverState || 'none'];
  const canTakeCover =
    coverState === 'standard' || coverState === 'greater' ? true : undefined;

  return {
    state: coverState || 'none',
    label: game.i18n.localize(coverConfig?.label || 'None'),
    icon: coverConfig?.icon || 'fas fa-shield',
    color: coverConfig?.color || '#999',
    cssClass: coverConfig?.cssClass || '',
    bonus: coverConfig?.bonusStealth || 0,
    canTakeCover,
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

export async function buildSneakAutoCoverData({
  actionData,
  subject,
  autoCoverSystem,
  stealthCheckUseCase,
}) {
  try {
    const sneakingToken = resolveSneakingToken(actionData);
    let coverState = null;
    let isOverride = false;
    let coverSource = 'none';

    try {
      const manualDetected = getCoverBetween(subject, sneakingToken);
      if (manualDetected && manualDetected !== 'none') {
        coverState = manualDetected;
        coverSource = 'manual';
      } else if (autoCoverSystem?.isEnabled?.()) {
        const autoDetected = stealthCheckUseCase?._detectCover?.(subject, sneakingToken);
        if (autoDetected && autoDetected !== 'none') {
          coverState = autoDetected;
          coverSource = 'automatic';
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Cover calculation failed for Sneak action:', e);
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
        if (originalDetectedState !== coverState) {
          isOverride = true;
          coverSource = storedModifier.source || 'dialog';
        }
      } else {
        const overrideData = autoCoverSystem?.consumeCoverOverride?.(
          sneakingToken,
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
      console.warn('PF2E Visioner | Error checking for cover override in Sneak:', e);
    }

    if (!coverState && !isOverride) return undefined;

    return buildAutoCoverDisplay({
      coverState,
      isOverride,
      originalDetectedState,
      coverSource,
    });
  } catch (e) {
    console.error('PF2E Visioner | Error in cover calculation for Sneak action:', e);
    return undefined;
  }
}
