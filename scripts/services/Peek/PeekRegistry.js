export class PeekRegistry {
  constructor() {
    this._peeks = new Map();
  }

  set(tokenId, data, now) {
    this._peeks.set(tokenId, {
      origin: data.origin,
      direction: data.direction,
      fov: data.fov,
      range: typeof data.range === 'number' ? data.range : 0,
      ignoredWallIds: Array.isArray(data.ignoredWallIds) ? data.ignoredWallIds : [],
      points: Array.isArray(data.points) ? data.points : null,
      userColor: data.userColor ?? null,
      userName: data.userName ?? null,
      userId: data.userId ?? null,
      ts: now,
    });
  }

  get(tokenId) {
    return this._peeks.get(tokenId) ?? null;
  }

  has(tokenId) {
    return this._peeks.has(tokenId);
  }

  clear(tokenId) {
    this._peeks.delete(tokenId);
  }

  clearAll() {
    this._peeks.clear();
  }

  ids() {
    return Array.from(this._peeks.keys());
  }

  pruneStale(ttlMs, now) {
    for (const [id, entry] of this._peeks) {
      if (now - entry.ts >= ttlMs) this._peeks.delete(id);
    }
  }
}

export const peekRegistry = new PeekRegistry();
