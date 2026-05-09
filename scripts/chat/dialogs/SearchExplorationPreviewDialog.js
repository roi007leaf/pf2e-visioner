import { MODULE_ID } from '../../constants.js';
import { getWallImage } from '../../utils.js';
import { SeekPreviewDialog } from './SeekPreviewDialog.js';

function getTokenId(token) {
  return token?.document?.id || token?.id || null;
}

function getWallId(target) {
  const wall = target?._isWall ? target.wall : target;
  return wall?.document?.id || wall?.id || null;
}

function getTargetId(target) {
  return target?._isWall ? getWallId(target) : getTokenId(target);
}

function getWallDisplayName(target) {
  const wall = target?._isWall ? target.wall : target;
  const doc = wall?.document;
  const doorType = Number(doc?.door) || 0;
  return (
    doc?.getFlag?.(MODULE_ID, 'wallIdentifier') ||
    (doorType === 2 ? 'Hidden Secret Door' : doorType === 1 ? 'Hidden Door' : 'Hidden Wall')
  );
}

function getTargetDisplay(target, resolveTokenImage) {
  if (target?._isWall) {
    const wall = target.wall;
    const doorType = Number(wall?.document?.door) || 0;
    return {
      name: getWallDisplayName(target),
      image: getWallImage(doorType),
    };
  }

  return {
    name: target?.name || target?.document?.name || 'Search target',
    image: resolveTokenImage(target),
  };
}

export class SearchExplorationPreviewDialog extends SeekPreviewDialog {
  static DEFAULT_OPTIONS = {
    ...SeekPreviewDialog.DEFAULT_OPTIONS,
    classes: ['pf2e-visioner', 'seek-preview-dialog', 'search-exploration-preview-dialog'],
    window: {
      ...SeekPreviewDialog.DEFAULT_OPTIONS.window,
      title: 'Search Exploration Results',
      icon: 'fas fa-search',
    },
  };

  constructor(targetToken, outcomes, changes, actionData, options = {}) {
    const targetId = getTargetId(targetToken);

    super(
      targetToken,
      outcomes,
      changes,
      {
        ...actionData,
        actor: targetToken,
        actorToken: targetToken,
        actionType: 'seek',
        searchExploration: true,
        searchExplorationGroup: true,
        searchExplorationTargetTokenId: targetToken?._isWall ? null : targetId,
        searchExplorationTargetWallId: targetToken?._isWall ? targetId : null,
      },
      {
        ...options,
        window: {
          ...options.window,
          title: 'Search Exploration Results',
          icon: 'fas fa-search',
        },
      },
    );

    this.searchExplorationTarget = targetToken;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const target = this.searchExplorationTarget;
    const display = getTargetDisplay(target, this.resolveTokenImage.bind(this));
    const total = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes.length
      : this.outcomes?.length || 0;

    context.searchExplorationGroup = true;
    context.seeker = {
      name: display.name,
      image: display.image,
      actionType: 'seek',
      actionLabel: `Search exploration target (${total} searcher${total === 1 ? '' : 's'})`,
    };

    context.seekFeatBadges = [];
    context.suppressedSensesBadge = null;
    context.availableReactions = [];
    context.hasReactions = false;
    context.allSenses = [];
    context.activeSenses = null;
    context.usedSenseCount = 0;
    context.primaryUsedSenseLabel = null;
    context.detectionFilterDisabled = true;
    context.ignoreAllies = false;
    context.hideFoundryHidden = false;

    return context;
  }
}
