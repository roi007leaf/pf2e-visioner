import { PredicateHelper } from '../PredicateHelper.js';
import {
  actorHasFeature,
  getActorItems,
  getActorLevel,
  normalizeSlug,
  resolveActor,
} from '../../utils/actor-features.js';

const VISIBILITY_OFF_GUARD_STATES = ['hidden', 'undetected'];
const STARSONG_NECTAR_SLUGS = new Set(['effect-starsong-nectar']);

function asFiniteLevel(value) {
  if (typeof value === 'boolean') return null;
  const level = Number(value);
  return Number.isFinite(level) ? level : null;
}

function getFlankingOffGuardableLevel(actor) {
  const flanking = actor?.system?.attributes?.flanking ?? actor?.attributes?.flanking ?? {};
  return asFiniteLevel(flanking.flatFootable) ?? asFiniteLevel(flanking.offGuardable);
}

function hasNativeDenyAdvantageAgainst(token, sourceToken) {
  const actor = resolveActor(token);
  const attackerLevel = getActorLevel(sourceToken);
  const flatFootableLevel = getFlankingOffGuardableLevel(actor);
  return (
    Number.isFinite(flatFootableLevel) &&
    attackerLevel !== null &&
    attackerLevel <= flatFootableLevel
  );
}

function getItemSlug(item) {
  return normalizeSlug(item?.system?.slug ?? item?.slug ?? item?.name);
}

function actorHasLegacyDenyAdvantage(token) {
  const actor = resolveActor(token);
  return getActorItems(actor).some((item) => {
    if (item?.type !== 'feat' && item?.system?.actionType?.value !== 'passive') return false;
    return /^deny-advantage-level-\d+$/.test(getItemSlug(item));
  });
}

function hasDenyAdvantage(token) {
  return actorHasFeature(token, 'deny-advantage') || actorHasLegacyDenyAdvantage(token);
}

function hasStarsongNectarEffect(token) {
  const actor = resolveActor(token);
  return getActorItems(actor).some((item) => {
    if (item?.type !== 'effect') return false;
    return STARSONG_NECTAR_SLUGS.has(getItemSlug(item));
  });
}

function hasOffGuardImmunity(token) {
  const actor = resolveActor(token);
  if (!actor) return false;
  try {
    if (typeof actor.isImmuneTo === 'function' && actor.isImmuneTo('off-guard')) return true;
  } catch (_) { }

  const immunities = [
    ...(Array.isArray(actor?.attributes?.immunities) ? actor.attributes.immunities : []),
    ...(Array.isArray(actor?.system?.attributes?.immunities)
      ? actor.system.attributes.immunities
      : []),
  ];
  if (
    immunities.some((immunity) =>
      ['type', 'slug', 'key', 'value', 'name'].some(
        (field) => normalizeSlug(immunity?.[field]) === 'off-guard',
      ),
    )
  ) {
    return true;
  }

  return getActorItems(actor).some((item) =>
    (Array.isArray(item?.system?.rules) ? item.system.rules : []).some(
      (rule) => normalizeSlug(rule?.key) === 'immunity' && normalizeSlug(rule?.type) === 'off-guard',
    ),
  );
}

function getTokenDocument(tokenOrDocument) {
  if (typeof tokenOrDocument?.document?.getFlag === 'function') return tokenOrDocument.document;
  if (typeof tokenOrDocument?.getFlag === 'function') return tokenOrDocument;
  return null;
}

function tokenTraceData(tokenOrDocument) {
  const actor = resolveActor(tokenOrDocument);
  const document = getTokenDocument(tokenOrDocument);
  return {
    tokenId: tokenOrDocument?.id ?? tokenOrDocument?.document?.id ?? null,
    documentId: document?.id ?? null,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorType: actor?.type ?? null,
    actorSignature: actor?.signature ?? null,
    actorLevel: getActorLevel(tokenOrDocument),
    flatFootable: actor?.system?.attributes?.flanking?.flatFootable ?? null,
    offGuardable: actor?.system?.attributes?.flanking?.offGuardable ?? null,
    hasTokenDocument: !!document,
  };
}

export class OffGuardSuppression {
  static async applyOffGuardSuppression(operation, subjectToken) {
    const subjectDocument = getTokenDocument(subjectToken);
    if (!subjectDocument) return;

    const { suppressedStates = [], source, priority = 100, predicate } = operation;

    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(subjectToken);
      const predicateResult = PredicateHelper.evaluate(predicate, rollOptions);
      if (!predicateResult) {
        return;
      }
    }

