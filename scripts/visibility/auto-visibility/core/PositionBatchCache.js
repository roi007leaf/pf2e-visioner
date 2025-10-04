/**
 * PositionBatchCache
 *
 * Maintains a per-batch cache of token positions and derived position keys.
 * - Build once at the start of a batch from a list of tokens
 * - Provide fast lookups by token object or id
 * - Compute stable string keys used to index batch/global caches
 */
export class PositionBatchCache {
    /**
     * @param {import('./PositionManager.js').PositionManager} positionManager
     */
    constructor(positionManager) {
        this._positionManager = positionManager;
        /** @type {Map<string, {x:number,y:number,elevation?:number}>} */
        this._posById = new Map();
        /** @type {Map<string, string>} */
        this._keyById = new Map();
        /** @type {Map<string, string>} */
        this._coarseKeyById = new Map();
    }

    /**
     * Build the cache from a list of tokens.
     * Best-effort: tokens that error during position fetch are skipped.
     * @param {Token[]} tokens
     */
    build(tokens) {
        this._posById.clear();
        this._keyById.clear();
        this._coarseKeyById.clear();
        for (const t of tokens || []) {
            const id = t?.document?.id;
            if (!id) continue;
            try {
                const p = this._positionManager.getTokenPosition(t);
                this._posById.set(id, p);
                this._keyById.set(id, this._makeKey(p));
                this._coarseKeyById.set(id, this._makeCoarseKey(p));
            } catch {
                // skip
            }
        }
    }

    /**
     * Get a cached position for a token; computes and inserts if missing.
     * @param {Token} token
     * @returns {{x:number,y:number,elevation?:number}|undefined}
     */
    getPosition(token) {
        try {
            const id = token?.document?.id;
            if (!id) return undefined;
            if (this._posById.has(id)) return this._posById.get(id);
            const p = this._positionManager.getTokenPosition(token);
            this._posById.set(id, p);
            this._keyById.set(id, this._makeKey(p));
            this._coarseKeyById.set(id, this._makeCoarseKey(p));
            return p;
        } catch {
            return undefined;
        }
    }

    /**
     * Get a cached position by id.
     * @param {string} id
     * @returns {{x:number,y:number,elevation?:number}|undefined}
     */
    getPositionById(id) {
        return this._posById.get(id);
    }

    /**
     * Get the position key for a token; computes and inserts if missing.
     * @param {Token} token
     * @returns {string|undefined}
     */
    getPositionKey(token) {
        try {
            const id = token?.document?.id;
            if (!id) return undefined;
            if (this._keyById.has(id)) return this._keyById.get(id);
            const p = this.getPosition(token);
            if (!p) return undefined;
            const k = this._makeKey(p);
            this._keyById.set(id, k);
            return k;
        } catch {
            return undefined;
        }
    }

    /**
     * Get the position key by id, computing from a provided fallback position if needed.
     * @param {string} id
     * @param {{x:number,y:number,elevation?:number}|undefined} fallback
     * @returns {string|undefined}
     */
    getPositionKeyById(id, fallback) {
        if (this._keyById.has(id)) return this._keyById.get(id);
        const p = this._posById.get(id) || fallback;
        if (!p) return undefined;
        const k = this._makeKey(p);
        this._keyById.set(id, k);
        return k;
    }

    /**
     * Get the coarse (grid-cell) position key by id, computing from a provided fallback position if needed.
     * @param {string} id
     * @param {{x:number,y:number,elevation?:number}|undefined} fallback
     * @returns {string|undefined}
     */
    getCoarseKeyById(id, fallback) {
        if (this._coarseKeyById.has(id)) return this._coarseKeyById.get(id);
        const p = this._posById.get(id) || fallback;
        if (!p) return undefined;
        const k = this._makeCoarseKey(p);
        this._coarseKeyById.set(id, k);
        return k;
    }

    /**
     * Get the coarse (grid-cell) position key for a token; computes and inserts if missing.
     * @param {Token} token
     * @returns {string|undefined}
     */
    getCoarseKey(token) {
        try {
            const id = token?.document?.id;
            if (!id) return undefined;
            if (this._coarseKeyById.has(id)) return this._coarseKeyById.get(id);
            const p = this.getPosition(token);
            if (!p) return undefined;
            const k = this._makeCoarseKey(p);
            this._coarseKeyById.set(id, k);
            return k;
        } catch {
            return undefined;
        }
    }

    /**
     * Helper to build LOS-pair key with id ordering to ensure symmetry
     * @param {string} aId
     * @param {string} aKey
     * @param {string} bId
     * @param {string} bKey
     * @returns {string}
     */
    makePairKey(aId, aKey, bId, bKey) {
        return aId < bId ? `${aId}|${aKey}::${bId}|${bKey}` : `${bId}|${bKey}::${aId}|${aKey}`;
    }

    /**
     * Helper to build directional visibility cache key (a -> b)
     * @param {string} aId
     * @param {string} aKey
     * @param {string} bId
     * @param {string} bKey
     * @returns {string}
     */
    makeDirectionalKey(aId, aKey, bId, bKey) {
        return `${aId}|${aKey}>>${bId}|${bKey}`;
    }

    /**
     * Helper to build LOS pair key (uses coarse keys under the hood)
     * @param {string} aId
     * @param {string} aCoarseKey
     * @param {string} bId
     * @param {string} bCoarseKey
     * @returns {string}
     */
    makeLosPairKey(aId, aCoarseKey, bId, bCoarseKey) {
        // Use symmetric ordering same as makePairKey
        return aId < bId ? `${aId}|${aCoarseKey}::${bId}|${bCoarseKey}` : `${bId}|${bCoarseKey}::${aId}|${aCoarseKey}`;
    }

    /**
     * Normalize a position into a compact key.
     * @param {{x:number,y:number,elevation?:number}} p
     * @returns {string}
     * @private
     */
    _makeKey(p) {
        // Quantize by grid step to stabilize keys across animation frames/micro-movements
        // Use half-cell granularity to balance stability and correctness
        const gs = Math.max(1, Math.floor((canvas?.grid?.size || 1) / 2));
        const quant = (v) => Math.round((v ?? 0) / gs) * gs;
        const x = quant(p?.x);
        const y = quant(p?.y);
        const z = Number(p?.elevation ?? 0) || 0;
        return `${x}:${y}:${z}`;
    }

    /**
     * Build a coarse key based on grid-cell indices. This is ideal for LOS caching, which tolerates small intra-cell moves.
     * @param {{x:number,y:number,elevation?:number}} p
     * @returns {string}
     * @private
     */
    _makeCoarseKey(p) {
        const gs = Math.max(1, canvas?.grid?.size || 1);
        const cx = Math.floor((p?.x ?? 0) / gs);
        const cy = Math.floor((p?.y ?? 0) / gs);
        // Ignore elevation for LOS coarse key to maximize reuse; LOS rarely depends on z in 2D scenes
        return `${cx}:${cy}`;
    }
}
