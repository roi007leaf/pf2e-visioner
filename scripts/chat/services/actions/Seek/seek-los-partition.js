async function loadVisionAnalyzer(provided) {
  if (Object.prototype.hasOwnProperty.call(provided, 'visionAnalyzer')) {
    return provided.visionAnalyzer;
  }

  if (typeof provided.getVisionAnalyzer === 'function') {
    return provided.getVisionAnalyzer();
  }

  try {
    const { VisionAnalyzer } = await import(
      '../../../../visibility/auto-visibility/VisionAnalyzer.js'
    );
    return VisionAnalyzer.getInstance();
  } catch {
    return null;
  }
}

function hasConfiguredStealthDc(target) {
  const configuredDC = Number(target?.document?.getFlag?.('pf2e-visioner', 'stealthDC')) || 0;
  return configuredDC > 0;
}

function hasSameAlliance(observer, target) {
  const observerAlliance = observer?.actor?.alliance ?? observer?.actor?.system?.details?.alliance;
  const targetAlliance = target?.actor?.alliance ?? target?.actor?.system?.details?.alliance;
  return !!observerAlliance && !!targetAlliance && observerAlliance === targetAlliance;
}

function shouldApplySeekChangeImmediately(change, outcome, observer, visionAnalyzer) {
  if (change.wallId || outcome?._isWall) return true;

  const targetActorType = change.target?.actor?.type?.toLowerCase();
  if (targetActorType === 'loot' && !hasConfiguredStealthDc(change.target)) return true;
  if (targetActorType === 'hazard' && (!outcome?.dc || outcome.dc <= 0)) return true;
  if (hasSameAlliance(observer, change.target)) return true;
  if (!visionAnalyzer || !change.target) return true;
  if (change.newVisibility !== 'observed') return true;

  return visionAnalyzer.hasLineOfSight(observer, change.target) !== false;
}

export async function partitionSeekChangesByLOS(actionData, changes, outcomes, deps = {}) {
  const immediateChanges = [];
  const deferredResults = [];
  const visionAnalyzer = await loadVisionAnalyzer(deps);
  const observer = actionData.actorToken || actionData.actor;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const outcome = outcomes[i];

    if (shouldApplySeekChangeImmediately(change, outcome, observer, visionAnalyzer)) {
      immediateChanges.push(change);
      continue;
    }

    deferredResults.push({
      targetId: change.target?.document?.id,
      newVisibility: change.newVisibility,
      oldVisibility: change.oldVisibility,
      outcome: outcome?.outcome,
    });
  }

  return { immediateChanges, deferredResults };
}
