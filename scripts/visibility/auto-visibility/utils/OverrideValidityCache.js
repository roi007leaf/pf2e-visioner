import { TTLCache } from './TTLCache.js';

export class OverrideValidityCache {
    constructor(ttlMs = 750) {
        this._ttl = new TTLCache(ttlMs);
    }
    makeKey(observerId, targetId) { return `${observerId}-${targetId}`; }
    get(key) { return this._ttl.get(key); }
    set(key, result, obsPos, tgtPos) {
        this._ttl.set(key, { result, obsPos, tgtPos });
    }
    pruneIfDue(minIntervalMs = 5000) { return this._ttl.pruneIfDue(minIntervalMs); }
    get size() { return this._ttl.size; }
}
