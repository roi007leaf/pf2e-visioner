import { ruleElementService } from '../services/RuleElementService.js';

export function registerRuleElementHooks() {
  Hooks.on('createItem', (item) => {
    if (!item.actor) return;
    ruleElementService.invalidateCacheForActor(item.actor.uuid);
  });

  Hooks.on('updateItem', (item) => {
    if (!item.actor) return;
    ruleElementService.invalidateCacheForActor(item.actor.uuid);
  });

  Hooks.on('deleteItem', (item) => {
    if (!item.actor) return;
    ruleElementService.invalidateCacheForActor(item.actor.uuid);
  });

  Hooks.on('createActiveEffect', (effect) => {
    const actor = effect.parent;
    if (!actor || actor.documentName !== 'Actor') return;
    ruleElementService.invalidateCacheForActor(actor.uuid);
  });

  Hooks.on('updateActiveEffect', (effect) => {
    const actor = effect.parent;
    if (!actor || actor.documentName !== 'Actor') return;
    ruleElementService.invalidateCacheForActor(actor.uuid);
  });

  Hooks.on('deleteActiveEffect', (effect) => {
    const actor = effect.parent;
    if (!actor || actor.documentName !== 'Actor') return;
    ruleElementService.invalidateCacheForActor(actor.uuid);
  });

  Hooks.on('updateToken', (tokenDoc, changes) => {
    if (changes.actorData || changes.actorLink !== undefined) {
      ruleElementService.clearCache(tokenDoc.id);
    }
  });

  Hooks.on('deleteToken', (tokenDoc) => {
    ruleElementService.clearCache(tokenDoc.id);
  });
}
