export function normalizeSlug(value = '') {
  try {
    return String(value)
      .toLowerCase()
      .replace(/\u2019/g, "'")
      .replace(/'+/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch (_) {
    return '';
  }
}

export function resolveActor(tokenOrActor) {
  if (!tokenOrActor) return null;
  if (tokenOrActor.actor) return tokenOrActor.actor;
  if (tokenOrActor.document?.actor) return tokenOrActor.document.actor;
  if (
    tokenOrActor.system ||
    tokenOrActor.items ||
    tokenOrActor.itemTypes ||
    tokenOrActor.type ||
    tokenOrActor.level
  ) {
    return tokenOrActor;
  }
  return null;
}

let actorFeatureSlugCache = new WeakMap();

export function clearActorFeatureCache(tokenOrActor = null) {
  if (!tokenOrActor) {
    actorFeatureSlugCache = new WeakMap();
    return;
  }

  const actor = resolveActor(tokenOrActor);
  if (actor && (typeof actor === 'object' || typeof actor === 'function')) {
    actorFeatureSlugCache.delete(actor);
  }
}

export function getActorItems(actor) {
  const items = actor?.items;
  const resolvedItems = (() => {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (Array.isArray(items.contents)) return items.contents;
    if (typeof items.values === 'function') return Array.from(items.values());
    if (typeof items[Symbol.iterator] === 'function') return Array.from(items);
    return [];
  })();
  const itemTypes = actor?.itemTypes;
  if (!itemTypes) return resolvedItems;
  return [
    ...resolvedItems,
    ...(Array.isArray(itemTypes.feat)
      ? itemTypes.feat.map((item) => ({ type: item?.type ?? 'feat', ...item }))
      : []),
    ...(Array.isArray(itemTypes.action)
      ? itemTypes.action.map((item) => ({ type: item?.type ?? 'action', ...item }))
      : []),
  ];
}

function getActorRollOptions(actor) {
  try {
    const options = actor?.getRollOptions?.(['all']);
    if (Array.isArray(options)) return options;
    if (options instanceof Set) return Array.from(options);
  } catch {}

  try {
    const options = actor?.getRollOptions?.();
    if (Array.isArray(options)) return options;
    if (options instanceof Set) return Array.from(options);
  } catch {}

  return [];
}

function addFeatureSlugFromRollOption(slugs, option) {
  const parts = String(option ?? '')
    .split(':')
    .map((part) => normalizeSlug(part))
    .filter(Boolean);
  if (parts.length === 0) return;

  const last = parts[parts.length - 1];
  const hasFeaturePrefix = parts.includes('feat') || parts.includes('feature');
  const hasItemSlugPrefix =
    parts.includes('item') && parts.some((part, index) => part === 'slug' && index < parts.length - 1);

  if ((hasFeaturePrefix || hasItemSlugPrefix) && last) {
    slugs.add(last);
  }
}

function buildActorFeatureSlugs(actor) {
  const slugs = new Set();
  for (const item of getActorItems(actor)) {
    if (item?.type === 'feat') {
      const slug = normalizeSlug(item.system?.slug ?? item.slug ?? item.name);
      if (slug) slugs.add(slug);
    } else if (item?.system?.actionType?.value === 'passive') {
      const slug = normalizeSlug(item.system?.slug ?? item.slug ?? item.name);
      if (slug) slugs.add(slug);
    }
  }
  for (const option of getActorRollOptions(actor)) {
    addFeatureSlugFromRollOption(slugs, option);
  }
  return slugs;
}

function getCachedActorFeatureSlugs(tokenOrActor) {
  try {
    const actor = resolveActor(tokenOrActor);
    if (!actor || (typeof actor !== 'object' && typeof actor !== 'function')) {
      return new Set();
    }

    const cached = actorFeatureSlugCache.get(actor);
    if (cached) return cached;

    const slugs = buildActorFeatureSlugs(actor);
    actorFeatureSlugCache.set(actor, slugs);
    return slugs;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to read actor features:', error);
    return new Set();
  }
}

export function getActorFeatureSlugs(tokenOrActor) {
  return new Set(getCachedActorFeatureSlugs(tokenOrActor));
}

export function actorHasFeature(tokenOrActor, slugOrSlugs) {
  const featureSlugs = getCachedActorFeatureSlugs(tokenOrActor);
  if (Array.isArray(slugOrSlugs)) {
    return slugOrSlugs.some((slug) => featureSlugs.has(normalizeSlug(slug)));
  }
  return featureSlugs.has(normalizeSlug(slugOrSlugs));
}

export function getActorLevel(tokenOrActor) {
  const actor = resolveActor(tokenOrActor);
  const raw =
    actor?.system?.details?.level?.value ??
    actor?.system?.details?.level ??
    actor?.system?.level?.value ??
    actor?.system?.level ??
    actor?.level?.value ??
    actor?.level;
  const level = Number(raw);
  return Number.isFinite(level) ? level : null;
}
