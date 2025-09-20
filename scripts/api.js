/**
 * Public API for PF2E Per-Token Visibility
 */

import { MODULE_ID } from './constants.js';
import autoCoverSystem from './cover/auto-cover/AutoCoverSystem.js';
import { VisionerTokenManager } from './managers/token-manager/token-manager.js';
import {
  rebuildAndRefresh,
  removeAllReferencesToTarget,
  removeModuleEffectsFromActors,
  removeModuleEffectsFromTokenActors,
  removeObserverContributions,
  unsetMapsForTokens,
} from './services/api-internal.js';
import { manuallyRestoreAllPartyTokens } from './services/party-token-state.js';
import { refreshEveryonesPerception } from './services/socket.js';
import { updateTokenVisuals } from './services/visual-effects.js';
import {
  cleanupDeletedToken,
  getCoverBetween,
  getVisibility,
  setCoverBetween,
  setVisibilityBetween,
  showNotification,
} from './utils.js';
import { autoVisibilitySystem } from './visibility/auto-visibility/index.js';

/**
 * Main API class for the module
 */
export class Pf2eVisionerApi {
  // Internal helpers (not exported)
  static async _unsetMapsForTokens(scene, tokens) {
    return unsetMapsForTokens(scene, tokens);
  }

  static _collectModuleEffectIds() {
    return null;
  }

  static async _removeModuleEffectsFromActors(actors) {
    return removeModuleEffectsFromActors(actors);
  }

  static async _removeModuleEffectsFromTokenActors(tokens) {
    return removeModuleEffectsFromTokenActors(tokens);
  }

  static async _removeObserverContributions(observerToken, tokens) {
    return removeObserverContributions(observerToken, tokens);
  }

  static async _removeAllReferencesToTarget(targetToken, tokens) {
    return removeAllReferencesToTarget(targetToken, tokens, cleanupDeletedToken);
  }

  static async _rebuildAndRefresh() {
    return rebuildAndRefresh();
  }

  /**
   * Open the token manager for a specific observer token
   * @param {Token} observer - The observer token (optional, uses controlled tokens if not provided)
   * @param options - data to pass to the token manager constructor. mode can be 'observer' or 'target'
   */
  static async openTokenManager(observer = null, options = { mode: 'observer' }) {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility and cover');
      return;
    }

    // Use provided observer or get from controlled tokens
    if (!observer) {
      const controlled = canvas.tokens.controlled;
      if (controlled.length === 0) {
        showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED', 'warn');
        return;
      }
      observer = controlled[0];

      if (controlled.length > 1) {
        showNotification('PF2E_VISIONER.NOTIFICATIONS.MULTIPLE_OBSERVERS', 'warn');
        return;
      }
    }

