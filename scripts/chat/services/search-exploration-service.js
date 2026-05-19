import { MODULE_ID } from '../../constants.js';

export const SEARCH_EXPLORATION_FLAG = 'searchExploration';

const DEFAULT_PLAYER_VISIBILITY_FLAG = 'defaultPlayerVisibility';
const SEEK_ACTION_TRAITS = ['concentrate', 'secret'];
const SEEK_EXPLORATION_ROLL_OPTIONS = [
  'action:seek',
  ...SEEK_ACTION_TRAITS,
  ...SEEK_ACTION_TRAITS.map((trait) => `item:trait:${trait}`),
  'exploration:search',
];
const RECENT_SEARCH_EXPLORATION_ROLL_TTL_MS = 10 * 60 * 1000;
const RECENT_SEARCH_EXPLORATION_ROLL_LIMIT = 50;
const recentSearchExplorationRolls = [];

function normalizeSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function isSearchSlug(value) {
  const text = normalizeSearchText(value);
  return (
    text === 'search' ||
    text === 'exploration-search' ||
    text === 'search-exploration' ||
    text === 'effect-search' ||
    text === 'effect-exploration-search' ||
    text === 'exploration-activity-search'
  );
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return Array.from(value.values());
  if (typeof value.values === 'function') {
    try {
      return Array.from(value.values());
    } catch {
      return [];
    }
  }
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function objectLooksLikeSearchActivity(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    isSearchSlug(value.slug) ||
    isSearchSlug(value.id) ||
    isSearchSlug(value.value) ||
    isSearchSlug(value.name) ||
    isSearchSlug(value.system?.slug) ||
    isSearchSlug(value.activity?.slug) ||
    isSearchSlug(value.activity?.id)
  );
}

function valueHasSearchActivity(value, depth = 0) {
  if (!value || depth > 3) return false;
  if (typeof value === 'string') return isSearchSlug(value);
  if (objectLooksLikeSearchActivity(value)) return true;

  if (Array.isArray(value) || value instanceof Map || typeof value.values === 'function') {
    return collectionValues(value).some((entry) => valueHasSearchActivity(entry, depth + 1));
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if ((entry === true || entry === 'true') && isSearchSlug(key)) return true;
      if (valueHasSearchActivity(entry, depth + 1)) return true;
    }
  }

  return false;
}

function isEffectLikeItem(value) {
  const type = normalizeSearchText(value?.type ?? value?.documentName ?? value?.constructor?.name);
  return type === 'effect' || type === 'active-effect' || type === 'activeeffect';
}

function isDisabledEffect(value) {
  return !!(
    value?.disabled === true ||
    value?.system?.disabled === true ||
    value?.system?.expired === true ||
    value?.expired === true
  );
}

function isSearchExplorationEffect(value) {
  if (!value || isDisabledEffect(value)) return false;
  return objectLooksLikeSearchActivity(value);
}

function collectionHasSearchExplorationEffect(collection, requireEffectType = false) {
  return collectionValues(collection).some((entry) => {
    if (requireEffectType && !isEffectLikeItem(entry)) return false;
    return isSearchExplorationEffect(entry);
  });
}

function createActorSearchActivityReader() {
  const cache = new WeakMap();
  return (actor) => {
    if (!actor || typeof actor !== 'object') return actorHasSearchExplorationActivity(actor);
    if (!cache.has(actor)) {
      cache.set(actor, actorHasSearchExplorationActivity(actor));
    }
    return cache.get(actor);
  };
}

export function actorHasSearchExplorationActivity(actor) {
  try {
    if (!actor) return false;
    const candidates = [
      actor.system?.exploration,
      actor.system?.explorationActivities,
      actor.system?.details?.exploration,
      actor.flags?.pf2e?.exploration,
      actor.flags?.pf2e?.explorationActivities,
      actor.flags?.pf2e?.party?.exploration,
    ];

    if (candidates.some((candidate) => valueHasSearchActivity(candidate))) return true;

    return (
      collectionHasSearchExplorationEffect(actor.itemTypes?.effect) ||
      collectionHasSearchExplorationEffect(actor.effects) ||
      collectionHasSearchExplorationEffect(actor.items, true)
    );
  } catch {
    return false;
  }
}

export function isManualSearchExplorationEnabled(token) {
  try {
    return !!token?.document?.getFlag?.(MODULE_ID, SEARCH_EXPLORATION_FLAG);
  } catch {
    return false;
  }
}

export function isSearchExplorationActive(token) {
  return isManualSearchExplorationEnabled(token) || actorHasSearchExplorationActivity(token?.actor);
}

