/**
 * Sneak Recommendation Engine - Provides intelligent recommendations
 * for alternative actions based on position analysis and validation results.
 */

export class SneakRecommendationEngine {
  /**
   * Generates comprehensive recommendations based on validation results
   * @param {Object} validationResult - Prerequisite validation results
   * @param {Object} positionAnalysis - Position analysis data
   * @param {Object} actionData - Original action data
   * @returns {Object} Comprehensive recommendation data
   */
  static generateRecommendations(validationResult, positionAnalysis, actionData) {
    const recommendations = {
      primary: null,
      alternatives: [],
      tactical: [],
      positioning: [],
      conditions: [],
      priority: 'medium'
    };

    // Determine primary recommendation based on validation status
    if (!validationResult.canProceed) {
      recommendations.primary = SneakRecommendationEngine._getPrimaryErrorRecommendation(validationResult);
      recommendations.priority = 'high';
    } else if (!validationResult.valid) {
      recommendations.primary = SneakRecommendationEngine._getPrimaryWarningRecommendation(validationResult, positionAnalysis);
      recommendations.priority = 'medium';
    } else {
      recommendations.primary = SneakRecommendationEngine._getPrimarySuccessRecommendation(positionAnalysis);
      recommendations.priority = 'low';
    }

    // Generate alternative actions
    recommendations.alternatives = SneakRecommendationEngine._generateAlternativeActions(
      validationResult, 
      positionAnalysis, 
      actionData
    );

    // Generate tactical recommendations
    recommendations.tactical = SneakRecommendationEngine._generateTacticalRecommendations(
      positionAnalysis, 
      validationResult
    );

    // Generate positioning recommendations
    recommendations.positioning = SneakRecommendationEngine._generatePositioningRecommendations(
      positionAnalysis
    );

    // Generate condition-based recommendations
    recommendations.conditions = SneakRecommendationEngine._generateConditionRecommendations(
      validationResult, 
      actionData
    );

    return recommendations;
  }

  /**
   * Gets primary recommendation for critical errors
   * @param {Object} validationResult - Validation results
   * @returns {Object} Primary recommendation
   * @private
   */
  static _getPrimaryErrorRecommendation(validationResult) {
    const firstError = validationResult.errors[0];
    
    if (firstError.includes('unconscious') || firstError.includes('dead')) {
      return {
        action: 'heal',
        title: 'Heal Character',
        description: 'Character must be conscious to perform stealth actions',
        icon: 'fas fa-heart',
        urgency: 'critical'
      };
    }
    
    if (firstError.includes('preventing conditions')) {
      return {
        action: 'remove-conditions',
        title: 'Remove Conditions',
        description: 'Remove conditions that prevent stealth before attempting',
        icon: 'fas fa-times-circle',
        urgency: 'high'
      };
    }
    
    if (firstError.includes('RAW enforcement')) {
      return {
        action: 'hide-first',
        title: 'Use Hide Action First',
        description: 'RAW requires being hidden or undetected before sneaking',
        icon: 'fas fa-eye-slash',
        urgency: 'high'
      };
    }
    
    return {
      action: 'check-setup',
      title: 'Check Scene Setup',
      description: 'Verify token and scene configuration before attempting stealth',
      icon: 'fas fa-cog',
      urgency: 'high'
    };
  }

  /**
   * Gets primary recommendation for warnings
   * @param {Object} validationResult - Validation results
   * @param {Object} positionAnalysis - Position analysis
   * @returns {Object} Primary recommendation
   * @private
   */
  static _getPrimaryWarningRecommendation(validationResult, positionAnalysis) {
    if (!positionAnalysis) {
      return {
        action: 'proceed-carefully',
        title: 'Proceed with Caution',
        description: 'Position analysis unavailable - results may be unpredictable',
        icon: 'fas fa-exclamation-triangle',
        urgency: 'medium'
      };
    }

    switch (positionAnalysis.overallQuality) {
      case 'terrible':
        return {
          action: 'reposition',
          title: 'Reposition Before Sneaking',
          description: 'Current position is very poor for stealth - move to better cover first',
          icon: 'fas fa-arrows-alt',
          urgency: 'high'
        };
      
      case 'poor':
        return {
          action: 'improve-position',
          title: 'Improve Position',
          description: 'Consider taking cover or hiding to improve stealth chances',
          icon: 'fas fa-shield-alt',
          urgency: 'medium'
        };
      
      default:
        return {
          action: 'proceed-with-awareness',
          title: 'Proceed with Awareness',
          description: 'Be aware of the warnings but position is acceptable',
          icon: 'fas fa-eye',
          urgency: 'low'
        };
    }
  }