    // Check if there's already an open instance
    if (VisionerTokenManager.currentInstance) {
      // If the observer is the same, just bring the existing dialog to front
      if (VisionerTokenManager.currentInstance.observer === observer) {
        if (
          VisionerTokenManager.currentInstance.rendered &&
          (VisionerTokenManager.currentInstance.element ||
            VisionerTokenManager.currentInstance.window)
        ) {
          VisionerTokenManager.currentInstance.bringToFront();
        } else {
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data
      VisionerTokenManager.currentInstance.updateObserver(observer);
      await VisionerTokenManager.currentInstance.render({ force: true });
      if (
        VisionerTokenManager.currentInstance.element ||
        VisionerTokenManager.currentInstance.window
      ) {
        VisionerTokenManager.currentInstance.bringToFront();
      }
      return VisionerTokenManager.currentInstance;
    }

    const manager = new VisionerTokenManager(observer, { mode: options.mode });
    await manager.render({ force: true });
    try {
      if (manager.element || manager.window) manager.bringToFront();
    } catch (_) { }
    return manager;
  }

  /**
   * Open the token manager with a specific mode
   * @param {Token} observer - The observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  static async openTokenManagerWithMode(observer, mode = 'observer') {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility and cover');
      return;
    }

    if (!observer) {
      showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED', 'warn');
      return;
    }

    // Check if there's already an open instance
    if (VisionerTokenManager.currentInstance) {
      // If the observer is the same, update mode if different and bring to front
      if (VisionerTokenManager.currentInstance.observer === observer) {
        if (VisionerTokenManager.currentInstance.mode !== mode) {
          VisionerTokenManager.currentInstance.mode = mode;
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        if (
          VisionerTokenManager.currentInstance.rendered &&
          (VisionerTokenManager.currentInstance.element ||
            VisionerTokenManager.currentInstance.window)
        ) {
          VisionerTokenManager.currentInstance.bringToFront();
        } else {
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data and mode
      VisionerTokenManager.currentInstance.updateObserverWithMode(observer, mode);
      await VisionerTokenManager.currentInstance.render({ force: true });
      if (
        VisionerTokenManager.currentInstance.element ||
        VisionerTokenManager.currentInstance.window
      ) {
        VisionerTokenManager.currentInstance.bringToFront();
      }
      return VisionerTokenManager.currentInstance;
    }

    const manager = new VisionerTokenManager(observer, { mode });
    await manager.render({ force: true });
    try {
      if (manager.element || manager.window) manager.bringToFront();
    } catch (_) { }
    return manager;
  }

  /**
   * Bulk set visibility between subjects and their targets.
   * @param {Array<{observerId:string,targetId:string,state:string}>|Map<string,Array<{targetId:string,state:string}>>} updates
   *   Either an array of tuples, or a map of observerId -> array of { targetId, state }
   * @param {{direction?:"observer_to_target"|"target_to_observer", effectTarget?:"observer"|"subject"}} options
   */
  static async bulkSetVisibility(updates, options = {}) {
    const { batchUpdateVisibilityEffects } = await import('./visibility/ephemeral.js');
    // Also import override manager lazily only if we will create overrides
    let AvsOverrideManager = null;
    const groups = new Map();
    if (updates instanceof Map) {
      for (const [observerId, arr] of updates.entries()) {
        const observer = canvas.tokens.get(observerId);
        if (!observer) continue;
        const prepared = [];
        for (const { targetId, state } of arr || []) {
          const target = canvas.tokens.get(targetId);
          if (target && typeof state === 'string' && state) prepared.push({ target, state });
        }
        if (prepared.length) groups.set(observer.id, { observer, prepared });
      }
    } else if (Array.isArray(updates)) {
      for (const u of updates) {
        const observer = canvas.tokens.get(u?.observerId);
        const target = canvas.tokens.get(u?.targetId);
        const state = u?.state;
        if (!observer || !target || typeof state !== 'string' || !state) continue;
        const key = observer.id;
        const entry = groups.get(key) || { observer, prepared: [] };
        entry.prepared.push({ target, state });
        groups.set(key, entry);
      }
    }
    for (const { observer, prepared } of groups.values()) {
      // Create AVS overrides first so automatic systems won't immediately revert manual intention
      try {
        if (!options?.isAutomatic && prepared.length) {
          if (!AvsOverrideManager) {
            AvsOverrideManager = (await import('./chat/services/infra/avs-override-manager.js')).default;
          }
          // Build changes map expected by applyOverrides: array of { target, state }
            // Source tagged as manual_action for consistency with single setVisibility
          await AvsOverrideManager.applyOverrides(observer, prepared.map(p => ({ target: p.target, state: p.state })), { source: 'manual_action' });
        }
      } catch (e) {
        console.warn('PF2E Visioner API: Failed to apply AVS overrides during bulkSetVisibility', e);
      }
      await batchUpdateVisibilityEffects(observer, prepared, options);
    }
  }

  /**
   * Get visibility state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {string|null} The visibility state, or null if tokens not found
   */
  static getVisibility(observerId, targetId) {
    try {
      return getVisibility(observerId, targetId);
    } catch (error) {
      console.error('Error getting visibility:', error);
      return null;
    }
  }

  /**
   * Set visibility state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @param {string} state - The visibility state to set ('observed', 'hidden', 'undetected', 'concealed')
   * @param {Object} options - Optional configuration
   * @param {boolean} options.skipEphemeralUpdate - Boolean (default: false)
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async setVisibility(observerId, targetId, state, options = {}) {
    try {
      // Validate visibility state
      const validStates = ['observed', 'hidden', 'undetected', 'concealed'];
      if (!validStates.includes(state)) {
        console.error(
          `Invalid visibility state: ${state}. Valid states are: ${validStates.join(', ')}`,
        );
        return false;
      }

      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return false;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return false;
      }

      // For manual calls (default), create AVS overrides so AVS won't fight manual edits
      try {
        if (!options?.isAutomatic) {
          const AvsOverrideManager = (await import('./chat/services/infra/avs-override-manager.js')).default;
          await AvsOverrideManager.applyOverrides(observerToken, { target: targetToken, state }, {
            source: 'manual_action',
          });
        }
      } catch (e) {
        console.warn('PF2E Visioner API: Failed to set AVS overrides for manual visibility', e);
      }

      // Set visibility using utility function
      await setVisibilityBetween(observerToken, targetToken, state, options);
      await updateTokenVisuals();

      return true;
    } catch (error) {
      console.error('Error setting visibility:', error);
      return false;
    }
  }

  /**
   * Update all token visuals manually
   */
  static async updateTokenVisuals() {
    await updateTokenVisuals();
  }

  // (Removed) updateEphemeralEffects: superseded by map/effects batch updaters

  /**
   * Get cover state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {string|null} The cover state, or null if tokens not found
   */
  static getCover(observerId, targetId) {
    try {
      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return null;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return null;
      }

      // Get cover using utility function
      return getCoverBetween(observerToken, targetToken);
    } catch (error) {
      console.error('Error getting cover:', error);
      return null;
    }
  }

