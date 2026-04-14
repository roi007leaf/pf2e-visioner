/**
 * Levels Module Integration Service
 * Provides integration with both Foundry V14 core Levels/Surfaces and the legacy Levels module
 * for 3D elevation-aware visibility and cover.
 * Singleton pattern ensures consistent integration across the application
 */
class LevelsIntegration {
  constructor() {
    if (LevelsIntegration._instance) {
      return LevelsIntegration._instance;
    }
    LevelsIntegration._instance = this;

    this._isCoreLevelsAvailable = false;
    this._isLevelsActive = false;
    this._isWallHeightActive = false;
    this._initialized = false;
  }

  static getInstance() {
    if (!LevelsIntegration._instance) {
      LevelsIntegration._instance = new LevelsIntegration();
    }
    return LevelsIntegration._instance;
  }

  initialize() {
    if (this._initialized) return;

    this.refresh();
    this._initialized = true;
  }

  refresh() {
    this._isCoreLevelsAvailable = this._detectCoreLevels();
    this._isLevelsActive = this._detectLegacyLevels();
    this._isWallHeightActive = game?.modules?.get?.('wall-height')?.active ?? false;
    return this;
  }

  _detectCoreLevels() {
    const scene = canvas?.scene;
    return !!(
      scene?.levels &&
      typeof scene.getSurfaces === 'function' &&
      typeof scene.testSurfaceCollision === 'function'
    );
  }

  _detectLegacyLevels() {
    return game?.modules?.get?.('levels')?.active ?? false;
  }

  get isCoreActive() {
    this.refresh();
    return this._isCoreLevelsAvailable;
  }

  get isLegacyActive() {
    this.refresh();
    return !!this.api;
  }

  get isActive() {
    this.refresh();
    return this.isCoreActive || this.isLegacyActive;
  }

  get hasWallHeight() {
    this.refresh();
    return this._isWallHeightActive;
  }

  get mode() {
    if (this.isCoreActive) return 'core';
    if (this.isLegacyActive) return 'legacy';
    return 'none';
  }

  get api() {
    this._isLevelsActive = this._detectLegacyLevels();
    if (!this._isLevelsActive || !CONFIG?.Levels?.API) {
      return null;
    }
    return CONFIG.Levels.API;
  }

  getTokenPosition(token, { origin = 'movement', data = {} } = {}) {
    const tokenDoc = this._getTokenDocument(token);
    const methodName = this._getOriginMethodName(origin);
    const originPoint =
      tokenDoc && typeof tokenDoc[methodName] === 'function' ? tokenDoc[methodName](data) : null;

    if (originPoint) {
      return this._normalizePoint(originPoint);
    }

    return this._getFallbackTokenPosition(token, tokenDoc, data);
  }

  getTokenElevation(token) {
    return this.getTokenPosition(token, { origin: 'movement' }).elevation;
  }

  getTokenLosHeight(token) {
    if (!token) return 0;

    if (this.isCoreActive) {
      return this.getTokenPosition(token, { origin: 'vision' }).elevation;
    }

    if (this.isLegacyActive && typeof token.losHeight === 'number') {
      return token.losHeight;
    }

    return this.getTokenElevation(token);
  }

  getTokenLevelId(token) {
    const tokenDoc = this._getTokenDocument(token);
    return tokenDoc?.level ?? tokenDoc?._source?.level ?? null;
  }

  getTokenLevel(token) {
    const tokenDoc = this._getTokenDocument(token);
    const levelId = this.getTokenLevelId(token);
    if (!levelId) return null;

    const scene = tokenDoc?.parent ?? canvas?.scene;
    return scene?.levels?.get?.(levelId) ?? null;
  }

  resolveLevel(level, scene = canvas?.scene) {
    if (!level) return null;
    if (typeof level === 'string') {
      return scene?.levels?.get?.(level) ?? null;
    }
    return level;
  }