  /**
   * Gets primary recommendation for successful validation
   * @param {Object} positionAnalysis - Position analysis
   * @returns {Object} Primary recommendation
   * @private
   */
  static _getPrimarySuccessRecommendation(positionAnalysis) {
    if (!positionAnalysis) {
      return {
        action: 'proceed',
        title: 'Proceed with Sneak',
        description: 'Prerequisites met - ready to attempt stealth',
        icon: 'fas fa-check-circle',
        urgency: 'low'
      };
    }

    switch (positionAnalysis.overallQuality) {
      case 'excellent':
        return {
          action: 'proceed-confidently',
          title: 'Excellent Position',
          description: 'Outstanding stealth position - proceed with confidence',
          icon: 'fas fa-star',
          urgency: 'low'
        };
      
      case 'good':
        return {
          action: 'proceed',
          title: 'Good Position',
          description: 'Solid stealth position - reasonable chance of success',
          icon: 'fas fa-thumbs-up',
          urgency: 'low'
        };
      
      default:
        return {
          action: 'proceed',
          title: 'Proceed with Sneak',
          description: 'Prerequisites met - ready to attempt stealth',
          icon: 'fas fa-check-circle',
          urgency: 'low'
        };
    }
  }

  /**
   * Generates alternative action recommendations
   * @param {Object} validationResult - Validation results
   * @param {Object} positionAnalysis - Position analysis
   * @param {Object} actionData - Action data
   * @returns {Array<Object>} Alternative action recommendations
   * @private
   */
  static _generateAlternativeActions(validationResult, positionAnalysis, actionData) {
    const alternatives = [];

    // Always suggest Hide as an alternative
    alternatives.push({
      action: 'hide',
      title: 'Hide Action',
      description: 'Break line of sight and become hidden before sneaking',
      icon: 'fas fa-eye-slash',
      priority: 'high',
      conditions: ['Can break line of sight', 'Has cover or concealment available']
    });

    // Suggest Take Cover if no cover detected
    if (positionAnalysis && positionAnalysis.noCoverCount > positionAnalysis.goodCoverCount) {
      alternatives.push({
        action: 'take-cover',
        title: 'Take Cover',
        description: 'Gain cover bonuses and improve defensive position',
        icon: 'fas fa-shield-alt',
        priority: 'high',
        conditions: ['Cover available nearby', 'Can reach cover with movement']
      });
    }

    // Suggest movement if positioning is poor
    if (positionAnalysis && (positionAnalysis.overallQuality === 'poor' || positionAnalysis.overallQuality === 'terrible')) {
      alternatives.push({
        action: 'move',
        title: 'Reposition',
        description: 'Move to a better tactical position before attempting stealth',
        icon: 'fas fa-arrows-alt',
        priority: 'medium',
        conditions: ['Better positions available', 'Movement remaining']
      });
    }

    // Suggest Create a Diversion if observed by many
    if (positionAnalysis && positionAnalysis.observedByCount > positionAnalysis.hiddenFromCount) {
      alternatives.push({
        action: 'create-diversion',
        title: 'Create a Diversion',
        description: 'Distract observers to improve stealth chances',
        icon: 'fas fa-magic',
        priority: 'medium',
        conditions: ['Allies available to help', 'Diversion options available']
      });
    }

    // Suggest Point Out if trying to help allies
    if (actionData.actor && positionAnalysis && positionAnalysis.hiddenFromCount > 0) {
      alternatives.push({
        action: 'point-out',
        title: 'Point Out',
        description: 'Help allies locate hidden enemies instead',
        icon: 'fas fa-hand-point-right',
        priority: 'low',
        conditions: ['Hidden enemies present', 'Allies need assistance']
      });
    }

    // Suggest Seek if looking for hidden enemies
    alternatives.push({
      action: 'seek',
      title: 'Seek Action',
      description: 'Search for hidden enemies in the area',
      icon: 'fas fa-search',
      priority: 'low',
      conditions: ['Suspected hidden enemies', 'Good perception skill']
    });

    return alternatives.slice(0, 4); // Limit to top 4 alternatives
  }

