import { MODULE_ID, getVisibilityStateLabelKey } from '../../../../constants.js';
import { SeekDialogAdapter } from '../../../../visibility/auto-visibility/SeekDialogAdapter.js';
import { buildSeekWallMetadata, getSeekWallCurrentVisibility } from './seek-wall-subjects.js';

async function loadSharedUtils(deps) {
  if (deps.extractStealthDC && deps.determineOutcome && deps.isTokenWithinTemplate) {
    return deps;
  }

  const shared = await import('../../infra/shared-utils.js');
  return {
    extractStealthDC: deps.extractStealthDC || shared.extractStealthDC,
    determineOutcome: deps.determineOutcome || shared.determineOutcome,
    isTokenWithinTemplate: deps.isTokenWithinTemplate || shared.isTokenWithinTemplate,
  };
}

async function loadFeatsHandler(deps) {
  if (Object.prototype.hasOwnProperty.call(deps, 'featsHandler')) return deps.featsHandler;

  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    return FeatsHandler;
  } catch {
    return null;
  }
}

async function loadVisibilityDeps(deps) {
  const getVisibilityBetween =
    deps.getVisibilityBetween || (await import('../../../../utils.js')).getVisibilityBetween;
  const getDefaultNewStateFor =
    deps.getDefaultNewStateFor ||
    (await import('../../data/action-state-config.js')).getDefaultNewStateFor;

  return { getVisibilityBetween, getDefaultNewStateFor };
}

async function loadVisionAnalyzer(deps) {
  if (Object.prototype.hasOwnProperty.call(deps, 'visionAnalyzer')) return deps.visionAnalyzer;

  try {
    const { VisionAnalyzer } = await import(
      '../../../../visibility/auto-visibility/VisionAnalyzer.js'
    );
    return VisionAnalyzer.getInstance();
  } catch {
    return null;
  }
}

function getRollTotal(actionData) {
  return Number(actionData?.roll?.total ?? 0);
}

function getDieResult(actionData) {
  return Number(
    actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ??
      0,
  );
}

function getObserverToken(actionData) {
  return actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
}

function recordSenseUsed(deps, senseType, precision) {
  if (senseType) deps.recordSenseUsed?.(senseType, precision);
}

function buildBlockedOutcome(subject, current, actionData, dc, outcome, extra = {}) {
  const total = getRollTotal(actionData);
  const die = getDieResult(actionData);

  return {
    target: subject,
    dc,
    roll: total,
    die,
    rollTotal: total,
    dieResult: die,
    margin: total - dc,
    outcome,
    currentVisibility: current,
    oldVisibility: current,
    newVisibility: current,
    changed: false,
    ...extra,
  };
}

async function getCurrentVisibility(actionData, subject, deps) {
  if (subject?._isWall) {
    return deps.getSeekWallCurrentVisibility
      ? deps.getSeekWallCurrentVisibility(actionData, subject)
      : getSeekWallCurrentVisibility(actionData, subject);
  }

  return deps.getVisibilityBetween(getObserverToken(actionData), subject);
}

function hasAnomalyAutoDetection(featsHandler, actionData, subject) {
  const isAnomaly = !!(
    subject?._isWall ||
    subject?.actor?.type === 'hazard' ||
    subject?.actor?.type === 'loot'
  );
  return !!(isAnomaly && featsHandler?.hasFeat?.(actionData.actor, ['thats-odd', "that's-odd"]));
}