export function isMovementUpdate(changes) {
  return !!(
    changes &&
    ('x' in changes || 'y' in changes || 'elevation' in changes || 'rotation' in changes)
  );
}

function getGridSize() {
  return Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
}

function getGridDistance() {
  return Number(canvas?.scene?.grid?.distance ?? canvas?.grid?.distance ?? 5) || 5;
}

export function getSearchExplorationRangeFeet() {
  return 30;
}

export function getTokenCenter(token) {
  if (!token) return null;
  if (Number.isFinite(token.center?.x) && Number.isFinite(token.center?.y)) return token.center;
  const doc = token.document ?? token;
  const gridSize = getGridSize();
  const x = Number(token.x ?? doc.x);
  const y = Number(token.y ?? doc.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const width = Number(token.w ?? doc.widthPx ?? (doc.width ?? token.width ?? 1) * gridSize);
  const height = Number(token.h ?? doc.heightPx ?? (doc.height ?? token.height ?? 1) * gridSize);
  return { x: x + width / 2, y: y + height / 2 };
}

function getTokenImage(token) {
  return (
    token?.document?.texture?.src ||
    token?.texture?.src ||
    token?.actor?.img ||
    token?.document?.img ||
    'icons/svg/mystery-man.svg'
  );
}

export function getWallCenter(wall) {
  if (!wall) return null;
  if (Number.isFinite(wall.center?.x) && Number.isFinite(wall.center?.y)) return wall.center;
  const doc = wall.document ?? wall;
  const c = Array.isArray(doc?.c) ? doc.c : null;
  if (c?.length >= 4) {
    return {
      x: (Number(c[0]) + Number(c[2])) / 2,
      y: (Number(c[1]) + Number(c[3])) / 2,
    };
  }
  if (
    Number.isFinite(doc?.x) &&
    Number.isFinite(doc?.y) &&
    Number.isFinite(doc?.x2) &&
    Number.isFinite(doc?.y2)
  ) {
    return { x: (doc.x + doc.x2) / 2, y: (doc.y + doc.y2) / 2 };
  }
  return null;
}

function getSubjectCenter(subject) {
  if (subject?._isWall) return getWallCenter(subject.wall);
  return getTokenCenter(subject);
}

function distanceFeetBetweenPoints(a, b) {
  if (!a || !b) return Infinity;
  const pixels = Math.hypot(a.x - b.x, a.y - b.y);
  return (pixels / getGridSize()) * getGridDistance();
}

function actorHasCondition(actor, slugs) {
  try {
    const wanted = new Set(slugs);
    const collections = [
      actor?.itemTypes?.condition,
      actor?.conditions?.conditions,
      actor?.conditions,
      actor?.appliedConditions,
    ];
    for (const collection of collections) {
      for (const condition of collectionValues(collection)) {
        const slug = normalizeSearchText(condition?.slug ?? condition?.name ?? condition);
        if (wanted.has(slug)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function hasConfiguredStealthDC(token) {
  try {
    const tokenDC = Number(token?.document?.getFlag?.(MODULE_ID, 'stealthDC'));
    if (Number.isFinite(tokenDC) && tokenDC > 0) return true;
    const actorDC = Number(token?.actor?.system?.attributes?.stealth?.dc);
    if (Number.isFinite(actorDC) && actorDC > 0) return true;
  } catch {
    return false;
  }
  return false;
}

function getTokenId(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function getWallId(wallOrSubject) {
  const wall = wallOrSubject?._isWall ? wallOrSubject.wall : wallOrSubject;
  return wall?.document?.id ?? wall?.id ?? null;
}

function getSearchTargetId(target) {
  return target?._isWall ? getWallId(target) : getTokenId(target);
}

function getSearchTargetName(target) {
  if (target?._isWall) {
    const wall = target.wall;
    const doorType = Number(wall?.document?.door) || 0;
    return (
      wall?.document?.getFlag?.(MODULE_ID, 'wallIdentifier') ||
      (doorType === 2 ? 'Hidden Secret Door' : doorType === 1 ? 'Hidden Door' : 'Hidden Wall')
    );
  }

  return target?.name || target?.document?.name || getSearchTargetId(target) || 'Search target';
}

function getWallStealthDC(wall) {
  const dcOverride = Number(wall?.document?.getFlag?.(MODULE_ID, 'stealthDC'));
  if (Number.isFinite(dcOverride) && dcOverride > 0) return dcOverride;
  return Number(game?.settings?.get?.(MODULE_ID, 'wallStealthDC')) || 15;
}

function makeSearchExplorationWallSubject(wall) {
  if (!wall) return null;
  return {
    _isWall: true,
    _isHiddenWall: true,
    wall,
    dc: getWallStealthDC(wall),
  };
}

function isPlayerCharacterToken(token) {
  return !!(
    token?.actor?.type === 'character' &&
    (token.actor.hasPlayerOwner || token.actor.isOwner || token.actor.hasPlayerOwner === undefined)
  );
}

function getActorId(actor) {
  return actor?.id ?? actor?._id ?? actor?.uuid ?? null;
}

function getActorCollectionValues(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  return collectionValues(collection);
}

function isPlayerCharacterActor(actor) {
  try {
    const isCharacter = actor?.type === 'character' || actor?.isOfType?.('character');
    return !!(isCharacter && (actor?.hasPlayerOwner || actor?.isOwner));
  } catch {
    return false;
  }
}

function makeActorSearchSeeker(actor, visibilityTarget = null) {
  const actorId = getActorId(actor);
  const moduleFlags = { ...(actor?.flags?.[MODULE_ID] || {}) };
  const targetId = getTokenId(visibilityTarget);
  if (targetId && tokenHasHiddenPrepDefault(visibilityTarget)) {
    moduleFlags.visibility = {
      ...(moduleFlags.visibility || {}),
      [targetId]: 'hidden',
    };
  }
  const center = getSubjectCenter(visibilityTarget);
  const document = {
    id: actorId,
    name: actor?.name || actorId || 'PC',
    actor,
    uuid: actor?.uuid,
    img: actor?.img,
    texture: { src: actor?.img },
    getFlag(scope, key) {
      if (scope !== MODULE_ID) return actor?.getFlag?.(scope, key) ?? actor?.flags?.[scope]?.[key] ?? null;
      return moduleFlags[key] ?? actor?.getFlag?.(scope, key) ?? actor?.flags?.[scope]?.[key] ?? null;
    },
    async setFlag(scope, key, value) {
      if (scope === MODULE_ID) {
        moduleFlags[key] = value;
        return value;
      }
      return actor?.setFlag?.(scope, key, value);
    },
    async unsetFlag(scope, key) {
      if (scope === MODULE_ID) {
        delete moduleFlags[key];
        return true;
      }
      return actor?.unsetFlag?.(scope, key);
    },
  };
  const seeker = {
    id: actorId,
    name: actor?.name || actorId || 'PC',
    actor,
    document,
    center,
    x: center?.x ?? 0,
    y: center?.y ?? 0,
    width: 1,
    height: 1,
    w: 1,
    h: 1,
    _isActorSearchSeeker: true,
  };
  document.object = seeker;
  return seeker;
}

function getActorSearchExplorationSeekers() {
  const hasSearchActivity = createActorSearchActivityReader();
  return getActorCollectionValues(game?.actors)
    .filter((actor) => isPlayerCharacterActor(actor) && hasSearchActivity(actor))
    .map((actor) => makeActorSearchSeeker(actor));
}

function resolveActorById(actorId) {
  if (!actorId) return null;
  return (
    game?.actors?.get?.(actorId) ||
    getActorCollectionValues(game?.actors).find((actor) => getActorId(actor) === actorId) ||
    null
  );
}

function resolveSearchSeekerById(seekerId, target = null) {
  const token = resolveTokenById(seekerId);
  if (token) return token;

  const actor = resolveActorById(seekerId);
  if (!isPlayerCharacterActor(actor)) return null;
  return makeActorSearchSeeker(actor, target);
}

function tokenIsHiddenByVisionerToAnyPC(token) {
  const targetId = getTokenId(token);
  if (!targetId) return false;

  const tokens = canvas?.tokens?.placeables || [];
  return tokens.some((observer) => {
    if (!isPlayerCharacterToken(observer) || getTokenId(observer) === targetId) return false;
    const visibilityMap = observer?.document?.getFlag?.(MODULE_ID, 'visibility') || {};
    const visibility = visibilityMap?.[targetId];
    return visibility === 'hidden' || visibility === 'undetected';
  });
}

function tokenHasHiddenPrepDefault(token) {
  try {
    return token?.document?.getFlag?.(MODULE_ID, DEFAULT_PLAYER_VISIBILITY_FLAG) === 'hidden';
  } catch {
    return false;
  }
}

function tokenHasHiddenState(token) {
  return !!(
    token?.document?.hidden === true ||
    tokenHasHiddenPrepDefault(token) ||
    actorHasCondition(token?.actor, ['hidden', 'undetected']) ||
    tokenIsHiddenByVisionerToAnyPC(token)
  );
}

export function isSearchExplorationCandidate(subject) {
  try {
    if (subject?._isWall) return !!subject._isHiddenWall;

    const actorType = subject?.actor?.type;
    if (actorType === 'hazard') return hasConfiguredStealthDC(subject);

    if (actorType === 'loot') {
      return (
        hasConfiguredStealthDC(subject) ||
        tokenHasHiddenState(subject)
      );
    }

    if (actorType === 'npc') return tokenHasHiddenState(subject);
  } catch {
    return false;
  }
  return false;
}

export function isSearchExplorationHudTarget(token) {
  try {
    if (!game?.user?.isGM) return false;
    const actorType = token?.actor?.type;
    if (!['loot', 'hazard', 'npc'].includes(actorType)) return false;
    return isSearchExplorationCandidate(token);
  } catch {
    return false;
  }
}

export function isSearchExplorationWallTarget(wall) {
  try {
    return !!(game?.user?.isGM && wall?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
  } catch {
    return false;
  }
}

export function getSearchExplorationSeekers(targetToken, tokens = canvas?.tokens?.placeables || []) {
  const targetId = getTokenId(targetToken);
  const tokenList = tokens || [];
  const hasSearchActivity = createActorSearchActivityReader();
  const tokenSeekers = tokenList.filter((token) => {
    if (!token?.actor) return false;
    if (getTokenId(token) === targetId) return false;
    return isPlayerCharacterToken(token) && hasSearchActivity(token.actor);
  });

  const hasPcTokensOnScene = tokenList.some(
    (token) => getTokenId(token) !== targetId && isPlayerCharacterToken(token),
  );
  if (tokenSeekers.length > 0 || hasPcTokensOnScene) return tokenSeekers;

  return getActorSearchExplorationSeekers();
}

export function filterSearchExplorationSubjects(subjects, seekerToken, rangeFeet) {
  const seekerCenter = getTokenCenter(seekerToken);
  if (!Array.isArray(subjects) || !seekerCenter) return [];
  const maxFeet = Number(rangeFeet);
  const hasRange = Number.isFinite(maxFeet) && maxFeet > 0;

  return subjects.filter((subject) => {
    if (!isSearchExplorationCandidate(subject)) return false;
    if (!hasRange) return true;
    const subjectCenter = getSubjectCenter(subject);
    const distance = distanceFeetBetweenPoints(seekerCenter, subjectCenter);
    return Number.isFinite(distance) && distance <= maxFeet;
  });
}

function getSearchExplorationTime() {
  const worldTime = Number(game?.time?.worldTime);
  if (Number.isFinite(worldTime)) return worldTime;
  return Date.now() / 1000;
}

function getPerceptionModifier(actor) {
  const stat = actor?.getStatistic?.('perception');
  const values = [
    stat?.mod,
    stat?.modifier,
    stat?.check?.mod,
    actor?.system?.perception?.mod,
    actor?.system?.perception?.value,
    actor?.system?.attributes?.perception?.value,
  ];
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function normalizeRollForSeek(roll, fallbackDie = null) {
  const total = Number(roll?.total);
  if (Number.isFinite(total)) return roll;

  const die = Number(fallbackDie ?? 10);
  const modifier = Number(roll?.modifier ?? 0);
  return {
    total: die + modifier,
    dice: [{ total: die, results: [{ result: die }] }],
    terms: [{ total: die }],
  };
}

function extractRollFromResult(result) {
  const candidates = [
    result?.roll,
    result?.rolls?.[0],
    result?.message?.rolls?.[0],
    result?.chatMessage?.rolls?.[0],
    result,
  ];

  for (const candidate of candidates) {
    const total = Number(candidate?.total ?? candidate?._total);
    if (Number.isFinite(total)) return normalizeRollForSeek({ ...candidate, total });
  }

  return null;
}

function buildSearchExplorationFlag(token, rangeFeet, options = {}) {
  const targetToken = options.targetToken || null;
  const targetWall = options.targetWall || null;
  return {
    tokenId: getTokenId(token),
    sceneId: canvas?.scene?.id ?? null,
    radiusFeet: Number(rangeFeet) || getSearchExplorationRangeFeet(),
    targetTokenId: getTokenId(targetToken),
    targetWallId: getWallId(targetWall),
    groupId: options.groupId || null,
  };
}

function buildSearchExplorationMessageFlags(
  token,
  rangeFeet,
  includeFallbackPf2eContext = false,
  options = {},
) {
  const flags = {
    [MODULE_ID]: {
      searchExploration: buildSearchExplorationFlag(token, rangeFeet, options),
    },
  };

  if (includeFallbackPf2eContext) {
    flags.pf2e = {
      context: {
        type: 'perception-check',
        slug: 'seek',
        options: SEEK_EXPLORATION_ROLL_OPTIONS,
      },
    };
  }

  return flags;
}

function getMessageFromRollResult(result) {
  const candidates = [
    result?.message,
    result?.chatMessage,
    result?.msg,
    result?.chatMessage?.message,
    result,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate?.id &&
        (typeof candidate.update === 'function' ||
          Array.isArray(candidate.rolls) ||
          candidate.flags ||
          candidate.speaker),
    ) || null
  );
}

async function persistSearchExplorationMessageFlag(result, token, rangeFeet, options = {}) {
  const message = getMessageFromRollResult(result);
  if (typeof message?.update !== 'function') return;

  const existing = message.flags?.[MODULE_ID]?.searchExploration || {};
  const flag = {
    ...existing,
    ...buildSearchExplorationFlag(token, rangeFeet, options),
  };

  try {
    await message.update({
      [`flags.${MODULE_ID}.searchExploration`]: flag,
    });
  } catch {
    /* best effort; in-memory recovery still keeps current-session buttons working */
  }
}

function getRollTotal(roll) {
  const total = Number(roll?.total ?? roll?._total);
  return Number.isFinite(total) ? total : null;
}

function pruneRecentSearchExplorationRolls(now = Date.now()) {
  for (let i = recentSearchExplorationRolls.length - 1; i >= 0; i -= 1) {
    if (now - recentSearchExplorationRolls[i].createdAt > RECENT_SEARCH_EXPLORATION_ROLL_TTL_MS) {
      recentSearchExplorationRolls.splice(i, 1);
    }
  }

  while (recentSearchExplorationRolls.length > RECENT_SEARCH_EXPLORATION_ROLL_LIMIT) {
    recentSearchExplorationRolls.shift();
  }
}

function rememberSearchExplorationRoll(token, rangeFeet, options, roll, result = null) {
  const total = getRollTotal(roll);
  if (!token || total === null) return;

  const now = Date.now();
  pruneRecentSearchExplorationRolls(now);
  const message = getMessageFromRollResult(result);
  recentSearchExplorationRolls.push({
    createdAt: now,
    messageId: message?.id || null,
    tokenId: getTokenId(token),
    rollTotal: total,
    roll,
    flag: buildSearchExplorationFlag(token, rangeFeet, options),
  });
  pruneRecentSearchExplorationRolls(now);
}

export async function rollSearchPerception(token, options = {}) {
  const actor = token?.actor;
  const stat = actor?.getStatistic?.('perception');
  const rangeFeet = Number(options.rangeFeet ?? getSearchExplorationRangeFeet());
  const flavor = game?.i18n?.localize?.('PF2E_VISIONER.SEEK_AUTOMATION.SEARCH_EXPLORATION_ROLL');
  const flags = buildSearchExplorationMessageFlags(token, rangeFeet, false, options);
  const rollOptions = {
    skipDialog: true,
    secret: true,
    rollMode: 'blindgm',
    messageMode: 'blind',
    createMessage: true,
    token: token?.document ?? token,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ token }),
    extraRollOptions: SEEK_EXPLORATION_ROLL_OPTIONS,
    traits: SEEK_ACTION_TRAITS,
    message: { flavor, flags },
    messageData: { flavor, flags },
    flags,
  };

  const rollFns = [
    typeof stat?.roll === 'function' ? stat.roll.bind(stat) : null,
    typeof stat?.check?.roll === 'function' ? stat.check.roll.bind(stat.check) : null,
  ].filter(Boolean);

  for (const rollFn of rollFns) {
    try {
      const result = await rollFn(rollOptions);
      const roll =
        extractRollFromResult(result) ?? normalizeRollForSeek({ modifier: getPerceptionModifier(actor) });
      await persistSearchExplorationMessageFlag(result, token, rangeFeet, options);
      rememberSearchExplorationRoll(token, rangeFeet, options, roll, result);
      return roll;
    } catch {
      /* try next available roller */
    }
  }

  const modifier = getPerceptionModifier(actor);
  try {
    const RollClass = globalThis.Roll;
    const roll = new RollClass(`1d20 + ${modifier}`);
    await roll.evaluate({ async: true });
    const message = await roll.toMessage?.(
      {
        speaker: globalThis.ChatMessage?.getSpeaker?.({ token }),
        flavor,
        flags: buildSearchExplorationMessageFlags(token, rangeFeet, true, options),
      },
      { rollMode: 'blindgm' },
    );
    const normalized = normalizeRollForSeek(roll);
    await persistSearchExplorationMessageFlag(message, token, rangeFeet, options);
    rememberSearchExplorationRoll(token, rangeFeet, options, normalized, message);
    return normalized;
  } catch {
    const die = Math.floor(Math.random() * 20) + 1;
    const roll = normalizeRollForSeek({ modifier }, die);
    rememberSearchExplorationRoll(token, rangeFeet, options, roll);
    return roll;
  }
}

function createSearchExplorationGroupId(targetToken) {
  const sceneId = canvas?.scene?.id ?? 'scene';
  const targetId = getSearchTargetId(targetToken) ?? 'target';
  return `search-exploration:${sceneId}:${targetId}:${Date.now()}`;
}

export async function runSearchExplorationForTarget(targetToken, options = {}) {
  try {
    if (!game?.user?.isGM) return 0;
    if (!isSearchExplorationHudTarget(targetToken)) {
      ui.notifications?.warn?.('PF2E Visioner: This token is not a Search exploration target.');
      return 0;
    }

    const seekers = options.seekers || getSearchExplorationSeekers(targetToken);
    if (!seekers.length) {
      ui.notifications?.warn?.(
        'PF2E Visioner: No player characters have Search as their active exploration activity.',
      );
      return 0;
    }

    const groupId = options.groupId || createSearchExplorationGroupId(targetToken);
    for (const seeker of seekers) {
      await rollSearchPerception(seeker, {
        ...options,
        targetToken,
        groupId,
      });
    }

    return seekers.length;
  } catch (error) {
    console.warn('PF2E Visioner | Search exploration target roll failed:', error);
    return 0;
  }
}

export async function runSearchExplorationForWall(wall, options = {}) {
  try {
    if (!game?.user?.isGM) return 0;
    if (!isSearchExplorationWallTarget(wall)) {
      ui.notifications?.warn?.('PF2E Visioner: Selected wall is not a hidden wall.');
      return 0;
    }

    const seekers = options.seekers || getSearchExplorationSeekers(null);
    if (!seekers.length) {
      ui.notifications?.warn?.(
        'PF2E Visioner: No player characters have Search as their active exploration activity.',
      );
      return 0;
    }

    const targetWall = makeSearchExplorationWallSubject(wall);
    const groupId = options.groupId || createSearchExplorationGroupId(targetWall);
    for (const seeker of seekers) {
      await rollSearchPerception(seeker, {
        ...options,
        targetWall,
        groupId,
      });
    }

    return seekers.length;
  } catch (error) {
    console.warn('PF2E Visioner | Search exploration wall roll failed:', error);
    return 0;
  }
}

function getSearchExplorationFlagFromMessage(message) {
  return message?.flags?.[MODULE_ID]?.searchExploration || null;
}

function findRecentSearchExplorationRecord(actionData = {}) {
  pruneRecentSearchExplorationRolls();
  const messageId = actionData?.messageId || null;
  const tokenId =
    actionData?.searchExplorationTokenId ||
    getTokenId(actionData?.actorToken) ||
    getTokenId(actionData?.actor) ||
    null;
  const rollTotal = getRollTotal(actionData?.roll);

  const matches = recentSearchExplorationRolls.filter((record) => {
    if (messageId && record.messageId === messageId) return true;
    if (!tokenId || record.tokenId !== tokenId) return false;
    return rollTotal === null || record.rollTotal === rollTotal;
  });

  return matches[matches.length - 1] || null;
}

function getRecentSearchExplorationFlag(actionData = {}) {
  return findRecentSearchExplorationRecord(actionData)?.flag || null;
}

function getSearchExplorationActionFlag(actionData = {}) {
  return (
    getSearchExplorationFlagFromMessage(getMessageById(actionData?.messageId)) ||
    getRecentSearchExplorationFlag(actionData) ||
    null
  );
}

function getSearchExplorationGroupId(actionData = {}) {
  return actionData?.searchExplorationGroupId || getSearchExplorationActionFlag(actionData)?.groupId || null;
}

function buildRecentSearchExplorationMessage(record) {
  return {
    id:
      record.messageId ||
      `recent-search-exploration:${record.flag?.groupId}:${record.tokenId}:${record.rollTotal}`,
    speaker: { token: record.flag?.tokenId || record.tokenId },
    rolls: [record.roll],
    flags: {
      [MODULE_ID]: {
        searchExploration: record.flag,
      },
    },
  };
}

function getRecentSearchExplorationGroupMessages(groupId) {
  if (!groupId) return [];
  pruneRecentSearchExplorationRolls();
  return recentSearchExplorationRolls
    .filter((record) => record.flag?.groupId === groupId)
    .map((record) => buildRecentSearchExplorationMessage(record));
}

function getMessagesCollectionValues() {
  return collectionValues(game?.messages?.contents || game?.messages);
}

function getMessageById(messageId) {
  if (!messageId) return null;
  return game?.messages?.get?.(messageId) || getMessagesCollectionValues().find((m) => m?.id === messageId) || null;
}

function resolveTokenById(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    canvas?.tokens?.placeables?.find?.((token) => getTokenId(token) === tokenId) ||
    null
  );
}

function resolveWallById(wallId) {
  if (!wallId) return null;
  const wall =
    canvas?.walls?.get?.(wallId) ||
    canvas?.walls?.placeables?.find?.((candidate) => getWallId(candidate) === wallId) ||
    null;
  if (wall) return makeSearchExplorationWallSubject(wall);

  const wallDoc =
    canvas?.scene?.walls?.get?.(wallId) ||
    canvas?.scene?.getEmbeddedDocument?.('Wall', wallId) ||
    null;
  if (!wallDoc) return null;

  return makeSearchExplorationWallSubject({
    id: wallDoc.id || wallId,
    document: wallDoc,
  });
}

function getSearchExplorationGroupMessages(actionData) {
  const groupId = getSearchExplorationGroupId(actionData);
  const messageId = actionData?.messageId;
  const current = getMessageById(messageId);

  if (!groupId) return current ? [current] : [];

  const matches = getMessagesCollectionValues().filter((message) => {
    const flag = getSearchExplorationFlagFromMessage(message);
    return flag?.groupId === groupId;
  });

  if (matches.length) return matches;
  const recentMatches = getRecentSearchExplorationGroupMessages(groupId);
  if (recentMatches.length) return recentMatches;
  return current ? [current] : [];
}

function getSearchExplorationTarget(actionData) {
  const messageFlag = getSearchExplorationActionFlag(actionData);
  return (
    resolveTokenById(actionData?.searchExplorationTargetTokenId) ||
    resolveTokenById(messageFlag?.targetTokenId) ||
    resolveWallById(actionData?.searchExplorationTargetWallId) ||
    resolveWallById(messageFlag?.targetWallId)
  );
}

function extractRollFromMessage(message, fallbackRoll = null) {
  return (
    extractRollFromResult({ rolls: message?.rolls }) ||
    extractRollFromResult(message?.rolls?.[0]) ||
    fallbackRoll ||
    null
  );
}

export async function openSearchExplorationGroupResults(actionData = {}) {
  try {
    const target = getSearchExplorationTarget(actionData);
    if (!target) {
      ui.notifications?.warn?.('PF2E Visioner: Search exploration target is no longer on the scene.');
      return 0;
    }

    const { SeekActionHandler } = await import('./actions/SeekAction.js');
    const handler = new SeekActionHandler();
    const messages = getSearchExplorationGroupMessages(actionData);
    const outcomes = [];

    for (const message of messages) {
      const flag = getSearchExplorationFlagFromMessage(message) || {};
      const seekerToken = resolveSearchSeekerById(
        flag.tokenId || message?.speaker?.token || message?.speaker?.actor,
        target,
      );
      if (!seekerToken?.actor) continue;

      const roll = extractRollFromMessage(message, actionData.roll);
      if (!roll) continue;

      const seekerActionData = {
        ...actionData,
        actionType: 'seek',
        actor: seekerToken,
        actorToken: seekerToken,
        messageId: message?.id || actionData.messageId,
        roll,
        searchExploration: true,
        searchExplorationGroup: true,
        searchExplorationGroupId: flag.groupId || actionData.searchExplorationGroupId || null,
        searchExplorationTargetTokenId: target?._isWall ? null : getTokenId(target),
        searchExplorationTargetWallId: target?._isWall ? getWallId(target) : null,
      };

      const outcome = await handler.analyzeOutcome(seekerActionData, target);
      if (!outcome) continue;

      const observerId = getTokenId(seekerToken);
      const targetId = getSearchTargetId(target);
      outcomes.push({
        ...outcome,
        observer: seekerToken,
        observerToken: seekerToken,
        searchExplorationObserver: seekerToken,
        searchExplorationObserverName: seekerToken.name || seekerToken.actor?.name || observerId,
        searchExplorationObserverImage: getTokenImage(seekerToken),
        searchExplorationRowId: `${observerId}:${targetId}`,
        searchExplorationTargetName: getSearchTargetName(target),
        searchExplorationTargetTokenId: target?._isWall ? null : targetId,
        searchExplorationTargetWallId: target?._isWall ? targetId : null,
      });
    }

    if (!outcomes.length) {
      ui.notifications?.warn?.('PF2E Visioner: No Search exploration results found for this target.');
      return 0;
    }

    const changes = outcomes.filter((outcome) => outcome?.changed);
    const firstSeeker = outcomes[0]?.observerToken || outcomes[0]?.observer || actionData.actor;
    const dialogActionData = {
      ...actionData,
      actionType: 'seek',
      actor: firstSeeker,
      actorToken: firstSeeker,
      searchExploration: true,
      searchExplorationGroup: true,
      searchExplorationGroupedOutcomes: outcomes,
      searchExplorationTargetTokenId: target?._isWall ? null : getTokenId(target),
      searchExplorationTargetWallId: target?._isWall ? getWallId(target) : null,
    };

    const { SeekPreviewDialog } = await import('../dialogs/SeekPreviewDialog.js');
    if (SeekPreviewDialog.currentSeekDialog) {
      try {
        await SeekPreviewDialog.currentSeekDialog.close();
      } catch {
        /* ignore */
      }
    }
    const { SearchExplorationPreviewDialog } = await import(
      '../dialogs/SearchExplorationPreviewDialog.js'
    );
    new SearchExplorationPreviewDialog(target, outcomes, changes, dialogActionData).render(true);
    return outcomes.length;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to open Search exploration group results:', error);
    return 0;
  }
}

export async function openSearchExplorationResults(token, options = {}) {
  if (!token?.actor) return 0;
  if (!isSearchExplorationActive(token)) return 0;

  const now = Number(options.now ?? getSearchExplorationTime());
  const rangeFeet = Number(options.rangeFeet ?? getSearchExplorationRangeFeet());

  const { SeekActionHandler } = await import('./actions/SeekAction.js');
  const handler = new SeekActionHandler();
  const baseActionData = {
    actionType: 'seek',
    actor: token,
    actorToken: token,
    ignoreAllies: false,
    messageId: `search-exploration-${now}`,
    searchExploration: true,
    searchExplorationRadiusFeet: rangeFeet,
  };

  const subjects = await handler.discoverSubjects(baseActionData);
  const candidates = filterSearchExplorationSubjects(subjects, token, rangeFeet);
  if (candidates.length === 0) return 0;

  const roll = options.roll ?? (await rollSearchPerception(token));
  const actionData = { ...baseActionData, roll };
  const outcomes = await Promise.all(
    candidates.map((subject) => handler.analyzeOutcome(actionData, subject)),
  );
  const displayOutcomes = outcomes.filter(Boolean);
  if (displayOutcomes.length === 0) return 0;

  const changes = displayOutcomes.filter((outcome) => outcome?.changed);
  const { SeekPreviewDialog } = await import('../dialogs/SeekPreviewDialog.js');
  if (SeekPreviewDialog.currentSeekDialog) {
    try {
      await SeekPreviewDialog.currentSeekDialog.close();
    } catch {
      /* ignore */
    }
  }
  new SeekPreviewDialog(token, displayOutcomes, changes, actionData).render(true);
  return displayOutcomes.length;
}

export async function createSearchExplorationCheck(token, options = {}) {
  if (!token?.actor) return 0;
  if (!isSearchExplorationActive(token)) return 0;

  const rangeFeet = Number(options.rangeFeet ?? getSearchExplorationRangeFeet());

  const { SeekActionHandler } = await import('./actions/SeekAction.js');
  const handler = new SeekActionHandler();
  const subjects = await handler.discoverSubjects({
    actionType: 'seek',
    actor: token,
    actorToken: token,
    ignoreAllies: false,
    searchExploration: true,
    searchExplorationRadiusFeet: rangeFeet,
  });
  const candidates = filterSearchExplorationSubjects(subjects, token, rangeFeet);
  if (candidates.length === 0) return 0;

  await rollSearchPerception(token, { rangeFeet });
  return candidates.length;
}

export async function handleSearchExplorationTokenUpdate(tokenDoc, changes, options, userId) {
  tokenDoc;
  changes;
  options;
  userId;
  return 0;
}
