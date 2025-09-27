/**
 * Unified Apply/Revert Service - Consolidated apply and revert logic
 * Eliminates duplication of apply/revert patterns across action handlers
 * Provides a single, consistent interface for state changes
 */

import { notify } from './infra/notifications.js';

/**
 * Apply/Revert operation result
 * @typedef {Object} OperationResult
 * @property {boolean} success - Whether operation succeeded
 * @property {number} changesCount - Number of changes applied/reverted
 * @property {Array<string>} errors - Any errors that occurred
 * @property {Array<string>} warnings - Any warnings
 * @property {string} transactionId - Transaction ID for rollback (if applicable)
 */

/**
 * Operation context
 * @typedef {Object} OperationContext
 * @property {string} actionType - Type of action (e.g., 'sneak', 'seek', 'hide')
 * @property {string} sessionId - Session ID for the operation
 * @property {Object} actionData - Original action data
 * @property {Array} outcomes - Outcomes to apply/revert
 * @property {HTMLElement} button - Button element to update
 * @property {boolean} skipNotification - Whether to skip user notifications
 */

export class UnifiedApplyRevert {
  constructor() {
    this._activeOperations = new Map(); // Track active operations
    this._operationHistory = new Map(); // Track operation history for revert
  }

  /**
   * Apply changes using the appropriate service
   * @param {OperationContext} context - Operation context
   * @returns {Promise<OperationResult>} Operation result
   */
  async applyChanges(context) {
    const operationId = this._generateOperationId(context);
    
    try {
      // Mark operation as active
      this._activeOperations.set(operationId, {
        type: 'apply',
        context,
        startTime: Date.now()
      });

      // Determine apply strategy based on action type
      const strategy = this._determineApplyStrategy(context);
      
      // Execute apply operation
      const result = await this._executeApply(context, strategy);
      
      // Handle result
      if (result.success) {
        // Store for potential revert
        this._storeOperationForRevert(operationId, context, result);
        
        // Update UI
        this._updateButtonToRevert(context.button);
        
        // Show notification
        if (!context.skipNotification) {
          notify.info(`Applied ${result.changesCount} changes successfully`);
        }
      } else {
        // Handle failure
        if (!context.skipNotification) {
          notify.error(`Failed to apply changes: ${result.errors.join('; ')}`);
        }
      }
      
      return result;
    } catch (error) {

      
      return {
        success: false,
        changesCount: 0,
        errors: [error.message],
        warnings: [],
        transactionId: null
      };
    } finally {
      // Clean up active operation
      this._activeOperations.delete(operationId);
    }
  }

  /**
   * Revert changes using the appropriate service
   * @param {OperationContext} context - Operation context
   * @returns {Promise<OperationResult>} Operation result
   */
  async revertChanges(context) {
    const operationId = this._generateOperationId(context);
    
    try {
      // Mark operation as active
      this._activeOperations.set(operationId, {
        type: 'revert',
        context,
        startTime: Date.now()
      });

      // Find stored operation to revert
      const storedOperation = this._findStoredOperation(context);
      if (!storedOperation) {
        throw new Error('No stored operation found to revert');
      }

      // Determine revert strategy
      const strategy = this._determineRevertStrategy(context, storedOperation);
      
      // Execute revert operation
      const result = await this._executeRevert(context, storedOperation, strategy);
      
      // Handle result
      if (result.success) {
        // Remove from stored operations
        this._removeStoredOperation(context);
        
        // Update UI
        this._updateButtonToApply(context.button);
        
        // Show notification
        if (!context.skipNotification) {
          notify.info('Changes reverted successfully');
        }
      } else {
        // Handle failure
        if (!context.skipNotification) {
          notify.error(`Failed to revert changes: ${result.errors.join('; ')}`);
        }
      }
      
      return result;
    } catch (error) {
      
      return {
        success: false,
        changesCount: 0,
        errors: [error.message],
        warnings: [],
        transactionId: null
      };
    } finally {
      // Clean up active operation
      this._activeOperations.delete(operationId);
    }
  }

  /**
   * Check if an operation can be reverted
   * @param {OperationContext} context - Operation context
   * @returns {boolean} Whether operation can be reverted
   */
  canRevert(context) {
    return this._findStoredOperation(context) !== null;
  }

  /**
   * Get operation status
   * @param {OperationContext} context - Operation context
   * @returns {Object} Operation status
   */
  getOperationStatus(context) {
    const operationId = this._generateOperationId(context);
    const activeOperation = this._activeOperations.get(operationId);
    const storedOperation = this._findStoredOperation(context);
    
    return {
      isActive: !!activeOperation,
      canRevert: !!storedOperation,
      operationType: activeOperation?.type || null,
      startTime: activeOperation?.startTime || null
    };
  }

  /**
   * Clear operation history for cleanup
   * @param {string} sessionId - Session ID to clear
   */
  clearOperationHistory(sessionId) {
    for (const [key, operation] of this._operationHistory) {
      if (operation.context.sessionId === sessionId) {
        this._operationHistory.delete(key);
      }
    }
  }

  // Private methods

