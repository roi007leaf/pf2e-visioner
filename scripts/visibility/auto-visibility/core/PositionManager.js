/**
 * Manages token position calculations and coordinate transformations for the auto-visibility system.
 * Delegates to Foundry's native getMovementAdjustedPoint() for animation-aware positioning.
 *
 * @class PositionManager
 */
export class PositionManager {
  constructor(systemStateProvider) {
    this.systemStateProvider = systemStateProvider;
  }

  /**
   * Get token center position using movement-adjusted coordinates
   * Delegates to Foundry's native getMovementAdjustedPoint() for animation-aware positioning
   * @param {Object} token - Token object
   * @returns {Object} Position object with x, y, elevation
   */
  getTokenPosition(token) {
    const canvasToken = canvas.tokens.get(token.document.id);
    if (canvasToken) {
      const center = canvasToken.center || { x: canvasToken.x + canvasToken.w / 2, y: canvasToken.y + canvasToken.h / 2 };
      const adjustedPos = canvasToken.getMovementAdjustedPoint?.(center) ?? center;
      return {
        x: adjustedPos.x,
        y: adjustedPos.y,
        elevation: canvasToken.document.elevation || 0,
      };
    }

    const center = token.center || { x: token.x + token.w / 2, y: token.y + token.h / 2 };
    return {
      x: center.x,
      y: center.y,
      elevation: token.document.elevation || 0,
    };
  }

  /**
   * Get token position for visual effects (same as getTokenPosition since we use movement-adjusted)
   * @param {Object} token - Token object
   * @returns {Object} Position object with x, y, elevation
   */
  getTokenPositionVisual(token) {
    return this.getTokenPosition(token);
  }

  /**
   * Calculate distance between two tokens
   * @param {Object} token1 - First token
   * @param {Object} token2 - Second token
   * @returns {number} Distance in pixels
   */
  calculateDistance(token1, token2) {
    // Use native Foundry distanceTo method if available
    if (token1?.distanceTo && typeof token1.distanceTo === 'function') {
      try {
        return token1.distanceTo(token2);
      } catch (e) {
        // Fall back to manual calculation if native method fails
      }
    }
    
    const pos1 = this.getTokenPosition(token1);
    const pos2 = this.getTokenPosition(token2);
    return Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y);
  }

  /**
   * Get all tokens within a specified range of a position
   * @param {Object} position - Center position {x, y}
   * @param {number} maxDistance - Maximum distance in grid units
   * @param {string} excludeId - Token ID to exclude from results
   * @returns {Array} Array of tokens within range
   */
  getTokensInRange(position, maxDistance, excludeId) {
    const allTokens = canvas.tokens?.placeables || [];
    const tokensInRange = [];
    const maxPixelDistance = maxDistance * (canvas.grid?.size || 1);

    for (const token of allTokens) {
      if (token.document.id === excludeId) continue;

      const tokenPos = this.getTokenPosition(token);
      const distance = Math.hypot(tokenPos.x - position.x, tokenPos.y - position.y);

      if (distance <= maxPixelDistance) {
        tokensInRange.push(token);
      }
    }

    return tokensInRange;
  }
}
