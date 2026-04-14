import { LevelsIntegration } from '../services/LevelsIntegration.js';
import { getLogger } from '../utils/logger.js';
import { getVisibilityBetween, getVisibilityMap } from '../stores/visibility-map.js';

const log = getLogger('AVS/ControlDebug');

function summarizeToken(token) {
  if (!token?.document?.id) return null;

  const levelsIntegration = LevelsIntegration.getInstance();
  const visionPosition = levelsIntegration.getTokenPosition(token, { origin: 'vision' });

  return {
    id: token.document.id,
    name: token.name ?? token.document.name ?? token.document.id,
    level: levelsIntegration.getTokenLevelId(token),
    elevation: visionPosition.elevation,
    position: { x: visionPosition.x, y: visionPosition.y },
  };
}

function summarizePair(observerSummary, pair) {
  const target = pair?.target;
  return [
    `${observerSummary?.name ?? observerSummary?.id ?? 'unknown'}`,
    `[${observerSummary?.level ?? 'none'}]`,
    `->`,
    `${target?.name ?? target?.id ?? 'unknown'}`,
    `[${target?.level ?? 'none'}]`,
    `=`,
    `${pair?.observerToTarget ?? 'unknown'}`,
    `; reverse=`,
    `${pair?.targetToObserver ?? 'unknown'}`,
  ].join('');
}

export function logControlTokenVisibilitySnapshot(token, phase = 'immediate') {
  if (!log.enabled()) return;

  const controlledIds = canvas?.tokens?.controlled?.map?.((t) => t?.document?.id).filter(Boolean) ?? [];
  if (!token?.document?.id) {
    log.debug(() => ({
      msg: 'control-visibility-snapshot',
      phase,
      observer: null,
      controlledIds,
    }));
    return;
  }

  const observerSummary = summarizeToken(token);
  const observerMap = getVisibilityMap(token);

  const pairs = (canvas?.tokens?.placeables ?? [])
    .filter((other) => other?.document?.id && other.document.id !== token.document.id)
    .map((other) => ({
      target: summarizeToken(other),
      observerToTarget: observerMap[other.document.id] ?? 'observed',
      targetToObserver: getVisibilityBetween(other, token),
    }));
  const pairSummaries = pairs.slice(0, 10).map((pair) => summarizePair(observerSummary, pair));
  const firstPair = pairs[0] ?? null;

  log.debug(() => ({
    msg: 'control-visibility-snapshot',
    phase,
    observerId: observerSummary.id,
    observerName: observerSummary.name,
    observerLevel: observerSummary.level,
    observerElevation: observerSummary.elevation,
    observer: observerSummary,
    controlledIds,
    pairCount: pairs.length,
    pairSummary: pairSummaries[0] ?? null,
    pairSummaries,
    firstTargetId: firstPair?.target?.id ?? null,
    firstTargetName: firstPair?.target?.name ?? null,
    firstTargetLevel: firstPair?.target?.level ?? null,
    firstObserverToTarget: firstPair?.observerToTarget ?? null,
    firstTargetToObserver: firstPair?.targetToObserver ?? null,
    pairs,
  }));
}