  /**
   * Generates tactical recommendations
   * @param {Object} positionAnalysis - Position analysis
   * @param {Object} validationResult - Validation results
   * @returns {Array<Object>} Tactical recommendations
   * @private
   */
  static _generateTacticalRecommendations(positionAnalysis, validationResult) {
    const tactical = [];

    if (!positionAnalysis) return tactical;

    // Distance recommendations
    if (positionAnalysis.averageDistance < 15) {
      tactical.push({
        category: 'distance',
        title: 'Increase Distance',
        description: 'Move farther from observers to reduce detection chance',
        icon: 'fas fa-expand-arrows-alt',
        priority: 'high'
      });
    } else if (positionAnalysis.averageDistance > 60) {
      tactical.push({
        category: 'distance',
        title: 'Good Distance',
        description: 'Excellent distance from observers - maintain or improve',
        icon: 'fas fa-check-circle',
        priority: 'low'
      });
    }

    // Lighting recommendations
    if (positionAnalysis.brightLightCount > positionAnalysis.dimLightCount + positionAnalysis.darknessCount) {
      tactical.push({
        category: 'lighting',
        title: 'Seek Darkness',
        description: 'Move to areas with dim light or darkness for better concealment',
        icon: 'fas fa-moon',
        priority: 'medium'
      });
    } else if (positionAnalysis.darknessCount > 0) {
      tactical.push({
        category: 'lighting',
        title: 'Excellent Lighting',
        description: 'Darkness provides excellent concealment - exploit this advantage',
        icon: 'fas fa-star',
        priority: 'low'
      });
    }

    // Cover recommendations
    if (positionAnalysis.noCoverCount === positionAnalysis.validPositions) {
      tactical.push({
        category: 'cover',
        title: 'Find Cover',
        description: 'No cover detected - seek walls, obstacles, or terrain features',
        icon: 'fas fa-shield-alt',
        priority: 'high'
      });
    } else if (positionAnalysis.goodCoverCount > positionAnalysis.noCoverCount) {
      tactical.push({
        category: 'cover',
        title: 'Maintain Cover',
        description: 'Good cover position - maintain or improve current advantage',
        icon: 'fas fa-thumbs-up',
        priority: 'low'
      });
    }

    // Visibility recommendations
    if (positionAnalysis.observedByCount > positionAnalysis.hiddenFromCount + positionAnalysis.concealedFromCount) {
      tactical.push({
        category: 'visibility',
        title: 'Break Line of Sight',
        description: 'Too many observers can see you - use Hide action or move to concealment',
        icon: 'fas fa-eye-slash',
        priority: 'high'
      });
    }

    return tactical;
  }

  /**
   * Generates positioning recommendations
   * @param {Object} positionAnalysis - Position analysis
   * @returns {Array<Object>} Positioning recommendations
   * @private
   */
  static _generatePositioningRecommendations(positionAnalysis) {
    const positioning = [];

    if (!positionAnalysis) return positioning;

    // Directional recommendations
    if (positionAnalysis.bestCoverDirection) {
      positioning.push({
        type: 'direction',
        title: 'Best Cover Direction',
        description: `Move toward ${positionAnalysis.bestCoverDirection}`,
        icon: 'fas fa-compass',
        priority: 'medium'
      });
    }

    if (positionAnalysis.worstExposureDirection) {
      positioning.push({
        type: 'avoidance',
        title: 'Avoid Exposure',
        description: `Avoid ${positionAnalysis.worstExposureDirection}`,
        icon: 'fas fa-exclamation-triangle',
        priority: 'high'
      });
    }

    if (positionAnalysis.suggestedMovement) {
      positioning.push({
        type: 'movement',
        title: 'Suggested Movement',
        description: `Move ${positionAnalysis.suggestedMovement}`,
        icon: 'fas fa-arrows-alt',
        priority: 'medium'
      });
    }

    // Specific positioning advice based on quality
    switch (positionAnalysis.overallQuality) {
      case 'excellent':
        positioning.push({
          type: 'maintain',
          title: 'Maintain Position',
          description: 'Excellent position - stay put or make minimal adjustments',
          icon: 'fas fa-anchor',
          priority: 'low'
        });
        break;
      
      case 'terrible':
        positioning.push({
          type: 'relocate',
          title: 'Relocate Immediately',
          description: 'Current position is terrible - major repositioning required',
          icon: 'fas fa-running',
          priority: 'critical'
        });
        break;
    }

    return positioning;
  }