  getTokenVisionLevel(token) {
    const tokenDoc = this._getTokenDocument(token);
    const scene = tokenDoc?.parent ?? canvas?.scene;
    return this.getTokenLevel(token) ?? this.resolveLevel(this.getCollisionLevel({ originToken: token }), scene);
  }

  isTokenIncludedInLevel(token, level) {
    if (!this.isCoreActive) {
      return true;
    }

    const tokenDoc = this._getTokenDocument(token);
    if (!tokenDoc) {
      return false;
    }

    const scene = tokenDoc?.parent ?? canvas?.scene;
    const resolvedLevel = this.resolveLevel(level, scene);
    if (!resolvedLevel) {
      return true;
    }

    if (typeof tokenDoc.includedInLevel === 'function') {
      try {
        return !!tokenDoc.includedInLevel(resolvedLevel);
      } catch (error) {
        console.warn('[PF2E Visioner] Error checking token level inclusion:', error);
      }
    }

    const tokenLevelId = this.getTokenLevelId(token);
    if (!tokenLevelId) {
      return true;
    }

    if (resolvedLevel.id === tokenLevelId) {
      return true;
    }

    return !!resolvedLevel?.visibility?.levels?.has?.(tokenLevelId);
  }

  getCollisionLevel({ originToken = null, targetToken = null, level = null } = {}) {
    if (level) return level;

    const targetLevel = this.getTokenLevel(targetToken);
    if (targetLevel) return targetLevel;

    const targetLevelId = this.getTokenLevelId(targetToken);
    if (targetLevelId) return targetLevelId;

    const originLevel = this.getTokenLevel(originToken);
    if (originLevel) return originLevel;

    const originLevelId = this.getTokenLevelId(originToken);
    if (originLevelId) return originLevelId;

    return (
      canvas?.level?.id ??
      canvas?.scene?._view ??
      canvas?.scene?.initialLevel?.id ??
      canvas?.scene?.levels?.sorted?.[0]?.id ??
      null
    );
  }

  getVerticalDistance(token1, token2) {
    if (!this.isActive) return 0;

    const elevation1 = this.getTokenLosHeight(token1);
    const elevation2 = this.getTokenLosHeight(token2);
    const verticalDist = Math.abs(elevation2 - elevation1);

    return verticalDist;
  }

  getTotalDistance(token1, token2) {
    if (!token1 || !token2) return Infinity;

    const p1 = this.getTokenPosition(token1, { origin: 'movement' });
    const p2 = this.getTokenPosition(token2, { origin: 'movement' });
    const horizontalDistance = this._getHorizontalDistanceFromPoints(p1, p2);

    if (!this.isActive) {
      return horizontalDistance;
    }

    const verticalDistanceFeet = this.getVerticalDistance(token1, token2);
    const feetPerGrid = canvas.scene?.grid?.distance || 5;
    const verticalDistance = verticalDistanceFeet / feetPerGrid;
    const totalDistance = Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2);

