import { getActiveSceneHearingRange } from '../../../services/scene-hearing-range.js';

function normalizeCacheKeyNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function getSceneCacheId() {
  return String(globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? 'none');
}

function getSceneHearingRangeCacheKey() {
  const range = getActiveSceneHearingRange();
  return range === null ? 'none' : normalizeCacheKeyNumber(range);
}

function stableNormalize(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';

  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.map((entry) => stableNormalize(entry, seen));
    seen.delete(value);
    return normalized;
  }

  if (value instanceof Set) {
    const normalized = Array.from(value, (entry) => stableNormalize(entry, seen)).sort();
    seen.delete(value);
    return normalized;
  }

  if (value instanceof Map) {
    const normalized = Array.from(value.entries())
      .map(([key, entry]) => [String(key), stableNormalize(entry, seen)])
      .sort(([a], [b]) => a.localeCompare(b));
    seen.delete(value);
    return normalized;
  }

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (typeof value[key] === 'function') continue;
    normalized[key] = stableNormalize(value[key], seen);
  }
  seen.delete(value);
  return normalized;
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

function senseDataObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizePreparedSenseEntry(type, sense) {
  const senseObject = senseDataObject(sense);
  if (!senseObject) {
    return {
      key: String(type ?? ''),
      type: type ?? null,
      value: sense ?? null,
    };
  }

  const value = senseDataObject(senseObject.value);
  const source = senseDataObject(senseObject.source);
  const data = value ?? senseObject;
  const resolvedType =
    data?.type ??
    senseObject.type ??
    senseObject.slug ??
    senseObject.id ??
    senseObject.key ??
    source?.type ??
    type ??
    null;

  return {
    key: String(type ?? senseObject.key ?? resolvedType ?? ''),
    type: resolvedType,
    acuity: data?.acuity ?? senseObject.acuity ?? source?.acuity ?? null,
    range: data?.range ?? senseObject.range ?? source?.range ?? null,
    source: data?.source ?? source?.source ?? null,
  };
}

function normalizePreparedSensesForSignature(senses) {
  if (!senses) return null;

  const entries = [];
  const addEntry = (type, sense) => {
    entries.push(normalizePreparedSenseEntry(type, sense));
  };

  if (Array.isArray(senses)) {
    senses.forEach((sense, index) => addEntry(sense?.type ?? sense?.key ?? index, sense));
  } else if (Array.isArray(senses.contents)) {
    senses.contents.forEach((sense, index) => addEntry(sense?.type ?? sense?.key ?? index, sense));
  } else if (typeof senses.entries === 'function') {
    try {
      for (const [type, sense] of senses.entries()) addEntry(type, sense);
    } catch {
      // Fall through to other collection shapes.
    }
  }

  if (entries.length === 0 && typeof senses.values === 'function') {
    try {
      for (const sense of senses.values()) addEntry(sense?.type ?? sense?.key, sense);
    } catch {
      // Fall through to other collection shapes.
    }
  }

  if (entries.length === 0 && typeof senses[Symbol.iterator] === 'function') {
    try {
      for (const entry of senses) {
        if (Array.isArray(entry) && entry.length >= 2) {
          addEntry(entry[0], entry[1]);
        } else {
          addEntry(entry?.type ?? entry?.key, entry);
        }
      }
    } catch {
      // Fall through to object values.
    }
  }

  if (entries.length === 0 && typeof senses === 'object') {
    for (const [type, sense] of Object.entries(senses)) addEntry(type, sense);
  }

  return entries
    .map((entry) => stableNormalize(entry))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function buildPreparedSensesSignature(actorOrSenses) {
  const senses = actorOrSenses?.perception?.senses ?? actorOrSenses;
  return stableStringify(normalizePreparedSensesForSignature(senses));
}

function getActorConditions(actor) {
  const entries = [];
  const addCondition = (condition) => {
    if (!condition) return;
    const value =
      condition.slug ||
      condition.system?.slug ||
      condition.name ||
      condition.id ||
      condition._id ||
      condition;
    if (value != null) entries.push(String(value).toLowerCase());
  };

  for (const condition of actor?.itemTypes?.condition || []) {
    addCondition(condition);
  }

  const actorConditions = actor?.conditions;
  if (actorConditions) {
    if (Array.isArray(actorConditions)) {
      for (const condition of actorConditions) addCondition(condition);
    } else if (typeof actorConditions.values === 'function') {
      for (const condition of actorConditions.values()) addCondition(condition);
    } else if (typeof actorConditions[Symbol.iterator] === 'function') {
      for (const condition of actorConditions) addCondition(condition);
    } else if (typeof actorConditions === 'object') {
      for (const condition of Object.values(actorConditions)) addCondition(condition);
    }
  }

  if (typeof actor?.hasCondition === 'function') {
    for (const slug of ['blinded', 'deafened', 'dazzled', 'invisible']) {
      try {
        if (actor.hasCondition(slug)) entries.push(slug);
      } catch {
        /* best effort */
      }
    }
  }

  return Array.from(new Set(entries)).sort();
}

function getActorSensesSystemSignature(actor) {
  const system = actor?.system || {};
  return {
    traits: system.traits ?? null,
    perceptionAttributes: system.attributes?.perception ?? null,
    perception: system.perception ?? null,
    senses: system.senses ?? system.attributes?.senses ?? null,
    conditions: system.conditions ?? null,
  };
}

function buildTokenSenseSignature(token) {
  const id = token?.document?.id;
  if (!id) return null;

  const actor = token?.actor || token?.document?.actor || {};
  return {
    token: {
      id: String(id),
      elevation: normalizeCacheKeyNumber(token?.document?.elevation ?? 0),
      width: normalizeCacheKeyNumber(token?.document?.width ?? 1),
      height: normalizeCacheKeyNumber(token?.document?.height ?? 1),
    },
    actor: {
      id: actor?.id ?? null,
      uuid: actor?.uuid ?? null,
      signature: actor?.signature ?? null,
      type: actor?.type ?? null,
      conditions: getActorConditions(actor),
      system: getActorSensesSystemSignature(actor),
      preparedSenses: normalizePreparedSensesForSignature(actor?.perception?.senses),
    },
  };
}

export class TokenSenseSignatureCache {
  constructor() {
    this.entries = new WeakMap();
  }

  getEntry(token) {
    const id = token?.document?.id;
    if (!id) return null;

    const signature = buildTokenSenseSignature(token);
    const signatureKey = stableStringify(signature);
    const cached = this.entries.get(token);
    if (cached?.signatureKey === signatureKey) return cached.entry;

    const entry = `${String(id)}@${signatureKey}`;
    this.entries.set(token, { signatureKey, entry });
    return entry;
  }

  buildKey(tokens = []) {
    const entries = (tokens || [])
      .map((token) => this.getEntry(token))
      .filter(Boolean)
      .sort();

    return `scene:${getSceneCacheId()}|count:${entries.length}|hearing:${getSceneHearingRangeCacheKey()}|${entries.join('|')}`;
  }

  clear() {
    this.entries = new WeakMap();
  }
}

export function buildTokenSensesCacheKey(tokens, cache = new TokenSenseSignatureCache()) {
  return cache.buildKey(tokens);
}
