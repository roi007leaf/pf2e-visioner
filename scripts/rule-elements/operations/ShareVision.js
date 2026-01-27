import { MODULE_ID } from '../../constants.js';
import { PredicateHelper } from '../PredicateHelper.js';

export class ShareVision {
  /**
   * Get the scene token ID from an actor UUID
   * @param {string} actorUuid - Actor UUID
   * @returns {string|null} The scene token ID of the actor's token in current scene
   */
  static getSceneTokenIdFromActorUuid(actorUuid) {
    if (!actorUuid) return null;

    let actor = null;

    try {
      if (actorUuid.includes('.')) {
        actor = fromUuidSync(actorUuid);
      } else {
        actor = game.actors.get(actorUuid);
      }

      if (!actor) {
        console.warn(`PF2E Visioner | Could not resolve actor: ${actorUuid}`);
        return null;
      }

      const tokens = actor.getActiveTokens?.(false, true);

      if (!tokens || tokens.length === 0) {
        console.warn(
          `PF2E Visioner | Actor ${actor.name} has no tokens in current scene (${canvas.scene?.name})`,
        );
        return null;
      }

      return tokens[0].id;
    } catch (error) {
      console.error(`PF2E Visioner | Failed to resolve actor UUID: ${actorUuid}`, error);
      return null;
    }
  }

  /**
   * Apply vision sharing between tokens
   * @param {Object} operation - The operation configuration
   * @param {Token} subjectToken - The token this effect is applied to
   */
  static async applyShareVision(operation, subjectToken) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyShareVision');
      return;
    }

    const { mode = 'one-way', masterActorUuid, source, predicate } = operation;

    if (!masterActorUuid) {
      console.warn('PF2E Visioner | shareVision requires a masterActorUuid');
      return;
    }

    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(subjectToken);
      if (!PredicateHelper.evaluate(predicate, rollOptions)) {
        return;
      }
    }

    const validModes = ['one-way', 'two-way', 'replace', 'reverse'];
    if (!validModes.includes(mode)) {
      console.warn(`PF2E Visioner | Invalid shareVision mode: ${mode}`);
      return;
    }

    const sceneTokenId = this.getSceneTokenIdFromActorUuid(masterActorUuid);

    if (!sceneTokenId) {
      console.warn(`PF2E Visioner | Could not resolve master actor UUID: ${masterActorUuid}`);
      return;
    }

    try {
      await subjectToken.document.setFlag(MODULE_ID, 'visionMasterTokenId', sceneTokenId);
      await subjectToken.document.setFlag(MODULE_ID, 'visionSharingMode', mode);
      await subjectToken.document.setFlag(MODULE_ID, 'visionMasterActorUuid', masterActorUuid);

      if (source) {
        const existingSources =
          subjectToken.document.getFlag(MODULE_ID, 'visionSharingSources') || [];
        if (!existingSources.includes(source)) {
          await subjectToken.document.setFlag(MODULE_ID, 'visionSharingSources', [
            ...existingSources,
            source,
          ]);
        }
      }

      const masterToken = canvas.tokens.get(sceneTokenId);
      const shouldUpdateVision = subjectToken.controlled || masterToken?.controlled;

      if (shouldUpdateVision) {
        if (masterToken) {
          masterToken.initializeVisionSource();
        }

        subjectToken.initializeVisionSource();
        canvas.perception.update({ initializeVision: true, refreshLighting: true });
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to apply shareVision:', error);
    }
  }

  /**
   * Remove vision sharing from a token
   * @param {Object} operation - The operation configuration
   * @param {Token} subjectToken - The token to remove vision sharing from
   */
  static async removeShareVision(operation, subjectToken) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to removeShareVision');
      return;
    }

    const { source } = operation;

    try {
      if (source) {
        const existingSources =
          subjectToken.document.getFlag(MODULE_ID, 'visionSharingSources') || [];
        const updatedSources = existingSources.filter((s) => s !== source);

        if (updatedSources.length > 0) {
          await subjectToken.document.setFlag(MODULE_ID, 'visionSharingSources', updatedSources);
          return;
        }
      }

      const masterTokenId = subjectToken.document.getFlag(MODULE_ID, 'visionMasterTokenId');
      const masterToken = masterTokenId ? canvas.tokens.get(masterTokenId) : null;

      await subjectToken.document.unsetFlag(MODULE_ID, 'visionMasterTokenId');
      await subjectToken.document.unsetFlag(MODULE_ID, 'visionMasterActorUuid');
      await subjectToken.document.unsetFlag(MODULE_ID, 'visionSharingMode');
      await subjectToken.document.unsetFlag(MODULE_ID, 'visionSharingSources');

      const shouldUpdateVision = subjectToken.controlled || masterToken?.controlled;

      if (shouldUpdateVision) {
        if (masterToken) {
          masterToken.initializeVisionSource();
        }

        subjectToken.initializeVisionSource();
        canvas.perception.update({ initializeVision: true, refreshLighting: true });
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to remove shareVision:', error);
    }
  }
}
