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

export function getActorFeatureSlugs(tokenOrActor) {
  try {
    const actor = resolveActor(tokenOrActor);
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
    return slugs;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to read actor features:', error);
    return new Set();
  }
}

export function actorHasFeature(tokenOrActor, slugOrSlugs) {
  const featureSlugs = getActorFeatureSlugs(tokenOrActor);
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
