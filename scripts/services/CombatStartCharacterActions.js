import { MODULE_ID } from '../constants.js';

const RAISED_SHIELD_EFFECT_UUID = 'Compendium.pf2e.equipment-effects.Item.2YgXoHvJfrDHucMr';

function combatantToken(combatant) {
  return combatant?.token?.object ?? canvas?.tokens?.get?.(combatant?.tokenId) ?? null;
}

function playerCharacters(combat) {
  return Array.from(combat?.combatants ?? [])
    .map((combatant) => ({ actor: combatant?.actor, token: combatantToken(combatant) }))
    .filter(({ actor, token }) => actor?.type === 'character' && token?.document);
}

function hasDefendActivity(actor) {
  const selected = actor?.system?.exploration;
  if (!selected?.length && !selected?.size) return false;
  return Array.from(selected).some((id) => actor.items?.get?.(id)?.slug === 'defend');
}

function heldUsableShield(actor) {
  const shield = actor?.heldShield;
  return shield && !shield.isBroken && !shield.isDestroyed;
}

function hasRaisedShield(actor) {
  return actor?.itemTypes?.effect?.some((effect) =>
    effect.sourceId === RAISED_SHIELD_EFFECT_UUID ||
    ['raise-a-shield', 'effect-raise-a-shield'].includes(effect.slug));
}

function avoidNoticeHandles(setting) {
  if (!game.modules?.get?.('pf2e-avoid-notice')?.active) return false;
  try {
    return game.settings.get('pf2e-avoid-notice', setting) === true;
  } catch {
    return false;
  }
}

async function raiseDefendingShields(characters) {
  const raiseAShield = game.pf2e?.actions?.raiseAShield;
  if (typeof raiseAShield !== 'function') return;

  for (const { actor } of characters) {
    if (!hasDefendActivity(actor) || !heldUsableShield(actor) || hasRaisedShield(actor)) continue;
    try {
      await raiseAShield({ actors: [actor] });
      const effect = actor.itemTypes.effect.find((item) =>
        item.sourceId === RAISED_SHIELD_EFFECT_UUID ||
        ['raise-a-shield', 'effect-raise-a-shield'].includes(item.slug));
      if (effect && effect.system?.duration?.value !== 0) {
        await effect.update({ 'system.duration.value': 0 });
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not raise ${actor.name}'s shield at combat start:`, error);
    }
  }
}

function rageAction(actor) {
  if (!actor?.itemTypes?.feat?.some((feat) => feat.slug === 'quick-tempered')) return null;
  return actor.itemTypes.action?.find((action) => action.slug === 'rage' && action.system?.selfEffect?.uuid) ?? null;
}

async function enrageBarbarians(characters) {
  for (const { actor, token } of characters) {
    const action = rageAction(actor);
    if (!action) continue;
    try {
      const source = await globalThis.fromUuid(action.system.selfEffect.uuid);
      if (!source?.isOfType?.('effect')) continue;
      if (actor.itemTypes.effect.some((effect) =>
        effect.sourceId === source.uuid || effect.slug === source.slug)) continue;

      const data = source.toObject();
      data._id = null;
      data.system.context = {
        origin: {
          actor: actor.uuid,
          token: token.document.uuid,
          item: action.uuid,
          spellcasting: null,
          rollOptions: action.getOriginData?.().rollOptions ?? [],
        },
        target: { actor: actor.uuid, token: token.document.uuid },
        roll: null,
      };
      await actor.createEmbeddedDocuments('Item', [data]);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not apply Rage to ${actor.name} at combat start:`, error);
    }
  }
}

export async function applyCombatStartCharacterActions(combat) {
  if (!game.user?.isActiveGM || !combat) return;
  const raiseShields = game.settings.get(MODULE_ID, 'raisePcShieldsWhenDefending');
  const enrage = game.settings.get(MODULE_ID, 'enrageBarbariansAtCombatStart');
  if (!raiseShields && !enrage) return;

  const characters = playerCharacters(combat);
  if (raiseShields && !avoidNoticeHandles('raiseShields')) await raiseDefendingShields(characters);
  if (enrage && !avoidNoticeHandles('rage')) await enrageBarbarians(characters);
}