  /**
   * Set cover state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @param {string} state - The cover state to set ('none', 'lesser', 'standard', 'greater')
   * @param {Object} options - Optional configuration
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async setCover(observerId, targetId, state, options = {}) {
    try {
      // Validate cover state
      const validStates = ['none', 'lesser', 'standard', 'greater'];
      if (!validStates.includes(state)) {
        console.error(`Invalid cover state: ${state}. Valid states are: ${validStates.join(', ')}`);
        return false;
      }

      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return false;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return false;
      }

      // Set cover using utility function
      await setCoverBetween(observerToken, targetToken, state, options);
      await updateTokenVisuals();

      return true;
    } catch (error) {
      console.error('Error setting cover:', error);
      return false;
    }
  }

  /**
   * Request clients to refresh their canvas
   */
  static refreshEveryonesPerception() {
    refreshEveryonesPerception();
  }

  /**
   * Manually restore all party token states
   * Useful when automatic restoration fails or for debugging
   */
  static async restorePartyTokens() {
    return manuallyRestoreAllPartyTokens();
  }

  /**
   * Get roll options for Rule Elements integration
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {Array<string>} Array of roll options
   */
  static getRollOptions(observerId, targetId) {
    const options = [];

    if (!observerId || !targetId) return options;

    // Get visibility state between observer and target
    const visibilityState = this.getVisibility(observerId, targetId);
    if (visibilityState) {
      // Add visibility-specific roll options
      options.push(`per-token-visibility:target:${visibilityState}`);
    }

    // Get cover state between observer and target
    const coverState = this.getCover(observerId, targetId);
    if (coverState) {
      // Add cover-specific roll options
      options.push(`per-token-cover:target:${coverState}`);
    }

    // Get observer token for capabilities check
    const observerToken = canvas.tokens.get(observerId);
    if (observerToken?.actor) {
      // Add observer capabilities (if implemented)
      if (observerToken.actor.system?.traits?.senses?.darkvision) {
        options.push('per-token-visibility:observer:has-darkvision');
      }

      if (observerToken.actor.system?.traits?.senses?.tremorsense) {
        options.push('per-token-visibility:observer:has-tremorsense');
      }
    }

    return options;
  }

  /**
   * Register roll options for integration with PF2E roll system
   * This would typically be called during a roll preparation
   * @param {object} rollOptions - The roll options object to modify
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   */
  static addRollOptions(rollOptions, observerId, targetId) {
    const moduleOptions = this.getRollOptions(observerId, targetId);
    moduleOptions.forEach((option) => {
      rollOptions[option] = true;
    });
  }

  /**
   * Get all available visibility states
   * @returns {Array<string>} Array of valid visibility states
   */
  static getVisibilityStates() {
    return ['observed', 'hidden', 'undetected', 'concealed'];
  }

  /**
   * Get all available cover states
   * @returns {Array<string>} Array of valid cover states
   */
  static getCoverStates() {
    return ['none', 'lesser', 'standard', 'greater'];
  }

  /**
   * Clear all sneak-active flags from all tokens in the scene
   * @returns {Promise<boolean>} Success status
   */
  static async clearAllSneakFlags() {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear sneak flags');
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn('No active scene.');
        return false;
      }

