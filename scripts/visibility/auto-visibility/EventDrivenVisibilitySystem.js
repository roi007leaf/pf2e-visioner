/**
 * EventDrivenVisibilitySystem - Zero-delay event-driven visibility management
 * Uses zero-delay components with no artificial throttling
 * Relies purely on event batching and requestAnimationFrame for performance
 */

import { MODULE_ID } from '../../constants.js';
import { BatchOrchestrator } from './core/BatchOrchestrator.js';
import { BatchProcessor } from './core/BatchProcessor.js';
import { DependencyInjectionContainer } from './core/DependencyInjectionContainer.js';
import { EventHandlerFactory } from './core/EventHandlerFactory.js';
import { ExclusionManager } from './core/ExclusionManager.js';
import { PositionManager } from './core/PositionManager.js';
import { SystemStateProvider } from './core/SystemStateProvider.js';
import { VisibilityStateManager } from './core/VisibilityStateManager.js';

// Exported helper for unit tests and potential external reuse
export function isDefeatedOrUnconscious(token) {
  try {
    const actor = token?.actor;
    if (!actor) return false;
    const hpValue = actor.hitPoints?.value ?? actor.system?.attributes?.hp?.value;
    if (typeof hpValue === 'number' && hpValue <= 0) return true;
    const conditionSlugs = new Set();
    if (Array.isArray(actor.itemTypes?.condition)) {
      for (const c of actor.itemTypes.condition) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }
    if (Array.isArray(actor.conditions)) {
      for (const c of actor.conditions) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }
    for (const slug of ['unconscious', 'dead', 'dying']) {
      if (conditionSlugs.has(slug)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export class EventDrivenVisibilitySystem {
  /** @type {EventDrivenVisibilitySystem} */
  static #instance = null;

  /** @type {BatchProcessor} - Handles batch processing of visibility calculations */
  // Core systems
  #batchProcessor = null;

  /** @type {BatchOrchestrator} - Orchestrates the complete batch processing pipeline */
  #batchOrchestrator = null;

  /** @type {DependencyInjectionContainer} - Manages dependency creation and injection */
  #diContainer = null;

  /** @type {PositionManager} - Handles position tracking and calculations */
  #positionManager = null;

  /** @type {ExclusionManager} - Handles token exclusion logic */
  #exclusionManager = null;

  /** @type {SystemStateProvider} - Provides system state abstractions for handlers */
  #systemStateProvider = null;

  /** @type {VisibilityStateManager} - Manages visibility state changes and batch operations */
  #visibilityStateManager = null;

  /** @type {CacheManagementService} */
  #cacheManagementService = null;

  /** @type {ViewportFilterService} */
  #viewportFilterService = null;

  /** @type {any} - Optimized visibility calculator facade */
  #optimizedVisibilityCalculator = null;

  /** @type {import('./core/VisibilityMapService.js').VisibilityMapService} */
  #visibilityMapService = null;

  constructor() {
    if (EventDrivenVisibilitySystem.#instance) {
      return EventDrivenVisibilitySystem.#instance;
    }
    EventDrivenVisibilitySystem.#instance = this;
  }

  static getInstance() {
    if (!EventDrivenVisibilitySystem.#instance) {
      EventDrivenVisibilitySystem.#instance = new EventDrivenVisibilitySystem();
    }
    return EventDrivenVisibilitySystem.#instance;
  }

  /**
   * Initialize the system using dependency injection - cleaner architecture
   */
  async initialize() {

    try {
      // Initialize dependency injection container
      this.#diContainer = new DependencyInjectionContainer();

      // Get core services through DI container
      const coreServices = await this.#diContainer.getCoreServices(this);

      // Store core services as instance properties for backward compatibility
      this.#positionManager = coreServices.positionManager;
      this.#exclusionManager = coreServices.exclusionManager;
      this.#optimizedVisibilityCalculator = coreServices.optimizedVisibilityCalculator;
      this.#visibilityMapService = coreServices.visibilityMapService;

      // Initialize extracted services
      this.#cacheManagementService = await this.#diContainer.get('cacheManagementService', { coreServices });
      this.#viewportFilterService = await this.#diContainer.get('viewportFilterService', {
        positionManager: this.#positionManager
      });

      // Initialize BatchProcessor with proper dependency injection
      this.#batchProcessor = await this.#diContainer.get('batchProcessor', {
        spatialAnalyzer: coreServices.spatialAnalysisService,
        viewportFilter: this.#viewportFilterService?.createViewportFilterConfig(),
        optimizedVisibilityCalculator: coreServices.optimizedVisibilityCalculator,
        globalLosCache: coreServices.globalLosCache,
        globalVisibilityCache: coreServices.globalVisibilityCache,
        positionManager: coreServices.positionManager,
        visibilityMapService: coreServices.visibilityMapService,
        overrideService: coreServices.overrideService,
        visionAnalyzer: coreServices.visionAnalyzer,
      });

      // Initialize BatchOrchestrator
      this.#batchOrchestrator = await this.#diContainer.get('batchOrchestrator', {
        batchProcessor: this.#batchProcessor,
        telemetryReporter: coreServices.telemetryReporter,
        exclusionManager: coreServices.exclusionManager,
        viewportFilterService: this.#viewportFilterService,
        visibilityMapService: coreServices.visibilityMapService,
        moduleId: MODULE_ID
      });

      // Create system state provider
      this.#systemStateProvider = await this.#diContainer.createSystemStateProvider(this);

      // Create visibility state manager
      this.#visibilityStateManager = await this.#diContainer.get('visibilityStateManager', {
        batchProcessor: (changedTokens) => this.#batchOrchestrator.enqueueTokens(changedTokens),
        spatialAnalyzer: (oldPos, newPos, tokenId) =>
          coreServices.spatialAnalysisService.getAffectedTokens(oldPos, newPos, tokenId),
        exclusionManager: () => coreServices.exclusionManager,
        systemStateProvider: this.#systemStateProvider
      });

      // Initialize all event handlers using EventHandlerFactory
      // Handlers register themselves automatically and don't need to be stored
      await EventHandlerFactory.createHandlers(
        this.#systemStateProvider,
        this.#visibilityStateManager,
        {
          spatialAnalysisService: coreServices.spatialAnalysisService,
          exclusionManager: coreServices.exclusionManager,
          overrideValidationManager: coreServices.overrideValidationManager,
          positionManager: coreServices.positionManager,
          cacheManager: this.#cacheManagementService
        }
      );

      // Initialize the optimized visibility calculator with the core components
      coreServices.optimizedVisibilityCalculator.initialize(
        coreServices.lightingCalculator,
        coreServices.visionAnalyzer,
        coreServices.conditionManager,
        coreServices.spatialAnalysisService,
        coreServices.exclusionManager,
        coreServices.lightingRasterService
      );

      // Set system state
      this.#systemStateProvider.setEnabled(game.settings.get(MODULE_ID, 'autoVisibilityEnabled'));
    } catch (error) {
      console.error('PF2E Visioner | EventDrivenVisibilitySystem - Initialization failed:', error);
      throw error;
    }

    // Initialize AVS override manager if available
    try {
      const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
      AvsOverrideManager.registerHooks?.();
    } catch {
      /* best-effort */
    }
  }

  /**
   * Enable the system
   */
  enable() {

    this.#systemStateProvider.setEnabled(true);

    // Initial full calculation - immediate
    this.#visibilityStateManager.markAllTokensChangedImmediate();
  }

  /**
   * Disable the system
   */
  disable() {
    // Removed debug log

    this.#systemStateProvider.setDisabled(true);

    // Clear all pending changes through VisibilityStateManager
    this.#visibilityStateManager.clear();
  }

  /**
   * Force recalculation of all visibility (for manual triggers) - IMMEDIATE
   */
  recalculateAll() {
    if (!this.#systemStateProvider.shouldProcessEvents()) return;

    // Removed debug log

    this.#visibilityStateManager.markAllTokensChangedImmediate();
  }

  /**
   * Force recalculation of all token visibility
   * @param {boolean} force - Force recalculation even if recently done
   */
  async recalculateAllVisibility(force = false) {
    if (!this.#systemStateProvider.shouldProcessEvents() && !force) return;

    // Delegate to VisibilityStateManager for proper abstraction
    this.#visibilityStateManager.markAllTokensChangedImmediate();
  }


  /**
   * Recalculate visibility for a specific set of tokens (by id).
   * Useful when overrides are cleared and we need precise, immediate updates.
   * @param {string[]|Set<string>} tokenIds
   */
  async recalculateForTokens(tokenIds) {
    if (!this.#systemStateProvider.shouldProcessEvents()) return;
    const ids = Array.from(new Set((tokenIds || []).filter(Boolean)));
    if (ids.length === 0) return;

    // Filter to only valid, non-excluded tokens and delegate to VisibilityStateManager
    const validIds = ids.filter(id => {
      const tok = canvas.tokens?.get(id);
      return tok && !this.#exclusionManager.isExcludedToken(tok);
    });

    this.#visibilityStateManager.recalculateForTokens(validIds);
  }

  /**
   * Calculate visibility between two tokens using optimized calculator
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target, options = undefined) {
    try {
      // Short-circuit: AVS does not calculate for excluded participants (hidden, fails testVisibility, sneak-active)
      if (observer && this.#exclusionManager.isExcludedToken(observer)) {
        const map = this.#visibilityMapService?.getVisibilityMap?.(observer || {});
        return map?.[target?.document?.id] || 'observed';
      }
      if (target && this.#exclusionManager.isExcludedToken(target)) {
        const map = this.#visibilityMapService?.getVisibilityMap?.(observer || {});
        return map?.[target?.document?.id] || 'observed';
      }
      // Ensure we don't use stale cached vision capabilities when movement just happened
      const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();
      visionAnalyzer.invalidateVisionCache?.(observer?.document?.id);
    } catch {
      // Best effort only
    }
    return await this.#optimizedVisibilityCalculator.calculateVisibility(observer, target, options);
  }

  /**
   * Calculate effective visibility including manual overrides and the persisted visibility map.
   * Precedence:
   * 1) Active override flag on target (avs-override-from-<observerId>)
   * 2) Current visibility map entry (observer -> target)
   * 3) Fresh AVS calculation (no overrides)
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithOverrides(observer, target) {
    try {
      if (!observer?.document?.id || !target?.document?.id) return 'observed';

      // 1) Check for active override (persisted flag)
      const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
      const override = await AvsOverrideManager.getOverride(observer, target);
      if (typeof override === 'string' && override) return override;
      if (override?.state) return override.state;


      // 2) Check current visibility map (observer -> target)
      try {
        const current = this.#visibilityMapService?.getVisibilityMap?.(observer)?.[target.document.id];
        if (current) return current;
      } catch {
        /* ignore */
      }

      // 3) Fallback to regular AVS calculation (no overrides)
      return await this.calculateVisibility(observer, target);
    } catch {
      return 'observed';
    }
  }

  /**
   * Public: delegate updating-effects guard to SystemStateProvider
   * Use this to prevent event handlers from reacting to our own effect writes.
   * Safe to call before initialization (becomes a no-op).
   * @param {boolean} isUpdating
   */
  setUpdatingEffects(isUpdating) {
    try {
      this.#systemStateProvider?.setUpdatingEffects?.(!!isUpdating);
    } catch {
      /* no-op */
    }
  }


  /**
   * Force recalculation specifically for sneaking tokens
   * This ensures AVS processes sneaking tokens even when they're hidden by Foundry
   */
  async recalculateSneakingTokens() {
    const changedTokens = new Set();
    if (!this.#systemStateProvider.isEnabled()) return;

    const sneakingTokens =
      canvas.tokens?.placeables?.filter(
        (t) =>
          t.actor &&
          !this.#exclusionManager.isExcludedToken(t) &&
          t.document.getFlag('pf2e-visioner', 'sneak-active'),
      ) || [];

    // Mark all sneaking tokens as changed
    for (const token of sneakingTokens) {
      changedTokens.add(token.document.id);
    }

    this.#batchOrchestrator.enqueueTokens(changedTokens);
  }

  /**
   * API: Clear all AVS override flags in the scene.
   * Provided for backward-compatibility with existing API tests.
   */
  async clearAllOverrides() {
    try {
      const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
      return await AvsOverrideManager.clearAllOverrides();
    } catch (err) {
      console.error('PF2E Visioner | clearAllOverrides failed:', err);
      return false;
    }
  }

  /**
   * API: Remove an override between specific observer and target.
   * @param {string} observerId
   * @param {string} targetId
   */
  async removeOverride(observerId, targetId) {
    try {
      const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
      return await AvsOverrideManager.removeOverride(observerId, targetId);
    } catch (err) {
      console.error('PF2E Visioner | removeOverride failed:', { observerId, targetId, err });
      return false;
    }
  }
}

// Export singleton instance
export const eventDrivenVisibilitySystem = EventDrivenVisibilitySystem.getInstance();

// Make it available globally for other components to access
if (typeof window !== 'undefined') {
  window.Pf2eVisionerEventDrivenSystem = eventDrivenVisibilitySystem;
}