    if (!Array.isArray(suppressedStates) || suppressedStates.length === 0) {
      console.warn('PF2E Visioner | offGuardSuppression requires suppressedStates array');
      return;
    }

    const suppressionData = {
      id: source || `off-guard-suppression-${Date.now()}`,
      type: source,
      priority,
      suppressedStates,
    };

    await subjectDocument.setFlag(
      'pf2e-visioner',
      `offGuardSuppression.${suppressionData.id}`,
      suppressionData,
    );
  }

  static async removeOffGuardSuppression(operation, subjectToken) {
    const subjectDocument = getTokenDocument(subjectToken);
    if (!subjectDocument) return;

    const { source } = operation;
    const suppressions = subjectDocument.getFlag('pf2e-visioner', 'offGuardSuppression') || {};

    if (suppressions[source]) {
      await subjectDocument.unsetFlag('pf2e-visioner', `offGuardSuppression.${source}`);
    }
  }

  static shouldSuppressOffGuardForState(token, visibilityState, sourceToken = null) {
    if (!token || !visibilityState) return false;

    const decision = this.getOffGuardSuppressionDecision(token, visibilityState, sourceToken);

    return decision.result;
  }

  static getOffGuardSuppressionDecision(token, visibilityState, sourceToken = null) {
    const state = String(visibilityState ?? '').toLowerCase();
    const document = getTokenDocument(token);
    const suppressions = document?.getFlag?.('pf2e-visioner', 'offGuardSuppression') || {};
    const suppressionArray = Object.values(suppressions);
    const blindFight = actorHasFeature(token, 'blind-fight');
    const denyAdvantage = hasDenyAdvantage(token);
    const starsongNectar = hasStarsongNectarEffect(token);
    const offGuardImmune = hasOffGuardImmunity(token);
    const nativeDenyAdvantage =
      denyAdvantage && hasNativeDenyAdvantageAgainst(token, sourceToken);
    const defenderLevel = getActorLevel(token);
    const attackerLevel = getActorLevel(sourceToken);
    const levelQualifies =
      defenderLevel !== null && attackerLevel !== null && attackerLevel <= defenderLevel;

    const explicitSuppression = suppressionArray.some((suppression) =>
      suppression.suppressedStates?.includes(state),
    );
    const offGuardImmunitySuppression = offGuardImmune && VISIBILITY_OFF_GUARD_STATES.includes(state);
    const blindFightSuppression = blindFight && state === 'hidden';
    const denyAdvantageSuppression =
      VISIBILITY_OFF_GUARD_STATES.includes(state) &&
      (denyAdvantage || nativeDenyAdvantage) &&
      (nativeDenyAdvantage || levelQualifies);
    const starsongNectarSuppression = state === 'undetected' && starsongNectar;
    const result =
      explicitSuppression ||
      offGuardImmunitySuppression ||
      blindFightSuppression ||
      denyAdvantageSuppression ||
      starsongNectarSuppression;
    let source = null;
    if (offGuardImmunitySuppression) source = 'off-guard-immunity';
    else if (denyAdvantageSuppression) source = 'deny-advantage';
    else if (starsongNectarSuppression) source = 'starsong-nectar';
    else if (blindFightSuppression) source = 'blind-fight';
    else if (explicitSuppression) source = 'rule-element';

    return {
      state,
      result,
      source,
      explicitSuppression,
      blindFight,
      blindFightSuppression,
      denyAdvantage,
      starsongNectar,
      offGuardImmune,
      offGuardImmunitySuppression,
      nativeDenyAdvantage,
      denyAdvantageSuppression,
      starsongNectarSuppression,
      defenderLevel,
      attackerLevel,
      suppressionIds: suppressionArray.map((suppression) => suppression?.id ?? null),
    };
  }

  static getSuppressedStates(token) {
    const document = getTokenDocument(token);
    if (!document) return [];

    const suppressions = document.getFlag('pf2e-visioner', 'offGuardSuppression') || {};
    const allSuppressedStates = new Set();

    Object.values(suppressions).forEach((suppression) => {
      if (Array.isArray(suppression.suppressedStates)) {
        suppression.suppressedStates.forEach((state) => allSuppressedStates.add(state));
      }
    });

    return Array.from(allSuppressedStates);
  }
}
