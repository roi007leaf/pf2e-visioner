/**
 * LightingEventHandler - Handles lighting-related events that affect visibility
 * Manages ambient light source events that impact token visibility calculations
 *
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 */
export class LightingEventHandler {
  constructor(systemStateProvider, visibilityStateManager, cacheManager = null) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.cacheManager = cacheManager;
  }

  /**
   * Initialize lighting event handlers
   */
  initialize() {
    Hooks.on('updateAmbientLight', this.handleLightUpdate.bind(this));
    Hooks.on('createAmbientLight', this.handleLightCreate.bind(this));
    Hooks.on('deleteAmbientLight', this.handleLightDelete.bind(this));
    // Also respond when Foundry refreshes lighting due to token-based light changes (e.g., Torch toggles)
    Hooks.on('lightingRefresh', this.handleLightingRefresh.bind(this));
  }

  /**
   * Check if a light change affects visibility calculations
   * @param {Object} changeData - The change data from the update
   * @returns {boolean} Whether this change affects visibility
   */
  #affectsVisibility(changeData) {
    if (!changeData) return true; // Safe default - assume it affects visibility

    // Check for geometry changes that affect visibility
    const geometryFields = [
      'x',
      'y',
      'elevation', // Position changes
      'config.dim',
      'config.bright', // Light range changes
      'config.angle',
      'rotation', // Direction changes
      'config.alpha', // Visibility changes
      'config.darkness.min',
      'config.darkness.max', // Darkness interaction
      'hidden', // Visibility toggle
      'config.walls', // Wall interaction
    ];

    return geometryFields.some((field) => foundry.utils.hasProperty(changeData, field));
  }

  /**
   * Handle ambient light update - affects visibility for all tokens
   */
  async handleLightUpdate(document, changeData, options, userId) {
    if (!this.systemState.shouldProcessEvents()) return;

    // Only clear caches if the change actually affects visibility
    if (this.#affectsVisibility(changeData)) {
      if (this.cacheManager?.clearVisibilityCache) {
        this.cacheManager.clearVisibilityCache();
      }
      // CRITICAL: Clear LightingPrecomputer caches when ambient lights change
      // This ensures the lighting environment hash will be recalculated
      try {
        const { LightingPrecomputer } = await import('./LightingPrecomputer.js');
        LightingPrecomputer.clearLightingCaches();
      } catch (e) {
        console.warn('Failed to clear LightingPrecomputer caches:', e);
      }

      // Use immediate processing for ambient lights to ensure responsive updates
      // Ambient light changes are less frequent than token movements, so no need for throttling
      this.visibilityState.markAllTokensChangedImmediate();
    }
  }

  /**
   * Handle ambient light creation - affects visibility for all tokens
   */
  async handleLightCreate() {
    if (!this.systemState.shouldProcessEvents()) return;
    // New lights always affect visibility, so clear caches
    if (this.cacheManager?.clearVisibilityCache) {
      this.cacheManager.clearVisibilityCache();
    }
    // CRITICAL: Clear LightingPrecomputer caches when ambient lights are created
    try {
      const { LightingPrecomputer } = await import('./LightingPrecomputer.js');
      LightingPrecomputer.clearLightingCaches();
    } catch (e) {
      console.warn('Failed to clear LightingPrecomputer caches:', e);
    }

    // Use immediate processing for ambient light creation
    this.visibilityState.markAllTokensChangedImmediate();
  }

  /**
   * Handle ambient light deletion - affects visibility for all tokens
   */
  async handleLightDelete() {
    if (!this.systemState.shouldProcessEvents()) return;
    // Deleted lights always affect visibility, so clear caches
    if (this.cacheManager?.clearVisibilityCache) {
      this.cacheManager.clearVisibilityCache();
    }
    // CRITICAL: Clear LightingPrecomputer caches when ambient lights are deleted
    try {
      const { LightingPrecomputer } = await import('./LightingPrecomputer.js');
      LightingPrecomputer.clearLightingCaches();
    } catch (e) {
      console.warn('Failed to clear LightingPrecomputer caches:', e);
    }

    // Use immediate processing for ambient light deletion
    this.visibilityState.markAllTokensChangedImmediate();
  }

  /**
   * Handle Foundry lighting refreshes. This fires for ambient and token-emitted light changes.
   * We use a throttled recalculation to avoid over-processing during continuous refreshes.
   */
  handleLightingRefresh() {
    if (!this.systemState.shouldProcessEvents()) {
      return;
    }

    if (globalThis.game?.pf2eVisioner?.suppressLightingRefresh) {
      this.systemState.debug?.(
        'LightingEventHandler: suppressing lightingRefresh during token operation',
      );
      return;
    }

    if (this.#isLightingRefreshFromTokenSelection()) {
      this.systemState.debug?.(
        'LightingEventHandler: ignoring lightingRefresh from token selection',
      );
      return;
    }

    if (this.systemState.isSceneConfigOpen?.()) {
      this.systemState.markPendingLightingChange?.();
      this.systemState.debug?.(
        'LightingEventHandler: deferring lightingRefresh during open SceneConfig',
      );
      return;
    }

    // Check if we're in a feedback loop - if a batch just completed, don't immediately trigger another
    const now = Date.now();
    const lastBatchComplete = globalThis.game?.pf2eVisioner?._lastBatchCompleteTime || 0;
    if (now - lastBatchComplete < 100) {
      this.systemState.debug?.(
        'LightingEventHandler: ignoring lightingRefresh within 100ms of batch completion (feedback loop prevention)',
      );
      return;
    }

    try {
      this.cacheManager?.clearAllCaches?.();
    } catch {
      /* best-effort */
    }
    this.visibilityState.markAllTokensChangedThrottled();
  }

  /**
   * Check if a lighting refresh event was likely triggered by token selection
   * @returns {boolean} True if this refresh should be ignored
   */
  #isLightingRefreshFromTokenSelection() {
    try {
      // Get the current time
      const now = Date.now();

      // Check if there was a recent controlToken event (within last 100ms)
      const lastControlEvent = this.constructor._lastControlTokenTime || 0;
      const timeSinceControl = now - lastControlEvent;

      // If a controlToken happened very recently, this lighting refresh is likely from that
      if (timeSinceControl < 100) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Track when controlToken events occur
   */
  static trackControlTokenEvent() {
    LightingEventHandler._lastControlTokenTime = Date.now();
  }
}
