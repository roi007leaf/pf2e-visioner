import { CoverOverride } from './CoverOverride.js';

const FLAG_SCOPE = 'pf2e-visioner';
const FLAG_KEY = 'coverAdjustments';

export class CoverAdjustment {
  static getTargetTokens(subjectToken, targets, range, tokenIds) {
    return CoverOverride.getTargetTokens(subjectToken, targets, range, tokenIds);
  }

  static descriptor(operation, ruleElement) {
    const itemSlug = ruleElement?.item?.slug || ruleElement?.item?.name?.slugify?.() || 'unknown';
    return {
      id: operation.source || `rule-element-${itemSlug}`,
      priority: operation.priority ?? ruleElement?.priority ?? 100,
      mode: operation.mode,
      steps: operation.steps,
      amount: operation.amount,
      scope: operation.scope || 'while-active',
      predicate: operation.predicate,
    };
  }

  static async applyCoverAdjustment(operation, subjectToken, ruleElement = null) {
    if (!subjectToken) return;
    const { targets = 'all', observers, direction = 'from', range, tokenIds } = operation;
    const targetTokens = this.getTargetTokens(subjectToken, observers || targets, range, tokenIds);
    const descriptor = this.descriptor(operation, ruleElement);

    for (const targetToken of targetTokens) {
      if (targetToken.id === subjectToken.id) continue;
      if (direction === 'to') {
        await this.addAdjustment(targetToken, subjectToken.id, descriptor);
      } else {
        await this.addAdjustment(subjectToken, targetToken.id, descriptor);
      }
    }
  }

  static async addAdjustment(holderToken, observerId, descriptor) {
    const all = { ...(holderToken.document.getFlag(FLAG_SCOPE, FLAG_KEY) || {}) };
    const list = (all[observerId] || []).filter((a) => a.id !== descriptor.id);
    list.push(descriptor);
    all[observerId] = list;
    await holderToken.document.setFlag(FLAG_SCOPE, FLAG_KEY, all);
  }

  static getActiveCoverAdjustments(attackerToken, defenderToken) {
    const all = defenderToken?.document?.getFlag?.(FLAG_SCOPE, FLAG_KEY);
    return all?.[attackerToken?.id] ?? [];
  }

  static async consumeCoverAdjustment(defenderToken, attackerId, sourceId) {
    const all = { ...(defenderToken.document.getFlag(FLAG_SCOPE, FLAG_KEY) || {}) };
    const list = (all[attackerId] || []).filter((a) => a.id !== sourceId);
    if (list.length) all[attackerId] = list;
    else delete all[attackerId];
    await defenderToken.document.setFlag(FLAG_SCOPE, FLAG_KEY, all);
  }

  static async removeCoverAdjustment(operation, subjectToken, ruleElement = null) {
    if (!subjectToken) return;
    const { targets = 'all', observers, direction = 'from', range, tokenIds } = operation;
    const sourceId = this.descriptor(operation, ruleElement).id;
    const targetTokens = this.getTargetTokens(subjectToken, observers || targets, range, tokenIds);
    for (const targetToken of targetTokens) {
      if (targetToken.id === subjectToken.id) continue;
      if (direction === 'to') await this.consumeCoverAdjustment(targetToken, subjectToken.id, sourceId);
      else await this.consumeCoverAdjustment(subjectToken, targetToken.id, sourceId);
    }
  }
}