  /**
   * Determine apply strategy based on context
   * @private
   */
  _determineApplyStrategy(context) {
    switch (context.actionType) {
      case 'sneak':
        return 'sneak-core';
      case 'seek':
      case 'hide':
      case 'point-out':
        return 'standard-action';
      default:
        return 'fallback';
    }
  }

  /**
   * Determine revert strategy
   * @private
   */
  _determineRevertStrategy(context, storedOperation) {
    if (storedOperation.result.transactionId) {
      return 'transaction-rollback';
    }
    
    switch (context.actionType) {
      case 'sneak':
        return 'sneak-core-revert';
      default:
        return 'standard-revert';
    }
  }

  /**
   * Execute apply operation
   * @private
   */
  async _executeApply(context, strategy) {
    switch (strategy) {
      case 'sneak-core': {
        // Use SneakCore for sneak actions
        const { default: sneakCore } = await import('./sneak-core.js');
        const result = await sneakCore.applyResults(context.sessionId, context.outcomes);
        
        return {
          success: result.success,
          changesCount: context.outcomes?.length || 0,
          errors: result.errors || [],
          warnings: result.warnings || [],
          transactionId: result.transactionId
        };
      }
      
      case 'standard-action': {
        // Use standard action handler apply logic
        const { applyVisibilityChanges } = await import('./infra/shared-utils.js');
        
        // Convert outcomes to changes
        const changes = context.outcomes.map(outcome => ({
          observer: outcome.token,
          target: context.actionData.actor,
          newVisibility: outcome.newVisibility,
          oldVisibility: outcome.oldVisibility
        }));
        
        const appliedCount = await applyVisibilityChanges(
          context.actionData.actor,
          changes,
          { direction: 'observer_to_target' }
        );
        
        return {
          success: appliedCount > 0,
          changesCount: appliedCount,
          errors: [],
          warnings: [],
          transactionId: null
        };
      }
      
      default: {
        // Fallback strategy
        return {
          success: false,
          changesCount: 0,
          errors: ['Unknown apply strategy'],
          warnings: [],
          transactionId: null
        };
      }
    }
  }

  /**
   * Execute revert operation
   * @private
   */
  async _executeRevert(context, storedOperation, strategy) {
    switch (strategy) {
      case 'sneak-core-revert': {
        // Use SneakCore for sneak revert
        const { default: sneakCore } = await import('./sneak-core.js');
        const success = await sneakCore.revertResults(context.sessionId);
        
        return {
          success,
          changesCount: success ? (context.outcomes?.length || 0) : 0,
          errors: success ? [] : ['Revert failed'],
          warnings: [],
          transactionId: null
        };
      }
      
      case 'transaction-rollback': {
        // Use transaction rollback
        const { default: dualSystemApplication } = await import('./dual-system-result-application.js');
        const success = await dualSystemApplication.rollbackTransaction(
          storedOperation.result.transactionId
        );
        
        return {
          success,
          changesCount: success ? (context.outcomes?.length || 0) : 0,
          errors: success ? [] : ['Transaction rollback failed'],
          warnings: [],
          transactionId: null
        };
      }
      
      default: {
        // Standard revert - reverse the changes
        const { applyVisibilityChanges } = await import('./infra/shared-utils.js');
        
        // Create reverse changes
        const reverseChanges = context.outcomes.map(outcome => ({
          observer: outcome.token,
          target: context.actionData.actor,
          newVisibility: outcome.oldVisibility,
          oldVisibility: outcome.newVisibility
        }));
        
        const revertedCount = await applyVisibilityChanges(
          context.actionData.actor,
          reverseChanges,
          { direction: 'observer_to_target' }
        );
        
        return {
          success: revertedCount > 0,
          changesCount: revertedCount,
          errors: [],
          warnings: [],
          transactionId: null
        };
      }
    }
  }

  /**
   * Generate operation ID
   * @private
   */
  _generateOperationId(context) {
    return `${context.actionType}-${context.sessionId || context.actionData?.messageId || Date.now()}`;
  }

  /**
   * Store operation for potential revert
   * @private
   */
  _storeOperationForRevert(operationId, context, result) {
    this._operationHistory.set(operationId, {
      context,
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Find stored operation
   * @private
   */
  _findStoredOperation(context) {
    const operationId = this._generateOperationId(context);
    return this._operationHistory.get(operationId) || null;
  }

  /**
   * Remove stored operation
   * @private
   */
  _removeStoredOperation(context) {
    const operationId = this._generateOperationId(context);
    this._operationHistory.delete(operationId);
  }

  /**
   * Update button to revert state
   * @private
   */
  _updateButtonToRevert(button) {
    if (button) {
      button.textContent = 'Revert';
      button.classList.remove('apply');
      button.classList.add('revert');
      button.disabled = false;
    }
  }

  /**
   * Update button to apply state
   * @private
   */
  _updateButtonToApply(button) {
    if (button) {
      button.textContent = 'Apply';
      button.classList.remove('revert');
      button.classList.add('apply');
      button.disabled = false;
    }
  }
}

export default new UnifiedApplyRevert();