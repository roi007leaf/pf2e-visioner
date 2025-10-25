/**
 * Public API for PF2E Per-Token Visibility
 */

import { MODULE_ID } from './constants.js';
import autoCoverSystem from './cover/auto-cover/AutoCoverSystem.js';
import { VisionerTokenManager } from './managers/token-manager/TokenManager.js';
import {
  rebuildAndRefresh,
  removeAllReferencesToTarget,
  removeModuleEffectsFromActors,
  removeModuleEffectsFromTokenActors,
  removeObserverContributions,
  unsetMapsForTokens,
} from './services/api-internal.js';
import { LevelsIntegration } from './services/LevelsIntegration.js';
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
import { autoVisibilitySystem, ConditionManager } from './visibility/auto-visibility/index.js';
import { optimizedPerceptionManager } from './visibility/auto-visibility/PerceptionManager.js';

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
      ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.PERMISSION_DENIED'));
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
    } catch (_) {}
    return manager;
  }

  /**
   * Open the token manager with a specific mode
   * @param {Token} observer - The observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  static async openTokenManagerWithMode(observer, mode = 'observer') {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.PERMISSION_DENIED'));
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
    } catch (_) {}
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

    // Performance optimization: Skip visual updates for large bulk operations
    const optimizedOptions = {
      ...options,
      skipVisualUpdates:
        options.skipVisualUpdates ||
        (updates instanceof Map
          ? Array.from(updates.values()).reduce((total, arr) => total + (arr?.length || 0), 0) > 20
          : Array.isArray(updates) && updates.length > 20),
    };
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
            AvsOverrideManager = (await import('./chat/services/infra/AvsOverrideManager.js'))
              .default;
          }
          // Build changes map expected by applyOverrides: array of { target, state }
          // Source tagged as manual_action for consistency with single setVisibility
          await AvsOverrideManager.applyOverrides(
            observer,
            prepared.map((p) => ({ target: p.target, state: p.state })),
            { source: 'manual_action' },
          );
        }
      } catch (e) {
        console.warn(
          'PF2E Visioner API: Failed to apply AVS overrides during bulkSetVisibility',
          e,
        );
      }
      await batchUpdateVisibilityEffects(observer, prepared, optimizedOptions);
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
   * Get the primary factors affecting visibility between two tokens
   * Returns structured data about lighting, conditions, and special detection
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {Promise<Object>} Object with visibility factors: {state, lighting, conditions, detection}
   */
  static async getVisibilityFactors(observerId, targetId) {
    try {
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken || !targetToken) {
        return null;
      }

      // Get components
      const { optimizedVisibilityCalculator } = await import(
        './visibility/auto-visibility/VisibilityCalculator.js'
      );
      const { VisionAnalyzer } = await import('./visibility/auto-visibility/VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();

      // Calculate current visibility - skip LOS check for diagnostic purposes
      const visibility = await optimizedVisibilityCalculator.calculateVisibility(
        observerToken,
        targetToken,
        { skipLOS: true },
      );

      // Check for manual overrides
      const visibilityMap = observerToken.document.getFlag('pf2e-visioner', 'visibility') || {};
      const manualState = visibilityMap[targetToken.id];

      // Get lighting at target (movement-adjusted)
      const lightingCalc = optimizedVisibilityCalculator.getComponents().lightingCalculator;
      const targetAdjusted =
        targetToken.getMovementAdjustedPoint?.(targetToken.center) ?? targetToken.center;
      const targetPos = {
        x: targetAdjusted.x,
        y: targetAdjusted.y,
        elevation: targetToken.document.elevation || 0,
      };
      const targetLight = lightingCalc.getLightLevelAt(targetPos, targetToken);

      // Also get lighting at observer (movement-adjusted)
      const observerAdjusted =
        observerToken.getMovementAdjustedPoint?.(observerToken.center) ?? observerToken.center;
      const observerPos = {
        x: observerAdjusted.x,
        y: observerAdjusted.y,
        elevation: observerToken.document.elevation || 0,
      };
      const observerLight = lightingCalc.getLightLevelAt(observerPos, observerToken);

      // Check for region-based concealment (now that we have targetPos)
      let regionConcealment = false;
      try {
        const { ConcealmentRegionBehavior } = await import(
          './regions/ConcealmentRegionBehavior.js'
        );
        regionConcealment = ConcealmentRegionBehavior.doesRayHaveConcealment(
          observerPos,
          targetPos,
        );
      } catch (e) {
        console.error('[Visibility Factors API Debug] Region concealment check failed:', e);
      }

      // Check for darkness along the ray (magical darkness templates)
      let rayDarkness = false;
      let rayDarknessRank = 0;
      let darknessTemplates = [];
      try {
        const lightingRasterService =
          optimizedVisibilityCalculator.getComponents().lightingRasterService;
        if (lightingRasterService) {
          const result = await lightingRasterService.checkDarknessRayIntersection(
            observerPos,
            targetPos,
            observerLight,
            targetLight,
          );
          rayDarkness = result?.linePassesThroughDarkness || false;
          rayDarknessRank = result?.rayDarknessRank || 0;
        }

        // Also check if target is inside a darkness template
        const templates = canvas.templates?.placeables || [];
        for (const template of templates) {
          const templateName =
            template.document?.flags?.pf2e?.origin?.name || template.document?.name || '';
          const isDarknessSpell =
            /darkness/i.test(templateName) ||
            template.document?.getFlag?.('pf2e-visioner', 'isDarknessTemplate');

          if (isDarknessSpell) {
            // Check if target is within the template
            const templateShape = template.shape;
            if (
              templateShape &&
              templateShape.contains(targetPos.x - template.x, targetPos.y - template.y)
            ) {
              darknessTemplates.push({
                name: templateName,
                template,
                affectsTarget: true,
                affectsObserver: false,
              });
            }
            // Also check if observer is within the template
            else if (
              templateShape &&
              templateShape.contains(observerPos.x - template.x, observerPos.y - template.y)
            ) {
              darknessTemplates.push({
                name: templateName,
                template,
                affectsTarget: false,
                affectsObserver: true,
              });
            }
            // Check if the ray passes through the template (both tokens on opposite sides)
            else {
              // Simple check: if template is between the two tokens
              const templateCenter = { x: template.x, y: template.y };
              const distObserverToTemplate = Math.hypot(
                observerPos.x - templateCenter.x,
                observerPos.y - templateCenter.y,
              );
              const distTargetToTemplate = Math.hypot(
                targetPos.x - templateCenter.x,
                targetPos.y - templateCenter.y,
              );
              const distObserverToTarget = Math.hypot(
                observerPos.x - targetPos.x,
                observerPos.y - targetPos.y,
              );

              // If template is roughly between them (within template radius)
              const templateRadius = template.document?.distance || 20;
              const gridSize = canvas.grid?.size || 100;
              const radiusPixels = (templateRadius / canvas.dimensions?.distance) * gridSize;

              if (
                distObserverToTemplate < distObserverToTarget &&
                distTargetToTemplate < distObserverToTarget
              ) {
                // Template is between them, check if ray likely passes through it
                if (distObserverToTemplate < radiusPixels + distObserverToTarget * 0.5) {
                  darknessTemplates.push({
                    name: templateName,
                    template,
                    affectsTarget: false,
                    affectsObserver: false,
                    betweenTokens: true,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[Visibility Factors API Debug] Ray darkness check failed:', e);
      }

      // Determine lighting factor
      let lightingFactor = 'bright';
      if (targetLight.darknessRank >= 4) {
        lightingFactor =
          targetLight.darknessRank === 4
            ? 'greaterMagicalDarkness'
            : `magicalDarkness${targetLight.darknessRank}`;
      } else if (targetLight.darknessRank >= 1) {
        lightingFactor = 'magicalDarkness';
      } else if (targetLight.level === 'darkness') {
        lightingFactor = 'darkness';
      } else if (targetLight.level === 'dim') {
        lightingFactor = 'dim';
      }

      // Check conditions
      const targetConditions = [];
      if (targetToken.actor?.itemTypes?.condition) {
        const conditionSlugs = targetToken.actor.itemTypes.condition.map((c) => c.slug);
        if (conditionSlugs.includes('invisible')) targetConditions.push('invisible');
        if (conditionSlugs.includes('undetected')) targetConditions.push('undetected');
        if (conditionSlugs.includes('hidden')) targetConditions.push('hidden');
        if (conditionSlugs.includes('concealed')) targetConditions.push('concealed');
      }

      const observerConditions = [];
      if (observerToken.actor?.itemTypes?.condition) {
        const conditionSlugs = observerToken.actor.itemTypes.condition.map((c) => c.slug);
        if (conditionSlugs.includes('blinded')) observerConditions.push('blinded');
      }

      // Check vision capabilities
      const visionCaps = visionAnalyzer.getVisionCapabilities(observerToken);

      // Calculate distance for sense range checks
      const distance = visionAnalyzer.distanceFeet(observerToken, targetToken);

      // Check special detection
      const detection = {
        darkvision: visionCaps.hasDarkvision,
        lowLightVision: visionCaps.hasLowLightVision,
        lifesense: false,
        tremorsense: false,
      };

      const hasLifesense = visionCaps.sensingSummary?.lifesense?.range > 0;
      if (hasLifesense) {
        // Check if target is within lifesense range and is a living/undead creature
        const inRange = distance <= (visionCaps.sensingSummary.lifesense.range || 0);
        const traits = targetToken.actor?.system?.traits?.value || [];
        const isLivingOrUndead = !traits.includes('construct') && !traits.includes('object');
        detection.lifesense = inRange && isLivingOrUndead;
      }

      const hasTremorsense = visionCaps.sensingSummary?.tremorsense?.range > 0;
      if (hasTremorsense) {
        const observerMovementAction = observerToken.document.movementAction;
        const targetMovementAction = targetToken.document.movementAction;
        const isElevated = observerMovementAction === 'fly' || targetMovementAction === 'fly';
        const bothOnGround =
          (observerToken.document.elevation || 0) === 0 &&
          (targetToken.document.elevation || 0) === 0;
        detection.tremorsense =
          !isElevated &&
          bothOnGround &&
          distance <= (visionCaps.sensingSummary.tremorsense.range || 0);
      }

      // Build comprehensive senses object from sensingSummary
      const sensingSummary = visionCaps.sensingSummary || {};
      const senses = {
        darkvision: {
          has: visionCaps.hasDarkvision,
          range: visionCaps.darkvisionRange || 0,
          active:
            visionCaps.hasDarkvision &&
            (lightingFactor === 'darkness' || lightingFactor.includes('magicalDarkness')),
          type: 'precise',
        },
        lowLightVision: {
          has: visionCaps.hasLowLightVision,
          active: visionCaps.hasLowLightVision && lightingFactor === 'dim',
          type: 'precise',
        },
        lifesense: {
          has: hasLifesense,
          range: sensingSummary.lifesense?.range || 0,
          active: detection.lifesense,
          inRange: hasLifesense && distance <= (sensingSummary.lifesense?.range || 0),
          type: 'precise',
        },
        tremorsense: {
          has: hasTremorsense,
          range: sensingSummary.tremorsense?.range || 0,
          active: detection.tremorsense,
          inRange: hasTremorsense && distance <= (sensingSummary.tremorsense?.range || 0),
          type: 'precise',
        },
        scent: {
          has: (sensingSummary.scent?.range || 0) > 0,
          range: sensingSummary.scent?.range || 0,
          inRange:
            (sensingSummary.scent?.range || 0) > 0 &&
            distance <= (sensingSummary.scent?.range || 0),
          type: 'imprecise',
        },
        hearing: {
          has: (sensingSummary.hearing?.range || 0) > 0 || !observerConditions.includes('deafened'),
          range: sensingSummary.hearing?.range || Infinity,
          inRange: distance <= (sensingSummary.hearing?.range || Infinity),
          type: 'imprecise',
        },
      };

      // Add all precise senses from sensingSummary
      if (sensingSummary.precise) {
        for (const sense of sensingSummary.precise) {
          const senseKey = sense.type?.replace(/-/g, '') || sense.type;
          if (senseKey && !senses[senseKey]) {
            senses[senseKey] = {
              has: sense.range > 0,
              range: sense.range || 0,
              inRange: sense.range > 0 && distance <= sense.range,
              type: 'precise',
            };
          }
        }
      }

      // Add all imprecise senses from sensingSummary
      if (sensingSummary.imprecise) {
        for (const sense of sensingSummary.imprecise) {
          const senseKey = sense.type?.replace(/-/g, '') || sense.type;
          if (senseKey && !senses[senseKey]) {
            senses[senseKey] = {
              has: sense.range > 0,
              range: sense.range || 0,
              inRange: sense.range > 0 && distance <= sense.range,
              type: 'imprecise',
            };
          }
        }
      }

      // Build comprehensive reasons array explaining WHY the visibility state is what it is
      const reasons = [];
      const slugs = [];

      // 1. OBSERVER CONDITIONS (highest priority - completely override senses)
      if (observerConditions.includes('blinded')) {
        reasons.push(
          game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_BLINDED'),
        );
        slugs.push('blinded');
      }

      const isDeafened = observerConditions.includes('deafened');
      if (isDeafened && targetConditions.includes('invisible')) {
        reasons.push(
          game.i18n.localize(
            'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_DEAFENED_INVISIBLE',
          ),
        );
        slugs.push('invisible');
      }

      // Check for dazzled condition
      const isDazzled = observerToken.actor?.itemTypes?.condition?.some(
        (c) => c.slug === 'dazzled',
      );
      if (isDazzled && (visibility === 'concealed' || lightingFactor === 'bright')) {
        // Dazzled causes concealment in bright light if vision is the only precise sense
        const hasNonVisualPreciseSense =
          detection.lifesense ||
          detection.tremorsense ||
          Object.entries(sensingSummary.precise || []).some(
            ([type]) =>
              !['vision', 'darkvision', 'low-light-vision', 'greater-darkvision'].includes(type),
          );
        if (!hasNonVisualPreciseSense && lightingFactor === 'bright') {
          reasons.push(
            game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_DAZZLED'),
          );
          slugs.push('dazzled');
        }
      }

      // 2. TARGET CONDITIONS (override most other factors)
      if (targetConditions.includes('invisible')) {
        reasons.push(
          game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_INVISIBLE'),
        );
        slugs.push('invisible');
      }
      if (targetConditions.includes('undetected')) {
        reasons.push(
          game.i18n.localize(
            'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_UNDETECTED_CONDITION',
          ),
        );
        slugs.push('undetected');
      }
      if (targetConditions.includes('hidden')) {
        reasons.push(
          game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_HIDDEN_CONDITION'),
        );
        slugs.push('hidden');
      }
      if (targetConditions.includes('concealed')) {
        reasons.push(
          game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_CONCEALED_CONDITION'),
        );
        slugs.push('concealed');
      }

      // 3. LIGHTING CONDITIONS (main cause of concealment/hidden for most cases)
      if (visibility === 'concealed' || visibility === 'hidden') {
        // Check for darkness templates first (most common cause)
        if (darknessTemplates.length > 0) {
          const affectsTarget = darknessTemplates.some((t) => t.affectsTarget);
          const affectsObserver = darknessTemplates.some((t) => t.affectsObserver);
          const betweenTokens = darknessTemplates.some((t) => t.betweenTokens);
          const templateNames = darknessTemplates.map((t) => t.name).join(', ');

          // Determine darkness rank
          const darknessRank = Math.max(
            targetLight.darknessRank || 0,
            observerLight.darknessRank || 0,
          );

          // Build appropriate message based on darkvision and darkness rank
          if (affectsTarget) {
            if (darknessRank >= 4) {
              // Greater Magical Darkness (rank 4+)
              if (visionCaps.hasGreaterDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_GREATER_DARKNESS_WITH_GREATER_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_GREATER_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_GREATER_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else if (darknessRank >= 1) {
              // Regular Magical Darkness (rank 1-3)
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_MAGICAL_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_MAGICAL_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else {
              // Regular darkness
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            }
          } else if (affectsObserver) {
            if (darknessRank >= 4) {
              // Greater Magical Darkness (rank 4+)
              if (visionCaps.hasGreaterDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_GREATER_DARKNESS_WITH_GREATER_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_GREATER_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_GREATER_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else if (darknessRank >= 1) {
              // Regular Magical Darkness (rank 1-3)
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_MAGICAL_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_MAGICAL_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else {
              // Regular darkness
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_DARKNESS_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.OBSERVER_IN_DARKNESS_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            }
          } else if (betweenTokens) {
            if (darknessRank >= 4) {
              if (visionCaps.hasGreaterDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DARKNESS_BETWEEN_WITH_GREATER_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DARKNESS_BETWEEN_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DARKNESS_BETWEEN_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else if (darknessRank >= 1) {
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.MAGICAL_DARKNESS_BETWEEN_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.MAGICAL_DARKNESS_BETWEEN_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            } else {
              if (visionCaps.hasDarkvision) {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.REGULAR_DARKNESS_BETWEEN_WITH_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              } else {
                reasons.push(
                  game.i18n.format(
                    'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.REGULAR_DARKNESS_BETWEEN_NO_DARKVISION',
                    { templates: templateNames },
                  ),
                );
              }
            }
          } else {
            reasons.push(
              game.i18n.format('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.AFFECTED_BY_DARKNESS', {
                templates: templateNames,
              }),
            );
          }
          slugs.push('darkness-template');
        }
        // Check for region-based concealment
        else if (regionConcealment) {
          reasons.push(
            game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.REGION_CONCEALMENT'),
          );
          slugs.push('region-concealment');
        }
        // Check for darkness along the ray (magical darkness templates/areas)
        else if (rayDarkness && rayDarknessRank > 0) {
          if (rayDarknessRank >= 4) {
            if (visionCaps.hasDarkvision && !visionCaps.hasGreaterDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.RAY_GREATER_DARKNESS_WITH_DARKVISION',
                  { rank: rayDarknessRank },
                ),
              );
              slugs.push('magical-darkness');
            } else if (!visionCaps.hasDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.RAY_GREATER_DARKNESS_NO_DARKVISION',
                  { rank: rayDarknessRank },
                ),
              );
              slugs.push('magical-darkness');
            }
          } else {
            if (!visionCaps.hasDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.RAY_MAGICAL_DARKNESS_NO_DARKVISION',
                  { rank: rayDarknessRank },
                ),
              );
              slugs.push('magical-darkness');
            }
          }
        }
        // Check magical darkness from lighting
        else if (
          lightingFactor == 'greaterMagicalDarkness' ||
          lightingFactor.startsWith('magicalDarkness')
        ) {
          const rank = targetLight.darknessRank || 0;
          if (rank >= 4) {
            if (visionCaps.hasDarkvision && !visionCaps.hasGreaterDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.GREATER_MAGICAL_DARKNESS_WITH_DARKVISION',
                  { rank: rank },
                ),
              );
              slugs.push('magical-darkness');
            } else if (!visionCaps.hasDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_MAGICAL_DARKNESS_NO_DARKVISION',
                  { rank: rank },
                ),
              );
              slugs.push('magical-darkness');
            }
            // Note: Greater darkvision can see through rank 4 darkness
          } else if (rank >= 1) {
            // Regular magical darkness (rank 1-3) - works like normal darkness
            if (!visionCaps.hasDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_MAGICAL_DARKNESS_NO_DARKVISION',
                  { rank: rank },
                ),
              );
              slugs.push('magical-darkness');
            }
          }
        }
        // Regular darkness without darkvision
        else if (lightingFactor === 'darkness' && !visionCaps.hasDarkvision) {
          reasons.push(
            game.i18n.localize(
              'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_DARKNESS_NO_DARKVISION_SIMPLE',
            ),
          );
          slugs.push('darkness');
        }
        // Dim light without low-light vision (causes concealment)
        else if (lightingFactor === 'dim' && !visionCaps.hasLowLightVision) {
          reasons.push(
            game.i18n.localize(
              'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_IN_DIM_NO_LOW_LIGHT',
            ),
          );
          slugs.push('dim-light');
        }
      }

      // 4. SPECIAL SENSE DETECTION (can detect otherwise hidden targets)
      // Helper to determine acuity of a sense
      const getSenseAcuity = (senseType) => {
        // Check if sense is in precise array
        if (sensingSummary.precise?.some((s) => s.type === senseType)) {
          return 'precise';
        }
        // Check if sense is in imprecise array
        if (sensingSummary.imprecise?.some((s) => s.type === senseType)) {
          return 'imprecise';
        }
        // Default fallback
        return 'imprecise';
      };

      // Lifesense detection
      if (detection.lifesense) {
        const acuity = getSenseAcuity('lifesense');
        reasons.push(
          game.i18n.format('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_LIFESENSE', {
            acuity: acuity,
          }),
        );
        slugs.push('lifesense');
      }

      // Tremorsense detection
      if (detection.tremorsense) {
        const acuity = getSenseAcuity('tremorsense');
        reasons.push(
          game.i18n.format('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_TREMORSENSE', {
            acuity: acuity,
          }),
        );
        slugs.push('tremorsense');
      }

      // Check for other precise non-visual senses
      if (sensingSummary.precise) {
        for (const sense of sensingSummary.precise) {
          const senseType = sense.type;
          // Skip lifesense and tremorsense (already handled above)
          // Skip visual senses (they're not "special" detection)
          if (
            ![
              'vision',
              'darkvision',
              'low-light-vision',
              'greater-darkvision',
              'lifesense',
              'tremorsense',
            ].includes(senseType)
          ) {
            if (sense.range > 0 && distance <= sense.range) {
              const senseName = senseType.replace(/-/g, ' ');
              reasons.push(
                game.i18n.format('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_SENSE', {
                  sense: senseName,
                }),
              );
              slugs.push(senseType);
            }
          }
        }
      }

      // Imprecise senses (provide hidden state, not observed)
      if (visibility === 'hidden') {
        // Check if detection is via imprecise senses
        const hasHearing =
          sensingSummary.hearing &&
          !isDeafened &&
          distance <= (sensingSummary.hearing.range || Infinity);
        const hasScent = sensingSummary.scent && distance <= (sensingSummary.scent?.range || 0);

        if (hasHearing && targetConditions.includes('invisible')) {
          reasons.push(
            game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.HEARD_INVISIBLE_HIDDEN'),
          );
          slugs.push('hearing');
        } else if (
          hasHearing &&
          (lightingFactor === 'darkness' ||
            (typeof lightingFactor === 'string' && lightingFactor.includes('magicalDarkness')))
        ) {
          // Target is hidden in darkness but can be heard
          reasons.push(
            game.i18n.format(
              'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_SENSE_IMPRECISE',
              { sense: 'hearing' },
            ),
          );
          slugs.push('hearing');
        }

        if (hasScent) {
          reasons.push(
            game.i18n.format(
              'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_SENSE_IMPRECISE',
              { sense: 'scent' },
            ),
          );
          slugs.push('scent');
        }

        if (sensingSummary.imprecise && Array.isArray(sensingSummary.imprecise)) {
          for (const sense of sensingSummary.imprecise) {
            const senseType = sense?.type;
            if (!senseType || senseType === 'hearing' || senseType === 'scent') continue;
            const range = Number(sense?.range) || 0;
            if (range > 0 && distance <= range) {
              const senseName = senseType.replace(/-/g, ' ');
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DETECTED_BY_SENSE_IMPRECISE',
                  { sense: senseName },
                ),
              );
              slugs.push(senseType);
            }
          }
        }
      }

      // 5. NORMAL VISIBILITY (explain why target IS visible)
      if (visibility === 'observed' && reasons.length === 0) {
        // Explain why they can see the target
        if (lightingFactor === 'bright') {
          reasons.push(
            game.i18n.localize(
              'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.BRIGHT_LIGHT_NORMAL_VISION',
            ),
          );
          slugs.push('bright-light');
        } else if (lightingFactor === 'dim' && visionCaps.hasLowLightVision) {
          reasons.push(
            game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.LOW_LIGHT_VISION_DIM'),
          );
          slugs.push('low-light-vision');
        } else if (
          (lightingFactor === 'darkness' || lightingFactor.includes('magicalDarkness')) &&
          visionCaps.hasDarkvision
        ) {
          if (lightingFactor.includes('magicalDarkness')) {
            const rank = targetLight.darknessRank || 0;
            if (rank < 4) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DARKVISION_THROUGH_MAGICAL_DARKNESS',
                  { rank: rank },
                ),
              );
              slugs.push('darkvision');
            } else if (visionCaps.hasGreaterDarkvision) {
              reasons.push(
                game.i18n.format(
                  'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.GREATER_DARKVISION_THROUGH_MAGICAL_DARKNESS',
                  { rank: rank },
                ),
              );
              slugs.push('greater-darkvision');
            }
          } else {
            reasons.push(
              game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.DARKVISION_IN_DARKNESS'),
            );
            slugs.push('darkvision');
          }
        }
      }

      // 6. UNDETECTED - explain why completely undetected
      if (visibility === 'undetected' && reasons.length === 0) {
        if (targetConditions.includes('invisible')) {
          if (isDeafened) {
            reasons.push(
              game.i18n.localize(
                'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_INVISIBLE_OBSERVER_DEAFENED',
              ),
            );
            slugs.push('invisible');
          } else {
            reasons.push(
              game.i18n.localize(
                'PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_INVISIBLE_NO_SENSES',
              ),
            );
            slugs.push('invisible');
          }
        } else {
          reasons.push(
            game.i18n.localize('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.TARGET_NO_SENSES'),
          );
          slugs.push('undetected');
        }
      }

      // 7. FALLBACK - if we still have no reasons but visibility is not observed, add generic explanation
      if (reasons.length === 0 && visibility !== 'observed') {
        // Check if there's a stored visibility state (could be from AVS or manual override)
        // But we can't tell if it's manual or automatic, so use generic wording
        reasons.push(
          game.i18n.format('PF2E_VISIONER.VISIBILITY_FACTORS.REASONS.STORED_STATE', {
            state: visibility,
          }),
        );
        slugs.push('stored-state');
      }

      const dedupedReasons = [];
      const seenReasons = new Set();
      for (const r of reasons) {
        const t = (r ?? '').trim();
        if (!t || seenReasons.has(t)) continue;
        seenReasons.add(t);
        dedupedReasons.push(t);
      }

      const dedupedSlugs = [];
      const seenSlugs = new Set();
      for (const s of slugs) {
        const k = (s ?? '').trim();
        if (!k || seenSlugs.has(k)) continue;
        seenSlugs.add(k);
        dedupedSlugs.push(k);
      }

      return {
        state: visibility,
        lighting: lightingFactor,
        reasons: dedupedReasons,
        slugs: dedupedSlugs,
      };
    } catch (error) {
      console.error('Error getting visibility factors:', error);
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
          const AvsOverrideManager = (await import('./chat/services/infra/AvsOverrideManager.js'))
            .default;
          await AvsOverrideManager.applyOverrides(
            observerToken,
            { target: targetToken, state },
            {
              source: 'manual_action',
            },
          );
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

      // Note: Lifesense detection requires async import and is handled in the auto-visibility system
      // For roll options, lifesense effects are applied through the visibility calculation system
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
   * Get the ConditionManager instance for managing invisible condition states
   * @returns {ConditionManager} The condition manager instance
   */
  static getConditionManager() {
    if (!this._conditionManager) {
      this._conditionManager = new ConditionManager();
    }
    return this._conditionManager;
  }

  /**
   * Explain why a token has a specific visibility state from an observer's perspective
   * Returns detailed information about lighting, vision capabilities, conditions, and LOS
   * @param {string|Token} observer - The observer token or token ID
   * @param {string|Token} target - The target token or token ID
   * @returns {Promise<Object>} Detailed explanation of visibility factors
   */
  static async explainVisibility(observer, target) {
    try {
      // Resolve tokens
      const observerToken = typeof observer === 'string' ? canvas.tokens.get(observer) : observer;
      const targetToken = typeof target === 'string' ? canvas.tokens.get(target) : target;

      if (!observerToken || !targetToken) {
        return { error: 'Observer or target token not found' };
      }

      // Get the auto-visibility system components
      const { optimizedVisibilityCalculator } = await import(
        './visibility/auto-visibility/VisibilityCalculator.js'
      );
      const { VisionAnalyzer } = await import('./visibility/auto-visibility/VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();

      // Calculate current visibility
      const visibility = await optimizedVisibilityCalculator.calculateVisibility(
        observerToken,
        targetToken,
      );

      // Get observer's vision capabilities
      const visionCaps = visionAnalyzer.getVisionCapabilities(observerToken);

      // Get lighting at target's position (movement-adjusted)
      const lightingCalc = optimizedVisibilityCalculator.getComponents().lightingCalculator;
      const targetAdjusted =
        targetToken.getMovementAdjustedPoint?.(targetToken.center) ?? targetToken.center;
      const targetPos = {
        x: targetAdjusted.x,
        y: targetAdjusted.y,
        elevation: targetToken.document.elevation || 0,
      };
      const targetLight = lightingCalc.getLightLevelAt(targetPos, targetToken);

      const observerAdjusted =
        observerToken.getMovementAdjustedPoint?.(observerToken.center) ?? observerToken.center;
      const losResult = CONFIG.Canvas.polygonBackends.sight.testCollision(
        observerAdjusted,
        targetAdjusted,
        { type: 'sight', mode: 'any' },
      );

      const distance = visionAnalyzer.distanceFeet(observerToken, targetToken);

      // Check for conditions
      const targetConditions = {
        invisible:
          targetToken.actor?.itemTypes?.condition?.some((c) => c.slug === 'invisible') || false,
        undetected:
          targetToken.actor?.itemTypes?.condition?.some((c) => c.slug === 'undetected') || false,
        hidden: targetToken.actor?.itemTypes?.condition?.some((c) => c.slug === 'hidden') || false,
        concealed:
          targetToken.actor?.itemTypes?.condition?.some((c) => c.slug === 'concealed') || false,
      };

      const observerConditions = {
        blinded:
          observerToken.actor?.itemTypes?.condition?.some((c) => c.slug === 'blinded') || false,
      };

      // Check for special senses
      const hasLifesense = visionCaps.sensingSummary?.lifesense?.range > 0;
      const canDetectWithLifesense =
        hasLifesense && visionAnalyzer.canDetectWithLifesenseInRange(observerToken, targetToken);

      const hasTremorsense = visionCaps.sensingSummary?.tremorsense?.range > 0;
      const observerMovementAction = observerToken.document.movementAction;
      const targetMovementAction = targetToken.document.movementAction;
      const isElevated = observerMovementAction === 'fly' || targetMovementAction === 'fly';
      const bothOnGround =
        (observerToken.document.elevation || 0) === 0 &&
        (targetToken.document.elevation || 0) === 0;
      const canDetectWithTremorsense =
        hasTremorsense &&
        !isElevated &&
        bothOnGround &&
        distance <= (visionCaps.sensingSummary.tremorsense.range || 0);

      // Build explanation
      const explanation = {
        visibility,
        observer: {
          name: observerToken.name,
          id: observerToken.id,
          darkvision: visionCaps.hasDarkvision,
          darkvisionRange: visionCaps.darkvisionRange || 0,
          lowLightVision: visionCaps.hasLowLightVision,
          senses: visionCaps.sensingSummary,
          conditions: observerConditions,
          blinded: observerConditions.blinded,
        },
        target: {
          name: targetToken.name,
          id: targetToken.id,
          lighting: {
            level: targetLight.level,
            darknessRank: targetLight.darknessRank || 0,
            isDarkness: (targetLight.darknessRank || 0) >= 4,
            description: this._describeLighting(targetLight),
          },
          conditions: targetConditions,
          elevation: targetToken.document.elevation || 0,
        },
        distance: {
          feet: Math.round(distance * 10) / 10,
          gridUnits: Math.round((distance / (canvas.grid.distance || 5)) * 10) / 10,
        },
        lineOfSight: {
          blocked: losResult,
          hasLOS: !losResult,
        },
        specialDetection: {
          lifesense: canDetectWithLifesense,
          tremorsense: canDetectWithTremorsense,
        },
        reasons: this._buildVisibilityReasons(
          visibility,
          visionCaps,
          targetLight,
          targetConditions,
          observerConditions,
          losResult,
          canDetectWithLifesense,
          canDetectWithTremorsense,
        ),
      };

      return explanation;
    } catch (error) {
      console.error('PF2E Visioner: Error explaining visibility:', error);
      return { error: error.message };
    }
  }

  /**
   * Helper: Describe lighting level in human-readable terms
   * @private
   */
  static _describeLighting(light) {
    if (!light) return 'unknown';
    if (light.darknessRank >= 4) return `magical darkness (rank ${light.darknessRank})`;
    if (light.darknessRank >= 1) return `magical darkness (rank ${light.darknessRank})`;
    if (light.level === 'bright') return 'bright light';
    if (light.level === 'dim') return 'dim light';
    if (light.level === 'darkness') return 'darkness';
    return light.level || 'unknown';
  }

  /**
   * Helper: Build array of human-readable reasons for visibility state
   * @private
   */
  static _buildVisibilityReasons(
    visibility,
    visionCaps,
    targetLight,
    targetConditions,
    observerConditions,
    losBlocked,
    lifesense,
    tremorsense,
  ) {
    const reasons = [];

    // Observer conditions
    if (observerConditions.blinded) {
      reasons.push('Observer is blinded');
    }

    // Target conditions
    if (targetConditions.invisible) {
      reasons.push('Target has invisible condition');
    }
    if (targetConditions.undetected) {
      reasons.push('Target has undetected condition');
    }
    if (targetConditions.hidden) {
      reasons.push('Target has hidden condition');
    }
    if (targetConditions.concealed) {
      reasons.push('Target has concealed condition');
    }

    // LOS
    if (losBlocked) {
      reasons.push('Line of sight is blocked by walls');
    }

    // Lighting and vision
    if (targetLight.level === 'darkness' || targetLight.darknessRank >= 4) {
      if (visionCaps.hasDarkvision) {
        if (targetLight.darknessRank >= 4) {
          reasons.push(
            `In magical darkness (rank ${targetLight.darknessRank}) - darkvision cannot see through`,
          );
        } else {
          reasons.push('In darkness but observer has darkvision');
        }
      } else {
        reasons.push('In darkness and observer lacks darkvision');
      }
    } else if (targetLight.level === 'dim') {
      if (!visionCaps.hasLowLightVision && !visionCaps.hasDarkvision) {
        reasons.push('In dim light and observer lacks low-light vision');
      } else {
        reasons.push('In dim light but observer has low-light vision or darkvision');
      }
    } else if (targetLight.level === 'bright') {
      reasons.push('In bright light');
    }

    // Special senses
    if (lifesense) {
      reasons.push('Detected by lifesense');
    }
    if (tremorsense) {
      reasons.push('Detected by tremorsense (both on ground)');
    }

    // Result explanation
    if (visibility === 'observed') {
      if (reasons.length === 0 || reasons.some((r) => r.includes('bright light'))) {
        reasons.push('→ Clearly visible (observed)');
      }
    } else if (visibility === 'concealed') {
      reasons.push('→ Partially obscured (concealed)');
    } else if (visibility === 'hidden') {
      reasons.push('→ Location known but not visible (hidden)');
    } else if (visibility === 'undetected') {
      reasons.push('→ Completely undetected');
    }

    return reasons;
  }

  /**
   * Enable/disable AVS-specific debugging
   * @param {boolean} enabled - Whether to enable AVS debugging
   * @returns {boolean} Success status
   */
  static async enableAVSDebugging(enabled = true) {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.setAVSDebugEnabled(enabled);

      if (enabled) {
        console.log('PF2E Visioner | AVS Debug Mode ENABLED');
      } else {
        console.log('PF2E Visioner | AVS Debug Mode DISABLED');
      }

      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to toggle AVS debugging:', error);
      return false;
    }
  }

  /**
   * Enable/disable general module debugging
   * @param {boolean} enabled - Whether to enable general debugging
   * @returns {boolean} Success status
   */
  static async enableGeneralDebugging(enabled = true) {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.setGeneralDebugEnabled(enabled);

      if (enabled) {
        console.log('PF2E Visioner | General Debug Mode ENABLED');
      } else {
        console.log('PF2E Visioner | General Debug Mode DISABLED');
      }

      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to toggle general debugging:', error);
      return false;
    }
  }

  /**
   * Enable FPS drop debugging mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  static async enableFPSDropDebugging(enabled = true) {
    try {
      const { fpsDropDebugger } = await import('./utils/fps-drop-debugger.js');
      const { performanceMonitor } = await import('./utils/performance-monitor.js');

      if (enabled) {
        fpsDropDebugger.enableDebugMode();
        performanceMonitor.startMonitoring();
        console.log('PF2E Visioner | FPS Drop Debugging ENABLED');
      } else {
        fpsDropDebugger.disableDebugMode();
        performanceMonitor.stopMonitoring();
        console.log('PF2E Visioner | FPS Drop Debugging DISABLED');
      }

      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to toggle FPS drop debugging:', error);
      return false;
    }
  }

  /**
   * Get FPS drop debug report
   * @returns {Object} Debug report with performance data and recommendations
   */
  static async getFPSDropDebugReport() {
    try {
      const { fpsDropDebugger } = await import('./utils/fps-drop-debugger.js');
      return fpsDropDebugger.getDebugReport();
    } catch (error) {
      console.error('PF2E Visioner | Failed to get debug report:', error);
      return { error: error.message };
    }
  }

  /**
   * Get AVS debug logs
   * @returns {Array} Array of AVS log entries
   */
  static async getAVSDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      return debugLogger.getAVSLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to get AVS debug logs:', error);
      return [];
    }
  }

  /**
   * Get general debug logs
   * @returns {Array} Array of general log entries
   */
  static async getGeneralDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      return debugLogger.getGeneralLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to get general debug logs:', error);
      return [];
    }
  }

  /**
   * Get all debug logs
   * @returns {Object} Object containing both AVS and general logs
   */
  static async getAllDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      return debugLogger.getAllLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to get debug logs:', error);
      return { avs: [], general: [], avsEnabled: false, generalEnabled: false };
    }
  }

  /**
   * Clear AVS debug logs
   */
  static async clearAVSDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.clearAVSLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to clear AVS debug logs:', error);
    }
  }

  /**
   * Clear general debug logs
   */
  static async clearGeneralDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.clearGeneralLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to clear general debug logs:', error);
    }
  }

  /**
   * Clear all debug logs
   */
  static async clearAllDebugLogs() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.clearAllLogs();
    } catch (error) {
      console.error('PF2E Visioner | Failed to clear debug logs:', error);
    }
  }

  /**
   * Clear FPS drop debug data
   */
  static async clearFPSDropDebugData() {
    try {
      const { fpsDropDebugger } = await import('./utils/fps-drop-debugger.js');
      fpsDropDebugger.clearDebugData();
      console.log('PF2E Visioner | FPS Drop Debug Data Cleared');
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to clear debug data:', error);
      return false;
    }
  }

  /**
   * Initialize debug logger with current settings
   * This should be called when the module loads
   */
  static async initializeDebugLogger() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');
      debugLogger.initialize();
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to initialize debug logger:', error);
      return false;
    }
  }

  /**
   * Test if debugging is working
   * @returns {Object} Debug status information
   */
  static async testDebugging() {
    try {
      const { debugLogger } = await import('./utils/debug-logger.js');

      // Show current settings
      const avsSetting = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      const generalSetting = !!game.settings.get(MODULE_ID, 'debug');

      console.log(
        `${MODULE_ID} | Current Settings - AVS: ${avsSetting}, General: ${generalSetting}`,
      );
      console.log(
        `${MODULE_ID} | Debug Logger State - AVS: ${debugLogger.isAVSDebugEnabled()}, General: ${debugLogger.isGeneralDebugEnabled()}`,
      );

      // Test general debugging
      debugLogger.generalLog('TEST: General debugging is working!');
      debugLogger.generalWarn('TEST: General warning is working!');

      // Test AVS debugging
      debugLogger.avsLog('TEST: AVS debugging is working!');
      debugLogger.avsWarn('TEST: AVS warning is working!');

      return {
        success: true,
        settings: {
          avsEnabled: avsSetting,
          generalEnabled: generalSetting,
        },
        debugLogger: {
          avsEnabled: debugLogger.isAVSDebugEnabled(),
          generalEnabled: debugLogger.isGeneralDebugEnabled(),
        },
        message: 'Debug test completed - check console for test messages',
      };
    } catch (error) {
      console.error('PF2E Visioner | Debug test failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Track token movement start for FPS debugging
   * @param {string} tokenId - Token ID
   * @param {string} tokenName - Token name
   */
  static async trackTokenMovementStart(tokenId, tokenName) {
    try {
      const { fpsDropDebugger } = await import('./utils/fps-drop-debugger.js');
      fpsDropDebugger.trackTokenMovementStart(tokenId, tokenName);
    } catch (error) {
      console.error('PF2E Visioner | Failed to track token movement start:', error);
    }
  }

  /**
   * Track token movement end for FPS debugging
   * @param {string} tokenId - Token ID
   * @param {string} tokenName - Token name
   */
  static async trackTokenMovementEnd(tokenId, tokenName) {
    try {
      const { fpsDropDebugger } = await import('./utils/fps-drop-debugger.js');
      fpsDropDebugger.trackTokenMovementEnd(tokenId, tokenName);
    } catch (error) {
      console.error('PF2E Visioner | Failed to track token movement end:', error);
    }
  }

  /**
   * Clear all sneak-active flags from all tokens in the scene
   * @returns {Promise<boolean>} Success status
   */
  static async clearAllSneakFlags() {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn(
          game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SNEAK_CLEAR_GM_ONLY'),
        );
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_ACTIVE_SCENE'));
        return false;
      }

      // Find all tokens with sneak-active flag and clear it
      const tokens = canvas.tokens?.placeables ?? [];
      const updates = tokens
        .filter((t) => t.document.getFlag('pf2e-visioner', 'sneak-active'))
        .map((t) => ({
          _id: t.id,
          [`flags.${MODULE_ID}.-=sneak-active`]: null,
        }));

      if (updates.length && scene.updateEmbeddedDocuments) {
        await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
      }

      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing sneak flags:', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SNEAK_CLEAR_FAILED'));
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
        ui.notifications.warn(
          game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SCENE_CLEAR_GM_ONLY'),
        );
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_ACTIVE_SCENE'));
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
        [`flags.-=${MODULE_ID}`]: null,
      }));

      if (updates.length && scene.updateEmbeddedDocuments) {
        try {
          // Additional verification and cleanup: check if flags are actually gone
          setTimeout(async () => {
            const remainingFlags = [];
            const explicitUpdates = [];

            tokens.forEach((t) => {
              const flags = t.document.flags?.[MODULE_ID] || {};
              if (Object.keys(flags).length > 0) {
                remainingFlags.push({
                  tokenName: t.name,
                  remainingFlags: Object.keys(flags),
                });

                // Build explicit removal updates for stubborn flags
                const explicitUpdate = { _id: t.id };
                Object.keys(flags).forEach((flagKey) => {
                  explicitUpdate[`flags.${MODULE_ID}.-=${flagKey}`] = null;
                });
                explicitUpdates.push(explicitUpdate);
              }
            });

            if (remainingFlags.length > 0) {
              console.warn(
                'PF2E Visioner | ⚠️ Some flags were not removed, attempting explicit removal:',
                remainingFlags,
              );

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

      // 1.5) Additional safety: explicitly clear all types of flags
      try {
        await this.clearAllSneakFlags();

        // Also clear other flag types that might be missed
        const explicitFlagUpdates = tokens.map((t) => ({
          _id: t.id,
          [`flags.${MODULE_ID}.-=waitingSneak`]: null,
          [`flags.${MODULE_ID}.-=invisibility`]: null,
          [`flags.${MODULE_ID}.-=coverOverride`]: null,
          [`flags.${MODULE_ID}.-=sneak-speed-effect-id`]: null,
        }));

        if (explicitFlagUpdates.length && scene.updateEmbeddedDocuments) {
          await scene.updateEmbeddedDocuments('Token', explicitFlagUpdates, { diff: false });
        }
      } catch {}

      // 2) Clear ALL scene-level flags used by the module
      try {
        // Only GMs can update scene flags
        if (game.user.isGM) {
          // Clear all known scene-level flags
          await scene.unsetFlag(MODULE_ID, 'deletedEntryCache');
          await scene.unsetFlag(MODULE_ID, 'partyTokenStateCache');
          await scene.unsetFlag(MODULE_ID, 'deferredPartyUpdates');

          // Clear any other scene flags that might exist
          const sceneFlags = scene.flags?.[MODULE_ID] || {};
          for (const flagKey of Object.keys(sceneFlags)) {
            try {
              await scene.unsetFlag(MODULE_ID, flagKey);
            } catch {}
          }
        }
      } catch {}

      // 3) Remove module-created effects from all actors and token-actors (handles unlinked tokens)
      try {
        const actors = Array.from(game.actors ?? []);
        for (const actor of actors) {
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              const slug = e?.system?.slug;
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true ||
                f.sneakingEffect === true ||
                slug === 'waiting-for-sneak-start'
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch {}
          }
        }

        // Also purge effects on token-actors (unlinked tokens won't be in game.actors)
        for (const tok of tokens) {
          const a = tok?.actor;
          if (!a) continue;

          // Remove effects
          const effects = a?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              const slug = e?.system?.slug;
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true ||
                f.sneakingEffect === true ||
                slug === 'waiting-for-sneak-start'
              );
            })
            .map((e) => e.id)
            .filter((id) => !!a.items.get(id));
          if (toDelete.length) {
            try {
              await a.deleteEmbeddedDocuments('Item', toDelete);
            } catch {}
          }

          // Remove actor-level flags (like echolocation)
          try {
            await a.unsetFlag(MODULE_ID, 'echolocation');
          } catch {}
        }
      } catch {}

      // 4) Clear AVS overrides from the new map-based system and hide the override indicator
      try {
        const autoVis = autoVisibilitySystem;
        if (autoVis && typeof autoVis.clearAllOverrides === 'function') {
          await autoVis.clearAllOverrides();
        }
        // Hide the override validation indicator if present
        try {
          const { default: indicator } = await import('./ui/OverrideValidationIndicator.js');
          if (indicator && typeof indicator.hide === 'function') indicator.hide(true);
        } catch {}
      } catch (error) {
        console.warn('PF2E Visioner | Error clearing AVS overrides:', error);
      }

      // 5) Optional extra sweep for cover effects across all actors
      try {
        const { cleanupAllCoverEffects } = await import('./cover/ephemeral.js');
        await cleanupAllCoverEffects();
      } catch {}

      // 5.5) Clean up chat message flags that might contain Visioner data
      try {
        const messages = game.messages?.contents ?? [];
        for (const message of messages) {
          const flags = message.flags?.[MODULE_ID] || {};
          if (Object.keys(flags).length > 0) {
            try {
              await message.unsetFlag(MODULE_ID);
            } catch {}
          }
        }
      } catch {}

      // 6) Rebuild effects and refresh visuals/perception
      // Removed effects-coordinator: bulk rebuild handled elsewhere
      try {
        await updateTokenVisuals();
      } catch {}
      try {
        refreshEveryonesPerception();
      } catch {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch {}

      ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SCENE_DATA_CLEARED'));
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing scene data:', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SCENE_CLEAR_FAILED'));
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
        ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.DATA_CLEAR_GM_ONLY'));
        return false;
      }

      if (!tokens || tokens.length === 0) {
        ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_TOKENS_PROVIDED'));
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_ACTIVE_SCENE'));
        return false;
      }

      // 1.5) Additional safety: explicitly clear ALL visioner flags from selected tokens
      try {
        const flagUpdates = tokens.map((t) => ({
          _id: t.id,
          [`flags.${MODULE_ID}.-=sneak-active`]: null,
          [`flags.${MODULE_ID}.-=waitingSneak`]: null,
          [`flags.${MODULE_ID}.-=invisibility`]: null,
          [`flags.${MODULE_ID}.-=coverOverride`]: null,
          [`flags.${MODULE_ID}.-=visibility`]: null,
          [`flags.${MODULE_ID}.-=cover`]: null,
          [`flags.${MODULE_ID}.-=sneak-speed-effect-id`]: null,
        }));

        // Also clear any AVS override flags
        const allTokens = canvas.tokens?.placeables ?? [];
        const selectedTokenIds = tokens.map((t) => t.id);

        for (const token of tokens) {
          const flags = token.document.flags?.[MODULE_ID] || {};
          const additionalUpdates = {};

          // Find and remove any AVS override flags
          for (const flagKey of Object.keys(flags)) {
            if (flagKey.startsWith('avs-override-')) {
              additionalUpdates[`flags.${MODULE_ID}.-=${flagKey}`] = null;
            }
          }

          // Apply additional updates if any
          if (Object.keys(additionalUpdates).length > 0) {
            const existingUpdate = flagUpdates.find((u) => u._id === token.id);
            if (existingUpdate) {
              Object.assign(existingUpdate, additionalUpdates);
            }
          }
        }

        if (flagUpdates.length && scene.updateEmbeddedDocuments) {
          await scene.updateEmbeddedDocuments('Token', flagUpdates, { diff: false });
        }
      } catch {}

      // 2) Clear scene-level caches used by the module (only if clearing all tokens)
      try {
        // Only clear scene caches if we're clearing all tokens in the scene
        const allTokens = canvas.tokens?.placeables ?? [];
        if (game.user.isGM && tokens.length === allTokens.length) {
          await scene.unsetFlag(MODULE_ID, 'deletedEntryCache');
          await scene.unsetFlag(MODULE_ID, 'partyTokenStateCache');
          await scene.unsetFlag(MODULE_ID, 'deferredPartyUpdates');
        }
      } catch {}

      // 3) Remove module-created effects ONLY from selected tokens' actors
      try {
        for (const token of tokens) {
          const actor = token?.actor;
          if (!actor) continue;

          // Remove effects from this selected token's actor
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              const slug = e?.system?.slug;
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true ||
                f.sneakingEffect === true ||
                slug === 'waiting-for-sneak-start'
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch {}
          }

          // Remove actor-level flags (like echolocation) from this selected token's actor
          try {
            await actor.unsetFlag(MODULE_ID, 'echolocation');
          } catch {}
        }
      } catch {}

      // 4) Clean up any remaining effects related to the selected tokens specifically
      try {
        const { cleanupDeletedToken } = await import('./utils.js');
        for (const token of tokens) {
          if (!token?.actor) continue;
          // Clean up this token from all other tokens' maps and effects
          await cleanupDeletedToken(token.document);
        }
      } catch {}

      // 5) Remove the selected tokens from ALL other tokens' visibility/cover maps and clean up references
      try {
        const allTokens = canvas.tokens?.placeables ?? [];
        const selectedTokenIds = tokens.map((t) => t.id);
        const otherTokens = allTokens.filter((t) => !selectedTokenIds.includes(t.id));

        if (otherTokens.length > 0) {
          const updates = [];

          for (const token of otherTokens) {
            const update = { _id: token.id };
            let hasChanges = false;

            // Remove selected tokens from this token's visibility map
            const visibilityMap = token.document.getFlag(MODULE_ID, 'visibility') || {};
            const cleanedVisibilityMap = { ...visibilityMap };
            for (const selectedId of selectedTokenIds) {
              if (cleanedVisibilityMap[selectedId]) {
                delete cleanedVisibilityMap[selectedId];
                hasChanges = true;
              }
            }
            if (hasChanges) {
              update[`flags.${MODULE_ID}.visibility`] = cleanedVisibilityMap;
            }

            // Remove selected tokens from this token's cover map
            const coverMap = token.document.getFlag(MODULE_ID, 'cover') || {};
            const cleanedCoverMap = { ...coverMap };
            hasChanges = false;
            for (const selectedId of selectedTokenIds) {
              if (cleanedCoverMap[selectedId]) {
                delete cleanedCoverMap[selectedId];
                hasChanges = true;
              }
            }
            if (hasChanges) {
              update[`flags.${MODULE_ID}.cover`] = cleanedCoverMap;
            }

            // Only add update if there are actual changes
            if (Object.keys(update).length > 1) {
              updates.push(update);
            }
          }

          if (updates.length > 0 && scene.updateEmbeddedDocuments) {
            await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
          }
        }
      } catch {}

      // 5.5) Clean up AVS override flags that reference the purged tokens from ALL tokens
      try {
        const allTokens = canvas.tokens?.placeables ?? [];
        const purgedTokenIds = tokens.map((t) => t.id);
        const batchUpdates = [];

        for (const token of allTokens) {
          const updates = { _id: token.id };
          const flags = token.document.flags?.[MODULE_ID] || {};
          let hasUpdates = false;

          // Find and remove override flags that reference purged tokens
          for (const flagKey of Object.keys(flags)) {
            if (flagKey.startsWith('avs-override-')) {
              // Extract the referenced token ID from the flag key
              const match = flagKey.match(/^avs-override-(?:to|from)-(.+)$/);
              if (match && purgedTokenIds.includes(match[1])) {
                updates[`flags.${MODULE_ID}.-=${flagKey}`] = null;
                hasUpdates = true;
              }
            }
          }

          // Add to batch if there are updates
          if (hasUpdates) {
            batchUpdates.push(updates);
          }
        }

        // Apply all updates in a single batch
        if (batchUpdates.length > 0 && scene.updateEmbeddedDocuments) {
          await scene.updateEmbeddedDocuments('Token', batchUpdates, { diff: false });
        }
      } catch {}

      // 6) Clear AVS overrides involving these tokens from the new map-based system and hide the override indicator
      try {
        const autoVis = autoVisibilitySystem;
        if (autoVis && autoVis.removeOverride) {
          const allTokens = canvas.tokens?.placeables ?? [];
          const selectedTokenIds = tokens.map((t) => t.id);

          // Remove overrides between selected tokens and all other tokens
          for (const selectedToken of tokens) {
            for (const otherToken of allTokens) {
              if (selectedToken.id !== otherToken.id) {
                try {
                  await autoVis.removeOverride(selectedToken.id, otherToken.id);
                  await autoVis.removeOverride(otherToken.id, selectedToken.id);
                } catch {}
              }
            }
          }
        }
        // Hide the override validation indicator if present
        try {
          const { default: indicator } = await import('./ui/OverrideValidationIndicator.js');
          if (indicator && typeof indicator.hide === 'function') indicator.hide(true);
        } catch {}
      } catch (error) {
        console.warn('PF2E Visioner | Error clearing AVS overrides for selected tokens:', error);
      }

      // 7) Clean up any chat message flags that reference the purged tokens
      try {
        const messages = game.messages?.contents ?? [];
        for (const message of messages) {
          const flags = message.flags?.[MODULE_ID] || {};
          const updates = {};
          let hasUpdates = false;

          // Check for coverOverride flags that might reference purged tokens
          if (flags.coverOverride) {
            // This is a more complex check - we'd need to examine the structure
            // For now, we'll leave this as a placeholder for future enhancement
          }

          // Check for sneak-related flags that might reference purged tokens
          if (flags.sneakStartStates || flags.startStates) {
            // These might contain references to purged tokens
            // For now, we'll leave this as a placeholder for future enhancement
          }

          if (hasUpdates) {
            try {
              await message.update({ [`flags.${MODULE_ID}`]: { ...flags, ...updates } });
            } catch {}
          }
        }
      } catch {}

      // 8) Rebuild effects and refresh visuals/perception
      try {
        await updateTokenVisuals();
      } catch {}
      try {
        refreshEveryonesPerception();
      } catch {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch {}

      ui.notifications.info(
        `PF2E Visioner: Cleared all data for ${tokens.length} selected token${tokens.length === 1 ? '' : 's'}.`,
      );
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing data for selected tokens:', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.TOKEN_CLEAR_FAILED'));
      return false;
    }
  }

  /**
   * Get perception manager status including animation state
   * @returns {Object} Status information
   */
  static getPerceptionManagerStatus() {
    try {
      return optimizedPerceptionManager.getStatus();
    } catch (error) {
      console.error('PF2E Visioner | Failed to get perception manager status:', error);
      return null;
    }
  }

  /**
   * Manually mark a token as animating (for testing/debugging)
   * @param {string} tokenId - The token ID
   * @returns {boolean} Success status
   */
  static markTokenAnimating(tokenId) {
    try {
      optimizedPerceptionManager.markTokenAnimating(tokenId);
      console.log(`PF2E Visioner | Marked token ${tokenId} as animating`);
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to mark token as animating:', error);
      return false;
    }
  }

  /**
   * Manually mark a token as finished animating (for testing/debugging)
   * @param {string} tokenId - The token ID
   * @returns {boolean} Success status
   */
  static markTokenAnimationComplete(tokenId) {
    try {
      optimizedPerceptionManager.markTokenAnimationComplete(tokenId);
      console.log(`PF2E Visioner | Marked token ${tokenId} as finished animating`);
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Failed to mark token animation complete:', error);
      return false;
    }
  }

  /**
   * Check if any tokens are currently animating
   * @returns {boolean} Animation state
   */
  static isAnyTokenAnimating() {
    try {
      return optimizedPerceptionManager.isAnyTokenAnimating();
    } catch (error) {
      console.error('PF2E Visioner | Failed to check animation state:', error);
      return false;
    }
  }

  /**
   * Get lighting refresh throttling status
   * @returns {Object} Lighting refresh throttling information
   */
  static getLightingRefreshStatus() {
    // This would require importing the LightingEventHandler, but for now return basic info
    return {
      throttlingEnabled: true,
      throttleMs: 100,
      message: 'Light refresh throttling is active to reduce lag when turning on/off lights',
    };
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
      ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.CACHE_CLEARED'));
    } else {
      ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.CACHE_UNAVAILABLE'));
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
      ui.notifications.warn(
        game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.VISION_CACHE_UNAVAILABLE'),
      );
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
    ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.ALL_CACHES_CLEARED'));
  },

  // Test invisibility detection for selected tokens
  testInvisibility: () => {
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 2) {
      ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SELECT_TWO_TOKENS'));
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
      ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SCENE_CONFIG_RESET'));
    }
  },

  /**
   * Clear all AVS overrides (memory and persistent flags)
   */
  async clearAllAVSOverrides() {
    const autoVis = autoVisibilitySystem;
    if (autoVis && typeof autoVis.clearAllOverrides === 'function') {
      await autoVis.clearAllOverrides();
      ui.notifications.info(
        'PF2E Visioner | All AVS overrides cleared (memory and persistent flags)',
      );
    } else {
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.AVS_UNAVAILABLE'));
    }
  },

  /**
   * Test lifesense detection for debugging
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {Object} Debug information about lifesense detection
   */
  testLifesense: async (observerId, targetId) => {
    try {
      const observer = canvas.tokens.get(observerId);
      const target = canvas.tokens.get(targetId);

      if (!observer || !target) {
        return { error: 'Observer or target token not found' };
      }

      const { VisionAnalyzer } = await import('./visibility/auto-visibility/VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();

      const { sensingSummary } = visionAnalyzer.getVisionCapabilities(observer);
      const canDetectType = visionAnalyzer.canDetectWithLifesense(target);
      const canDetectInRange = visionAnalyzer.canDetectWithLifesenseInRange(observer, target);

      // Use standardized distance calculation (now that distanceFeet is public)
      const distance = visionAnalyzer.distanceFeet(observer, target);

      return {
        observer: observer.name,
        target: target.name,
        targetCreatureType: target.actor?.system?.details?.creatureType || target.actor?.type,
        targetTraits: target.actor?.system?.traits?.value || [],
        observerLifesense: sensingSummary.lifesense,
        canDetectCreatureType: canDetectType,
        canDetectInRange: canDetectInRange,
        distance: Math.round(distance * 10) / 10, // Round to 1 decimal
        sensingSummary: sensingSummary,
      };
    } catch (error) {
      return { error: error.message };
    }
  },

  /**
   * Test darkness sources detection for debugging
   * @returns {Array} Array of darkness sources with their properties
   */
  testDarknessSources: () => {
    const darknessSources = canvas.effects?.darknessSources || [];
    const result = darknessSources.map((light) => ({
      id: light.document?.id || 'unknown',
      x: light.center?.x || light.x || 0, // Use native Foundry light center with fallback
      y: light.center?.y || light.y || 0, // Use native Foundry light center with fallback
      active: light.isVisible !== false || light.active !== false, // Use native Foundry visibility check with fallback
      bright: light.brightRadius || light.data?.bright || 0, // Use native Foundry bright radius with fallback
      dim: light.dimRadius || light.data?.dim || 0, // Use native Foundry dim radius with fallback
      darknessRank: Number(light.document?.getFlag?.('pf2e-visioner', 'darknessRank') || 0) || 0,
      flags: light.document?.flags || {},
      hasDocument: !!light.document,
      lightType: light.constructor?.name || 'unknown',
    }));
    return result;
  },

  /**
   * Debug lighting at specific token positions
   * @param {Token} observer - Observer token (optional, uses first selected)
   * @param {Token} target - Target token (optional, uses second selected)
   * @returns {Object} Lighting information for both tokens
   */
  debugTokenLighting: async (observer = null, target = null) => {
    const controlled = canvas.tokens.controlled;
    if (!observer && !target && controlled.length !== 2) {
      ui.notifications.warn(
        game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.SELECT_TWO_TOKENS_OR_PARAMS'),
      );
      return;
    }

    const obs = observer || controlled[0];
    const tgt = target || controlled[1];

    if (!obs || !tgt) {
      ui.notifications.warn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NEED_BOTH_TOKENS'));
      return;
    }

    // Import the visibility calculator to get access to lighting calculator
    const { visibilityCalculator } = await import('./visibility/auto-visibility/index.js');
    const lightingCalculator = visibilityCalculator.getComponents().lightingCalculator;

    const observerPos = {
      x: obs.center.x,
      y: obs.center.y,
      elevation: obs.document.elevation || 0,
    };

    const targetPos = {
      x: tgt.center.x,
      y: tgt.center.y,
      elevation: tgt.document.elevation || 0,
    };

    const observerLight = lightingCalculator.getLightLevelAt(observerPos, obs);
    const targetLight = lightingCalculator.getLightLevelAt(targetPos, tgt);

    const result = {
      observer: {
        name: obs.name,
        position: observerPos,
        lighting: observerLight,
        inRank4Darkness: (observerLight?.darknessRank ?? 0) >= 4,
      },
      target: {
        name: tgt.name,
        position: targetPos,
        lighting: targetLight,
        inRank4Darkness: (targetLight?.darknessRank ?? 0) >= 4,
      },
      darknessSources: (canvas.effects?.darknessSources || []).map((light) => ({
        id: light.document?.id || 'unknown',
        x: light.center.x, // Use native Foundry light center
        y: light.center.y, // Use native Foundry light center
        active: light.isVisible !== false || light.active !== false, // Use native Foundry visibility check with fallback
        bright: light.brightRadius || 0, // Use native Foundry bright radius
        dim: light.dimRadius || 0, // Use native Foundry dim radius
        darknessRank: Number(light.document?.getFlag?.('pf2e-visioner', 'darknessRank') || 0) || 0,
        hasDocument: !!light.document,
        lightType: light.constructor?.name || 'unknown',
      })),
    };

    return result;
  },
};

/**
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;

// Attach the autoVisibility object to the main API
api.autoVisibility = autoVisibility;

// Attach the Levels integration service to the main API
api.levels = LevelsIntegration.getInstance();
