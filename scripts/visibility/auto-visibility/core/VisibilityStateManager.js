
export function getVisibilityBatchProcessDecision({
  processingBatch = false,
  changedTokenCount = 0,
  hasBatchProcessor = false,
  systemStateProvider = null,
} = {}) {
  if (processingBatch) {
    return { shouldProcess: false, shouldClearChanges: false, reason: 'already-processing' };
  }

  if (changedTokenCount === 0) {
    return { shouldProcess: false, shouldClearChanges: false, reason: 'no-changes' };
  }

  if (!hasBatchProcessor) {
    return { shouldProcess: false, shouldClearChanges: false, reason: 'missing-batch-processor' };
  }

  if (
    systemStateProvider &&
    typeof systemStateProvider.isEnabled === 'function' &&
    !systemStateProvider.isEnabled()
  ) {
    return { shouldProcess: false, shouldClearChanges: true, reason: 'avs-disabled' };
  }

  if (
    systemStateProvider &&
    typeof systemStateProvider.shouldProcessEvents === 'function' &&
    !systemStateProvider.shouldProcessEvents()
  ) {
    return { shouldProcess: false, shouldClearChanges: true, reason: 'events-paused' };
  }

  return { shouldProcess: true, shouldClearChanges: false, reason: 'ready' };
}

export function getEligibleVisibilityTokenIds(tokens = [], exclusionManager = null) {
  const tokenIds = [];

  tokens.forEach((token) => {
    if (token.actor && (!exclusionManager || !exclusionManager.isExcludedToken(token))) {
      tokenIds.push(token.document.id);
    }
  });

  return tokenIds;
}

/**
 * VisibilityStateManager - Manages token visibility state changes and batch processing
 *
 * This class handles:
 * - Tracking which tokens need visibility recalculation
 * - Managing batch processing of visibility updates
 * - Coordinating immediate vs throttled processing
 * - Spatial optimization for movement events
 *
 * Follows SOLID principles by providing a focused interface for visibility state management
 * without depending on the main EventDrivenVisibilitySystem implementation.
 */
export class VisibilityStateManager {
  /** @type {Set<string>} - Tokens that have changed and need recalculation */
  #changedTokens = new Set();

  /** @type {boolean} - Whether batch processing is currently running */
  #processingBatch = false;

  /** @type {number} - Timeout ID for throttled full recalculations */
  #fullRecalcTimeout = null;

  /** @type {boolean} - Whether a full recalculation is pending */
  #pendingFullRecalc = false;

  /** @type {Function} - Callback to process batch (injected dependency) */
  #batchProcessor = null;

  /** @type {Function} - Callback to get spatial analysis (injected dependency) */
  #spatialAnalyzer = null;

  /** @type {Function} - Callback to get exclusion manager (injected dependency) */
  #exclusionManager = null;

  /** @type {import('./SystemStateProvider.js').SystemStateProvider} - System state provider for AVS enabled checks */
  #systemStateProvider = null;

  /** @type {Function} - Lazily captures stack details for debug logging */
  #debugStackFactory = () => new Error().stack;

  constructor(dependencies = {}) {
    this.#batchProcessor = dependencies.batchProcessor;
    this.#spatialAnalyzer = dependencies.spatialAnalyzer;
    this.#exclusionManager = dependencies.exclusionManager;
    this.#systemStateProvider = dependencies.systemStateProvider;
    if (typeof dependencies.debugStackFactory === 'function') {
      this.#debugStackFactory = dependencies.debugStackFactory;
    }
  }

  /**
   * Set the batch processor callback
   * @param {Function} processor - Function to call when processing batches
   */
  setBatchProcessor(processor) {
    this.#batchProcessor = processor;
  }

  /**
   * Set the spatial analyzer callback
   * @param {Function} analyzer - Function to get affected tokens by movement
   */
  setSpatialAnalyzer(analyzer) {
    this.#spatialAnalyzer = analyzer;
  }

  /**
   * Set the exclusion manager callback
   * @param {Function} manager - Function to get exclusion manager
   */
  setExclusionManager(manager) {
    this.#exclusionManager = manager;
  }

