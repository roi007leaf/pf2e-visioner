/**
 * Simple TTL cache with optional prune gating and metadata-aware get.
 */
export class TTLCache {
    /**
     * @param {number} defaultTtlMs - default TTL for entries when not specified on set()
     */
    constructor(defaultTtlMs = 1000) {
        this._map = new Map(); // key -> { value:any, expire:number }
        this._defaultTtlMs = defaultTtlMs;
        this._lastPruneAt = 0;
    }

    /**
     * Get entry with hit/miss/expired metadata
     * @param {string} key
     * @param {number} [now]
     * @returns {{state:'hit'|'miss'|'expired', value:any}}
     */
    getWithMeta(key, now = Date.now()) {
        const entry = this._map.get(key);
        if (!entry) return { state: 'miss', value: undefined };
        if (entry.expire > now) return { state: 'hit', value: entry.value };
        this._map.delete(key);
        return { state: 'expired', value: undefined };
    }

    /**
     * Get value or undefined if missing/expired.
     */
    get(key, now = Date.now()) {
        const m = this.getWithMeta(key, now);
        return m.state === 'hit' ? m.value : undefined;
    }

    /**
     * Set value with TTL (defaults to instance default TTL)
     */
    set(key, value, ttlMs = this._defaultTtlMs, now = Date.now()) {
        const expire = now + (typeof ttlMs === 'number' ? ttlMs : this._defaultTtlMs);
        this._map.set(key, { value, expire });
    }

    /**
     * Prune expired entries and update last prune time. Returns number pruned.
     */
    prune(now = Date.now()) {
        let pruned = 0;
        for (const [k, v] of this._map) {
            if (!v || v.expire <= now) {
                this._map.delete(k);
                pruned++;
            }
        }
        this._lastPruneAt = now;
        return pruned;
    }

    /**
     * Prune only if at least minIntervalMs elapsed since last prune.
     */
    pruneIfDue(minIntervalMs = 1000, now = Date.now()) {
        if (now - this._lastPruneAt < minIntervalMs) return 0;
        return this.prune(now);
    }

    /** Current entries count */
    get size() {
        return this._map.size;
    }
}
