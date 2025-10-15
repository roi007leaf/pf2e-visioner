import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class CoverOverride {
  static async applyCoverOverride(operation, subjectToken, options = {}) {
    if (!subjectToken) return;

    const {
      targets,
      direction,
      state,
      source,
      priority = 100,
      blockedEdges,
      requiresTakeCover,
      autoCoverBehavior = 'replace',
      preventAutoCover,
      tokenIds,
      predicate
    } = operation;

    const targetTokens = this.getTargetTokens(subjectToken, targets, operation.range, tokenIds);

    const sourceData = {
      id: source || `cover-${Date.now()}`,
      type: source,
      priority,
      state,
      direction,
      blockedEdges,
      requiresTakeCover,
      autoCoverBehavior,
      preventAutoCover,
      qualifications: operation.qualifications || {}
    };

    for (const targetToken of targetTokens) {
      if (targetToken.id === subjectToken.id) continue;

      // Check operation-level predicate per target
      if (predicate && predicate.length > 0) {
        const subjectOptions = PredicateHelper.getTokenRollOptions(subjectToken);
        const targetOptions = PredicateHelper.getTargetRollOptions(targetToken, subjectToken);
        const combinedOptions = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);
        
        if (!PredicateHelper.evaluate(predicate, combinedOptions)) {
          continue;
        }
      }

      if (direction === 'to') {
        await this.setCoverState(subjectToken, targetToken, state, sourceData);
      } else {
        await this.setCoverState(targetToken, subjectToken, state, sourceData);
      }
    }
  }

  static async setCoverState(attackerToken, defenderToken, state, sourceData) {
    try {
      const { setCoverBetween } = await import('../../cover/utils.js');
      await setCoverBetween(attackerToken, defenderToken, state);

      await SourceTracker.addSourceToState(defenderToken, 'cover', sourceData, attackerToken.id);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set cover state:', error);
    }
  }

  static async removeCoverOverride(operation, subjectToken) {
    if (!subjectToken) return;

    const { source } = operation;
    await SourceTracker.removeSource(subjectToken, source, 'cover');
  }

  static async applyProvideCover(operation, subjectToken) {
    if (!subjectToken) return;

    const {
      state,
      blockedEdges = [],
      requiresTakeCover = false,
      autoCoverBehavior = 'replace',
      source,
      priority = 100
    } = operation;

    const coverData = {
      id: source || `provided-cover-${subjectToken.id}`,
      type: 'provided',
      priority,
      state,
      blockedEdges,
      requiresTakeCover,
      autoCoverBehavior,
      tokenId: subjectToken.id,
      qualifications: operation.qualifications || {}
    };

    await subjectToken.document.setFlag('pf2e-visioner', 'providesCover', coverData);
  }

  static async removeProvideCover(subjectToken) {
    if (!subjectToken) return;
    await subjectToken.document.unsetFlag('pf2e-visioner', 'providesCover');
  }

  static getCoverFromToken(providerToken, receiverToken, attackerToken) {
    if (!providerToken?.document) return null;

    const coverData = providerToken.document.getFlag('pf2e-visioner', 'providesCover');
    if (!coverData) return null;

    if (coverData.blockedEdges && coverData.blockedEdges.length > 0) {
      const isProtected = this.checkDirectionalCover(
        providerToken,
        receiverToken,
        attackerToken,
        coverData.blockedEdges
      );
      if (!isProtected) return null;
    }

    if (coverData.requiresTakeCover) {
      const hasTakenCover = receiverToken.document.getFlag('pf2e-visioner', 'hasTakenCover');
      if (!hasTakenCover) return null;
    }

    return {
      state: coverData.state,
      source: coverData.id,
      priority: coverData.priority,
      behavior: coverData.autoCoverBehavior
    };
  }

  static checkDirectionalCover(providerToken, receiverToken, attackerToken, blockedEdges) {
    const providerPos = { x: providerToken.x, y: providerToken.y };
    const attackerPos = { x: attackerToken.x, y: attackerToken.y };
    
    const dx = attackerPos.x - providerPos.x;
    const dy = attackerPos.y - providerPos.y;
    
    let attackDirection;
    if (Math.abs(dx) > Math.abs(dy)) {
      attackDirection = dx > 0 ? 'east' : 'west';
    } else {
      attackDirection = dy > 0 ? 'south' : 'north';
    }

    return blockedEdges.includes(attackDirection);
  }

  static getTargetTokens(subjectToken, targets, range, tokenIds = null) {
    const allTokens = canvas.tokens?.placeables.filter(t => t.actor && t.id !== subjectToken.id) || [];

    let filteredTokens = [];

    switch (targets) {
      case 'all':
        filteredTokens = allTokens;
        break;
      case 'allies':
        filteredTokens = allTokens.filter(t => this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'enemies':
        filteredTokens = allTokens.filter(t => !this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'selected':
        filteredTokens = canvas.tokens?.controlled.filter(t => t.id !== subjectToken.id) || [];
        break;
      case 'targeted':
        filteredTokens = Array.from(game.user.targets).filter(t => t.id !== subjectToken.id);
        break;
      case 'specific':
        if (tokenIds && tokenIds.length > 0) {
          filteredTokens = allTokens.filter(t => tokenIds.includes(t.document.id));
        }
        break;
      default:
        filteredTokens = allTokens;
    }

    if (range) {
      filteredTokens = filteredTokens.filter(token => {
        const distance = canvas.grid.measureDistance(subjectToken, token);
        return distance <= range;
      });
    }

    return filteredTokens;
  }

  static areAllies(actor1, actor2) {
    if (!actor1 || !actor2) return false;

    const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
    const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
    const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

    return isPCvsPC || (isNPCvsNPC && sameDisposition);
  }
}

