/**
 * OverrideValidationSystem - Manages validation of visibility overrides when tokens move
 * Handles checking if stored override conditions still match current visibility state
 * Shows validation dialogs and manages override cleanup
 */

export class OverrideValidationSystem {
  /** @type {OverrideValidationSystem} */
  static #instance = null;

  /** @type {boolean} */
  #enabled = false;

  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

  /** @type {EventDrivenVisibilitySystem} - Reference to main visibility system */
  #visibilitySystem = null;

  constructor(visibilitySystem) {
    if (OverrideValidationSystem.#instance) {
      return OverrideValidationSystem.#instance;
    }

    this.#visibilitySystem = visibilitySystem;
    OverrideValidationSystem.#instance = this;
  }

  /**
   * Get singleton instance
   * @param {EventDrivenVisibilitySystem} visibilitySystem - Main visibility system
   * @returns {OverrideValidationSystem}
   */
  static getInstance(visibilitySystem) {
    if (!OverrideValidationSystem.#instance) {
      OverrideValidationSystem.#instance = new OverrideValidationSystem(visibilitySystem);
    }
    return OverrideValidationSystem.#instance;
  }

  /**
   * Enable the validation system
   */
  enable() {
    this.#enabled = true;
  }

  /**
   * Disable the validation system
   */
  disable() {
    this.#enabled = false;
    this.#tokensQueuedForValidation.clear();
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
      this.#validationTimeoutId = null;
    }
  }

  /**
   * Queue a token for override validation after movement
   * @param {string} tokenId - ID of the token that moved
   */
  queueOverrideValidation(tokenId) {
    if (!this.#enabled || !game.user.isGM) {
      return;
    }

    this.#tokensQueuedForValidation.add(tokenId);

    // Clear existing timeout and set new one to batch validations
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
    }

    // Validate after a short delay to handle waypoints and complete movements
    this.#validationTimeoutId = setTimeout(() => {
      this.#processQueuedValidations();
    }, 500); // 500ms delay to ensure movement is complete
  }

  /**
   * Process all queued override validations
   */
  async #processQueuedValidations() {
    if (!this.#enabled || !game.user.isGM) return;

    const tokensToValidate = Array.from(this.#tokensQueuedForValidation);
    this.#tokensQueuedForValidation.clear();
    this.#validationTimeoutId = null;

    for (const tokenId of tokensToValidate) {
      await this.#validateOverridesForToken(tokenId);
    }
  }

  /**
   * Validate all overrides involving a specific token that just moved
   * @param {string} movedTokenId - ID of the token that moved
   */
  async #validateOverridesForToken(movedTokenId) {
    const movedToken = canvas.tokens?.get(movedTokenId);
    if (!movedToken) {
      return;
    }

    const overridesToCheck = [];

    // Check memory-based overrides first (backwards compatibility)
    const activeOverrides = this.#visibilitySystem.getActiveOverrides();
    for (const [overrideKey, override] of activeOverrides.entries()) {
      const [observerId, targetId] = overrideKey.split('-');

      if (observerId === movedTokenId || targetId === movedTokenId) {
        overridesToCheck.push({
          key: overrideKey,
          override,
          observerId,
          targetId,
          type: 'memory'
        });
      }
    }

    // Check persistent flag-based overrides for all tokens
    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      if (!token?.document) continue;

      // Check all override flags on this token (target has flags FROM observers)
      const flags = token.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(flags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;

        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = token.document.id;

        // Skip if not involving the moved token
        if (observerId !== movedTokenId && targetId !== movedTokenId) continue;

        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: canvas.tokens?.get(observerId),
            target: token,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            observerId,
            targetId,
            observerName: flagData.observerName,
            targetName: flagData.targetName || token.name
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: token
        });
      }
    }


    // Check each override for validity and collect invalid ones
    const invalidOverrides = [];
    for (const checkData of overridesToCheck) {
      const { override, observerId, targetId, type, flagKey, token } = checkData;
      const shouldRemove = await this.#checkOverrideValidity(observerId, targetId, override);

      if (shouldRemove) {
        // Attach current visibility/cover to the override for dialog rendering
        try {
          if (shouldRemove.currentVisibility) override.currentVisibility = shouldRemove.currentVisibility;
          if (shouldRemove.currentCover) override.currentCover = shouldRemove.currentCover;
        } catch { /* ignore */ }
        invalidOverrides.push({
          observerId,
          targetId,
          override,
          reason: shouldRemove.reason,
          type,
          flagKey,
          token
        });
      }
    }

    // If we found invalid overrides, show the validation dialog
    if (invalidOverrides.length > 0) {
      await this.#showOverrideValidationDialog(invalidOverrides);
    }
  }

  /**
   * Check if an override is still valid based on current visibility/cover state
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID  
   * @param {Object} override - Override object with hasCover/hasConcealment flags
   * @returns {Promise<{shouldRemove: boolean, reason: string}|null>}
   */
  async #checkOverrideValidity(observerId, targetId, override) {
    const observer = canvas.tokens?.get(observerId);
    const target = canvas.tokens?.get(targetId);

    if (!observer || !target) return null;

    try {

      // Calculate current visibility and cover using the auto-visibility system
      const visibility = await this.#visibilitySystem.calculateVisibility(observer, target);

      if (!visibility) return null;

      const currentlyHasCover = visibility.cover !== 'none';
      const currentlyConcealed = visibility.visibility === 'concealed' || visibility.visibility === 'hidden';
      const currentlyVisible = visibility.visibility === 'observed' || visibility.visibility === 'concealed';

      const reasons = [];

      // Check if cover conditions have changed
      if (override.hasCover && !currentlyHasCover) {
        reasons.push('has NO cover (override expected cover)');
      }
      if (!override.hasCover && currentlyHasCover) {
        reasons.push('now has cover (override expected no cover)');
      }

      // Check if concealment conditions have changed
      if (override.hasConcealment && currentlyVisible && !currentlyConcealed) {
        reasons.push('has NO concealment (override expected concealment)');
      }
      if (!override.hasConcealment && currentlyConcealed) {
        reasons.push('now has concealment (override expected no concealment)');
      }

      // Additional check for concealment: if override claims hidden but token is now observed
      if (override.hasConcealment && visibility.visibility === 'observed') {
        reasons.push('is now clearly observed (override expected concealment)');
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if ((override.source === 'manual_action' || override.source === 'sneak_action') && override.state === 'undetected') {
        // If target is now clearly observed (in bright light with no concealment), 
        // "undetected" may be too strong
        if (visibility.visibility === 'observed' && !currentlyHasCover && !currentlyConcealed) {
          // Only flag if the observer has normal vision capabilities
          const observerToken = canvas.tokens?.get(observerId);
          if (observerToken?.actor) {
            try {
              const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
              const visionAnalyzer = VisionAnalyzer.getInstance();
              const visionCapabilities = visionAnalyzer.getVisionCapabilities(observerToken.actor);

              // If observer has normal vision and target is in bright light with no obstructions,
              // "undetected" might be questionable for stealth
              if (!visionCapabilities.hasDarkvision || visibility.lighting === 'bright') {
                if (override.source === 'sneak_action') {
                  reasons.push('stealth failed: now clearly visible in bright light');
                } else {
                  reasons.push('is now clearly visible with no concealment or cover');
                }
              }
            } catch (error) {
              console.warn('PF2E Visioner | Error checking vision capabilities:', error);
            }
          }
        }

        // Additional check for sneak actions: if moved from concealing terrain to open bright light
        if (override.source === 'sneak_action' && visibility.lighting === 'bright' && !currentlyHasCover) {
          reasons.push('stealth broken: moved to bright open area');
        }
      }

      if (reasons.length > 0) {
        return {
          shouldRemove: true,
          reason: reasons.join(' and '),
          currentVisibility: visibility?.visibility || null,
          currentCover: visibility?.cover || null
        };
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }

  /**
   * Show the override validation dialog for multiple invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   */
  async #showOverrideValidationDialog(invalidOverrides) {
    if (invalidOverrides.length === 0) return;

    // Prepare the override data for the dialog
    const overrideData = invalidOverrides.map(({ observerId, targetId, override, reason }) => {
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);

      return {
        id: `${observerId}-${targetId}`,
        observerId,
        targetId,
        observerName: observer?.document?.name || 'Unknown',
        targetName: target?.document?.name || 'Unknown',
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        reason,
        hasCover: override.hasCover || false,
        hasConcealment: override.hasConcealment || false,
        // Provide actual current states so the dialog can render accurate icon deltas
        currentVisibility: override.currentVisibility || null,
        currentCover: override.currentCover || null,
        isManual: override.source === 'manual_action'
      };
    });

    // Dynamically import the dialog
    try {
      const { OverrideValidationDialog } = await import('../../ui/override-validation-dialog.js');

      // Show the dialog and wait for the user's decision
      // Try to provide moved token id/name when available
      let movedTokenId = null;
      let movedTokenName = 'Token Movement';
      try {
        movedTokenId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || null;
        if (movedTokenId) {
          movedTokenName = canvas.tokens?.get(movedTokenId)?.document?.name || movedTokenName;
        }
      } catch { }
      const result = await OverrideValidationDialog.show(overrideData, movedTokenName, movedTokenId);

      // Handle the user's choice
      if (result) {
        switch (result.action) {
          case 'clear-all':
            // Remove all overrides
            {
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
              for (const { observerId, targetId } of invalidOverrides) {
                await AvsOverrideManager.removeOverride(observerId, targetId);
              }
            }
            ui.notifications.info(`Cleared ${invalidOverrides.length} invalid override${invalidOverrides.length > 1 ? 's' : ''}`);
            break;

          case 'clear-manual': {
            // Remove only manual overrides
            let clearedCount = 0;
            {
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
              for (const { observerId, targetId, override } of invalidOverrides) {
                if (override.source === 'manual_action') {
                  await AvsOverrideManager.removeOverride(observerId, targetId);
                  clearedCount++;
                }
              }
            }
            if (clearedCount > 0) {
              ui.notifications.info(`Cleared ${clearedCount} manual override${clearedCount > 1 ? 's' : ''}`);
            }
            break;
          }

          case 'keep':
            // Do nothing - keep all overrides
            ui.notifications.info('Kept all current overrides');
            break;

          default:
            console.warn('PF2E Visioner | Unknown dialog action:', result.action);
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Error showing override validation dialog:', error);
      // Fallback to simple confirmation for the first override
      const first = invalidOverrides[0];
      const observer = canvas.tokens?.get(first.observerId);
      const target = canvas.tokens?.get(first.targetId);

      if (observer && target) {
        const result = await Dialog.confirm({
          title: "Override Validation",
          content: `<p>The visibility override <strong>${observer.document.name} → ${target.document.name}</strong> may no longer be valid.</p><p><strong>Reason:</strong> ${first.reason}</p><p>Would you like to remove this override?</p>`,
          yes: () => true,
          no: () => false,
          defaultYes: true
        });

        if (result) {
          {
            const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
            await AvsOverrideManager.removeOverride(first.observerId, first.targetId);
          }
          ui.notifications.info(`Removed visibility override: ${observer.document.name} → ${target.document.name}`);
        }
      }
    }
  }

  /**
   * Debug method to manually trigger validation for a token (PUBLIC)
   * @param {string} tokenId - Token ID to validate
   */
  async debugValidateToken(tokenId) {
    await this.#validateOverridesForToken(tokenId);
  }
}