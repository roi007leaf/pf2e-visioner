const ORIGINAL_GEOMETRY_FUNCTION = Symbol('pf2eVisionerOriginalGeometryFunction');

export class PeekVisionSourceController {
  constructor({ refreshPerception } = {}) {
    this._refresh = refreshPerception || defaultRefresh;
    this._overrides = new Map();
    this._edgeSightBackup = new Map();
  }

  apply(token, peek) {
    const id = token.document.id;
    const ignoredWallIds = peek.ignoredWallIds ?? [];
    this._overrides.set(id, {
      origin: peek.origin,
      direction: peek.direction,
      fov: peek.fov,
      range: peek.range,
      ignoredWallIds,
    });
    this._excludeEdges(ignoredWallIds);
    this._reinitialize(token);
  }

  clear(token) {
    const id = token.document.id;
    if (!this._overrides.has(id)) return;
    this._overrides.delete(id);
    if (this._overrides.size === 0) this._restoreEdges();
    this._reinitialize(token);
  }

  getOverride(tokenId) {
    return this._overrides.get(tokenId) ?? null;
  }

  _edgeFor(wallId) {
    return globalThis.canvas?.walls?.get?.(wallId)?.edge ?? null;
  }

  _excludeEdges(wallIds) {
    for (const wallId of wallIds) {
      if (this._edgeSightBackup.has(wallId)) continue;
      const edge = this._edgeFor(wallId);
      if (!edge) continue;
      this._edgeSightBackup.set(wallId, edge.sight);
      try {
        edge.sight = 0;
      } catch (_) {}
    }
  }

  _restoreEdges() {
    for (const [wallId, sight] of this._edgeSightBackup) {
      const edge = this._edgeFor(wallId);
      if (edge) {
        try {
          edge.sight = sight;
        } catch (_) {}
      }
    }
    this._edgeSightBackup.clear();
  }

  _reinitialize(token) {
    try {
      token.initializeVisionSource?.();
    } catch (_) {}
    this._clampPeekLosToFov(token);
    this._refresh();
  }

  _clampPeekLosToFov(token) {
    const tokenId = token?.document?.id;
    if (!this._overrides.has(tokenId)) return;
    const los = token?.vision?.los;
    const fov = token?.vision?.fov;
    const fovPoints = fov?.points;
    if (!los || !Array.isArray(fovPoints) || fovPoints.length < 6) return;
    const originalLosGeometry = this._captureLosGeometry(los);
    try {
      los.points = [...fovPoints];
    } catch (_) {}
    this._delegateLosGeometryToFov(los, fov, originalLosGeometry);
  }

  _captureLosGeometry(los) {
    const geometry = {};
    for (const method of [
      'contains',
      'containsPoint',
      'intersectCircle',
      'intersectPolygon',
      'intersectRay',
      'intersectSegment',
      'lineSegmentIntersects',
      'testPoint',
      'getBounds',
      'getBoundsFast',
    ]) {
      const fn = this._unwrapGeometryFunction(los?.[method]);
      if (typeof fn === 'function') {
        geometry[method] = this._markGeometryFunction((...args) => fn.apply(los, args), fn);
      }
    }

    for (const prop of ['bounds']) {
      if (prop in los) geometry[prop] = los[prop];
    }

    return geometry;
  }

  _delegateLosGeometryToFov(los, fov, originalLosGeometry = {}) {
    for (const method of [
      'contains',
      'containsPoint',
      'intersectCircle',
      'intersectPolygon',
      'intersectRay',
      'intersectSegment',
      'lineSegmentIntersects',
      'testPoint',
    ]) {
      const fovMethod = this._unwrapGeometryFunction(fov?.[method]);
      if (typeof fovMethod !== 'function') continue;
      const originalMethod = originalLosGeometry?.[method];
      const wrappedMethod = this._markGeometryFunction(
        (...args) =>
          this._testPeekFovWithinOriginalLos({
            fovResult: fovMethod.apply(fov, args),
            originalResult:
              typeof originalMethod === 'function' ? originalMethod(...args) : true,
          }),
        this._unwrapGeometryFunction(originalMethod) ?? fovMethod,
      );
      this._assignGeometryProperty(los, method, wrappedMethod);
    }

    for (const method of ['getBounds', 'getBoundsFast']) {
      const fovMethod = this._unwrapGeometryFunction(fov?.[method]);
      if (typeof fovMethod !== 'function') continue;
      const originalMethod = originalLosGeometry?.[method];
      const wrappedMethod = this._markGeometryFunction(
        (...args) => fovMethod.apply(fov, args),
        this._unwrapGeometryFunction(originalMethod) ?? fovMethod,
      );
      this._assignGeometryProperty(los, method, wrappedMethod);
    }

    for (const prop of ['bounds']) {
      if (!(prop in fov)) continue;
      this._assignGeometryProperty(los, prop, fov[prop]);
    }
  }

  _testPeekFovWithinOriginalLos({ fovResult, originalResult }) {
    if (originalResult === false) return false;
    if (fovResult === false) return false;
    if (this._geometryResultIsEmpty(originalResult)) return originalResult;
    if (typeof fovResult === 'boolean') {
      return !!fovResult && originalResult !== false;
    }
    if (typeof originalResult === 'boolean') return originalResult ? fovResult : false;
    return fovResult;
  }

  _geometryResultIsEmpty(result) {
    const points = result?.points;
    return Array.isArray(points) && points.length === 0;
  }

  _unwrapGeometryFunction(fn) {
    if (typeof fn !== 'function') return fn;
    const seen = new Set();
    let current = fn;
    while (typeof current?.[ORIGINAL_GEOMETRY_FUNCTION] === 'function') {
      if (seen.has(current)) break;
      seen.add(current);
      current = current[ORIGINAL_GEOMETRY_FUNCTION];
    }
    return current;
  }

  _markGeometryFunction(fn, original) {
    if (typeof fn !== 'function' || typeof original !== 'function') return fn;
    try {
      Object.defineProperty(fn, ORIGINAL_GEOMETRY_FUNCTION, {
        configurable: true,
        value: this._unwrapGeometryFunction(original),
      });
    } catch (_) {}
    return fn;
  }

  _assignGeometryProperty(target, key, value) {
    try {
      target[key] = value;
      if (target[key] === value) return;
    } catch (_) {}
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value,
      });
    } catch (_) {}
  }
}

function defaultRefresh() {
  try {
    globalThis.canvas?.perception?.update?.({ initializeVision: true, refreshVision: true });
  } catch (_) {}
}
