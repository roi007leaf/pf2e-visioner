/**
 * SensesCapabilitiesCache
 * Builds a per-batch cache of vision/sense capabilities for tokens to avoid
 * repeatedly traversing PF2e actor data in hot paths.
 *
 * Contract: capability shape mirrors VisionAnalyzer.getVisionCapabilities(token)
 * so it can be used as a drop-in replacement when available.
 */
export class SensesCapabilitiesCache {
  constructor(visionAnalyzer) {
    this.visionAnalyzer = visionAnalyzer;
    /** @type {Map<string, any>} */
    this.map = new Map(); // tokenId -> capabilities object
  }

  /**
   * Build the cache for a set of tokens once per batch
   * @param {Token[]} tokens
   */
  build(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) return;
    for (const t of tokens) {
      try {
        const id = t?.document?.id;
        if (!id || this.map.has(id)) continue;
        // Delegate capability computation to VisionAnalyzer to ensure parity
        const caps = this.visionAnalyzer?.getVisionCapabilities?.(t);
        if (caps) this.map.set(id, caps);
      } catch {
        /* ignore individual token failures */
      }
    }
  }

  /**
   * Retrieve precomputed capabilities for token id
   * @param {string} tokenId
   * @returns {any|null}
   */
  get(tokenId) {
    return this.map.get(tokenId) ?? null;
  }

  /**
   * Expose the raw map for consumers that prefer direct access
   */
  getMap() {
    return this.map;
  }
}
