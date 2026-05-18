/**
 * OverrideValidationSystem - Manages validation of visibility overrides when tokens move
 * Handles checking if stored override conditions still match current visibility state
 * Shows validation dialogs and manages override cleanup
 */

import { VisibilityCalculator } from './VisibilityCalculator.js';
import { normalizePerceptionProfile } from '../perception-profile.js';
import { FeatsHandler } from '../../chat/services/FeatsHandler.js';
import { getLastMovedTokenId } from '../../services/runtime-state.js';

const STEALTH_OVERRIDE_STATES = new Set(['hidden', 'undetected', 'unnoticed']);

function profileToDisplayState(profile = {}) {
  if (profile.detectionState === 'observed' && profile.hasConcealment) return 'concealed';
  if (profile.detectionState === 'undetected' && profile.awarenessState === 'unnoticed') {
    return 'unnoticed';
  }
  return profile.detectionState || 'observed';
}

function normalizeOverrideForValidation(override = {}) {
  const normalized = normalizePerceptionProfile(override);
  return {
    ...normalized,
    ...override,
    detectionState: normalized.detectionState,
    coverState: normalized.coverState,
    detectionSense: normalized.detectionSense,
    awarenessState: normalized.awarenessState,
    hasConcealment:
      typeof override.hasConcealment === 'boolean'
        ? override.hasConcealment
        : normalized.hasConcealment,
    state: override.state ?? profileToDisplayState(normalized),
  };
}

function targetIgnoresStealthPositionValidation(target, override = {}) {
  const source = override.source || 'manual_action';
  if (!['manual_action', 'sneak_action', 'hide_action'].includes(source)) return false;
  if (!STEALTH_OVERRIDE_STATES.has(override.state)) return false;
  if (FeatsHandler.hasFeat(target, 'legendary-sneak')) return true;
  return false;
}

function getAcceptOptions(override) {
  if (!isTakeCoverTrackingOverride(override)) return undefined;
  return override?.coverOnly === true
    ? { acceptedCoverState: override.currentCover || 'none' }
    : { preserveTakeCoverTracking: true };
}

function isTakeCoverTrackingOverride(override = {}) {
  return (
    override?.coverOnly === true ||
    override?.coverOverrideSource === 'take_cover_action' ||
    override?.source === 'take_cover_action'
  );
}

function isPureTakeCoverCoverOnlyOverride(override = {}) {
  return override?.coverOnly === true && isTakeCoverTrackingOverride(override);
}

function shouldSuppressTakeCoverCoverChange(override = {}, targetId = null, movedTokenId = null) {
  return targetId === movedTokenId && isTakeCoverTrackingOverride(override);
}

async function removeAcceptedOverride(AvsOverrideManager, observerId, targetId, override) {
  const options = getAcceptOptions(override);
  if (options) {
    await AvsOverrideManager.removeOverride(observerId, targetId, options);
  } else {
    await AvsOverrideManager.removeOverride(observerId, targetId);
  }
}

export class OverrideValidationSystem {
  /** @type {OverrideValidationSystem} */
  static #instance = null;

  /** @type {boolean} */
  #enabled = false;

  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

  /** @type {VisibilityCalculator} - Reference to main visibility system */
  #visibilityCalculator = null;

  constructor(visibilityCalculator) {
    if (OverrideValidationSystem.#instance) {
      return OverrideValidationSystem.#instance;
    }

    this.#visibilityCalculator = visibilityCalculator;
    OverrideValidationSystem.#instance = this;
  }

