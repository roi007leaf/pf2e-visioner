/**
 * Levels Module Integration Service
 * Provides integration with the Levels module for 3D elevation-aware visibility and cover
 * Singleton pattern ensures consistent integration across the application
 */
class LevelsIntegration {
  constructor() {
    if (LevelsIntegration._instance) {
      return LevelsIntegration._instance;
    }
    LevelsIntegration._instance = this;

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

    this._isLevelsActive = game.modules.get('levels')?.active ?? false;
    this._isWallHeightActive = game.modules.get('wall-height')?.active ?? false;

    if (this._isLevelsActive) {
      console.log('[PF2E Visioner] Levels module detected - enabling 3D integration');
    }

    this._initialized = true;
  }

  get isActive() {
    return this._isLevelsActive;
  }

  get hasWallHeight() {
    return this._isWallHeightActive;
  }

  get api() {
    if (!this._isLevelsActive || !CONFIG.Levels?.API) {
      return null;
    }
    return CONFIG.Levels.API;
  }

  getTokenElevation(token) {
    if (!token?.document) return 0;
    return token.document.elevation ?? 0;
  }

  getTokenLosHeight(token) {
    if (!token) return 0;
    if (this._isLevelsActive && typeof token.losHeight === 'number') {
      return token.losHeight;
    }
    return this.getTokenElevation(token);
  }

  getVerticalDistance(token1, token2) {
    if (!this._isLevelsActive) return 0;

    const elevation1 = this.getTokenLosHeight(token1);
    const elevation2 = this.getTokenLosHeight(token2);
    const verticalDist = Math.abs(elevation2 - elevation1);

    console.log('[LevelsIntegration] getVerticalDistance - Token 1 elevation:', elevation1);
    console.log('[LevelsIntegration] getVerticalDistance - Token 2 elevation:', elevation2);
    console.log('[LevelsIntegration] getVerticalDistance - Vertical distance:', verticalDist);

    return verticalDist;
  }

  getTotalDistance(token1, token2) {
    if (!token1 || !token2) return Infinity;

    const horizontalDistance = this._getHorizontalDistance(token1, token2);
    console.log('[LevelsIntegration] getTotalDistance - Token 1:', token1.name, 'Token 2:', token2.name);
    console.log('[LevelsIntegration] getTotalDistance - Horizontal distance (grid):', horizontalDistance);

    if (!this._isLevelsActive) {
      console.log('[LevelsIntegration] getTotalDistance - Levels inactive, returning 2D distance');
      return horizontalDistance;
    }

    const verticalDistanceFeet = this.getVerticalDistance(token1, token2);
    const feetPerGrid = canvas.scene?.grid?.distance || 5;
    const verticalDistance = verticalDistanceFeet / feetPerGrid;
    const totalDistance = Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2);
    
    console.log('[LevelsIntegration] getTotalDistance - Vertical distance (feet):', verticalDistanceFeet);
    console.log('[LevelsIntegration] getTotalDistance - Vertical distance (grid):', verticalDistance);
    console.log('[LevelsIntegration] getTotalDistance - Total 3D distance (grid):', totalDistance);

    return totalDistance;
  }

  _getHorizontalDistance(token1, token2) {
    const p1 = token1.center ?? token1.getCenterPoint();
    const p2 = token2.center ?? token2.getCenterPoint();

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const pixelDistance = Math.sqrt(dx ** 2 + dy ** 2);
    const gridDistance = pixelDistance / canvas.dimensions.distance;

    return gridDistance;
  }

  test3DCollision(token1, token2, type = 'sight') {
    if (!this._isLevelsActive || !this.api) {
      return false;
    }

    try {
      const collision = this.api.checkCollision(token1, token2, type);
      return !!collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error testing 3D collision:', error);
      return false;
    }
  }

  test3DPointCollision(p0, p1, type = 'sight') {
    if (!this._isLevelsActive || !this.api) {
      console.log('[LevelsIntegration] test3DPointCollision - Levels inactive or no API');
      return false;
    }

    if (!p0 || !p1) {
      console.log('[LevelsIntegration] test3DPointCollision - Invalid points');
      return false;
    }

    try {
      console.log('[LevelsIntegration] test3DPointCollision - Checking collision type:', type);
      console.log('[LevelsIntegration] test3DPointCollision - From:', p0, 'To:', p1);
      
      const collision = this.api.testCollision(p0, p1, type);
      
      console.log('[LevelsIntegration] test3DPointCollision - Raw collision result:', collision);
      console.log('[LevelsIntegration] test3DPointCollision - Boolean result:', !!collision);
      
      return !!collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error testing 3D point collision:', error);
      return false;
    }
  }

  isTokenInRange(token, placeable, useElevation = true) {
    if (!this._isLevelsActive || !this.api) {
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
    if (!this._isLevelsActive) return false;

    const diff = this.getElevationDifference(target, observer);
    return diff >= threshold;
  }

  hasElevationDisadvantage(observer, target, threshold = 5) {
    if (!this._isLevelsActive) return false;

    const diff = this.getElevationDifference(target, observer);
    return diff <= -threshold;
  }

  get3DPoint(token) {
    if (!token) return null;

    const center = token.center ?? token.getCenterPoint();
    const z = this.getTokenLosHeight(token);

    return { x: center.x, y: center.y, z };
  }

  hasFloorCeilingBetween(observer, target) {
    if (!this._isLevelsActive) {
      console.log('[LevelsIntegration] hasFloorCeilingBetween - Levels inactive');
      return false;
    }

    try {
      const p0 = this.get3DPoint(observer);
      const p1 = this.get3DPoint(target);

      console.log('[LevelsIntegration] hasFloorCeilingBetween - Observer:', observer.name, 'at', p0);
      console.log('[LevelsIntegration] hasFloorCeilingBetween - Target:', target.name, 'at', p1);

      if (!p0 || !p1) {
        console.log('[LevelsIntegration] hasFloorCeilingBetween - Invalid points');
        return false;
      }

      const collision = this.test3DPointCollision(p0, p1, 'sight');
      
      console.log('[LevelsIntegration] hasFloorCeilingBetween - Collision result:', collision);
      
      return collision;
    } catch (error) {
      console.warn('[PF2E Visioner] Error checking floor/ceiling:', error);
      return false;
    }
  }

  adjustCoverForElevation(observer, target, baseCoverLevel) {
    if (!this._isLevelsActive) return baseCoverLevel;

    try {
      const elevationDiff = this.getElevationDifference(observer, target);

      if (Math.abs(elevationDiff) < 5) {
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
      isActive: this._isLevelsActive,
      hasWallHeight: this._isWallHeightActive,
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
    };

    if (this._isLevelsActive) {
      info.collision = {
        sight: this.test3DCollision(token1, token2, 'sight'),
        sound: this.test3DCollision(token1, token2, 'sound'),
      };
    }

    return info;
  }
}

export { LevelsIntegration };
