import { SPECIAL_SENSES } from '../../../constants.js';
import { SeekDialogAdapter } from '../../../visibility/auto-visibility/SeekDialogAdapter.js';

export function isVisionSenseType(senseType) {
  const type = String(senseType || '').toLowerCase();
  return (
    type === 'vision' ||
    type === 'sight' ||
    type === 'darkvision' ||
    type === 'greater-darkvision' ||
    type === 'greaterdarkvision' ||
    type === 'low-light-vision' ||
    type === 'lowlightvision' ||
    type === 'light-perception' ||
    type === 'lightperception' ||
    type === 'see-invisibility' ||
    type === 'see-all' ||
    type === 'seeall' ||
    type === 'truesight' ||
    type.includes('vision') ||
    type.includes('sight')
  );
}

function normalizeSenseRange(range) {
  if (range === Infinity || range === 'Infinity') return Infinity;
  return typeof range === 'number' ? range : 0;
}

function collectUsedSenseStats(outcomes = []) {
  const usedStats = new Map();

  for (const outcome of outcomes || []) {
    const type =
      typeof outcome?.usedSenseType === 'string' && outcome.usedSenseType
        ? String(outcome.usedSenseType)
        : null;
    const precision =
      typeof outcome?.usedSensePrecision === 'string'
        ? String(outcome.usedSensePrecision).toLowerCase()
        : null;
    const legacyImpreciseType =
      outcome?.usedImprecise && typeof outcome?.usedImpreciseSenseType === 'string'
        ? String(outcome.usedImpreciseSenseType)
        : null;

    if (type) {
      if (!usedStats.has(type)) usedStats.set(type, { total: 0, precise: 0, imprecise: 0 });
      const stat = usedStats.get(type);
      stat.total += 1;
      if (precision === 'precise') stat.precise += 1;
      else if (precision === 'imprecise') stat.imprecise += 1;
    }

    if (legacyImpreciseType) {
      if (!usedStats.has(legacyImpreciseType)) {
        usedStats.set(legacyImpreciseType, { total: 0, precise: 0, imprecise: 0 });
      }
      const stat = usedStats.get(legacyImpreciseType);
      stat.total += 1;
      stat.imprecise += 1;
    }
  }

  return usedStats;
}

function getSensePriority({ isVision, hasPrecise, hasUnlimitedRange }) {
  if (isVision) return 1;
  if (hasPrecise && hasUnlimitedRange) return 2;
  if (hasPrecise && !hasUnlimitedRange) return 3;
  if (!hasPrecise && hasUnlimitedRange) return 4;
  return 5;
}

export function choosePrimaryUsedSense(allSenses = [], outcomes = []) {
  const usedStats = collectUsedSenseStats(outcomes);
  let chosenUsedType = null;

  if (usedStats.size > 0) {
    const candidates = Array.from(usedStats.entries())
      .filter(([, stats]) => stats.precise > 0 || stats.imprecise > 0)
      .map(([type, stats]) => {
        const range = normalizeSenseRange(allSenses?.find?.((sense) => sense.type === type)?.range);
        const isVision = isVisionSenseType(type);
        const hasPrecise = stats.precise > 0;
        const hasUnlimitedRange = range === Infinity;

        return {
          type,
          stats,
          range,
          isVision,
          hasPrecise,
          hasUnlimitedRange,
          priority: getSensePriority({ isVision, hasPrecise, hasUnlimitedRange }),
        };
      });

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if ((a.priority === 3 || a.priority === 5) && a.range !== b.range) {
        return b.range - a.range;
      }
      return b.stats.total - a.stats.total;
    });

    chosenUsedType = candidates[0]?.type ?? null;
  }

  const annotatedSenses = Array.isArray(allSenses)
    ? allSenses.map((sense) => ({ ...sense, wasUsed: chosenUsedType ? sense.type === chosenUsedType : false }))
    : [];
  const match = annotatedSenses.find((sense) => sense.type === chosenUsedType);

  return {
    allSenses: annotatedSenses,
    activeSenses: chosenUsedType
      ? annotatedSenses.filter((sense) => !sense.isPrecise && sense.type === chosenUsedType)
      : null,
    usedSenseCount: chosenUsedType ? 1 : 0,
    primaryUsedSenseLabel: chosenUsedType ? (match?.config?.label ?? null) : null,
    chosenUsedType,
  };
}

