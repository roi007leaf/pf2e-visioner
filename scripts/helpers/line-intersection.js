/**
 * Line Intersection Module
 * Handles complex geometry calculations for line-rectangle intersections and token-based intersections
 */

import { segmentsIntersect } from './geometry-utils.js';

/**
 * Check if a line intersects with a rectangle in various modes
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @param {string} mode - Intersection mode ('any', 'length10')
 * @returns {boolean} True if line intersects rectangle according to mode
 */
export function centerLineIntersectsRect(p1, p2, rect, mode = 'any') {
  const topLeft = { x: rect.x1, y: rect.y1 };
  const topRight = { x: rect.x2, y: rect.y1 };
  const bottomRight = { x: rect.x2, y: rect.y2 };
  const bottomLeft = { x: rect.x1, y: rect.y2 };
  const edges = {
    top: [topLeft, topRight],
    right: [topRight, bottomRight],
    bottom: [bottomRight, bottomLeft],
    left: [bottomLeft, topLeft],
  };
  const hits = new Set();
  if (segmentsIntersect(p1, p2, edges.top[0], edges.top[1])) hits.add('top');
  if (segmentsIntersect(p1, p2, edges.bottom[0], edges.bottom[1])) hits.add('bottom');
  if (segmentsIntersect(p1, p2, edges.left[0], edges.left[1])) hits.add('left');
  if (segmentsIntersect(p1, p2, edges.right[0], edges.right[1])) hits.add('right');

  if (mode === 'any' || mode === 'length10') {
    const len = segmentRectIntersectionLength(p1, p2, rect);
    if (len <= 0) return false;

    if (mode === 'any') {
      // For ANY mode, we want to check if there's a significant intersection
      // Simply use a small percentage of the token's width as threshold
      const width = Math.abs(rect.x2 - rect.x1);
      return len > width * 0.05; // 5% of token width minimum
    }

    if (mode === 'length10') {
      // Grid-square-based approach: 10% of total grid squares
      const width = Math.abs(rect.x2 - rect.x1);
      const height = Math.abs(rect.y2 - rect.y1);

      // Calculate grid squares (assuming each square is ~50px in standard FoundryVTT)
      const gridSize = canvas?.grid?.size || 50;
      const widthSquares = Math.round(width / gridSize);
      const heightSquares = Math.round(height / gridSize);
      const totalSquares = widthSquares * heightSquares;

      // Convert intersection length to "square equivalents"
      // A full diagonal through one square ≈ √2 * gridSize ≈ 71px
      const squareEquivalent = len / (gridSize * Math.sqrt(2));
      const squarePercentage = (squareEquivalent / totalSquares) * 100;

      return squarePercentage >= 10;
    }

    // For other modes (length50), use the old diagonal approach
    const width = Math.abs(rect.x2 - rect.x1);
    const height = Math.abs(rect.y2 - rect.y1);
    const tokenDiagonal = Math.sqrt(width * width + height * height);
    const ratio = len / tokenDiagonal;
    const threshold = 0.5;
    return ratio >= threshold;
  }
  // For other modes, check if at least one edge is hit
  return hits.size > 0;
}

/**
 * Calculate intersection length between line segment and rectangle
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @returns {number} Length of intersection in pixels
 */
export function segmentRectIntersectionLength(p1, p2, rect) {
  // Liang-Barsky clipping to get [t0,t1] of the segment inside the rect
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - rect.x1, rect.x2 - p1.x, p1.y - rect.y1, rect.y2 - p1.y];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];
    if (pi === 0) {
      if (qi < 0) return 0;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 > t1) return 0;
  const segLen = Math.hypot(dx, dy);
  return Math.max(0, segLen * Math.max(0, t1 - t0));
}

/**
 * Calculate intersection range between line segment and rectangle
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @returns {Array|null} Range [t0, t1] or null if no intersection
 */
export function segmentRectIntersectionRange(p1, p2, rect) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - rect.x1, rect.x2 - p1.x, p1.y - rect.y1, rect.y2 - p1.y];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 > t1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

/**
 * Check if line between tokens intersects with a rectangle
 * For 'any' mode, be more permissive: if center-to-center misses, also try
 * attacker center → target corners and target center → attacker corners.
 * @param {Object} attacker - Attacker token object
 * @param {Object} target - Target token object
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @param {string} mode - Intersection mode
 * @param {Object} [blocker] - The blocker token associated with the rectangle
 * @returns {boolean} True if intersection occurs
 */
export function intersectsBetweenTokens(attacker, target, rect, mode, blocker) {
  // Prevent a token from being considered as providing cover to itself
  if (blocker && (blocker.id === target.id || blocker.id === attacker.id)) {
    return false;
  }

  const p1 = attacker.center ?? attacker.getCenterPoint?.();
  const p2 = target.center ?? target.getCenterPoint?.();

  // Primary check: center-to-center ray
  if (p1 && p2 && centerLineIntersectsRect(p1, p2, rect, mode)) return true;
  if (mode !== 'any') return false;

  return false;
}
