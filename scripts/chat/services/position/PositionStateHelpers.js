/**
 * Position State Helper Functions
 * Provides utility functions for position state comparison and analysis
 * in the enhanced sneak AVS integration system.
 */

import {
  validatePositionState,
  validatePositionTransition
} from './PositionStateModels.js';

/**
 * Compares two position states to determine if they are equal
 * @param {PositionState} state1 - First position state
 * @param {PositionState} state2 - Second position state
 * @param {Object} options - Comparison options
 * @param {boolean} options.ignoreTimestamp - Whether to ignore timestamp differences
 * @param {boolean} options.ignoreSystemErrors - Whether to ignore system error differences
 * @returns {boolean} Whether the states are equal
 */
export function comparePositionStates(state1, state2, options = {}) {
  // By default, ignore timestamp differences because states are often captured at different moments
  // Callers can opt-in to timestamp comparison by passing ignoreTimestamp: false
  const { ignoreTimestamp = true, ignoreSystemErrors = false } = options;

  // Validate inputs
  const validation1 = validatePositionState(state1);
  const validation2 = validatePositionState(state2);

  if (!validation1.isValid || !validation2.isValid) {
    console.warn('PF2E Visioner | Invalid position states in comparison:', {
      state1Errors: validation1.errors,
      state2Errors: validation2.errors
    });
    return false;
  }

  // Compare all fields except those optionally ignored
  const fieldsToCompare = [
    'avsVisibility',
    'avsCalculated',
    'coverState',
    'coverCalculated',
    'coverOverride',
    'stealthBonus',
    'effectiveVisibility',
    'distance',
    'hasLineOfSight',
    'lightingConditions',
    'avsEnabled',
    'autoCoverEnabled'
  ];

  if (!ignoreTimestamp) {
    fieldsToCompare.push('timestamp');
  }

  // Compare basic fields
  for (const field of fieldsToCompare) {
    if (state1[field] !== state2[field]) {
      return false;
    }
  }

  // Compare system errors array if not ignored
  if (!ignoreSystemErrors) {
    if (state1.systemErrors.length !== state2.systemErrors.length) {
      return false;
    }

    for (let i = 0; i < state1.systemErrors.length; i++) {
      if (state1.systemErrors[i] !== state2.systemErrors[i]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Determines if a position state change represents an improvement for stealth
 * @param {PositionState} fromState - Starting position state
 * @param {PositionState} toState - Ending position state
 * @returns {Object} Analysis of the improvement
 */
export function analyzeStealthImprovement(fromState, toState) {
  // Validate inputs
  const validation1 = validatePositionState(fromState);
  const validation2 = validatePositionState(toState);

  if (!validation1.isValid || !validation2.isValid) {
    return {
      isImprovement: false,
      reason: 'Invalid position states',
      details: {
        fromStateErrors: validation1.errors,
        toStateErrors: validation2.errors
      }
    };
  }

  const analysis = {
    isImprovement: false,
    reason: '',
    details: {
      visibilityChange: null,
      coverChange: null,
      stealthBonusChange: 0,
      overallImpact: 'neutral'
    }
  };

  // Analyze visibility change
  const visibilityImprovement = analyzeVisibilityChange(
    fromState.avsVisibility,
    toState.avsVisibility
  );
  analysis.details.visibilityChange = visibilityImprovement;

  // Analyze cover change
  const coverImprovement = analyzeCoverChange(
    fromState.coverState,
    toState.coverState,
    fromState.stealthBonus,
    toState.stealthBonus
  );
  analysis.details.coverChange = coverImprovement;
  analysis.details.stealthBonusChange = toState.stealthBonus - fromState.stealthBonus;

  // Determine overall improvement
  const hasVisibilityImprovement = visibilityImprovement.isImprovement;
  const hasCoverImprovement = coverImprovement.isImprovement;
  const hasVisibilityWorsening = visibilityImprovement.isWorsening;
  const hasCoverWorsening = coverImprovement.isWorsening;

  if (hasVisibilityImprovement || hasCoverImprovement) {
    if (hasVisibilityWorsening || hasCoverWorsening) {
      analysis.details.overallImpact = 'mixed';
      analysis.reason = 'Mixed changes - some improvements, some worsenings';
    } else {
      analysis.isImprovement = true;
      analysis.details.overallImpact = 'improved';
      analysis.reason = 'Position improved for stealth';
    }
  } else if (hasVisibilityWorsening || hasCoverWorsening) {
    analysis.details.overallImpact = 'worsened';
    analysis.reason = 'Position worsened for stealth';
  } else {
    analysis.details.overallImpact = 'unchanged';
    analysis.reason = 'No significant change in stealth position';
  }

  return analysis;
}

/**
 * Analyzes visibility state change for stealth purposes
 * @param {string} fromVisibility - Starting visibility state
 * @param {string} toVisibility - Ending visibility state
 * @returns {Object} Visibility change analysis
 */
export function analyzeVisibilityChange(fromVisibility, toVisibility) {
  // Define stealth preference order (better for stealth = higher value)
  const stealthValues = {
    'observed': 0,
    'concealed': 1,
    'hidden': 2,
    'undetected': 3
  };

  const fromValue = stealthValues[fromVisibility] ?? 0;
  const toValue = stealthValues[toVisibility] ?? 0;
  const change = toValue - fromValue;

  return {
    from: fromVisibility,
    to: toVisibility,
    change,
    isImprovement: change > 0,
    isWorsening: change < 0,
    isUnchanged: change === 0,
    description: getVisibilityChangeDescription(fromVisibility, toVisibility, change)
  };
}

/**
 * Analyzes cover state change for stealth purposes
 * @param {string} fromCover - Starting cover state
 * @param {string} toCover - Ending cover state
 * @param {number} fromBonus - Starting stealth bonus
 * @param {number} toBonus - Ending stealth bonus
 * @returns {Object} Cover change analysis
 */
export function analyzeCoverChange(fromCover, toCover, fromBonus, toBonus) {
  // Define cover preference order (better for stealth = higher value)
  const coverValues = {
    'none': 0,
    'lesser': 1,
    'standard': 2,
    'greater': 3
  };

  const fromValue = coverValues[fromCover] ?? 0;
  const toValue = coverValues[toCover] ?? 0;
  const coverChange = toValue - fromValue;
  const bonusChange = toBonus - fromBonus;

  return {
    from: fromCover,
    to: toCover,
    coverChange,
    bonusChange,
    isImprovement: coverChange > 0 || bonusChange > 0,
    isWorsening: coverChange < 0 || bonusChange < 0,
    isUnchanged: coverChange === 0 && bonusChange === 0,
    description: getCoverChangeDescription(fromCover, toCover, bonusChange)
  };
}

/**
 * Gets a human-readable description of visibility change
 * @param {string} from - Starting visibility
 * @param {string} to - Ending visibility
 * @param {number} change - Numeric change value
 * @returns {string} Description of the change
 */
function getVisibilityChangeDescription(from, to, change) {
  if (change === 0) {
    return `Visibility unchanged (${from})`;
  }

  if (change > 0) {
    return `Visibility improved from ${from} to ${to}`;
  }

  return `Visibility worsened from ${from} to ${to}`;
}

/**
 * Gets a human-readable description of cover change
 * @param {string} from - Starting cover state
 * @param {string} to - Ending cover state
 * @param {number} bonusChange - Change in stealth bonus
 * @returns {string} Description of the change
 */
function getCoverChangeDescription(from, to, bonusChange) {
  if (from === to && bonusChange === 0) {
    return `Cover unchanged (${from})`;
  }

  if (bonusChange > 0) {
    return `Cover improved from ${from} to ${to} (+${bonusChange} stealth bonus)`;
  }

  if (bonusChange < 0) {
    return `Cover worsened from ${from} to ${to} (${bonusChange} stealth bonus)`;
  }

  return `Cover changed from ${from} to ${to} (no bonus change)`;
}

/**
 * Calculates the effective DC modifier based on position state
 * @param {PositionState} positionState - Position state to analyze
 * @returns {Object} DC modifier information
 */
export function calculateDCModifier(positionState) {
  const validation = validatePositionState(positionState);
  if (!validation.isValid) {
    return {
      modifier: 0,
      source: 'error',
      description: 'Invalid position state',
      errors: validation.errors
    };
  }

  let modifier = 0;
  const sources = [];

  // Add stealth bonus from cover
  if (positionState.stealthBonus > 0) {
    modifier += positionState.stealthBonus;
    sources.push(`+${positionState.stealthBonus} from ${positionState.coverState} cover`);
  }

  // Add visibility-based modifiers (if any specific rules apply)
  // This could be expanded based on specific game rules

  // Add lighting condition modifiers (if any specific rules apply)
  // This could be expanded based on specific game rules

  return {
    modifier,
    source: sources.length > 0 ? sources.join(', ') : 'none',
    description: sources.length > 0
      ? `DC modifier: ${modifier >= 0 ? '+' : ''}${modifier} (${sources.join(', ')})`
      : 'No DC modifiers apply',
    breakdown: sources
  };
}

/**
 * Finds the best position state from a collection for stealth purposes
 * @param {Array<PositionState>} positionStates - Array of position states to compare
 * @returns {Object} Best position analysis
 */
export function findBestPositionForStealth(positionStates) {
  if (!Array.isArray(positionStates) || positionStates.length === 0) {
    return {
      bestPosition: null,
      bestIndex: -1,
      reason: 'No position states provided'
    };
  }

  // Validate all position states
  const validStates = [];
  const validIndices = [];

  for (let i = 0; i < positionStates.length; i++) {
    const validation = validatePositionState(positionStates[i]);
    if (validation.isValid) {
      validStates.push(positionStates[i]);
      validIndices.push(i);
    }
  }

  if (validStates.length === 0) {
    return {
      bestPosition: null,
      bestIndex: -1,
      reason: 'No valid position states found'
    };
  }

  // Score each position state for stealth effectiveness
  let bestScore = -Infinity;
  let bestIndex = -1;
  let bestPosition = null;

  for (let i = 0; i < validStates.length; i++) {
    const state = validStates[i];
    const score = calculateStealthScore(state);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = validIndices[i];
      bestPosition = state;
    }
  }

  return {
    bestPosition,
    bestIndex,
    score: bestScore,
    reason: `Best position with stealth score of ${bestScore}`
  };
}

/**
 * Calculates a stealth effectiveness score for a position state
 * @param {PositionState} positionState - Position state to score
 * @returns {number} Stealth effectiveness score (higher is better)
 */
export function calculateStealthScore(positionState) {
  const validation = validatePositionState(positionState);
  if (!validation.isValid) {
    return -Infinity;
  }

  let score = 0;

  // Visibility state scoring (higher is better for stealth)
  const visibilityScores = {
    'observed': 0,
    'concealed': 10,
    'hidden': 20,
    'undetected': 30
  };
  score += visibilityScores[positionState.avsVisibility] || 0;

  // Cover state scoring
  const coverScores = {
    'none': 0,
    'lesser': 5,
    'standard': 10,
    'greater': 15
  };
  score += coverScores[positionState.coverState] || 0;

  // Stealth bonus scoring
  score += positionState.stealthBonus;

  // Lighting condition scoring (darkness is better for stealth)
  const lightingScores = {
    'bright': -5,
    'dim': 0,
    'darkness': 5,
    'unknown': 0
  };
  score += lightingScores[positionState.lightingConditions] || 0;

  // Distance scoring (closer is generally riskier, but this depends on context)
  // For now, we'll give a small bonus for reasonable distances
  if (positionState.distance >= 10 && positionState.distance <= 30) {
    score += 2;
  }

  // Line of sight penalty (being seen is bad for stealth)
  if (positionState.hasLineOfSight) {
    score -= 3;
  }

  // System error penalty
  if (positionState.systemErrors.length > 0) {
    score -= positionState.systemErrors.length * 2;
  }

  return score;
}

/**
 * Groups position transitions by their transition type
 * @param {Array<PositionTransition>} transitions - Array of position transitions
 * @returns {Object} Grouped transitions by type
 */
export function groupTransitionsByType(transitions) {
  if (!Array.isArray(transitions)) {
    return {
      improved: [],
      worsened: [],
      unchanged: [],
      invalid: []
    };
  }

  const groups = {
    improved: [],
    worsened: [],
    unchanged: [],
    invalid: []
  };

  for (const transition of transitions) {
    const validation = validatePositionTransition(transition);
    if (!validation.isValid) {
      groups.invalid.push(transition);
      continue;
    }

    const type = transition.transitionType;
    if (groups[type]) {
      groups[type].push(transition);
    } else {
      groups.invalid.push(transition);
    }
  }

  return groups;
}

/**
 * Summarizes a collection of position transitions
 * @param {Array<PositionTransition>} transitions - Array of position transitions
 * @returns {Object} Summary of transitions
 */
export function summarizeTransitions(transitions) {
  if (!Array.isArray(transitions)) {
    return {
      total: 0,
      improved: 0,
      worsened: 0,
      unchanged: 0,
      invalid: 0,
      averageStealthBonusChange: 0,
      averageImpactOnDC: 0
    };
  }

  const groups = groupTransitionsByType(transitions);
  const validTransitions = [...groups.improved, ...groups.worsened, ...groups.unchanged];

  let totalStealthBonusChange = 0;
  let totalImpactOnDC = 0;

  for (const transition of validTransitions) {
    totalStealthBonusChange += transition.stealthBonusChange;
    totalImpactOnDC += transition.impactOnDC;
  }

  return {
    total: transitions.length,
    improved: groups.improved.length,
    worsened: groups.worsened.length,
    unchanged: groups.unchanged.length,
    invalid: groups.invalid.length,
    averageStealthBonusChange: validTransitions.length > 0
      ? totalStealthBonusChange / validTransitions.length
      : 0,
    averageImpactOnDC: validTransitions.length > 0
      ? totalImpactOnDC / validTransitions.length
      : 0
  };
}