function getMinimumPerceptionRankBlock(actionData, subject, current, extractStealthDC) {
  try {
    if (!subject?.actor || (subject.actor.type !== 'hazard' && subject.actor.type !== 'loot')) {
      return null;
    }

    const minRank = Number(subject.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
    if (!Number.isFinite(minRank) || minRank <= 0) return null;

    const stat = actionData.actor?.actor?.getStatistic?.('perception');
    const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
    if (Number.isFinite(seekerRank) && seekerRank >= minRank) return null;

    const dc = extractStealthDC(subject) || 0;
    return buildBlockedOutcome(subject, current, actionData, dc, 'no-proficiency', {
      noProficiency: true,
    });
  } catch {
    return null;
  }
}

async function determineSenseResult(actionData, subject, deps) {
  if (subject?._isWall) {
    recordSenseUsed(deps, 'vision', 'precise');
    return {
      usedSenseType: 'vision',
      usedSensePrecision: 'precise',
      usedImprecise: false,
      usedImpreciseSenseType: null,
      usedImpreciseSenseRange: null,
    };
  }

  try {
    const visionAnalyzer = await loadVisionAnalyzer(deps);
    if (!visionAnalyzer) return {};

    const adapter = deps.createSeekDialogAdapter
      ? deps.createSeekDialogAdapter(visionAnalyzer)
      : new SeekDialogAdapter(visionAnalyzer);
    const senseResult = await adapter.determineSenseUsed(getObserverToken(actionData), subject);
    const usedSenseType = senseResult.senseType || null;
    const usedSensePrecision = senseResult.precision || null;
    recordSenseUsed(deps, usedSenseType, usedSensePrecision);

    if (senseResult.canDetect && senseResult.precision === 'imprecise') {
      return {
        usedSenseType,
        usedSensePrecision,
        usedImprecise: true,
        usedImpreciseSenseType: senseResult.senseType,
        usedImpreciseSenseRange: senseResult.range,
      };
    }

    if (senseResult.canDetect) {
      return { usedSenseType, usedSensePrecision };
    }

    if (senseResult.unmetCondition) {
      return {
        usedSenseType,
        usedSensePrecision,
        blockedOutcome: {
          outcome: 'unmet-conditions',
          unmetConditions: true,
          unmetCondition: senseResult.reason,
          senseType: senseResult.senseType,
          senseRange: senseResult.range,
        },
      };
    }

    if (senseResult.outOfRange) {
      return {
        usedSenseType,
        usedSensePrecision,
        impreciseReason: 'out-of-range',
        impreciseSenseType: senseResult.senseType,
        impreciseSenseRange: senseResult.range,
      };
    }

    if (senseResult.reason) {
      return {
        usedSenseType,
        usedSensePrecision,
        impreciseReason: 'unmet-conditions',
        impreciseSenseType: senseResult.senseType,
        impreciseSenseRange: senseResult.range,
        impreciseUnmet: senseResult.reason,
      };
    }

    return { usedSenseType, usedSensePrecision };
  } catch (error) {
    console.warn('Error determining sense used for seek:', error);
    return {};
  }
}

async function enforcePreciseSenseObservedLimit(actionData, subject, newVisibility, deps) {
  if (subject?._isWall || newVisibility !== 'observed') return newVisibility;

  try {
    const visionAnalyzer = await loadVisionAnalyzer(deps);
    if (!visionAnalyzer) return newVisibility;

    const observerToken = getObserverToken(actionData);
    const visCaps = visionAnalyzer.getVisionCapabilities(observerToken);
    const hasLoS = visionAnalyzer.hasLineOfSight?.(observerToken, subject, true) ?? true;
    const hasVisualPrecise = !!(visCaps?.hasVision && !visCaps?.isBlinded && hasLoS);
    const hasNonVisualPrecise = visionAnalyzer.hasPreciseNonVisualInRange(observerToken, subject);
    const sensingSummaryForOutcome = visionAnalyzer.getVisionCapabilities(observerToken).sensingSummary;
    const hasPreciseNonVisualFromSummary = sensingSummaryForOutcome.precise?.some((sense) => {
      const type = String(sense.type || '').toLowerCase();
      const isVisual =
        type === 'vision' || type === 'sight' || type.includes('vision') || type.includes('sight');
      return !isVisual && sense.range > 0;
    });

    return hasVisualPrecise || hasNonVisualPrecise || hasPreciseNonVisualFromSummary
      ? newVisibility
      : 'hidden';
  } catch {
    return newVisibility;
  }
}

async function buildWallMetadata(subject, deps) {
  if (!subject?._isWall) return {};
  if (deps.buildSeekWallMetadata) return deps.buildSeekWallMetadata(subject);
  return buildSeekWallMetadata(subject);
}

function buildBaseOutcome(actionData, subject, data) {
  return {
    target: subject._isWall ? actionData.actor : subject,
    dc: data.dc,
    roll: data.total,
    die: data.die,
    rollTotal: data.total,
    dieResult: data.die,
    margin: data.total - data.dc,
    outcome: data.outcome,
    currentVisibility: data.current,
    oldVisibility: data.current,
    oldVisibilityLabel: getVisibilityStateLabelKey(data.current, { manual: true }) || data.current,
    newVisibility: data.newVisibility,
    changed: data.newVisibility !== data.current,
    usedImprecise: !!data.sense.usedImprecise,
    usedImpreciseSenseType: data.sense.usedImpreciseSenseType || null,
    usedImpreciseSenseRange: data.sense.usedImpreciseSenseRange ?? null,
    usedSenseType: data.sense.usedSenseType || null,
    usedSensePrecision: data.sense.usedSensePrecision || null,
    unmetConditions:
      data.sense.impreciseReason === 'unmet-conditions' ? true : undefined,
    outOfRange: data.sense.impreciseReason === 'out-of-range' ? true : undefined,
    senseType: data.sense.impreciseSenseType,
    senseRange: data.sense.impreciseSenseRange,
    unmetCondition: data.sense.impreciseUnmet,
    ...data.wallMeta,
  };
}

async function applyTemplateFilter(actionData, subject, base, deps) {
  try {
    if (!actionData.seekTemplateCenter || !actionData.seekTemplateRadiusFeet) return base;

    const target = subject?._isWall ? subject.wall : subject;
    const inside = deps.isTokenWithinTemplate(
      actionData.seekTemplateCenter,
      actionData.seekTemplateRadiusFeet,
      target,
      actionData.seekTemplateType || 'circle',
      actionData.messageId,
      actionData.actorToken?.id || actionData.actor?.id,
    );

    return inside ? base : { ...base, changed: false };
  } catch {
    return base;
  }
}

export async function analyzeSeekOutcome(actionData, subject, deps = {}) {
  const shared = await loadSharedUtils(deps);
  const visibility = await loadVisibilityDeps(deps);
  const featsHandler = await loadFeatsHandler(deps);
  const current = await getCurrentVisibility(actionData, subject, {
    ...deps,
    ...visibility,
  });
  const thatsOddAuto = hasAnomalyAutoDetection(featsHandler, actionData, subject);

  let dc = subject?._isWall ? Number(subject.dc) || 15 : shared.extractStealthDC(subject);
  if (!subject?._isWall && !thatsOddAuto) {
    const blocked = getMinimumPerceptionRankBlock(
      actionData,
      subject,
      current,
      shared.extractStealthDC,
    );
    if (blocked) return blocked;
  }

  const total = getRollTotal(actionData);
  const die = getDieResult(actionData);
  const outcome = shared.determineOutcome(total, die, dc);
  let newVisibility = visibility.getDefaultNewStateFor('seek', current, outcome) || current;

  try {
    newVisibility =
      featsHandler?.adjustVisibility?.('seek', actionData.actor, current, newVisibility, {
        subjectType: subject?._isWall ? 'wall' : subject?.actor?.type,
        isHiddenWall: !!subject?._isWall,
        outcome,
      }) ?? newVisibility;
  } catch { }

  const sense = await determineSenseResult(actionData, subject, deps);
  if (sense.blockedOutcome) {
    const dcBlocked = shared.extractStealthDC(subject) || 0;
    return buildBlockedOutcome(
      subject,
      current,
      actionData,
      dcBlocked,
      sense.blockedOutcome.outcome,
      {
        unmetConditions: sense.blockedOutcome.unmetConditions,
        unmetCondition: sense.blockedOutcome.unmetCondition,
        senseType: sense.blockedOutcome.senseType,
        senseRange: sense.blockedOutcome.senseRange,
      },
    );
  }

  if (!subject?._isWall && !sense.usedSenseType && !sense.usedImprecise) {
    newVisibility = current;
  }

  if (subject?._isWall && (outcome === 'success' || outcome === 'critical-success')) {
    newVisibility = 'observed';
  }

  newVisibility = await enforcePreciseSenseObservedLimit(
    actionData,
    subject,
    newVisibility,
    deps,
  );

  const wallMeta = await buildWallMetadata(subject, deps);
  const base = buildBaseOutcome(actionData, subject, {
    dc,
    total,
    die,
    outcome,
    current,
    newVisibility,
    sense,
    wallMeta,
  });

  if (thatsOddAuto) {
    const forced = {
      ...base,
      outcome: 'success',
      newVisibility: 'observed',
      changed: current !== 'observed',
      autoDetected: true,
      autoReason: "that's-odd",
    };
    if (subject?._isWall) forced.overrideState = 'observed';
    return forced;
  }

  return applyTemplateFilter(actionData, subject, base, {
    ...deps,
    ...shared,
  });
}
