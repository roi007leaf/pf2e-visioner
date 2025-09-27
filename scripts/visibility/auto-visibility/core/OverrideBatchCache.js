/**
 * OverrideBatchCache
 * Per-batch memoization of visibility override states for directed pairs (aId -> bId).
 * It consults the provided getActiveOverride function and falls back to legacy flags on the target token.
 */
export class OverrideBatchCache {
    /**
     * @param {{ getActiveOverrideForTokens: (observer: Token, target: Token) => Promise<{ state?: string } | null> | ({ state?: string } | null) }} overrideService
     */
    constructor(overrideService) {
        /** @type {{ getActiveOverrideForTokens: (observer: Token, target: Token) => Promise<{ state?: string } | null> | ({ state?: string } | null) }} */
        this._overrideService = overrideService || null;
        /** @type {Map<string, string | null>} */
        this._memo = new Map();
    }

    /**
     * Build is a no-op for now; retained for symmetry with other caches.
     * @param {Token[]} _tokens
     */
    build(_tokens) {
        this._memo.clear();
    }

    /**
     * Get the override state for a directed pair, cached per batch.
     * @param {string} aId Observer token id
     * @param {string} bId Target token id
     * @param {Token} tokenA Observer token
     * @param {Token} tokenB Target token
     * @returns {string | null}
     */
    getOverrideState(aId, bId, tokenA, tokenB) {
        const key = `${aId}->${bId}`;
        if (this._memo.has(key)) return this._memo.get(key);
        let state = null;
        try {
            const res = this._overrideService?.getActiveOverrideForTokens?.(tokenA, tokenB);
            const ov = (typeof res?.then === 'function') ? undefined : res; // avoid awaiting in sync path
            if (ov && ov.state) state = ov.state;
            if (state == null) {
                // Legacy flag fallback on tokenB
                const overrideFlagKey = `avs-override-from-${aId}`;
                const flag = tokenB?.document?.getFlag?.('pf2e-visioner', overrideFlagKey);
                if (flag?.state) state = flag.state;
            }
        } catch {
            // noop
        }

        this._memo.set(key, state);
        return state;
    }
}
