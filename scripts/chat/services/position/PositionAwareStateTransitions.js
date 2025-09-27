/**
 * Position-Aware State Transitions
 * 
 * This module tracks and manages visibility state transitions that occur
 * due to position changes during sneak actions. It provides sophisticated
 * logic for handling state changes that result from movement and positioning.
 */

import { VISIBILITY_STATES } from '../../../constants.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/error-handling-service.js';

/**
 * State transition data structure
 * @typedef {Object} StateTransition
 * @property {string} tokenId - Token ID
 * @property {string} transitionType - Type of transition ('position_based', 'roll_based', 'hybrid')
 * @property {string} fromState - Starting visibility state
 * @property {string} toState - Ending visibility state
 * @property {string} reason - Reason for the transition
 * @property {Object} positionContext - Position data context
 * @property {Object} rollContext - Roll data context
 * @property {number} timestamp - When transition occurred
 * @property {boolean} requiresConfirmation - Whether transition needs user confirmation
 * @property {Array<string>} warnings - Any warnings about the transition
 */

export class PositionAwareStateTransitions {
  constructor() {
    this._activeTransitions = new Map(); // Track ongoing transitions
    this._completedTransitions = new Map(); // Track completed transitions for rollback
    this._transitionHistory = new Map(); // Full transition history per token pair
    this._pendingConfirmations = new Set(); // Transitions awaiting confirmation
  }

  /**
   * Initiates a position-aware state transition
   * @param {Object} params - Transition parameters
   * @param {Token} params.observerToken - Observer token
   * @param {Token} params.targetToken - Target token (sneaking actor)
   * @param {string} params.newState - New visibility state
   * @param {Object} params.positionTransition - Position transition data
   * @param {Object} params.rollData - Roll data (outcome, total, DC, etc.)
   * @param {string} params.transitionReason - Reason for transition
   * @returns {Promise<Object>} Transition result
   */
  async initiateTransition(params) {
    const {
      observerToken,
      targetToken,
      newState,
      positionTransition,
      rollData,
      transitionReason
    } = params;

    try {

      // Validate transition parameters
      const validationResult = await this._validateTransition(params);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: 'Transition validation failed',
          validationResult,
          requiresUserIntervention: validationResult.severity === 'critical'
        };
      }

      // Determine transition type based on available data
      const transitionType = this._determineTransitionType(positionTransition, rollData);

      // Get current state for comparison
      const currentState = await this._getCurrentVisibilityState(observerToken, targetToken);

      // Create transition data
      const transitionId = `${observerToken.document.id}->${targetToken.document.id}-${Date.now()}`;
      const stateTransition = {
        transitionId,
        observerId: observerToken.document.id,
        targetId: targetToken.document.id,
        transitionType,
        fromState: currentState,
        toState: newState,
        reason: transitionReason,
        positionContext: positionTransition ? {
          startPosition: positionTransition.startPosition,
          endPosition: positionTransition.endPosition,
          transitionType: positionTransition.transitionType,
          hasChanged: positionTransition.hasChanged,
          impactOnDC: positionTransition.impactOnDC || 0
        } : null,
        rollContext: rollData ? {
          outcome: rollData.outcome,
          total: rollData.total,
          dc: rollData.dc,
          margin: rollData.margin,
          dieResult: rollData.dieResult
        } : null,
        timestamp: Date.now(),
        requiresConfirmation: validationResult.requiresConfirmation,
        warnings: validationResult.warnings || []
      };

      // Store active transition
      this._activeTransitions.set(transitionId, stateTransition);

      // Check if transition requires user confirmation
      if (stateTransition.requiresConfirmation) {
        this._pendingConfirmations.add(transitionId);
        return {
          success: false,
          pendingConfirmation: true,
          transitionId,
          confirmationData: {
            message: this._generateConfirmationMessage(stateTransition),
            options: this._getConfirmationOptions(stateTransition),
            stateTransition
          }
        };
      }

      // Apply the transition immediately
      const applicationResult = await this._applyTransition(stateTransition);
      
      if (applicationResult.success) {
        // Move to completed transitions
        this._completedTransitions.set(transitionId, stateTransition);
        this._activeTransitions.delete(transitionId);
        
        // Add to history
        this._addToTransitionHistory(stateTransition);
      }