  /**
   * Generates condition-based recommendations
   * @param {Object} validationResult - Validation results
   * @param {Object} actionData - Action data
   * @returns {Array<Object>} Condition recommendations
   * @private
   */
  static _generateConditionRecommendations(validationResult, actionData) {
    const conditions = [];

    // Extract condition information from validation results
    const actor = actionData.actor;
    if (!actor) return conditions;

    // Check for beneficial conditions to maintain
    const beneficialConditions = SneakRecommendationEngine._extractBeneficialConditions(validationResult);
    if (beneficialConditions.length > 0) {
      conditions.push({
        type: 'maintain',
        title: 'Maintain Beneficial Conditions',
        description: `Keep these conditions: ${beneficialConditions.join(', ')}`,
        icon: 'fas fa-star',
        priority: 'medium'
      });
    }

    // Check for conditions to remove
    const harmfulConditions = SneakRecommendationEngine._extractHarmfulConditions(validationResult);
    if (harmfulConditions.length > 0) {
      conditions.push({
        type: 'remove',
        title: 'Remove Harmful Conditions',
        description: `Remove these conditions: ${harmfulConditions.join(', ')}`,
        icon: 'fas fa-times-circle',
        priority: 'high'
      });
    }

    // Suggest beneficial conditions to acquire
    const suggestedConditions = SneakRecommendationEngine._suggestBeneficialConditions(validationResult);
    if (suggestedConditions.length > 0) {
      conditions.push({
        type: 'acquire',
        title: 'Acquire Beneficial Conditions',
        description: `Consider gaining: ${suggestedConditions.join(', ')}`,
        icon: 'fas fa-plus-circle',
        priority: 'low'
      });
    }

    return conditions;
  }

  /**
   * Extracts beneficial conditions from validation results
   * @param {Object} validationResult - Validation results
   * @returns {Array<string>} Beneficial condition names
   * @private
   */
  static _extractBeneficialConditions(validationResult) {
    const beneficial = [];
    
    for (const recommendation of validationResult.recommendations || []) {
      if (recommendation.includes('beneficial conditions for stealth:')) {
        const match = recommendation.match(/beneficial conditions for stealth: (.+)/);
        if (match) {
          beneficial.push(...match[1].split(', '));
        }
      }
    }
    
    return beneficial;
  }

  /**
   * Extracts harmful conditions from validation results
   * @param {Object} validationResult - Validation results
   * @returns {Array<string>} Harmful condition names
   * @private
   */
  static _extractHarmfulConditions(validationResult) {
    const harmful = [];
    
    for (const error of validationResult.errors || []) {
      if (error.includes('conditions preventing stealth:')) {
        const match = error.match(/conditions preventing stealth: (.+)/);
        if (match) {
          harmful.push(...match[1].split(', '));
        }
      }
    }
    
    return harmful;
  }

  /**
   * Suggests beneficial conditions to acquire
   * @param {Object} validationResult - Validation results
   * @returns {Array<string>} Suggested condition names
   * @private
   */
  static _suggestBeneficialConditions(validationResult) {
    const suggestions = [];
    
    // Suggest based on warnings
    for (const warning of validationResult.warnings || []) {
      if (warning.includes('fully observed')) {
        suggestions.push('Hidden', 'Concealed');
      }
      if (warning.includes('no cover')) {
        suggestions.push('Cover');
      }
      if (warning.includes('bright light')) {
        suggestions.push('Darkness', 'Concealment');
      }
    }
    
    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Formats recommendations for display
   * @param {Object} recommendations - Recommendation data
   * @returns {Object} Formatted recommendations
   */
  static formatForDisplay(recommendations) {
    return {
      primary: recommendations.primary,
      sections: [
        {
          title: 'Alternative Actions',
          items: recommendations.alternatives,
          icon: 'fas fa-list-alt'
        },
        {
          title: 'Tactical Advice',
          items: recommendations.tactical,
          icon: 'fas fa-chess'
        },
        {
          title: 'Positioning',
          items: recommendations.positioning,
          icon: 'fas fa-map-marker-alt'
        },
        {
          title: 'Conditions',
          items: recommendations.conditions,
          icon: 'fas fa-magic'
        }
      ].filter(section => section.items.length > 0),
      priority: recommendations.priority
    };
  }
}