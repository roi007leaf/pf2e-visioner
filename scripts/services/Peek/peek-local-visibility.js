export class PeekLocalVisibility {
  constructor() {
    this._map = new Map();
  }
  set(observerId, targetId, state) {
    let inner = this._map.get(observerId);
    if (!inner) {
      inner = new Map();
      this._map.set(observerId, inner);
    }
    inner.set(targetId, state);
  }
  get(observerId, targetId) {
    return this._map.get(observerId)?.get(targetId) ?? null;
  }
  hasObserver(observerId) {
    return this._map.has(observerId);
  }
  clearObserver(observerId) {
    this._map.delete(observerId);
  }
  clearAll() {
    this._map.clear();
  }
}
export const peekLocalVisibility = new PeekLocalVisibility();
