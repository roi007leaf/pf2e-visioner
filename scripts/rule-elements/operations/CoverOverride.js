import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class CoverOverride {
  static async applyCoverOverride(operation, subjectToken, ruleElement = null) {
    if (!subjectToken) return;

    const {
      priority = 100,
      targets = 'all',
      direction = 'from',
      state,
      source,
      preventAutoCover,
      tokenIds,
      predicate
    } = operation;

    const targetTokens = this.getTargetTokens(subjectToken, targets, operation.range, tokenIds);

    const itemSlug = ruleElement.item?.slug || ruleElement.item?.name?.slugify() || 'unknown';
    const sourceId = source || `rule-element-${itemSlug}`;

    const sourceData = {
      id: sourceId,
      type: 'rule-element',
      priority: priority,
      state: state,
      direction: direction,
      preventAutoCover: preventAutoCover || false,
      predicate: predicate,
    };

    for (const targetToken of targetTokens) {
      if (targetToken.id === subjectToken.id) continue;

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
      const { setCoverBetween } = await import('../../utils.js');
      await setCoverBetween(attackerToken, defenderToken, state);

      await SourceTracker.addSourceToState(defenderToken, 'cover', sourceData, attackerToken.id);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set cover state:', error);
    }
  }

  static async removeCoverOverride(operation, subjectToken, ruleElement = null) {
    if (!subjectToken) return;

    const { source, targets = 'all', range, tokenIds, direction = 'from' } = operation;
    // Generate the same source ID that was used during creation
    const itemSlug = ruleElement?.item?.slug || ruleElement?.item?.name?.slugify() || 'unknown';
    const sourceId = source || `rule-element-${itemSlug}`;

    // Get the same target tokens that were affected during creation
    const targetTokens = this.getTargetTokens(subjectToken, targets, range, tokenIds);

    // Remove the source from each target token
    for (const targetToken of targetTokens) {
      if (targetToken.id === subjectToken.id) continue;

      if (direction === 'to') {
        // Source was stored on targets with subjectToken as observerId
        await SourceTracker.removeSource(targetToken, sourceId, 'cover', subjectToken.id);

        // Also clean up any old sources from the same item (for backward compatibility)
        // This handles cases where the source ID changed between versions
        await this.cleanupOldSourcesFromItem(targetToken, ruleElement, subjectToken.id);
      } else {
        // Source was stored on subjectToken with targetToken as observerId
        await SourceTracker.removeSource(subjectToken, sourceId, 'cover', targetToken.id);

        // Clean up old sources
        await this.cleanupOldSourcesFromItem(subjectToken, ruleElement, targetToken.id);
      }
    }
  }

  static async cleanupOldSourcesFromItem(token, ruleElement, observerId) {
    if (!token?.document || !ruleElement?.item) return;

    const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
    const coverSources = stateSource.coverByObserver?.[observerId]?.sources || [];

    // Find and remove sources that match old naming patterns from this item
    const itemName = ruleElement.item.name;
    const itemSlug = ruleElement.item.slug || itemName?.slugify();
    const oldSourceIds = [
      'cover-override',  // Old generic name
      'aim-aiding-rune', // Old hardcoded name
      `rule-element-${itemSlug}`, // Current pattern
    ];

    for (const oldId of oldSourceIds) {
      if (coverSources.some(s => s.id === oldId && s.type === 'rule-element')) {
        await SourceTracker.removeSource(token, oldId, 'cover', observerId);
      }
    }
  }

  static async applyProvideCover(operation, subjectToken, ruleElement = null) {
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