async function getAllSensesForDisplay(actorToken) {
  try {
    const { VisionAnalyzer } = await import(
      '../../../visibility/auto-visibility/VisionAnalyzer.js'
    );
    const visionAnalyzer = VisionAnalyzer.getInstance();
    const adapter = new SeekDialogAdapter(visionAnalyzer);

    return await adapter.getAllSensesForDisplay(actorToken, {
      includeVision: true,
      includeHearing: true,
      includeEcholocation: true,
      filterVisualIfBlinded: true,
      usedSenseType: null,
    });
  } catch (error) {
    console.warn('PF2e Visioner | Error getting sensing summary:', error);
    return [];
  }
}

async function buildSeekFeatBadges(actorToken) {
  try {
    const { FeatsHandler } = await import('../../services/FeatsHandler.js');
    const badges = [];
    const has = (slug) => {
      try {
        return FeatsHandler.hasFeat(actorToken, slug);
      } catch {
        return false;
      }
    };

    if (has('keen-eyes')) {
      badges.push({
        key: 'keen-eyes',
        icon: 'fas fa-eye',
        label: game.i18n.localize('PF2E_VISIONER.BUTTONS.KEEN_EYES'),
        tooltip: game.i18n.localize('PF2E_VISIONER.TOOLTIPS.KEEN_EYES'),
      });
    }

    if (has('thats-odd') || has("that's-odd")) {
      badges.push({
        key: 'thats-odd',
        icon: 'fas fa-exclamation-triangle',
        label: "That's Odd",
        tooltip: game.i18n.localize('PF2E_VISIONER.TOOLTIPS.THAT_FEATURE'),
      });
    }

    return badges;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to build seek feat badges:', error);
    return [];
  }
}

async function buildSuppressedSensesBadge(actorToken) {
  try {
    const { SenseSuppressionRegionBehavior } = await import(
      '../../../regions/SenseSuppressionRegionBehavior.js'
    );
    const document = actorToken?.document;
    const gridSize = canvas.grid.size;
    const seekerPos = {
      x: document.x + (document.width * gridSize) / 2,
      y: document.y + (document.height * gridSize) / 2,
      elevation: document.elevation || 0,
    };
    const suppressed = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver(seekerPos);
    if (!suppressed || suppressed.size === 0) return null;

    const senses = Array.from(suppressed)
      .map((sense) => {
        const label = SPECIAL_SENSES[sense]?.label;
        return label ? game.i18n?.localize?.(label) || sense : sense;
      })
      .join(', ');

    return {
      icon: 'fas fa-ban',
      label: game.i18n.localize('PF2E_VISIONER.BUTTONS.SENSES_SUPPRESSED'),
      tooltip: game.i18n.format('PF2E_VISIONER.TOOLTIPS.SENSES_SUPPRESSED', { senses }),
    };
  } catch {
    return null;
  }
}

export async function buildSeekSenseContext(actorToken, { sourceOutcomes, processedOutcomes } = {}) {
  const allSenses = await getAllSensesForDisplay(actorToken);
  const usedSource =
    Array.isArray(sourceOutcomes) && sourceOutcomes.length ? sourceOutcomes : processedOutcomes || [];
  const selected = choosePrimaryUsedSense(allSenses, usedSource);
  const echolocationSense = selected.allSenses?.find?.((sense) => sense.type === 'echolocation');
  const lifesenseSense = selected.allSenses?.find?.((sense) => sense.type === 'lifesense');
  const suppressedSensesBadge = await buildSuppressedSensesBadge(actorToken);

  return {
    allSenses: selected.allSenses,
    activeSenses: selected.activeSenses,
    usedSenseCount: selected.usedSenseCount,
    primaryUsedSenseLabel: selected.primaryUsedSenseLabel,
    seekFeatBadges: await buildSeekFeatBadges(actorToken),
    ...(suppressedSensesBadge ? { suppressedSensesBadge } : {}),
    echolocationActive: !!echolocationSense,
    echolocationRange: echolocationSense?.range || 0,
    lifesenseActive: !!lifesenseSense,
    lifesenseRange: lifesenseSense?.range || 0,
  };
}