      return {
        success: applicationResult.success,
        transitionId,
        appliedState: newState,
        transitionData: stateTransition,
        warnings: stateTransition.warnings,
        error: applicationResult.error
      };

    } catch (error) {
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.POSITION_TRACKER,
        error,
        { params, phase: 'initiate_transition' }
      );
      
      return {
        success: false,
        error: `Transition initiation failed: ${error.message}`,
        requiresUserIntervention: true
      };
    }
  }

  /**
   * Confirms a pending position-aware state transition
   * @param {string} transitionId - Transition ID
   * @param {boolean} confirmed - Whether user confirmed the transition
   * @param {string} modifiedState - Optional modified state if user chose to modify
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmTransition(transitionId, confirmed, modifiedState = null) {
    try {
      const stateTransition = this._activeTransitions.get(transitionId);
      if (!stateTransition) {
        return {
          success: false,
          error: 'Transition not found or already processed'
        };
      }

      this._pendingConfirmations.delete(transitionId);

      if (!confirmed) {
        // User rejected the transition
        this._activeTransitions.delete(transitionId);
        return {
          success: true,
          transitionApplied: false,
          reason: 'User cancelled transition'
        };
      }

      // If user provided a modified state, update the transition
      if (modifiedState && modifiedState !== stateTransition.toState) {
        
        stateTransition.toState = modifiedState;
        stateTransition.reason += ' (user modified)';
        stateTransition.userModified = true;
      }

      // Apply the confirmed transition
      const applicationResult = await this._applyTransition(stateTransition);
      
      if (applicationResult.success) {
        this._completedTransitions.set(transitionId, stateTransition);
        this._activeTransitions.delete(transitionId);
        this._addToTransitionHistory(stateTransition);
      }

      return {
        success: applicationResult.success,
        transitionApplied: applicationResult.success,
        appliedState: stateTransition.toState,
        error: applicationResult.error
      };

    } catch (error) {
      console.error('PF2E Visioner | Error confirming transition:', error);
      return {
        success: false,
        error: `Confirmation failed: ${error.message}`
      };
    }
  }

  /**
   * Rolls back a completed state transition
   * @param {string} transitionId - Transition ID to rollback
   * @returns {Promise<boolean>} Whether rollback succeeded
   */
  async rollbackTransition(transitionId) {
    try {
      const stateTransition = this._completedTransitions.get(transitionId);
      if (!stateTransition) {
        console.warn('PF2E Visioner | Cannot rollback - transition not found:', transitionId);
        return false;
      }


      // Apply reverse transition (back to original state)
      const rollbackResult = await this._applyStateChange(
        stateTransition.observerId,
        stateTransition.targetId,
        stateTransition.fromState
      );

      if (rollbackResult) {
        // Remove from completed transitions
        this._completedTransitions.delete(transitionId);
      }

      return rollbackResult;
    } catch (error) {
      console.error('PF2E Visioner | Rollback failed:', error);
      return false;
    }
  }

  /**
   * Gets all pending confirmations
   * @returns {Array<Object>} Pending confirmation data
   */
  getPendingConfirmations() {
    return Array.from(this._pendingConfirmations).map(transitionId => {
      const transition = this._activeTransitions.get(transitionId);
      return transition ? {
        transitionId,
        observer: canvas.tokens.get(transition.observerId)?.name || 'Unknown',
        target: canvas.tokens.get(transition.targetId)?.name || 'Unknown',
        fromState: transition.fromState,
        toState: transition.toState,
        reason: transition.reason,
        confirmationMessage: this._generateConfirmationMessage(transition)
      } : null;
    }).filter(Boolean);
  }

  /**
   * Gets transition history for a token pair
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @returns {Array<Object>} Transition history
   */
  getTransitionHistory(observerId, targetId) {
    const key = `${observerId}->${targetId}`;
    return this._transitionHistory.get(key) || [];
  }

  /**
   * Clears transition data for cleanup
   * @param {string} sessionId - Optional session ID to clear specific data
   */
  clearTransitionData(sessionId = null) {
    if (sessionId) {
      // Clear specific session data
      for (const [key, transition] of this._activeTransitions) {
        if (transition.sessionId === sessionId) {
          this._activeTransitions.delete(key);
        }
      }
      for (const [key, transition] of this._completedTransitions) {
        if (transition.sessionId === sessionId) {
          this._completedTransitions.delete(key);
        }
      }
    } else {
      // Clear all data
      this._activeTransitions.clear();
      this._completedTransitions.clear();
      this._pendingConfirmations.clear();
    }
  }

  // Private methods

  /**
   * Validates a state transition request
   * @param {Object} params - Transition parameters
   * @returns {Promise<Object>} Validation result
   * @private
   */
  async _validateTransition(params) {
    const validationResult = {
      isValid: true,
      severity: 'info',
      warnings: [],
      requiresConfirmation: false
    };

    try {
      const { observerToken, targetToken, newState, positionTransition, rollData } = params;

      // Validate tokens
      if (!observerToken?.document || !targetToken?.document) {
        validationResult.isValid = false;
        validationResult.severity = 'critical';
        validationResult.warnings.push('Invalid observer or target token');
        return validationResult;
      }

      // Validate new state
      if (!Object.keys(VISIBILITY_STATES).includes(newState)) {
        validationResult.isValid = false;
        validationResult.severity = 'critical';
        validationResult.warnings.push(`Invalid visibility state: ${newState}`);
        return validationResult;
      }

      // Check for conflicting transitions
      const currentState = await this._getCurrentVisibilityState(observerToken, targetToken);
      if (currentState === newState) {
        validationResult.warnings.push('No state change - target already in proposed state');
        validationResult.requiresConfirmation = true;
      }

      // Validate position transition data if provided
      if (positionTransition) {
        if (!positionTransition.startPosition || !positionTransition.endPosition) {
          validationResult.warnings.push('Incomplete position transition data');
          validationResult.severity = 'warning';
        }

        // Check for dramatic state changes that might need confirmation
        const positionChangeSignificant = Math.abs(
          (positionTransition.endPosition?.stealthBonus || 0) - 
          (positionTransition.startPosition?.stealthBonus || 0)
        ) >= 3;

        if (positionChangeSignificant) {
          validationResult.requiresConfirmation = true;
          validationResult.warnings.push('Significant position change detected');
        }
      }

      // Validate roll data consistency if provided
      if (rollData && positionTransition) {
        const rollSuccess = ['success', 'critical-success'].includes(rollData.outcome);
        const positionImproved = positionTransition.transitionType === 'improved';
        
        if (!rollSuccess && positionImproved && newState === 'undetected') {
          validationResult.warnings.push('Failed roll but improved position leading to undetected - unusual');
          validationResult.requiresConfirmation = true;
        }
      }

      return validationResult;
    } catch (error) {
      console.warn('PF2E Visioner | Transition validation failed:', error);
      return {
        isValid: false,
        severity: 'critical',
        warnings: [`Validation error: ${error.message}`],
        requiresConfirmation: false
      };
    }
  }

  /**
   * Determines the type of state transition
   * @param {Object} positionTransition - Position transition data
   * @param {Object} rollData - Roll data
   * @returns {string} Transition type
   * @private
   */
  _determineTransitionType(positionTransition, rollData) {
    if (positionTransition && rollData) {
      return 'hybrid'; // Both position and roll data available
    } else if (positionTransition) {
      return 'position_based'; // Only position data
    } else if (rollData) {
      return 'roll_based'; // Only roll data
    } else {
      return 'manual'; // Neither - manual override
    }
  }

  /**
   * Gets current visibility state between tokens
   * @param {Token} observerToken - Observer token
   * @param {Token} targetToken - Target token
   * @returns {Promise<string>} Current visibility state
   * @private
   */
  async _getCurrentVisibilityState(observerToken, targetToken) {
    try {
      const { getVisibilityBetween } = await import('../../../utils.js');
      return getVisibilityBetween(observerToken, targetToken) || 'observed';
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get current visibility state:', error);
      return 'observed';
    }
  }

  /**
   * Applies a state transition
   * @param {Object} stateTransition - State transition data
   * @returns {Promise<Object>} Application result
   * @private
   */
  async _applyTransition(stateTransition) {
    try {
      const success = await this._applyStateChange(
        stateTransition.observerId,
        stateTransition.targetId,
        stateTransition.toState
      );

      return {
        success,
        error: success ? null : 'Failed to apply visibility state change'
      };
    } catch (error) {
      console.error('PF2E Visioner | Error applying transition:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Applies visibility state change between tokens
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @param {string} newState - New visibility state
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _applyStateChange(observerId, targetId, newState) {
    try {
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken || !targetToken) {
        console.warn('PF2E Visioner | Cannot apply state change - tokens not found');
        return false;
      }
     
    } catch (error) {
      console.error('PF2E Visioner | Failed to apply state change:', error);
      return false;
    }
  }

  /**
   * Generates confirmation message for user
   * @param {Object} stateTransition - State transition data
   * @returns {string} Confirmation message
   * @private
   */
  _generateConfirmationMessage(stateTransition) {
    const observer = canvas.tokens.get(stateTransition.observerId)?.name || 'Observer';
    const target = canvas.tokens.get(stateTransition.targetId)?.name || 'Target';
    
    let message = `Change ${observer}'s view of ${target} from ${stateTransition.fromState} to ${stateTransition.toState}?`;
    
    if (stateTransition.reason) {
      message += `\n\nReason: ${stateTransition.reason}`;
    }

    if (stateTransition.warnings.length > 0) {
      message += `\n\nWarnings:\n• ${stateTransition.warnings.join('\n• ')}`;
    }

    return message;
  }

  /**
   * Gets confirmation options for user choice
   * @param {Object} stateTransition - State transition data
   * @returns {Array<Object>} Confirmation options
   * @private
   */
  _getConfirmationOptions(stateTransition) {
    return [
      { id: 'confirm', label: 'Apply Change', primary: true },
      { id: 'cancel', label: 'Cancel', secondary: true },
      { 
        id: 'modify', 
        label: 'Choose Different State', 
        options: Object.keys(VISIBILITY_STATES).filter(state => 
          state !== stateTransition.fromState
        )
      }
    ];
  }

  /**
   * Adds transition to history
   * @param {Object} stateTransition - State transition data
   * @private
   */
  _addToTransitionHistory(stateTransition) {
    const key = `${stateTransition.observerId}->${stateTransition.targetId}`;
    const history = this._transitionHistory.get(key) || [];
    
    history.push({
      ...stateTransition,
      completedAt: Date.now()
    });

    // Keep only last 10 transitions per pair
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    this._transitionHistory.set(key, history);
  }
}

// Export singleton instance
export default new PositionAwareStateTransitions();
