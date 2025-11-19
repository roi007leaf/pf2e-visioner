
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

  constructor(dependencies = {}) {
    this.#batchProcessor = dependencies.batchProcessor;
    this.#spatialAnalyzer = dependencies.spatialAnalyzer;
    this.#exclusionManager = dependencies.exclusionManager;
    this.#systemStateProvider = dependencies.systemStateProvider;
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
    const stack = new Error().stack;
    const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
    this.#systemStateProvider?.debug?.('VSM:markTokenChangedImmediate', {
      tokenId,
      caller,
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    });
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
    const stack = new Error().stack;
    const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
    this.#systemStateProvider?.debug?.('VSM:markTokenChangedWithSpatialOptimization', {
      tokenId: tokenDoc?.id,
      tokenName: tokenDoc?.name,
      changes,
      caller,
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    });
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
    const stack = new Error().stack;
    const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
    const tokenCount = canvas.tokens?.placeables?.length || 0;
    this.#systemStateProvider?.debug?.('VSM:markAllTokensChangedImmediate', {
      tokenCount,
      caller,
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    });
    const tokens = canvas.tokens?.placeables || [];
    const exclusionManager = this.#exclusionManager?.();

    tokens.forEach((token) => {
      if (token.actor && (!exclusionManager || !exclusionManager.isExcludedToken(token))) {
        this.#changedTokens.add(token.document.id);
      }
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
    const stack = new Error().stack;
    const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
    this.#systemStateProvider?.debug?.('VSM:markAllTokensChangedThrottled', {
      caller,
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    });
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
    if (this.#processingBatch || this.#changedTokens.size === 0 || !this.#batchProcessor) {
      return;
    }

    // Critical check: Don't process batches when AVS is disabled
    if (
      this.#systemStateProvider &&
      typeof this.#systemStateProvider.isEnabled === 'function' &&
      !this.#systemStateProvider.isEnabled()
    ) {
      // AVS is disabled - clear any pending changes and don't process
      this.#changedTokens.clear();
      return;
    }

    // Critical check: Don't process batches when AVS is combat-only and not in combat
    if (this.#systemStateProvider && typeof this.#systemStateProvider.shouldProcessEvents === 'function') {
      if (!this.#systemStateProvider.shouldProcessEvents()) {
        this.#changedTokens.clear();
        return;
      }
    }

    this.#processingBatch = true;
    const tokenCount = this.#changedTokens.size;

    Hooks.callAll('pf2e-visioner.batchStart', { tokenCount });

    try {
      await this.#batchProcessor(this.#changedTokens);
      this.#changedTokens.clear();
    } catch (error) {
      console.error('PF2E Visioner | Batch processing failed:', error);
    } finally {
      this.#processingBatch = false;
      this.#systemStateProvider?.debug?.('VSM:processBatch:complete');
      Hooks.callAll('pf2e-visioner.batchComplete', { tokenCount });
    }
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
    const stack = new Error().stack;
    const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
    this.#systemStateProvider?.debug?.('VSM:recalculateForTokens', {
      tokenIds: Array.from(tokenIds),
      count: tokenIds?.length,
      caller,
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    });
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
