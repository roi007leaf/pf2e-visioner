/**
 * Dual System Result Application
 * Handles application of results to both AVS and Auto-Cover systems
 * This is the main integration point for applying visibility and cover changes
 */

import * as SharedUtils from './infra/shared-utils.js';
import AvsOverrideManager from './infra/avs-override-manager.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';

class DualSystemResultApplication {
  constructor() {
    this._transactionId = 0;
    this._activeTransactions = new Map();
  }

  /**
   * Generate a unique transaction ID
   * @returns {string}
   */
  _generateTransactionId() {
    return `dual-system-tx-${++this._transactionId}-${Date.now()}`;
  }

  /**
   * Apply sneak results to the visibility system with AVS overrides
   * @param {Array<Object>} sneakResults - Array of sneak result objects
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   */
  async applySneakResults(sneakResults, options = {}) {
    const transactionId = this._generateTransactionId();

    const applicationResult = {
      success: false,
      transactionId,
      errors: [],
      warnings: [],
      appliedChanges: {
        avsChanges: [],
        coverChanges: [],
        overrideChanges: [],
      },
      systemStatus: null,
    };

    try {
      // Validate input data
      if (!sneakResults || sneakResults.length === 0) {
        applicationResult.warnings.push('No sneak results to apply');
        applicationResult.success = true;
        return applicationResult;
      }

      // Group results by observer for batch processing
      const changesByObserver = new Map();

      for (const sneakResult of sneakResults) {
        const observer = sneakResult.token;
        const target = sneakResult.actor;

        if (!changesByObserver.has(observer.document.id)) {
          changesByObserver.set(observer.document.id, {
            observer,
            changes: [],
          });
        }

        const change = {
          target,
          newVisibility: sneakResult.newVisibility,
          oldVisibility: sneakResult.oldVisibility || sneakResult.currentVisibility,
          overrideState: sneakResult.overrideState,
        };

        changesByObserver.get(observer.document.id).changes.push(change);
      }

      // Apply changes using our enhanced applyVisibilityChanges with AVS overrides
      let totalChangesApplied = 0;
      
      for (const [observerId, data] of changesByObserver) {
        try {

          // Ensure AVS pair override flags are set BEFORE we apply visibility changes.
          // This prevents the Auto-Visibility System from recalculating and clobbering
          // our manual visibility updates while they are being applied.
          const changesByTarget = new Map();
          for (const change of data.changes) {
            const effectiveNewState = change.overrideState || change.newVisibility;
            if (!change?.target || !effectiveNewState) continue;
            const targetToken = change.targetToken || change.target;
            if (targetToken?.document?.id) {
              // Derive justification flags for the override so the validator/dialog can reflect them
              let detectedCover = 'none';
              // If the sneak result carried explicit autoCover info, prefer its originalState as expectedCover
              let expectedCover = undefined;
              try {
                detectedCover = autoCoverSystem.detectCoverBetweenTokens(data.observer, targetToken) || 'none';
              } catch {}
              // Pull expected/original cover from attached autoCover details on the matching sneak result, if any
              try {
                const matching = (sneakResults || []).find(r => r.token?.document?.id === data.observer?.document?.id && (r.actor?.document?.id || r.actor?.id) === targetToken?.document?.id);
                const overrideDetails = matching?.autoCover?.overrideDetails;
                if (overrideDetails && overrideDetails.originalState) {
                  expectedCover = overrideDetails.originalState;
                }
              } catch {}
              const hasCover = ((expectedCover || detectedCover) === 'standard' || (expectedCover || detectedCover) === 'greater');
              const hasConcealment = ['concealed', 'hidden', 'undetected'].includes(effectiveNewState);

              changesByTarget.set(targetToken.document.id, {
                target: targetToken,
                state: effectiveNewState,
                hasCover,
                hasConcealment,
                expectedCover
              });
            }
          }

          if (changesByTarget.size > 0) {
            try {
              await AvsOverrideManager.applyForSneak(data.observer, changesByTarget, {
                overrideDurationMinutes: options.overrideDurationMinutes || 5,
              });
            } catch (avsSetError) {
              console.warn('PF2E Visioner | Failed to pre-set AVS overrides (continuing):', avsSetError);
            }
          }

          // Now apply visibility changes. We pass setAVSOverrides: false because
          // we've already written the flags above to guarantee ordering.
          try {
            await SharedUtils.applyVisibilityChanges(data.observer, data.changes, {
              direction: options.direction || 'observer_to_target',
              skipEphemeralUpdate: options.skipEphemeralUpdate,
              skipCleanup: options.skipCleanup,
              ...options,
              setAVSOverrides: false, // Must come after ...options to ensure it's not overridden
            });
          } catch (applyError) {
            // Attempt to rollback any pre-set AVS flags to avoid leaving stale overrides
            try {
              for (const [, changeData] of changesByTarget) {
                const target = changeData.target;
                const obsId = data.observer.document.id;
                const tgtId = target.document.id;
                try {
                  await data.observer.document.unsetFlag('pf2e-visioner', `avs-override-to-${tgtId}`);
                } catch {}
                try {
                  await target.document.unsetFlag('pf2e-visioner', `avs-override-from-${obsId}`);
                } catch {}
              }
            } catch (cleanupErr) {
              console.warn('PF2E Visioner | Failed to cleanup AVS overrides after apply error:', cleanupErr);
            }
            throw applyError;
          }

          applicationResult.appliedChanges.avsChanges.push({
            observerId,
            changeCount: data.changes.length,
            type: 'avs',
          });

          totalChangesApplied += data.changes.length;
        } catch (error) {
          applicationResult.errors.push(
            `Failed to apply AVS changes for observer ${observerId}: ${error.message}`,
          );
          console.error('PF2E Visioner | Failed to apply changes for observer:', observerId, error);
        }
      }

      // Cache transaction for potential rollback
      this._activeTransactions.set(transactionId, {
        sneakResults,
        timestamp: Date.now(),
        options
      });

      applicationResult.success = applicationResult.errors.length === 0;

      return applicationResult;
    } catch (error) {
      console.error('PF2E Visioner | Dual system application failed:', error);
      applicationResult.errors.push(`Dual system application failed: ${error.message}`);
      return applicationResult;
    }
  }