  /**
   * Get singleton instance
   * @param {VisibilityCalculator} visibilityCalculator - Main visibility system
   * @returns {OverrideValidationSystem}
   */
  static getInstance(visibilityCalculator) {
    if (!OverrideValidationSystem.#instance) {
      OverrideValidationSystem.#instance = new OverrideValidationSystem(visibilityCalculator);
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

    // Check persistent flag-based overrides for all tokens
    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      if (!token?.document) continue;

      // Check all override flags on this token (target has flags FROM observers)
      const flags = token.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(flags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        if (flagData.takeCoverExpirationPending === true) continue;
        if (this.#shouldSkipTimedOverride(flagData.timedOverride)) continue;

        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = token.document.id;

        // Skip if not involving the moved token
        if (observerId !== movedTokenId && targetId !== movedTokenId) continue;
        if (targetId === movedTokenId && isPureTakeCoverCoverOnlyOverride(flagData)) continue;
        const suppressCoverChange = shouldSuppressTakeCoverCoverChange(
          flagData,
          targetId,
          movedTokenId,
        );

        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: canvas.tokens?.get(observerId),
            target: token,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            ...normalizeOverrideForValidation(flagData),
            expectedCover: flagData.expectedCover,
            coverOnly: flagData.coverOnly,
            coverOverrideSource: flagData.coverOverrideSource,
            suppressCoverChange,
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
          if (shouldRemove.coverChangeSource) override.coverChangeSource = shouldRemove.coverChangeSource;
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
      const visibility = await this.#visibilityCalculator.calculateVisibility(observer, target);

      // If we cannot compute visibility (missing data or calculator unavailable),
      // conservatively request validation for manual/sneak overrides after movement.
      if (!visibility) {
        if (override?.source === 'manual_action' || override?.source === 'sneak_action') {
          return {
            shouldRemove: true,
            reason: 'validation requested after movement (insufficient data)',
            currentVisibility: null,
            currentCover: null
          };
        }
        return null;
      }

      const currentlyHasCover = visibility.cover !== 'none';
      const currentlyConcealed = visibility.visibility === 'concealed' || visibility.visibility === 'hidden';
      const currentlyVisible = visibility.visibility === 'observed' || visibility.visibility === 'concealed';
      const ignoresStealthPositionValidation = targetIgnoresStealthPositionValidation(
        target,
        override,
      );
      const shouldValidateObscuredVisibility =
        override.source === 'manual_action' ||
        override.source === 'hide_action' ||
        override.source === 'sneak_action' ||
        isTakeCoverTrackingOverride(override);
      const suppressCoverChange = override?.suppressCoverChange === true;
      const isCoverOnlyOverride = isPureTakeCoverCoverOnlyOverride(override);
      const expectedCoverForDisplay =
        override.expectedCover ?? (override.hasCover ? 'standard' : 'none');
      const hasAutoCalculatedCoverChange =
        !isCoverOnlyOverride &&
        !suppressCoverChange &&
        visibility?.cover &&
        visibility.cover !== expectedCoverForDisplay;

      const reasons = [];

      // Check if cover conditions have changed
      if (
        !suppressCoverChange &&
        isCoverOnlyOverride &&
        override.expectedCover &&
        override.expectedCover !== visibility.cover
      ) {
        reasons.push(
          visibility.cover === 'none'
            ? 'has NO cover (override expected cover)'
            : `now has ${visibility.cover} cover (override expected ${override.expectedCover} cover)`,
        );
      }
      if (
        !suppressCoverChange &&
        !isCoverOnlyOverride &&
        !ignoresStealthPositionValidation &&
        override.hasCover &&
        !currentlyHasCover
      ) {
        reasons.push('has NO cover (override expected cover)');
      }
      if (
        !suppressCoverChange &&
        !isCoverOnlyOverride &&
        !ignoresStealthPositionValidation &&
        !override.hasCover &&
        currentlyHasCover
      ) {
        reasons.push('now has cover (override expected no cover)');
      }

      // Check if concealment conditions have changed
      if (
        !ignoresStealthPositionValidation &&
        override.hasConcealment &&
        currentlyVisible &&
        !currentlyConcealed
      ) {
        reasons.push('has NO concealment (override expected concealment)');
      }
      if (!ignoresStealthPositionValidation && !override.hasConcealment && currentlyConcealed) {
        reasons.push('now has concealment (override expected no concealment)');
      }

      // Additional check for concealment: if override claims hidden but token is now observed
      if (
        !ignoresStealthPositionValidation &&
        override.hasConcealment &&
        visibility.visibility === 'observed'
      ) {
        reasons.push('is now clearly observed (override expected concealment)');
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if (
        !ignoresStealthPositionValidation &&
        shouldValidateObscuredVisibility &&
        STEALTH_OVERRIDE_STATES.has(override.state)
      ) {
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
          currentCover: visibility?.cover || null,
          coverChangeSource: hasAutoCalculatedCoverChange ? 'auto' : undefined
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
        ...normalizeOverrideForValidation(override),
        source: override.source || 'unknown',
        reason,
        hasCover: override.hasCover || false,
        hasConcealment: override.hasConcealment || false,
        expectedCover: override.expectedCover,
        coverOnly: override.coverOnly === true,
        coverOverrideSource: override.coverOverrideSource,
        suppressCoverChange: override.suppressCoverChange === true,
        // Provide actual current states so the dialog can render accurate icon deltas
        currentVisibility: override.currentVisibility || null,
        currentCover: override.currentCover || null,
        coverChangeSource: override.coverChangeSource,
        isManual: override.source === 'manual_action'
      };
    });

    // Dynamically import the dialog
    try {
      const { OverrideValidationDialog } = await import('../../ui/OverrideValidationDialog.js');

      // Show the dialog and wait for the user's decision
      // Try to provide moved token id/name when available
      let movedTokenId = null;
      let movedTokenName = 'Token Movement';
      try {
        movedTokenId = getLastMovedTokenId();
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
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/AvsOverrideManager.js');
              for (const { observerId, targetId, override } of invalidOverrides) {
                await removeAcceptedOverride(AvsOverrideManager, observerId, targetId, override);
              }
            }
            ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_ACCEPTED_PLURAL', { count: invalidOverrides.length, plural: invalidOverrides.length > 1 ? 's' : '' }));
            break;

          case 'clear-manual': {
            // Remove only manual overrides
            let clearedCount = 0;
            {
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/AvsOverrideManager.js');
              for (const { observerId, targetId, override } of invalidOverrides) {
                if (override.source === 'manual_action') {
                  await removeAcceptedOverride(AvsOverrideManager, observerId, targetId, override);
                  clearedCount++;
                }
              }
            }
            if (clearedCount > 0) {
              ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_CLEARED_PLURAL', { count: clearedCount, plural: clearedCount > 1 ? 's' : '' }));
            }
            break;
          }

          case 'keep':
            // Do nothing - keep all overrides
            ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.AVS_REJECTED'));
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
          title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.OVERRIDE_VALIDATION'),
          content: `<p>The visibility override <strong>${observer.document.name} → ${target.document.name}</strong> may no longer be valid.</p><p><strong>Reason:</strong> ${first.reason}</p><p>Would you like to remove this override?</p>`,
          yes: () => true,
          no: () => false,
          defaultYes: true
        });

        if (result) {
          {
            const { default: AvsOverrideManager } = await import('../../chat/services/infra/AvsOverrideManager.js');
            await removeAcceptedOverride(
              AvsOverrideManager,
              first.observerId,
              first.targetId,
              first.override,
            );
          }
        }
      }
    }
  }

  #shouldSkipTimedOverride(timedOverride) {
    if (!timedOverride) return false;
    if (timedOverride.type === 'permanent') return true;
    if (timedOverride.type === 'realtime' && timedOverride.expiresAt > Date.now()) return true;
    if (timedOverride.type === 'rounds' && timedOverride.roundsRemaining > 0) return true;
    return false;
  }

  /**
   * Debug method to manually trigger validation for a token (PUBLIC)
   * @param {string} tokenId - Token ID to validate
   */
  async debugValidateToken(tokenId) {
    await this.#validateOverridesForToken(tokenId);
  }
}
