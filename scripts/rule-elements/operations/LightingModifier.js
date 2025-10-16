/**
 * LightingModifier - Handles modifyLighting operation
 * Allows rule elements to override the lighting level at a token's position
 */

export class LightingModifier {
  /**
   * Apply lighting modification to a token
   * @param {Object} operation - The operation configuration
   * @param {Token} subjectToken - The token with the effect
   */
  static async applyLightingModification(operation, subjectToken) {
    if (!subjectToken) return;

    const { lightingLevel, source, priority = 100 } = operation;

    if (!lightingLevel) {
      console.warn('PF2E Visioner | modifyLighting operation requires lightingLevel');
      return;
    }

    const lightingData = {
      id: source || `lighting-${Date.now()}`,
      type: source,
      priority,
      lightingLevel
    };

    await subjectToken.document.setFlag(
      'pf2e-visioner',
      `lightingModification.${lightingData.id}`,
      lightingData
    );

    // Trigger AVS recalculation for the subject token
    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([subjectToken.id]);
    } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    }
  }

  /**
   * Remove lighting modification from a token
   * @param {Object} operation - The operation configuration
   * @param {Token} subjectToken - The token with the effect
   */
  static async removeLightingModification(operation, subjectToken) {
    if (!subjectToken) return;

    const { source } = operation;
    
    const modifications = subjectToken.document.getFlag('pf2e-visioner', 'lightingModification') || {};

    if (modifications[source]) {
      await subjectToken.document.unsetFlag('pf2e-visioner', `lightingModification.${source}`);

      // Small delay to ensure flag update is processed
      await new Promise(resolve => setTimeout(resolve, 50));

      // Trigger AVS recalculation for the subject token
      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([subjectToken.id]);
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
      }
    }
  }

  /**
   * Get the effective lighting level for a token, considering all modifications
   * @param {Token} token - The token to get lighting level for
   * @param {string} defaultLighting - The default lighting level if no modifications
   * @returns {string} The effective lighting level
   */
  static getEffectiveLighting(token, defaultLighting = null) {
    if (!token?.document) return defaultLighting;

    const modifications = token.document.getFlag('pf2e-visioner', 'lightingModification') || {};
    const modArray = Object.values(modifications);

    if (modArray.length === 0) return defaultLighting;

    // Sort by priority (highest first) and return the lighting level from highest priority
    modArray.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return modArray[0].lightingLevel || defaultLighting;
  }

  /**
   * Check if a token has any lighting modifications
   * @param {Token} token - The token to check
   * @returns {boolean} True if token has lighting modifications
   */
  static hasLightingModification(token) {
    if (!token?.document) return false;
    const modifications = token.document.getFlag('pf2e-visioner', 'lightingModification') || {};
    return Object.keys(modifications).length > 0;
  }
}
