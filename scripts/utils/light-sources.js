import { MODULE_ID } from '../constants.js';

const AUTO_EXTINGUISHED_FLAG = 'autoExtinguishedLights';

function itemHasTokenLightRule(item) {
  const rules = item?.system?.rules;
  if (!Array.isArray(rules)) return false;
  return rules.some((rule) => rule?.key === 'TokenLight');
}

function collectCheckedToggles(actor) {
  const toggles = actor?.synthetics?.toggles;
  if (!toggles) return [];
  return Object.values(toggles)
    .flatMap((domainToggles) => Object.values(domainToggles ?? {}))
    .filter((toggle) => toggle?.checked === true);
}

/**
 * Turns off any active held/worn light source on the actor using PF2e's
 * native RollOption toggle (the same mechanism the item sheet uses), so the
 * item itself is unlit rather than just suppressing the token's light glow.
 */
export async function extinguishHeldLightSources(actor) {
  if (!actor) return;

  const litToggles = collectCheckedToggles(actor).filter((toggle) =>
    itemHasTokenLightRule(actor.items?.get?.(toggle.itemId)),
  );
  if (litToggles.length === 0) return;

  for (const toggle of litToggles) {
    await actor.toggleRollOption(toggle.domain, toggle.option, toggle.itemId, false);
  }

  const record = litToggles.map(({ domain, option, itemId }) => ({ domain, option, itemId }));
  await actor.setFlag?.(MODULE_ID, AUTO_EXTINGUISHED_FLAG, record);
}

/**
 * Turns back on any light source this module auto-extinguished for the
 * actor (via extinguishHeldLightSources), then clears the record.
 */
export async function relightHeldLightSources(actor) {
  if (!actor) return;

  const record = actor.getFlag?.(MODULE_ID, AUTO_EXTINGUISHED_FLAG);
  if (!Array.isArray(record) || record.length === 0) return;

  for (const { domain, option, itemId } of record) {
    if (!actor.items?.get?.(itemId)) continue;
    await actor.toggleRollOption(domain, option, itemId, true);
  }

  await actor.unsetFlag?.(MODULE_ID, AUTO_EXTINGUISHED_FLAG);
}
