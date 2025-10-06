/**
 * VisibilityMapBatchCache
 * Per-batch cache for each token's original visibility map.
 * This avoids repeated calls to an injected getVisibilityMap function during a batch.
 */
export class VisibilityMapBatchCache {
    /**
     * @param {{ getVisibilityMap: (token: Token) => Record<string, string> }} visibilityMapService
     */
    constructor(visibilityMapService) {
        /** @type {{ getVisibilityMap: (token: Token) => Record<string, string> } | null} */
        this._visibilityMapService = visibilityMapService || null;
        /** @type {Map<string, Record<string, string>>} */
        this._mapById = new Map();
    }

    /**
     * Build the cache for provided tokens. Safe against missing function or errors.
     * @param {Token[]} tokens
     */
    build(tokens) {
        this._mapById.clear();
        for (const t of tokens || []) {
            const id = t?.document?.id;
            if (!id) continue;
            let visMap = {};
            if (this._visibilityMapService?.getVisibilityMap) {
                try {
                    visMap = this._visibilityMapService.getVisibilityMap(t) || {};
                } catch {
                    visMap = {};
                }
            }
            this._mapById.set(id, visMap);
        }
    }

    /**
     * Get the cached visibility map for a token.
     * @param {Token} token
     * @returns {Record<string, string>}
     */
    getMap(token) {
        const id = token?.document?.id;
        return (id && this._mapById.get(id)) || {};
    }

    /**
     * Get the cached visibility map by token id.
     * @param {string} id
     * @returns {Record<string, string>}
     */
    getMapById(id) {
        return this._mapById.get(id) || {};
    }
}
