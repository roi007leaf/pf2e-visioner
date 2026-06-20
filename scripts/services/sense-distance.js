import { calculateRealDistanceInFeet } from '../helpers/geometry-utils.js';
import { applyActiveSceneHearingRangeLimit } from './scene-hearing-range.js';

function tokenDocOf(tokenOrDoc) {
  return tokenOrDoc?.document || tokenOrDoc || null;
}

function actorOf(tokenOrDoc) {
  return tokenOrDoc?.actor || tokenDocOf(tokenOrDoc)?.actor || null;
}

let actorConditionSlugCache = new WeakMap();

export function clearActorConditionSlugCache(tokenOrActor = null) {
  if (!tokenOrActor) {
    actorConditionSlugCache = new WeakMap();
    return;
  }

  const actor = actorOf(tokenOrActor) || tokenOrActor;
  if (actor && (typeof actor === 'object' || typeof actor === 'function')) {
    actorConditionSlugCache.delete(actor);
  }
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection === 'object') return Object.values(collection);
  return [];
}

export function actorHasConditionSlug(actor, slug) {
  if (!actor || !slug) return false;
  const normalizedSlug = String(slug).toLowerCase();
  if (typeof actor !== 'object' && typeof actor !== 'function') return false;

  const cached = actorConditionSlugCache.get(actor);
  if (cached?.has(normalizedSlug)) return cached.get(normalizedSlug);

  const result = actorHasConditionSlugUncached(actor, normalizedSlug);
  const actorCache = cached || new Map();
  actorCache.set(normalizedSlug, result);
  actorConditionSlugCache.set(actor, actorCache);
  return result;
}

function actorHasConditionSlugUncached(actor, normalizedSlug) {
  try {
    if (actor.hasCondition?.(normalizedSlug)) return true;
  } catch {}

  if (actor.system?.conditions?.[normalizedSlug]?.active) return true;
  if (actor.conditions?.has?.(normalizedSlug)) return true;

  const conditionItems = [
    ...collectionValues(actor.itemTypes?.condition),
    ...collectionValues(actor.itemTypes?.effect),
    ...collectionValues(actor.items),
  ];
  return conditionItems.some((item) => {
    const itemSlug = String(item?.slug ?? item?.system?.slug ?? '').toLowerCase();
    const itemName = String(item?.name ?? '').toLowerCase();
    return itemSlug === normalizedSlug || itemName === normalizedSlug;
  });
}

export function explicitHearingRange(actor) {
  const senses = actor?.system?.perception?.senses;
  const candidates = [];

  if (Array.isArray(senses)) {
    candidates.push(...senses.filter((sense) => sense?.type === 'hearing'));
  } else if (senses && typeof senses === 'object') {
    candidates.push(senses.hearing, senses.value?.hearing);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const range = Number(candidate.range ?? candidate.value?.range ?? candidate.distance);
    if (Number.isFinite(range)) return range;
  }

  return null;
}

export function effectiveHearingRange(range = null) {
  return applyActiveSceneHearingRangeLimit(range) ?? Infinity;
}

export function calculateHearingDistanceInFeet(observer, target, gridSize) {
  return calculateRealDistanceInFeet(observer, target, gridSize);
}

export function hearingRangeCanReach(hearingRange, hearingDistanceInFeet) {
  return hearingRange > 0 &&
    (!Number.isFinite(hearingRange) || hearingRange >= hearingDistanceInFeet);
}

function hasListedHearing(sensingSummary) {
  return Array.isArray(sensingSummary?.imprecise) &&
    sensingSummary.imprecise.some((sense) => sense?.type === 'hearing');
}

export function createDefaultHearingSense(capabilities, sensingSummary = {}) {
  if (capabilities?.isDeafened !== false || sensingSummary?.hearing || hasListedHearing(sensingSummary)) {
    return null;
  }

  return {
    acuity: 'imprecise',
    range: effectiveHearingRange(null),
  };
}

export function hearingSenseForVisibility(capabilities, hearingDistanceInFeet) {
  const sensingSummary = capabilities?.sensingSummary || {};

  if (sensingSummary.hearing) {
    const hearingRange = effectiveHearingRange(sensingSummary.hearing.range ?? Infinity);
    return hearingRangeCanReach(hearingRange, hearingDistanceInFeet)
      ? { range: hearingRange }
      : null;
  }

  const defaultHearing = createDefaultHearingSense(capabilities, sensingSummary);
  if (!defaultHearing) return null;
  return hearingRangeCanReach(defaultHearing.range, hearingDistanceInFeet)
    ? { range: defaultHearing.range }
    : null;
}

export function observerCanHearTarget(observer, target, { gridSize } = {}) {
  const actor = actorOf(observer);
  if (actorHasConditionSlug(actor, 'deafened')) return false;

  const hearingRange = effectiveHearingRange(explicitHearingRange(actor));
  if (hearingRange === 0) return false;
  if (!Number.isFinite(hearingRange)) return true;

  const distance = calculateHearingDistanceInFeet(observer, target, gridSize);
  return hearingRange >= distance;
}
