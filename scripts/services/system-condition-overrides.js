import { MODULE_ID } from '../constants.js';

export const SYSTEM_CONDITION_OVERRIDE_SOURCE = 'system-condition';
export const CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE = 'converted-system-condition';

const SYSTEM_CONDITION_STATES = {
  concealed: 'concealed',
  hidden: 'hidden',
  undetected: 'undetected',
};

const STATE_PRIORITY = { undetected: 3, hidden: 2, concealed: 1 };

function normalizeSlug(value) {
  return String(value ?? '').trim().toLowerCase();
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === 'function') {
    try {
      return Array.from(value.values());
    } catch {
      return [];
    }
  }
  return [];
}

export function isSystemConditionSlug(slug) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_CONDITION_STATES, normalizeSlug(slug));
}

function isStandaloneCondition(condition) {
  try {
    if (condition?.grantedBy) return false;
  } catch {
    /* fall through */
  }
  if (condition?.flags?.pf2e?.grantedBy) return false;
  return true;
}

export function removableSystemConditionItems(actor) {
  return collectionValues(actor?.itemTypes?.condition).filter(
    (condition) => isSystemConditionSlug(condition?.slug) && isStandaloneCondition(condition),
  );
}

export function strongestSystemConditionState(actor) {
  let best = null;
  let bestPriority = 0;
  for (const condition of collectionValues(actor?.itemTypes?.condition)) {
    const state = SYSTEM_CONDITION_STATES[normalizeSlug(condition?.slug)];
    if (!state) continue;
    const priority = STATE_PRIORITY[state];
    if (priority > bestPriority) {
      bestPriority = priority;
      best = state;
    }
  }
  return best;
}

function tokenAlliance(token) {
  return token?.actor?.alliance ?? token?.actor?.system?.details?.alliance ?? null;
}

function dispositionOpposes(a, b) {
  const da = Number(a?.document?.disposition);
  const db = Number(b?.document?.disposition);
  return Number.isFinite(da) && Number.isFinite(db) && da * db < 0;
}

export function resolveEnemyObservers(token, tokens = globalThis.canvas?.tokens?.placeables ?? []) {
  const id = token?.document?.id;
  if (!id) return [];
  const allianceOfToken = tokenAlliance(token);
  return (tokens ?? []).filter((observer) => {
    const observerId = observer?.document?.id;
    if (!observerId || observerId === id) return false;
    const observerAlliance = tokenAlliance(observer);
    if (allianceOfToken && observerAlliance) {
      return (
        observerAlliance !== allianceOfToken &&
        (observerAlliance === 'party' || observerAlliance === 'opposition')
      );
    }
    return dispositionOpposes(observer, token);
  });
}

function defaultIsEnabled() {
  try {
    return !!globalThis.game?.settings?.get?.(MODULE_ID, 'systemConditionOverrides');
  } catch {
    return false;
  }
}

async function defaultGetOverrideData(observer, target) {
  const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
  return AvsOverrideManager.getOverrideData(observer, target);
}

async function defaultApplyOverride(observer, target, state, source = SYSTEM_CONDITION_OVERRIDE_SOURCE) {
  const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
  return AvsOverrideManager.applyOverrides(observer, { target, state }, { source });
}

async function defaultRemoveOverride(observerId, targetId) {
  const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
  return AvsOverrideManager.removeOverride(observerId, targetId);
}

async function defaultRemoveConditionItems(conditions) {
  if (!globalThis.game?.user?.isGM) return;
  for (const condition of conditions) {
    try {
      await condition?.delete?.();
    } catch {
      /* best-effort: another process may have already removed it */
    }
  }
}

export async function syncSystemConditionOverridesForToken(token, deps = {}) {
  const {
    isEnabled = defaultIsEnabled,
    getOverrideData = defaultGetOverrideData,
    applyOverride = defaultApplyOverride,
    removeOverride = defaultRemoveOverride,
    resolveEnemies = resolveEnemyObservers,
    strongestState = strongestSystemConditionState,
    getRemovableConditions = removableSystemConditionItems,
    removeConditions = defaultRemoveConditionItems,
  } = deps;

  const targetId = token?.document?.id;
  if (!targetId || !token.actor) return;

  const state = isEnabled() ? strongestState(token.actor) : null;
  const enemies = resolveEnemies(token);

  // A standalone (GM-applied, not effect-granted) system condition is consumed:
  // converted into a permanent Visioner override and then removed, so the actor-wide
  // condition no longer blocks core detection for observers that should see it.
  const removable = state ? getRemovableConditions(token.actor) : [];
  const consuming = removable.length > 0 && enemies.length > 0;
  const appliedSource = consuming
    ? CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE
    : SYSTEM_CONDITION_OVERRIDE_SOURCE;

  let appliedAny = false;
  for (const observer of enemies) {
    const observerId = observer?.document?.id;
    if (!observerId) continue;
    const existing = await getOverrideData(observer, token);
    const existingSource = existing?.source ?? null;

    if (state) {
      if (
        existing &&
        existingSource !== SYSTEM_CONDITION_OVERRIDE_SOURCE &&
        existingSource !== CONVERTED_SYSTEM_CONDITION_OVERRIDE_SOURCE
      ) {
        continue;
      }
      await applyOverride(observer, token, state, appliedSource);
      appliedAny = true;
    } else if (existingSource === SYSTEM_CONDITION_OVERRIDE_SOURCE) {
      await removeOverride(observerId, targetId);
    }
  }

  if (consuming && appliedAny) {
    await removeConditions(removable);
  }
}

function tokensForActor(actor) {
  try {
    const tokens = actor?.getActiveTokens?.(true, false) ?? actor?.getActiveTokens?.() ?? [];
    return collectionValues(tokens);
  } catch {
    return [];
  }
}

export async function handleConditionItemChange(item, deps = {}) {
  const { sync = syncSystemConditionOverridesForToken } = deps;
  if (item?.type !== 'condition' || !isSystemConditionSlug(item?.slug)) return;
  for (const token of tokensForActor(item.actor)) {
    if (token?.document?.id) await sync(token);
  }
}

export async function handleTokenCreatedForSystemConditions(tokenDoc, deps = {}) {
  const {
    getSceneTokens = () => globalThis.canvas?.tokens?.placeables ?? [],
    strongestState = strongestSystemConditionState,
    isEnemyOf = (candidate, viewer) =>
      resolveEnemyObservers(candidate, [candidate, viewer]).some(
        (t) => t?.document?.id === viewer?.document?.id,
      ),
    sync = syncSystemConditionOverridesForToken,
  } = deps;

  const newToken = tokenDoc?.object ?? tokenDoc;
  if (!newToken?.document?.id) return;

  for (const candidate of getSceneTokens()) {
    if (candidate?.document?.id === newToken.document.id) continue;
    if (!candidate?.actor || !strongestState(candidate.actor)) continue;
    if (isEnemyOf(candidate, newToken)) await sync(candidate);
  }
}