      // Find all tokens with sneak-active flag and clear it
      const tokens = canvas.tokens?.placeables ?? [];
      const updates = tokens
        .filter(t => t.document.getFlag('pf2e-visioner', 'sneak-active'))
        .map((t) => ({
          _id: t.id,
          [`flags.${MODULE_ID}.-=sneak-active`]: null,
        }));

      if (updates.length && scene.updateEmbeddedDocuments) {
        await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
        ui.notifications.info(`PF2E Visioner: Cleared sneak flags from ${updates.length} token(s).`);
      } else {
        ui.notifications.info('PF2E Visioner: No sneak flags found to clear.');
      }

      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing sneak flags:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear sneak flags. See console.');
      return false;
    }
  }

  /**
   * Clear all PF2E Visioner scene data for all tokens
   * - Resets visibility/cover maps on all scene tokens
   * - Removes module-created ephemeral and aggregate effects from all actors
   * - Clears module scene caches
   * - Refreshes visuals and perception
   */
  static async clearAllSceneData() {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear Visioner scene data');
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn('No active scene.');
        return false;
      }

      // 1) Bulk-reset flags on all scene tokens (remove ALL visioner flags)
      const tokens = canvas.tokens?.placeables ?? [];

      // Count AVS override flags before removal for logging
      // (Optional logging of existing AVS override flags removed to reduce noise)

      // First, try to remove the entire flag namespace
      const updates = tokens.map((t) => ({
        _id: t.id,
        // Remove ALL visioner flags completely - using multiple approaches for safety
        [`flags.${MODULE_ID}`]: null,
        [`flags.-=${MODULE_ID}`]: null
      }));


      if (updates.length && scene.updateEmbeddedDocuments) {
        try {
          // Additional verification and cleanup: check if flags are actually gone
          setTimeout(async () => {
            const remainingFlags = [];
            const explicitUpdates = [];

            tokens.forEach(t => {
              const flags = t.document.flags?.[MODULE_ID] || {};
              if (Object.keys(flags).length > 0) {
                remainingFlags.push({
                  tokenName: t.name,
                  remainingFlags: Object.keys(flags)
                });

                // Build explicit removal updates for stubborn flags
                const explicitUpdate = { _id: t.id };
                Object.keys(flags).forEach(flagKey => {
                  explicitUpdate[`flags.${MODULE_ID}.-=${flagKey}`] = null;
                });
                explicitUpdates.push(explicitUpdate);
              }
            });

            if (remainingFlags.length > 0) {
              console.warn('PF2E Visioner | ⚠️ Some flags were not removed, attempting explicit removal:', remainingFlags);

              // Try explicit flag removal
              if (explicitUpdates.length > 0) {
                try {
                  await scene.updateEmbeddedDocuments('Token', explicitUpdates, { diff: false });
                } catch (error) {
                  console.error('PF2E Visioner | Error in explicit flag removal:', error);
                }
              }
            }
          }, 100);

        } catch (error) {
          console.error('PF2E Visioner | Error updating tokens:', error);
        }
      }

      // 1.5) Additional safety: explicitly clear sneak flags
      try {
        await this.clearAllSneakFlags();
      } catch { }

      // 2) Clear scene-level caches used by the module
      try {
        // Only GMs can update scene flags
        if (game.user.isGM) {
          // Clear all scene-level flags instead of just setting deletedEntryCache
          await scene.unsetFlag(MODULE_ID, 'deletedEntryCache');
          await scene.unsetFlag(MODULE_ID, 'partyTokenStateCache');
          await scene.unsetFlag(MODULE_ID, 'deferredPartyUpdates');
        }
      } catch { }

      // 3) Remove module-created effects from all actors and token-actors (handles unlinked tokens)
      try {
        const actors = Array.from(game.actors ?? []);
        for (const actor of actors) {
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch { }
          }
        }

        // Also purge effects on token-actors (unlinked tokens won't be in game.actors)
        for (const tok of tokens) {
          const a = tok?.actor;
          if (!a) continue;
          const effects = a?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!a.items.get(id));
          if (toDelete.length) {
            try {
              await a.deleteEmbeddedDocuments('Item', toDelete);
            } catch { }
          }
        }
      } catch { }

      // 4) Clear AVS overrides from the new map-based system and hide the override indicator
      try {
        const autoVis = autoVisibilitySystem;
        if (autoVis && typeof autoVis.clearAllOverrides === 'function') {
          await autoVis.clearAllOverrides();
        }
        // Hide the override validation indicator if present
        try {
          const { default: indicator } = await import('./ui/override-validation-indicator.js');
          if (indicator && typeof indicator.hide === 'function') indicator.hide(true);
        } catch { }
      } catch (error) {
        console.warn('PF2E Visioner | Error clearing AVS overrides:', error);
      }

      // 5) Optional extra sweep for cover effects across all actors
      try {
        const { cleanupAllCoverEffects } = await import('./cover/ephemeral.js');
        await cleanupAllCoverEffects();
      } catch { }

      // 5) Rebuild effects and refresh visuals/perception
      // Removed effects-coordinator: bulk rebuild handled elsewhere
      try {
        await updateTokenVisuals();
      } catch { }
      try {
        refreshEveryonesPerception();
      } catch { }
      try {
        canvas.perception.update({ refreshVision: true });
      } catch { }

      ui.notifications.info('PF2E Visioner: Cleared all scene data.');
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing scene data:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear scene data. See console.');
      return false;
    }
  }

  /**
   * Get the current auto-cover state from an observer token to a target token
   * @param {Token|string} observer - The observer token or token ID
   * @param {Token|string} target - The target token or token ID
   * @param {Object} options - Additional options for cover detection
   * @param {boolean} options.rawPrereq - Whether to use raw prerequisite mode (default: false)
   * @param {boolean} options.forceRecalculate - Whether to force recalculation instead of using cached values
   * @returns {string|null} The cover state: "none", "lesser", "standard", "greater", or null if error
   */
  static getAutoCoverState(observer, target, options = {}) {
    try {
      // Resolve tokens if IDs are provided
      let observerToken = observer;
      let targetToken = target;

      if (typeof observer === 'string') {
        observerToken = canvas.tokens.get(observer);
        if (!observerToken) {
          console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
          return null;
        }
      }

      if (typeof target === 'string') {
        targetToken = canvas.tokens.get(target);
        if (!targetToken) {
          console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
          return null;
        }
      }

      if (!observerToken || !targetToken) {
        console.warn('PF2E Visioner: Invalid tokens provided to getAutoCoverState');
        return null;
      }

      // Exclude same token (observer and target are the same)
      if (observerToken.id === targetToken.id) {
        console.warn('PF2E Visioner: Cannot calculate cover between a token and itself');
        return null;
      }

      // Check if auto-cover is enabled
      if (!game.settings.get(MODULE_ID, 'autoCover')) {
        console.warn('PF2E Visioner: Auto-cover is disabled in module settings');
        return null;
      }

      const { rawPrereq = false, forceRecalculate = false } = options;

      let coverState = null;

      if (forceRecalculate) {
        // Force fresh calculation
        coverState = autoCoverSystem.detectCoverBetweenTokens(observerToken, targetToken, {
          rawPrereq,
        });
      } else {
        // Try to get cached cover first, then fall back to fresh calculation
        coverState = (observerToken, targetToken);
        if (!coverState || coverState === 'none') {
          coverState = autoCoverSystem.detectCoverBetweenTokens(observerToken, targetToken, {
            rawPrereq,
          });
        }
      }

      return coverState || 'none';
    } catch (error) {
      console.error('PF2E Visioner: Error getting auto-cover state:', error);
      return null;
    }
  }

  /**
   * Clear all PF2E Visioner data for multiple selected tokens with comprehensive cleanup
   * - Removes visibility/cover maps from selected tokens
   * - Removes module-created effects from all actors (same as clearAllSceneData)
   * - Clears scene-level caches
   * - Rebuilds effects and refreshes visuals/perception
   */
  static async clearAllDataForSelectedTokens(tokens = []) {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear Visioner data');
        return false;
      }

      if (!tokens || tokens.length === 0) {
        ui.notifications.warn('No tokens provided for cleanup');
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn('No active scene.');
        return false;
      }

      // 1.5) Additional safety: explicitly clear sneak flags from selected tokens
      try {
        const sneakUpdates = tokens
          .filter(t => t.document.getFlag('pf2e-visioner', 'sneak-active'))
          .map((t) => ({
            _id: t.id,
            [`flags.${MODULE_ID}.-=sneak-active`]: null,
          }));
        if (sneakUpdates.length && scene.updateEmbeddedDocuments) {
          await scene.updateEmbeddedDocuments('Token', sneakUpdates, { diff: false });
        }
      } catch { }

      // 2) Clear scene-level caches used by the module (only if clearing all tokens)
      try {
        // Only clear scene caches if we're clearing all tokens in the scene
        const allTokens = canvas.tokens?.placeables ?? [];
        if (game.user.isGM && tokens.length === allTokens.length) {
          await scene.unsetFlag(MODULE_ID, 'deletedEntryCache');
          await scene.unsetFlag(MODULE_ID, 'partyTokenStateCache');
          await scene.unsetFlag(MODULE_ID, 'deferredPartyUpdates');
        }
      } catch { }

      // 3) Remove module-created effects from all actors and token-actors (handles unlinked tokens)
      try {
        const actors = Array.from(game.actors ?? []);
        for (const actor of actors) {
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch { }
          }
        }

        // Also purge effects on token-actors (unlinked tokens won't be in game.actors)
        const allTokens = canvas.tokens?.placeables ?? [];
        for (const tok of allTokens) {
          const a = tok?.actor;
          if (!a) continue;
          const effects = a?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!a.items.get(id));
          if (toDelete.length) {
            try {
              await a.deleteEmbeddedDocuments('Item', toDelete);
            } catch { }
          }
        }
      } catch { }

      // 4) Clean up any remaining effects related to the selected tokens specifically
      try {
        const { cleanupDeletedToken } = await import('./utils.js');
        for (const token of tokens) {
          if (!token?.actor) continue;
          // Clean up this token from all other tokens' maps and effects
          await cleanupDeletedToken(token.document);
        }
      } catch { }

      // 5) Also remove the selected tokens from ALL other tokens' visibility/cover maps
      try {
        const allTokens = canvas.tokens?.placeables ?? [];
        const otherTokens = allTokens.filter(
          (t) => !tokens.some((selected) => selected.id === t.id),
        );

        if (otherTokens.length > 0) {
          const updates = otherTokens
            .map((t) => {
              const update = { _id: t.id };
              update[`flags.${MODULE_ID}`] = null;
              return update;
            })
            .filter((update) => Object.keys(update).length > 1); // Only include updates that have changes

          if (updates.length > 0 && scene.updateEmbeddedDocuments) {
            await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
          }
        }
      } catch { }

      // 5.5) Clean up AVS override flags that reference the purged tokens
      try {
        const allTokens = canvas.tokens?.placeables ?? [];
        const purgedTokenIds = tokens.map(t => t.id);

        for (const token of allTokens) {
          const updates = {};
          const flags = token.document.flags?.[MODULE_ID] || {};

          // Find and remove override flags that reference purged tokens
          for (const flagKey of Object.keys(flags)) {
            if (flagKey.startsWith('avs-override-')) {
              // Extract the referenced token ID from the flag key
              const match = flagKey.match(/^avs-override-(?:to|from)-(.+)$/);
              if (match && purgedTokenIds.includes(match[1])) {
                updates[`flags.${MODULE_ID}.-=${flagKey}`] = null;
              }
            }
          }

          // Apply updates if there are any
          if (Object.keys(updates).length > 0) {
            updates._id = token.id;
            await scene.updateEmbeddedDocuments('Token', [updates], { diff: false });
          }
        }
      } catch { }

      // 5.5) Clear AVS overrides involving these tokens from the new map-based system and hide the override indicator
      try {
        const autoVis = autoVisibilitySystem;
        if (autoVis && autoVis.removeOverride) {
          // Also remove overrides between selected tokens
          for (const token1 of tokens) {
            for (const token2 of tokens) {
              if (token1.id !== token2.id) {
                if (await autoVis.removeOverride(token1.id, token2.id)) {
                }
              }
            }
          }
        }
        // Hide the override validation indicator if present
        try {
          const { default: indicator } = await import('./ui/override-validation-indicator.js');
          if (indicator && typeof indicator.hide === 'function') indicator.hide(true);
        } catch { }
      } catch (error) {
        console.warn('PF2E Visioner | Error clearing AVS overrides for selected tokens:', error);
      }

      // 6) Rebuild effects and refresh visuals/perception
      try {
        await updateTokenVisuals();
      } catch { }
      try {
        refreshEveryonesPerception();
  } catch { }
      try {
        canvas.perception.update({ refreshVision: true });
  } catch { }

      ui.notifications.info(
        `PF2E Visioner: Cleared all data for ${tokens.length} selected token${tokens.length === 1 ? '' : 's'}.`,
      );
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing data for selected tokens:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear token data. See console.');
      return false;
    }
  }
}