  /**
   * Rollback a transaction
   * @param {string} transactionId - Transaction ID to rollback
   * @returns {Promise<boolean>} Whether rollback succeeded
   */
  async rollbackTransaction(transactionId) {
    try {
      const transaction = this._activeTransactions.get(transactionId);
      if (!transaction) {
        console.warn('PF2E Visioner | No transaction found for rollback:', transactionId);
        return false;
      }


      // For sneak actions, rollback means restoring the old visibility states
      const changesByObserver = new Map();

      for (const sneakResult of transaction.sneakResults) {
        const observer = sneakResult.token;
        const target = sneakResult.actor;

        if (!changesByObserver.has(observer.document.id)) {
          changesByObserver.set(observer.document.id, {
            observer,
            changes: [],
          });
        }

        // Reverse the change - new visibility becomes old visibility
        const reverseChange = {
          target,
          newVisibility: sneakResult.oldVisibility || sneakResult.currentVisibility,
          oldVisibility: sneakResult.newVisibility,
        };

        changesByObserver.get(observer.document.id).changes.push(reverseChange);
      }

      // Apply reverse changes (but don't set new AVS overrides for rollback)
      for (const [observerId, data] of changesByObserver) {
        try {
          await SharedUtils.applyVisibilityChanges(data.observer, data.changes, {
            direction: transaction.options.direction || 'observer_to_target',
            setAVSOverrides: false, // Don't set overrides when rolling back
            ...transaction.options
          });
        } catch (error) {
          console.error('PF2E Visioner | Failed to rollback changes for observer:', observerId, error);
        }
      }

      // Remove transaction from cache
      this._activeTransactions.delete(transactionId);
      
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Rollback failed:', error);
      return false;
    }
  }

  /**
   * Clean up old transactions (older than 10 minutes)
   */
  cleanup() {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const expiredTransactions = [];

    for (const [transactionId, transaction] of this._activeTransactions.entries()) {
      if (transaction.timestamp < tenMinutesAgo) {
        expiredTransactions.push(transactionId);
      }
    }

    for (const transactionId of expiredTransactions) {
      this._activeTransactions.delete(transactionId);
    }
  }
}

const dualSystemApplication = new DualSystemResultApplication();

// Debug: Log that this file was loaded

// Set up periodic cleanup (every 5 minutes)
setInterval(() => {
  dualSystemApplication.cleanup();
}, 5 * 60 * 1000);

export default dualSystemApplication;