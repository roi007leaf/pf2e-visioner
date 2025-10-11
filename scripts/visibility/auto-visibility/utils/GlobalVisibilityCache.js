import { TTLCache } from './TTLCache.js';

export class GlobalVisibilityCache {
    constructor(ttlMs = 1000) {
        this._ttl = new TTLCache(ttlMs);
    }
    getWithMeta(key) {
        return this._ttl.getWithMeta(key);
    }
    get(key) {
        return this._ttl.get(key);
    }
    set(key, value) {
        this._ttl.set(key, value);
    }
    clear() {
        const sizeBefore = this._ttl.size || 0;
        this._ttl._map.clear();
    }
    pruneIfDue(minIntervalMs = 1000) {
        return this._ttl.pruneIfDue(minIntervalMs);
    }
    get size() { return this._ttl.size; }
}
