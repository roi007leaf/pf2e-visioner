import { MODULE_ID } from '../constants.js';
import {
  createAggregateEffectData,
  createEphemeralEffectRule,
} from '../helpers/visibility-helpers.js';
import { runWithEffectLock } from './utils.js';
import { performanceMonitor } from '../utils/performance-monitor.js';

export async function batchUpdateVisibilityEffects(observerToken, targetUpdates, options = {}) {
  return performanceMonitor.timeAsyncOperation(
    `batchUpdateVisibilityEffects(${targetUpdates.length} targets)`,
    async () => {
      if (!observerToken?.actor || !targetUpdates?.length) return;
      try {
        const oType = observerToken?.actor?.type;
        if (oType && ['loot', 'vehicle', 'party'].includes(oType)) return;
      } catch (_) {}
      
      // Performance optimization: Skip visual updates for bulk operations
      const skipVisualUpdates = options.skipVisualUpdates || targetUpdates.length > 10;
      
      const effectTarget =
        options.effectTarget || (options.direction === 'target_to_observer' ? 'observer' : 'subject');
      const updatesByReceiver = new Map();
  for (const update of targetUpdates) {
    if (!update.target?.actor) continue;
    try {
      const tType = update.target.actor?.type;
      if (tType && ['loot', 'vehicle', 'party'].includes(tType)) continue;
    } catch (_) {}
    const receiver = effectTarget === 'observer' ? observerToken : update.target;
    const receiverId = receiver.actor.id;
    if (!updatesByReceiver.has(receiverId))
      updatesByReceiver.set(receiverId, { receiver, updates: [] });
    updatesByReceiver.get(receiverId).updates.push({
      source: effectTarget === 'observer' ? update.target : observerToken,
      state: update.state,
    });
  }
  // Process all receivers in parallel for better performance
  const receiverPromises = Array.from(updatesByReceiver.values()).map(async ({ receiver, updates }) => {
    try {
      const rType = receiver?.actor?.type;
      if (rType && ['loot', 'vehicle', 'party'].includes(rType)) return;
    } catch (_) {}
    
    return runWithEffectLock(receiver.actor, async () => {
      const effects = receiver.actor.itemTypes.effect;
      const hiddenAggregate = effects.find(
        (e) =>
          e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
          e.flags?.[MODULE_ID]?.visibilityState === 'hidden' &&
          e.flags?.[MODULE_ID]?.effectTarget === effectTarget,
      );
      const undetectedAggregate = effects.find(
        (e) =>
          e.flags?.[MODULE_ID]?.aggregateOffGuard === true &&
          e.flags?.[MODULE_ID]?.visibilityState === 'undetected' &&
          e.flags?.[MODULE_ID]?.effectTarget === effectTarget,
      );
      let hiddenRules = hiddenAggregate
        ? Array.isArray(hiddenAggregate.system.rules)
          ? [...hiddenAggregate.system.rules]
          : []
        : [];
      let undetectedRules = undetectedAggregate
        ? Array.isArray(undetectedAggregate.system.rules)
          ? [...undetectedAggregate.system.rules]
          : []
        : [];
      const effectsToCreate = [];
      const effectsToUpdate = [];
      const effectsToDelete = [];
      // Performance optimization: Pre-compute all operations and signatures
      const operationsBySignature = new Map();
      const signaturesToProcess = new Set();
      
      for (const { source, state } of updates) {
        const signature = source.actor.signature;
        signaturesToProcess.add(signature);
        
        if (!operationsBySignature.has(signature)) {
          const operations = {
            hidden: { add: false, remove: false },
            undetected: { add: false, remove: false },
          };
          if (options.removeAllEffects || state === 'observed' || state === 'concealed') {
            operations.hidden.remove = true;
            operations.undetected.remove = true;
          } else if (state === 'hidden') {
            operations.hidden.add = true;
            operations.undetected.remove = true;
          } else if (state === 'undetected') {
            operations.hidden.remove = true;
            operations.undetected.add = true;
          }
          operationsBySignature.set(signature, operations);
        }
      }
      
      // Performance optimization: Batch process all operations efficiently
      for (const signature of signaturesToProcess) {
        const operations = operationsBySignature.get(signature);
        
        if (operations.hidden.remove) {
          const signatureToRemove = `target:signature:${signature}`;
          hiddenRules = hiddenRules.filter(r => 
            !(r?.key === 'EphemeralEffect' && 
              Array.isArray(r.predicate) && 
              r.predicate.includes(signatureToRemove))
          );
        }
        if (operations.hidden.add) {
          const signatureToAdd = `target:signature:${signature}`;
          const exists = hiddenRules.some(r => 
            r?.key === 'EphemeralEffect' && 
            Array.isArray(r.predicate) && 
            r.predicate.includes(signatureToAdd)
          );
          if (!exists) {
            hiddenRules.push(createEphemeralEffectRule(signature));
          }
        }
        
        if (operations.undetected.remove) {
          const signatureToRemove = `target:signature:${signature}`;
          undetectedRules = undetectedRules.filter(r => 
            !(r?.key === 'EphemeralEffect' && 
              Array.isArray(r.predicate) && 
              r.predicate.includes(signatureToRemove))
          );
        }
        if (operations.undetected.add) {
          const signatureToAdd = `target:signature:${signature}`;
          const exists = undetectedRules.some(r => 
            r?.key === 'EphemeralEffect' && 
            Array.isArray(r.predicate) && 
            r.predicate.includes(signatureToAdd)
          );
          if (!exists) {
            undetectedRules.push(createEphemeralEffectRule(signature));
          }
        }
      }
      if (hiddenAggregate) {
        if (hiddenRules.length === 0) effectsToDelete.push(hiddenAggregate.id);
        else effectsToUpdate.push({ _id: hiddenAggregate.id, 'system.rules': hiddenRules });
      } else if (hiddenRules.length > 0)
        effectsToCreate.push(
          createAggregateEffectData('hidden', 'batch', {
            ...options,
            receiverId: receiver.actor.id,
            existingRules: hiddenRules,
          }),
        );
      if (undetectedAggregate) {
        if (undetectedRules.length === 0) effectsToDelete.push(undetectedAggregate.id);
        else effectsToUpdate.push({ _id: undetectedAggregate.id, 'system.rules': undetectedRules });
      } else if (undetectedRules.length > 0)
        effectsToCreate.push(
          createAggregateEffectData('undetected', 'batch', {
            ...options,
            receiverId: receiver.actor.id,
            existingRules: undetectedRules,
          }),
        );
      // Performance optimization: Batch all effect operations with minimal perception refreshes
      // Execute operations in parallel when possible for better performance
      const operationPromises = [];
      
      if (effectsToDelete.length > 0 && game.user.isGM) {
        operationPromises.push(
          receiver.actor.deleteEmbeddedDocuments('Item', effectsToDelete, { 
            render: false // Skip individual renders
          })
        );
      }
      if (effectsToUpdate.length > 0) {
        operationPromises.push(
          receiver.actor.updateEmbeddedDocuments('Item', effectsToUpdate, { 
            render: false // Skip individual renders
          })
        );
      }
      if (effectsToCreate.length > 0) {
        operationPromises.push(
          receiver.actor.createEmbeddedDocuments('Item', effectsToCreate, { 
            render: false // Skip individual renders
          })
        );
      }
      
      // Execute all operations in parallel for better performance
      if (operationPromises.length > 0) {
        await Promise.all(operationPromises);
      }
      
      // Note: We skip manual rendering here to avoid renderTexture errors
      // Foundry will handle rendering automatically when effects are applied
      // The perception refresh at the end of the batch will ensure everything is properly rendered
    });
  });
  
  // Wait for all receiver processing to complete
  await Promise.all(receiverPromises);
  });
}