/**
 * Standalone function exports for internal use
 */
export const openTokenManager = Pf2eVisionerApi.openTokenManager;
export const openTokenManagerWithMode = Pf2eVisionerApi.openTokenManagerWithMode;

// Legacy exports for backward compatibility
export const openVisibilityManager = Pf2eVisionerApi.openTokenManager;
export const openVisibilityManagerWithMode = Pf2eVisionerApi.openTokenManagerWithMode;

/**
 * Standalone function to get auto-cover state between two tokens
 * @param {Token|string} observer - The observer token or token ID
 * @param {Token|string} target - The target token or token ID
 * @param {Object} options - Additional options for cover detection
 * @returns {string|null} The cover state: "none", "lesser", "standard", "greater", or null if error
 */
export const getAutoCoverState = Pf2eVisionerApi.getAutoCoverState;

/**
 * Auto-Visibility System API
 */
export const autoVisibility = {
  enable: () => autoVisibilitySystem.enable(),
  disable: () => autoVisibilitySystem.disable(),
  isEnabled: () => autoVisibilitySystem.getStatus().enabled,
  recalculateAll: (force = false) => autoVisibilitySystem.recalculateAllVisibility(force),
  updateTokens: (tokens) =>
    autoVisibilitySystem.updateVisibilityForTokens?.(tokens) ||
    console.warn('updateTokens method not available in refactored system'),
  calculateVisibility: (observer, target) =>
    autoVisibilitySystem.calculateVisibility(observer, target),

  // Clear light cache (for performance troubleshooting)
  clearLightCache: () => {
    if (autoVisibilitySystem.clearLightCache) {
      autoVisibilitySystem.clearLightCache();
      ui.notifications.info('Light-emitting tokens cache cleared');
    } else {
      ui.notifications.warn('Cache clearing not available');
    }
  },

  // Clear vision cache (for performance troubleshooting)
  clearVisionCache: (actorId = null) => {
    if (autoVisibilitySystem.clearVisionCache) {
      autoVisibilitySystem.clearVisionCache(actorId);
      const message = actorId
        ? `Vision cache cleared for actor ${actorId}`
        : 'Vision capabilities cache cleared';
      ui.notifications.info(message);
    } else {
      ui.notifications.warn('Vision cache clearing not available');
    }
  },

  // Force recalculation with cache clear (for troubleshooting scene changes)
  forceRecalculate: () => {
    if (autoVisibilitySystem.clearLightCache) {
      autoVisibilitySystem.clearLightCache();
    }
    if (autoVisibilitySystem.clearVisionCache) {
      autoVisibilitySystem.clearVisionCache();
    }
    autoVisibilitySystem.recalculateAllVisibility();
    ui.notifications.info('All caches cleared and visibility recalculated');
  },

  // Test invisibility detection for selected tokens
  testInvisibility: () => {
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 2) {
      ui.notifications.warn('Select exactly 2 tokens: observer and target');
      return;
    }

    const [observer, target] = controlled;
    const isInvisible = autoVisibilitySystem.testInvisibility?.(observer, target);

    ui.notifications.info(
      `${target.name} is ${isInvisible ? 'invisible' : 'visible'} to ${observer.name}`,
    );
  },


  // Reset Scene Config flag (emergency fix)
  resetSceneConfigFlag: () => {
    if (autoVisibilitySystem.resetSceneConfigFlag) {
      autoVisibilitySystem.resetSceneConfigFlag();
      ui.notifications.info('Scene Config flag reset - updates should resume');
    }
  },

  /**
   * Clear all AVS overrides (memory and persistent flags)
   */
  async clearAllAVSOverrides() {
    const autoVis = autoVisibilitySystem;
    if (autoVis && typeof autoVis.clearAllOverrides === 'function') {
      await autoVis.clearAllOverrides();
      ui.notifications.info('PF2E Visioner | All AVS overrides cleared (memory and persistent flags)');
    } else {
      ui.notifications.error('PF2E Visioner | Auto-visibility system not available');
    }
  },
};

/**
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;