  /**
   * Mark a specific token as needing visibility recalculation (immediate processing)
   * @param {string} tokenId - ID of the token to mark as changed
   */
  markTokenChangedImmediate(tokenId) {
    this.#debugWithStack('VSM:markTokenChangedImmediate', () => ({
      tokenId,
    }));
    this.#changedTokens.add(tokenId);

    // Execute immediately (not scheduled) to avoid browser throttling when window is minimized
    if (!this.#processingBatch) {
      this.#processBatch();
    }
  }

  /**
   * Mark a token as changed with spatial optimization for movement
   * @param {TokenDocument} [tokenDoc] - Token document (optional)
   * @param {Object} [changes] - Changes being made to the token (optional)
   */
  markTokenChangedWithSpatialOptimization(tokenDoc, changes) {
    this.#debugWithStack('VSM:markTokenChangedWithSpatialOptimization', () => ({
      tokenId: tokenDoc?.id,
      tokenName: tokenDoc?.name,
      changes,
    }));
    // Handle the case where no parameters are provided (just trigger optimization)
    if (!tokenDoc) {
      this.markAllTokensChangedImmediate();
      return;
    }

    const tokenId = tokenDoc.id;
    this.#changedTokens.add(tokenId);

    // If spatial analyzer is available, get affected tokens
    if (this.#spatialAnalyzer) {
      try {
        // Calculate old and new positions
        const oldPos = {
          x: tokenDoc.x + (tokenDoc.width * canvas.grid.size) / 2,
          y: tokenDoc.y + (tokenDoc.height * canvas.grid.size) / 2,
        };
        const newPos = {
          x:
            (changes.x !== undefined ? changes.x : tokenDoc.x) +
            (tokenDoc.width * canvas.grid.size) / 2,
          // BUGFIX: use token height for Y center offset (was width)
          y:
            (changes.y !== undefined ? changes.y : tokenDoc.y) +
            (tokenDoc.height * canvas.grid.size) / 2,
        };

        const affectedTokens = this.#spatialAnalyzer(oldPos, newPos, tokenId);

        affectedTokens.forEach((token) => {
          this.#changedTokens.add(token.document.id);
        });
      } catch (error) {
        try {
          this.#systemStateProvider?.debug?.('VSM:spatialOptimizationFailed', error);
        } catch {}
      }
    }

    // Process SYNCHRONOUSLY to avoid browser throttling when window is minimized
    // Foundry hooks fire even when minimized, so we can process immediately
    if (!this.#processingBatch) {
      this.#processBatch();
    }
  }

  /**
   * Mark all eligible tokens as needing recalculation (immediate processing)
   */
  markAllTokensChangedImmediate() {
    const tokenCount = canvas.tokens?.placeables?.length || 0;
    this.#debugWithStack('VSM:markAllTokensChangedImmediate', () => ({
      tokenCount,
    }));
    const tokens = canvas.tokens?.placeables || [];
    const exclusionManager = this.#exclusionManager?.();

    getEligibleVisibilityTokenIds(tokens, exclusionManager).forEach((tokenId) => {
      this.#changedTokens.add(tokenId);
    });

    // Process SYNCHRONOUSLY to avoid browser throttling when window is minimized
    // Foundry hooks fire even when minimized, so we can process immediately
    if (!this.#processingBatch) {
      this.#processBatch();
    }
  }

  /**
   * Mark all tokens as needing recalculation with throttling to prevent excessive processing
   * Debounces rapid-fire events that would cause constant full recalculations
   */
  markAllTokensChangedThrottled() {
    this.#debugWithStack('VSM:markAllTokensChangedThrottled');
    // If already pending, just extend the timeout
    if (this.#pendingFullRecalc) {
      if (this.#fullRecalcTimeout) {
        clearTimeout(this.#fullRecalcTimeout);
      }
    } else {
      this.#pendingFullRecalc = true;
    }

    this.#fullRecalcTimeout = setTimeout(() => {
      this.#pendingFullRecalc = false;
      this.#fullRecalcTimeout = null;
      this.markAllTokensChangedImmediate();
    }, 10); // 10ms debounce for full recalculations
  }

  /**
   * Process the current batch of changed tokens
   * @private
   */
  async #processBatch() {
    this.#systemStateProvider?.debug?.('VSM:processBatch:start', {
      changedCount: this.#changedTokens.size,
    });

    const decision = getVisibilityBatchProcessDecision({
      processingBatch: this.#processingBatch,
      changedTokenCount: this.#changedTokens.size,
      hasBatchProcessor: !!this.#batchProcessor,
      systemStateProvider: this.#systemStateProvider,
    });

    if (!decision.shouldProcess) {
      if (decision.shouldClearChanges) {
        this.#changedTokens.clear();
      }
      return;
    }

    this.#processingBatch = true;
    const tokensForBatch = new Set(this.#changedTokens);
    this.#changedTokens.clear();
    const tokenCount = tokensForBatch.size;
    let batchSucceeded = false;

    Hooks.callAll('pf2e-visioner.batchStart', { tokenCount });

    try {
      await this.#batchProcessor(tokensForBatch);
      batchSucceeded = true;
    } catch (error) {
      tokensForBatch.forEach((tokenId) => this.#changedTokens.add(tokenId));
      console.error('PF2E Visioner | Batch processing failed:', error);
    } finally {
      this.#processingBatch = false;
      this.#systemStateProvider?.debug?.('VSM:processBatch:complete');
      Hooks.callAll('pf2e-visioner.batchComplete', { tokenCount });
      if (batchSucceeded && this.#changedTokens.size > 0) {
        this.#processBatch();
      }
    }
  }

  #debugWithStack(message, getData = () => ({})) {
    const provider = this.#systemStateProvider;
    if (!provider?.debug) return;
    if (typeof provider.isDebugMode === 'function' && !provider.isDebugMode()) return;

    const stack = this.#debugStackFactory?.();
    const caller = stack?.split('\n')?.[1]?.trim() || 'unknown';
    provider.debug(message, {
      ...getData(),
      caller,
      stack: stack?.split('\n').slice(1, 4).map((line) => line.trim()).join('\n'),
    });
  }

  /**
   * Get the current set of changed token IDs
   * @returns {Set<string>} Set of token IDs that need processing
   */
  getChangedTokens() {
    return new Set(this.#changedTokens); // Return a copy to prevent external mutation
  }

  /**
   * Check if batch processing is currently running
   * @returns {boolean} True if processing a batch
   */
  isProcessingBatch() {
    return this.#processingBatch;
  }

  /**
   * Get the number of tokens currently marked as changed
   * @returns {number} Number of changed tokens
   */
  getChangedTokenCount() {
    return this.#changedTokens.size;
  }

  /**
   * Clear all pending changes and timeouts
   */
  clear() {
    this.#changedTokens.clear();

    if (this.#fullRecalcTimeout) {
      clearTimeout(this.#fullRecalcTimeout);
      this.#fullRecalcTimeout = null;
    }

    this.#pendingFullRecalc = false;
  }

  /**
   * Check if there's a pending full recalculation
   * @returns {boolean} True if a full recalculation is pending
   */
  isPendingFullRecalc() {
    return this.#pendingFullRecalc;
  }

  /**
   * Force immediate processing of current batch (for testing or manual triggers)
   */
  async forceProcessBatch() {
    if (this.#changedTokens.size > 0) {
      await this.#processBatch();
    }
  }

  /**
   * Recalculate visibility for specific tokens
   * @param {string[]} tokenIds - Array of token IDs to recalculate
   */
  recalculateForTokens(tokenIds) {
    this.#debugWithStack('VSM:recalculateForTokens', () => ({
      tokenIds: Array.from(tokenIds),
      count: tokenIds?.length,
    }));
    // Add all specified tokens to the changed set
    tokenIds.forEach((id) => this.#changedTokens.add(id));

    // Process SYNCHRONOUSLY to avoid browser throttling when window is minimized
    // Foundry hooks fire even when minimized, so we can process immediately
    if (!this.#processingBatch) {
      this.#processBatch();
    }
  }

  /**
   * Remove a token from the changed tokens list
   * @param {string} tokenId - ID of the token to remove
   */
  removeChangedToken(tokenId) {
    this.#changedTokens.delete(tokenId);
  }
}
