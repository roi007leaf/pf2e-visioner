export class LastValidationRequest {
    constructor() {
        this._map = new Map(); // id -> { pos:string, time:number }
    }

    /**
     * Returns true if this request should be queued (not a duplicate within debounce window)
     * and records the request; returns false if it should be skipped.
     */
    shouldQueue(id, posKey, debounceMs, now = Date.now()) {
        const last = this._map.get(id);
        if (last && last.pos === posKey && now - last.time < debounceMs) return false;
        this._map.set(id, { pos: posKey, time: now });
        return true;
    }

    clear(id) { this._map.delete(id); }
    reset() { this._map.clear(); }
    get size() { return this._map.size; }
}
