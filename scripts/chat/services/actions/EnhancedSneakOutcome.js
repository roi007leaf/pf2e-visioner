/**
 * Enhanced Sneak Outcome Determination System
 * 
 * This module provides sophisticated outcome determination for sneak actions
 * based on start/end position qualifications, AVS system decisions, and 
 * roll results vs perception DC.
 */

import { getDefaultNewStateFor } from '../data/action-state-config.js';

/**
 * Enhanced outcome determination for sneak actions
 */
export class EnhancedSneakOutcome {
  
  /**
   * Determines if a position qualifies for sneak based on visibility state
   * @param {string} visibilityState - The visibility state ('observed', 'concealed', 'hidden', 'undetected')
   * @param {boolean} isStartPosition - Whether this is a start position (different rules)
   * @param {string} coverState - The cover state ('none', 'standard', 'greater', etc.) - only used for end positions
   * @returns {boolean} Whether this position qualifies for sneak
   */
  static doesPositionQualifyForSneak(visibilityState, isStartPosition = false, coverState = 'none') {
    if (isStartPosition) {
      // Start position must be Hidden or Undetected to attempt Sneak
      return visibilityState === 'hidden' || visibilityState === 'undetected';
    } else {
      // End position needs concealment OR cover to maintain stealth
      const hasConcealment = visibilityState === 'concealed';
      const hasCover = coverState && (coverState === 'standard' || coverState === 'greater');
      return hasConcealment || hasCover;
    }
  }

  /**
   * Determines the final outcome state based on position qualifications and roll results
   * @param {Object} params - Parameters for outcome determination
   * @param {string} params.startVisibilityState - Starting visibility state
   * @param {string} params.endVisibilityState - Ending visibility state
   * @param {string} params.currentVisibilityState - Current visibility state from AVS
   * @param {string} params.rollOutcome - Roll outcome ('critical-success', 'success', 'failure', 'critical-failure')
   * @param {number} params.rollTotal - Total roll result
   * @param {number} params.perceptionDC - Observer's perception DC
   * @param {number} params.dieResult - Die roll result (for critical determination)
   * @param {Object} params.observerToken - Observer token
   * @param {Object} params.sneakingToken - Sneaking token
   * @param {Object} params.positionTransition - Position transition data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enhanced outcome determination result
   */
  static async determineEnhancedOutcome(params, options = {}) {
    const {
      startVisibilityState,
      endVisibilityState,
      currentVisibilityState,
      rollOutcome,
      rollTotal,
      perceptionDC,
      dieResult,
      observerToken,
      sneakingToken,
      positionTransition
    } = params;

    // Check position qualifications
    const startQualifies = this.doesPositionQualifyForSneak(startVisibilityState, true);
    const endCoverState = positionTransition?.endPosition?.coverState;
    const endQualifies = this.doesPositionQualifyForSneak(endVisibilityState, false, endCoverState);

    let finalOutcome = {
      newVisibility: currentVisibilityState,
      outcomeReason: 'standard',
      avsDecisionUsed: false,
      positionImpact: null,
      enhancedLogic: true
    };

    // Case 1: Start OR end position doesn't qualify for sneak
    // -> Set newVisibility to 'observed' (sneak fails)
    if (!startQualifies || !endQualifies) {
      
      finalOutcome.newVisibility = 'observed';
      finalOutcome.outcomeReason = !startQualifies && !endQualifies 
        ? 'neither_position_qualified' 
        : !startQualifies 
          ? 'start_position_unqualified' 
          : 'end_position_unqualified';
      finalOutcome.enhancedLogic = true;
      finalOutcome.positionImpact = 'sneak_failed_due_to_position';

    // Case 2: Both start and end positions qualify for sneak
    // -> Use regular calculation from action-state-config.js
    } else {
      
      // Use the standard outcome determination from action-state-config.js
      const standardOutcome = getDefaultNewStateFor('sneak', currentVisibilityState, rollOutcome);
      finalOutcome.newVisibility = standardOutcome || currentVisibilityState;
      finalOutcome.outcomeReason = 'both_positions_qualified_standard_calculation';
      finalOutcome.enhancedLogic = true;
      finalOutcome.positionImpact = 'sneak_successful';
    }

    // Add additional outcome metadata
    finalOutcome.positionQualifications = {
      startQualifies,
      endQualifies,
      startState: startVisibilityState,
      endState: endVisibilityState
    };

    finalOutcome.rollData = {
      outcome: rollOutcome,
      total: rollTotal,
      dc: perceptionDC,
      margin: rollTotal - perceptionDC,
      dieResult
    };

    // Apply position-aware state transition if needed
    if (finalOutcome.enhancedLogic && (finalOutcome.avsDecisionUsed || finalOutcome.positionImpact)) {
      try {
        const { default: positionAwareStateTransitions } = await import('../position/PositionAwareStateTransitions.js');
        
        const transitionResult = await positionAwareStateTransitions.initiateTransition({
          observerToken,
          targetToken: sneakingToken,
          newState: finalOutcome.newVisibility,
          positionTransition,
          rollData: finalOutcome.rollData,
          transitionReason: finalOutcome.outcomeReason
        });
        
        if (transitionResult.success) {
          finalOutcome.stateTransitionApplied = true;
          finalOutcome.transitionId = transitionResult.transitionId;
        } else if (transitionResult.pendingConfirmation) {
          finalOutcome.pendingConfirmation = true;
          finalOutcome.confirmationData = transitionResult.confirmationData;
        } else {
          finalOutcome.stateTransitionFailed = true;
          finalOutcome.stateTransitionError = transitionResult.error;
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to apply position-aware state transition:', error);
        finalOutcome.stateTransitionFailed = true;
        finalOutcome.stateTransitionError = error.message;
      }
    }

    return finalOutcome;
  }

}

export default EnhancedSneakOutcome;