    return totalDistance;
  }

  _getHorizontalDistance(token1, token2) {
    const p1 = this.getTokenPosition(token1, { origin: 'movement' });
    const p2 = this.getTokenPosition(token2, { origin: 'movement' });
    return this._getHorizontalDistanceFromPoints(p1, p2);
  }

  _getHorizontalDistanceFromPoints(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const pixelDistance = Math.sqrt(dx ** 2 + dy ** 2);
    const gridSize = canvas?.dimensions?.size || canvas?.grid?.size || 100;
    const gridDistanceValue = canvas?.dimensions?.distance || canvas?.scene?.grid?.distance || 5;
    const pixelsPerUnit = gridSize / gridDistanceValue;
    const gridDistance = pixelDistance / pixelsPerUnit;

    return gridDistance;
  }

  test3DCollision(token1, token2, type = 'sight') {
    try {
      if (this.isCoreActive) {
        const originType = type === 'sight' ? 'vision' : type === 'sound' ? 'sound' : 'movement';
        const p0 = this.getTokenPosition(token1, { origin: originType });
        const p1 = this.getTokenPosition(token2, { origin: originType });
        const originLevel = this.getTokenVisionLevel(token1);
        const targetLevel = this.getTokenVisionLevel(token2);
        return this._testCoreCombinedCollision(p0, p1, type, {
          originToken: token1,
          targetToken: token2,
          originLevel,
          targetLevel,
        });
      }

      if (!this.isLegacyActive) {
        return false;
      }

      const collision = this.api.checkCollision(token1, token2, type);
      return !!collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error testing 3D collision:', error);
      return false;
    }
  }

  test3DPointCollision(p0, p1, type = 'sight', options = {}) {
    if (!p0 || !p1) {
      return false;
    }

    try {
      const origin = this._normalizePoint(p0);
      const destination = this._normalizePoint(p1);

      if (this.isCoreActive) {
        const scene =
          this._getTokenDocument(options.originToken)?.parent ??
          this._getTokenDocument(options.targetToken)?.parent ??
          canvas?.scene;
        const originLevel =
          this.resolveLevel(options.originLevel, scene) ??
          this.getTokenVisionLevel(options.originToken) ??
          this.resolveLevel(options.level, scene);
        const targetLevel =
          this.resolveLevel(options.targetLevel, scene) ??
          this.getTokenVisionLevel(options.targetToken) ??
          this.resolveLevel(options.level, scene) ??
          originLevel;

        if (!originLevel && !targetLevel) {
          return false;
        }

        if (
          type === 'sight' &&
          options.originToken &&
          options.targetToken &&
          originLevel &&
          !this.isTokenIncludedInLevel(options.targetToken, originLevel)
        ) {
          return true;
        }

        const resolvedOriginLevel = originLevel ?? targetLevel;
        const resolvedTargetLevel = targetLevel ?? originLevel;

        if (
          !resolvedOriginLevel ||
          !resolvedTargetLevel ||
          resolvedOriginLevel === resolvedTargetLevel ||
          resolvedOriginLevel.id === resolvedTargetLevel.id
        ) {
          const result = this._testCoreSurfaceCollision(origin, destination, type, {
            ...options,
            level: resolvedTargetLevel ?? resolvedOriginLevel,
          });
          return result;
        }

        const t = this._getIntermediateTValue(
          origin,
          destination,
          resolvedOriginLevel,
          resolvedTargetLevel,
        );

        const originCollision = this._testCoreSurfaceCollision(origin, destination, type, {
          ...options,
          crossLevel: true,
          level: resolvedOriginLevel,
          tMin: 0,
          tMax: t,
        });
        if (originCollision) {
          return true;
        }

        const result = this._testCoreSurfaceCollision(origin, destination, type, {
          ...options,
          crossLevel: true,
          level: resolvedTargetLevel,
          tMin: t,
          tMax: 1,
        });
        return result;
      }

      if (!this.isLegacyActive) {
        return false;
      }

      const collision = this.api.testCollision(
        { x: origin.x, y: origin.y, z: origin.elevation },
        { x: destination.x, y: destination.y, z: destination.elevation },
        type,
      );
      return !!collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error testing 3D point collision:', error);
      return false;
    }
  }

  isTokenInRange(token, placeable, useElevation = true) {
    if (!this.isLegacyActive || !this.api) {
      return true;
    }

    try {
      return this.api.isTokenInRange(token, placeable, useElevation);
    } catch (error) {
      console.warn('[PF2E Visioner] Error checking token range:', error);
      return true;
    }
  }

  getElevationDifference(token1, token2) {
    const elevation1 = this.getTokenLosHeight(token1);
    const elevation2 = this.getTokenLosHeight(token2);

    return elevation2 - elevation1;
  }

  hasElevationAdvantage(observer, target, threshold = 5) {
    if (!this.isActive) return false;

    const diff = this.getElevationDifference(target, observer);
    return diff >= threshold;
  }

  hasElevationDisadvantage(observer, target, threshold = 5) {
    if (!this.isActive) return false;

    const diff = this.getElevationDifference(target, observer);
    return diff <= -threshold;
  }

  get3DPoint(token) {
    if (!token) return null;

    const center = this.getTokenPosition(token, { origin: 'vision' });
    const z = center.elevation;

    return { x: center.x, y: center.y, z, elevation: z };
  }

  hasFloorCeilingBetween(observer, target) {
    if (!this.isActive) {
      return false;
    }

    try {
      const p0 = this.get3DPoint(observer);
      const p1 = this.get3DPoint(target);
      if (!p0 || !p1) {
        return false;
      }

      const collision = this.test3DPointCollision(p0, p1, 'sight', {
        originToken: observer,
        targetToken: target,
      });

      return collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error checking floor/ceiling:', error);
      return false;
    }
  }

  adjustCoverForElevation(observer, target, baseCoverLevel) {
    if (!this.isActive) return baseCoverLevel;

    try {
      const elevationDiff = Math.abs(this.getElevationDifference(observer, target));

      if (elevationDiff < 5) {
        return baseCoverLevel;
      }

      if (this.hasFloorCeilingBetween(observer, target)) {
        return 'greater';
      }

      if (this.hasElevationAdvantage(observer, target, 10)) {
        const coverLevels = ['none', 'lesser', 'standard', 'greater'];
        const currentIndex = coverLevels.indexOf(baseCoverLevel);
        if (currentIndex > 0) {
          return coverLevels[currentIndex - 1];
        }
      }

      return baseCoverLevel;
    } catch (error) {
      console.warn('[PF2E Visioner] Error adjusting cover for elevation:', error);
      return baseCoverLevel;
    }
  }

  getDebugInfo(token1, token2) {
    if (!token1 || !token2) return null;

    const info = {
      isActive: this.isActive,
      hasWallHeight: this.hasWallHeight,
      token1: {
        elevation: this.getTokenElevation(token1),
        losHeight: this.getTokenLosHeight(token1),
      },
      token2: {
        elevation: this.getTokenElevation(token2),
        losHeight: this.getTokenLosHeight(token2),
      },
      distances: {
        horizontal: this._getHorizontalDistance(token1, token2),
        vertical: this.getVerticalDistance(token1, token2),
        total: this.getTotalDistance(token1, token2),
      },
      elevationDiff: this.getElevationDifference(token1, token2),
      mode: this.mode,
    };

    if (this.isActive) {
      info.collision = {
        sight: this.test3DCollision(token1, token2, 'sight'),
        sound: this.test3DCollision(token1, token2, 'sound'),
      };
      if (this.isCoreActive) {
        info.levels = {
          observer: this.getTokenLevelId(token1),
          target: this.getTokenLevelId(token2),
          targetIncludedInObserverLevel: this.isTokenIncludedInLevel(
            token2,
            this.getTokenVisionLevel(token1),
          ),
          observerIncludedInTargetLevel: this.isTokenIncludedInLevel(
            token1,
            this.getTokenVisionLevel(token2),
          ),
        };
      }
    }

    return info;
  }

  _getTokenDocument(token) {
    if (!token) return null;
    return token.document ?? token;
  }

  _getOriginMethodName(origin) {
    switch (origin) {
      case 'vision':
        return 'getVisionOrigin';
      case 'sound':
        return 'getSoundOrigin';
      case 'light':
        return 'getLightOrigin';
      default:
        return 'getMovementOrigin';
    }
  }

  _normalizePoint(point) {
    return {
      x: Number(point?.x ?? 0) || 0,
      y: Number(point?.y ?? 0) || 0,
      elevation: Number(point?.elevation ?? point?.z ?? 0) || 0,
    };
  }

  _getFallbackTokenPosition(token, tokenDoc, data = {}) {
    const gridSize = canvas?.grid?.size || canvas?.dimensions?.size || 100;
    const width = Number(data.width ?? tokenDoc?.width ?? token?.document?.width ?? 1) || 1;
    const height = Number(data.height ?? tokenDoc?.height ?? token?.document?.height ?? 1) || 1;
    const x =
      Number(data.x ?? tokenDoc?.x ?? token?.document?.x ?? token?.x ?? 0) ||
      0;
    const y =
      Number(data.y ?? tokenDoc?.y ?? token?.document?.y ?? token?.y ?? 0) ||
      0;
    const center =
      token?.center ??
      token?.getCenterPoint?.() ??
      tokenDoc?.getCenterPoint?.() ?? {
        x: x + (width * gridSize) / 2,
        y: y + (height * gridSize) / 2,
      };

    return {
      x: Number(center.x ?? x) || 0,
      y: Number(center.y ?? y) || 0,
      elevation:
        Number(data.elevation ?? tokenDoc?.elevation ?? token?.elevation ?? token?.document?.elevation ?? 0) ||
        0,
    };
  }

  _mapCollisionType(type) {
    if (type === 'light') return 'light';
    if (type === 'sound') return 'sound';
    if (type === 'move') return 'move';
    return 'sight';
  }

  _getCoreSurfaceCollisionSide(origin, destination, options = {}) {
    if (options.side) return options.side;

    const originElevation = Number(origin?.elevation ?? 0);
    const destinationElevation = Number(destination?.elevation ?? 0);
    return destinationElevation >= originElevation ? 'above' : 'below';
  }

  _getCoreSurfaceCollisionDetail(origin, destination, type, options = {}) {
    const level =
      this.resolveLevel(options.level, canvas?.scene) ??
      this.resolveLevel(this.getCollisionLevel(options), canvas?.scene);
    const requestedSide = this._getCoreSurfaceCollisionSide(origin, destination, options);
    if (!level) {
      return {
        collisionType: this._mapCollisionType(type),
        levelId: null,
        mode: options.mode ?? 'any',
        requestedResult: false,
        requestedSide,
        tMax: options.tMax ?? 1,
        tMin: options.tMin ?? 0,
      };
    }

    const collisionType = this._mapCollisionType(type);
    const mode = options.mode ?? 'any';
    const tMin = options.tMin ?? 0;
    const tMax = options.tMax ?? 1;
    const baseConfig = {
      type: collisionType,
      mode,
      tMin,
      tMax,
      level,
    };
    const requestedCollision = canvas.scene.testSurfaceCollision(origin, destination, {
      ...baseConfig,
      side: requestedSide,
    });

    return {
      collisionType,
      levelId: level?.id ?? null,
      mode,
      requestedResult: !!requestedCollision,
      requestedSide,
      tMax,
      tMin,
    };
  }

  _testCoreSurfaceCollision(origin, destination, type, options = {}) {
    return this._getCoreSurfaceCollisionDetail(origin, destination, type, options).requestedResult;
  }

  _testCorePolygonCollision(origin, destination, type, options = {}) {
    const level =
      this.resolveLevel(options.level, canvas?.scene) ??
      this.resolveLevel(this.getCollisionLevel(options), canvas?.scene);
    if (!level) {
      return false;
    }

    const mappedType = this._mapCollisionType(type);
    const polygonBackend = CONFIG?.Canvas?.polygonBackends?.[mappedType];
    if (!polygonBackend?.testCollision) {
      return false;
    }

    const source = options.source ?? this._getCoreCollisionSource(type, options.originToken);
    const config = {
      type: mappedType,
      mode: options.mode ?? 'any',
      tMin: options.tMin ?? 0,
      tMax: options.tMax ?? 1,
      level,
    };
    if (source) {
      config.source = source;
    }

    const collision = polygonBackend.testCollision(origin, destination, config);
    return !!collision;
  }

  _testCoreVisibilityCollision(origin, destination, type, options = {}) {
    return this._evaluateCoreVisibilityCollision(origin, destination, type, options).result;
  }

  _testCoreCombinedCollision(p0, p1, type = 'sight', options = {}) {
    if (!p0 || !p1) {
      return false;
    }

    const origin = this._normalizePoint(p0);
    const destination = this._normalizePoint(p1);
    const scene =
      this._getTokenDocument(options.originToken)?.parent ??
      this._getTokenDocument(options.targetToken)?.parent ??
      canvas?.scene;
    const originLevel =
      this.resolveLevel(options.originLevel, scene) ??
      this.getTokenVisionLevel(options.originToken) ??
      this.resolveLevel(options.level, scene);
    const targetLevel =
      this.resolveLevel(options.targetLevel, scene) ??
      this.getTokenVisionLevel(options.targetToken) ??
      this.resolveLevel(options.level, scene) ??
      originLevel;

    if (!originLevel && !targetLevel) {
      return false;
    }

    if (
      type === 'sight' &&
      options.originToken &&
      options.targetToken &&
      originLevel &&
      !this.isTokenIncludedInLevel(options.targetToken, originLevel)
    ) {
      return true;
    }

    const resolvedOriginLevel = originLevel ?? targetLevel;
    const resolvedTargetLevel = targetLevel ?? originLevel;

    if (
      !resolvedOriginLevel ||
      !resolvedTargetLevel ||
      resolvedOriginLevel === resolvedTargetLevel ||
      resolvedOriginLevel.id === resolvedTargetLevel.id
    ) {
      const collision = this._evaluateCoreVisibilityCollision(origin, destination, type, {
        ...options,
        level: resolvedTargetLevel ?? resolvedOriginLevel,
      });
      return collision.result;
    }

    const t = this._getIntermediateTValue(
      origin,
      destination,
      resolvedOriginLevel,
      resolvedTargetLevel,
    );

    const originCollision = this._evaluateCoreVisibilityCollision(origin, destination, type, {
      ...options,
      crossLevel: true,
      level: resolvedOriginLevel,
      tMin: 0,
      tMax: t,
    });
    if (originCollision.result) {
      return true;
    }

    const targetCollision = this._evaluateCoreVisibilityCollision(origin, destination, type, {
      ...options,
      crossLevel: true,
      level: resolvedTargetLevel,
      tMin: t,
      tMax: 1,
    });
    return targetCollision.result;
  }

  _getCoreCollisionSource(type, token) {
    if (!token) {
      return null;
    }

    switch (type) {
      case 'sight':
        return token.vision ?? token.visionSource ?? null;
      case 'sound':
        return token.sound ?? token.soundSource ?? null;
      case 'light':
        return token.light ?? token.lightSource ?? null;
      default:
        return null;
    }
  }

  _evaluateCoreVisibilityCollision(origin, destination, type, options = {}) {
    const surfaceCollision = this._testCoreSurfaceCollision(origin, destination, type, options);
    const polygonCollision = surfaceCollision
      ? false
      : this._testCorePolygonCollision(origin, destination, type, options);
    return {
      surfaceCollision,
      polygonCollision,
      result: surfaceCollision || polygonCollision,
    };
  }

  _getIntermediateTValue(origin, destination, originLevel, destinationLevel) {
    if (!originLevel || !destinationLevel) {
      return 1;
    }

    if (originLevel === destinationLevel || originLevel.id === destinationLevel.id) {
      return 1;
    }

    const originBounds = originLevel?.elevation;
    const destinationBounds = destinationLevel?.elevation;
    if (
      !originBounds ||
      !destinationBounds ||
      !Number.isFinite(originBounds.bottom) ||
      !Number.isFinite(originBounds.top) ||
      !Number.isFinite(destinationBounds.bottom) ||
      !Number.isFinite(destinationBounds.top)
    ) {
      return 1;
    }

    const delta = destination.elevation - origin.elevation;
    if (delta === 0) {
      return 1;
    }

    let t00 = (originBounds.bottom - origin.elevation) / delta;
    let t01 = (originBounds.top - origin.elevation) / delta;
    if (t00 > t01) [t00, t01] = [t01, t00];

    let t10 = (destinationBounds.bottom - origin.elevation) / delta;
    let t11 = (destinationBounds.top - origin.elevation) / delta;
    if (t10 > t11) [t10, t11] = [t11, t10];

    if ((t11 > 0) && (t01 < t11)) {
      return Math.min(Math.max(t01, t10), 1);
    }

    return 1;
  }
}

export { LevelsIntegration };
