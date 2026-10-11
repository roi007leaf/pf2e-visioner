import { MODULE_ID } from '../constants.js';
import { normalizeSlug, resolveActor } from '../utils/actor-features.js';

export const STEALTH_BYPASS_FLAG = 'stealthPrerequisiteBypass';

const HIDE_AND_SNEAK = ['hide', 'sneak'];
const HIDE_ONLY = ['hide'];

export const STEALTH_PREREQUISITE_ITEMS = {
  'camouflage-dye-lesser': { actions: HIDE_AND_SNEAK, duration: { value: 10, unit: 'minutes' } },
  'camouflage-dye-greater': { actions: HIDE_AND_SNEAK, duration: { value: 1, unit: 'minutes' } },
  'chameleon-suit': { actions: HIDE_ONLY, duration: { value: 1, unit: 'minutes' } },
  'chameleon-suit-greater': { actions: HIDE_ONLY, duration: { value: 10, unit: 'minutes' } },
  'chameleon-suit-major': { actions: HIDE_ONLY, duration: { value: 1, unit: 'hours' } },
  'camouflaging-chromatophores-lesser': { actions: HIDE_ONLY, duration: { value: 1, unit: 'minutes' } },
  'camouflaging-chromatophores-greater': { actions: HIDE_ONLY, duration: { value: 1, unit: 'minutes' } },
};

export function getItemSlug(item) {
  return normalizeSlug(item?.system?.slug ?? item?.slug ?? item?.name ?? '');
}

export function getStealthPrerequisiteItemConfig(item) {
  const slug = getItemSlug(item);
  const config = STEALTH_PREREQUISITE_ITEMS[slug];
  return config ? { slug, ...config } : null;
}

function getActorEffects(tokenOrActor) {
  const actor = resolveActor(tokenOrActor);
  return actor?.itemTypes?.effect ?? [];
}

function getBypassActions(effect) {
  const actions = effect?.flags?.[MODULE_ID]?.[STEALTH_BYPASS_FLAG];
  return Array.isArray(actions) ? actions : [];
}

export function getStealthBypassEffects(tokenOrActor, action) {
  return getActorEffects(tokenOrActor).filter((effect) => {
    const actions = getBypassActions(effect);
    return action ? actions.includes(action) : actions.length > 0;
  });
}

export function hasStealthPrerequisiteBypass(tokenOrActor, action) {
  return getStealthBypassEffects(tokenOrActor, action).length > 0;
}

function getEffectSlug(itemSlug) {
  return `effect-visioner-${itemSlug}`;
}

function getDescriptionKey(actions) {
  return actions.includes('sneak')
    ? 'PF2E_VISIONER.STEALTH_PREREQ_ITEMS.DESCRIPTION_HIDE_SNEAK'
    : 'PF2E_VISIONER.STEALTH_PREREQ_ITEMS.DESCRIPTION_HIDE';
}

export function buildStealthBypassEffectData(config, item) {
  return {
    name: game.i18n.format('PF2E_VISIONER.STEALTH_PREREQ_ITEMS.EFFECT_NAME', {
      item: item?.name ?? config.slug,
    }),
    type: 'effect',
    img: item?.img ?? 'icons/svg/mystery-man.svg',
    flags: { [MODULE_ID]: { [STEALTH_BYPASS_FLAG]: [...config.actions], sourceItemSlug: config.slug } },
    system: {
      slug: getEffectSlug(config.slug),
      description: { value: `<p>${game.i18n.localize(getDescriptionKey(config.actions))}</p>` },
      duration: { ...config.duration, expiry: 'turn-start', sustained: false },
      tokenIcon: { show: true },
    },
  };
}

async function removeExistingEffects(actor, config) {
  const slug = getEffectSlug(config.slug);
  const ids = getActorEffects(actor)
    .filter((effect) => normalizeSlug(effect?.system?.slug ?? effect?.slug ?? '') === slug)
    .map((effect) => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
}

export async function applyStealthBypassEffect(actor, config, item) {
  if (!actor || !config) return false;
  await removeExistingEffects(actor, config);
  await actor.createEmbeddedDocuments('Item', [buildStealthBypassEffectData(config, item)]);
  return true;
}
