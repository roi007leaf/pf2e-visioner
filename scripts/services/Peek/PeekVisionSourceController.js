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

  constrainToken(token) {
    this._clampPeekLosToFov(token);
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
    try {
      token.initializeLightSource?.();
    } catch (_) {}
    this._clampPeekLosToFov(token);
    this._refresh();
  }

  _clampPeekLosToFov(token) {
    const tokenId = token?.document?.id;
    const peek = this._overrides.get(tokenId);
    if (!peek) return;
    const los = token?.vision?.los;
    const generatedFov = this._createPeekFovPolygon(los, peek);
    const fov = generatedFov ?? token?.vision?.fov;
    const fovPoints = fov?.points;
    if (!los || !Array.isArray(fovPoints) || fovPoints.length < 6) return;
    const originalLosGeometry = this._captureLosGeometry(los);
    if (generatedFov && token?.vision) {
      this._assignGeometryProperty(token.vision, 'fov', generatedFov);
      this._assignGeometryProperty(token.vision, 'shape', fov);
      this._assignGeometryProperty(token.vision, 'light', generatedFov);
    }
    try {
      los.points = [...fovPoints];
    } catch (_) {}
    this._delegateLosGeometryToFov(los, fov, originalLosGeometry);
    if (generatedFov) {
      this._refreshRenderedGeometry(token.vision);
      this._clampTokenLightToFov(token, generatedFov);
    }
  }

  _clampTokenLightToFov(token, fov) {
    const light = token?.light;
    if (!light || !fov) return;
    this._assignGeometryProperty(light, 'shape', fov);
    this._assignGeometryProperty(light, '_visualShape', fov);
    this._refreshRenderedGeometry(light);
  }

  _createPeekFovPolygon(los, peek) {
    if (typeof peek?.fov !== 'number') return null;
    const constraint = this._createPeekConeConstraint(peek, this._peekConstraintRadius(los, peek));
    if (!constraint) return null;
    if (typeof los?.applyConstraint === 'function') {
      try {
        const constrained = los.applyConstraint(constraint);
        if (Array.isArray(constrained?.points) && constrained.points.length >= 6) {
          return constrained;
        }
      } catch (_) {}
    }
    return constraint;
  }

  _peekConstraintRadius(los, peek) {
    for (const value of [peek?.range, los?.config?.radius, globalThis.canvas?.dimensions?.maxR]) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    }
    return 0;
  }

  _createPeekConeConstraint(peek, radius) {
    const Polygon = globalThis.PIXI?.Polygon;
    if (typeof Polygon !== 'function') return null;
    const origin = peek?.origin;
    const direction = peek?.direction;
    const fov = peek?.fov;
    if (!origin || typeof direction !== 'number' || typeof fov !== 'number') return null;
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(direction) || !Number.isFinite(fov)) {
      return null;
    }
    const clampedFov = Math.max(0, Math.min(360, fov));
    if (clampedFov <= 0 || clampedFov >= 360) return null;
    const half = (clampedFov * Math.PI) / 360;
    const start = direction - half;
    const steps = Math.max(2, Math.ceil(clampedFov / 5));
    const points = [origin.x, origin.y];
    for (let i = 0; i <= steps; i += 1) {
      const angle = start + ((2 * half * i) / steps);
      points.push(origin.x + Math.cos(angle) * radius, origin.y + Math.sin(angle) * radius);
    }
    return new Polygon(points);
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

  _refreshRenderedGeometry(source) {
    if (!source || typeof source._updateGeometry !== 'function') return;
    try {
      source._updateGeometry();
    } catch (_) {}
    for (const layer of Object.values(source.layers ?? {})) {
      if (layer) layer.reset = true;
    }
  }
}

function defaultRefresh() {
  try {
    globalThis.canvas?.perception?.update?.({ refreshVision: true, refreshLighting: true });
  } catch (_) {}
}
