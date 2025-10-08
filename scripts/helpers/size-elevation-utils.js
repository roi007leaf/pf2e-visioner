/**
 * Size and Elevation Utilities
 * Functions for calculating token sizes, heights, and spatial properties
 * Minimal dependencies - safe to extract second
 */

import { MODULE_ID } from '../constants.js';

/**
 * Parse a value as feet measurement
 * @param {*} value - Value to parse (number, string, or null)
 * @returns {number|null} Parsed feet value or null if invalid
 */
export function parseFeet(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const m = value.trim().match(/(-?\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Height mapping by creature size category
 */
export const SIZE_TO_HEIGHT_FT = {
  tiny: 2.5,
  sm: 5,
  small: 5,
  med: 5,
  medium: 5,
  lg: 10,
  large: 10,
  huge: 15,
  grg: 20,
  gargantuan: 20,
};

/**
 * Size order mapping for size comparisons
 */
export const SIZE_ORDER = {
  tiny: 0,
  sm: 1,
  small: 1,
  med: 2,
  medium: 2,
  lg: 3,
  large: 3,
  huge: 4,
  grg: 5,
  gargantuan: 5,
};

/**
 * Get token height in feet
 * @param {Object} token - Token object
 * @returns {number} Height in feet
 */
export function getTokenHeightFt(token) {
  try {
    // 1) Module flag override on token document
    const flagH = token?.document?.getFlag?.(MODULE_ID, 'heightFt');
    const fromFlag = parseFeet(flagH);
    if (fromFlag != null) return fromFlag;
    // 2) Wall Height module integration - check for tokenHeight flag
    const wallHeightFlag = token?.document?.flags?.['wall-height']?.tokenHeight;
    const fromWallHeight = parseFeet(wallHeightFlag);
    if (fromWallHeight != null) return fromWallHeight;
    // 3) Size-only mode: use actor size category to determine height
    const size = token?.actor?.system?.traits?.size?.value ?? 'med';
    return SIZE_TO_HEIGHT_FT[size] ?? 5;
  } catch (_) {
    return 5;
  }
}

/**
 * Get token vertical span (bottom and top elevation)
 * @param {Object} token - Token object
 * @returns {Object} Object with bottom and top elevation in feet
 */
export function getTokenVerticalSpanFt(token) {
  try {
    const elev = Number(token?.document?.elevation ?? token?.elevation ?? 0) || 0;
    const h = getTokenHeightFt(token);
    const bottom = Math.min(elev, elev + h);
    const top = Math.max(elev, elev + h);
    return { bottom, top };
  } catch (_) {
    const elev = Number(token?.document?.elevation ?? token?.elevation ?? 0) || 0;
    return { bottom: elev, top: elev + 5 };
  }
}

/**
 * Get size rank for comparisons
 * @param {Object} token - Token object
 * @returns {number} Size rank (0=tiny, 2=medium, 5=gargantuan)
 */
export function getSizeRank(token) {
  try {
    const v = token?.actor?.system?.traits?.size?.value ?? 'med';
    return SIZE_ORDER[v] ?? 2;
  } catch (_) {
    return 2;
  }
}

/**
 * Get token rectangle bounds
 * @param {Object} token - Token object
 * @returns {Object} Rectangle with x1, y1, x2, y2 properties
 */
export function getTokenRect(token) {
  const x1 = token.document.x;
  const y1 = token.document.y;
  const width = token.document.width * canvas.grid.size;
  const height = token.document.height * canvas.grid.size;
  return { x1, y1, x2: x1 + width, y2: y1 + height };
}

/**
 * Get token corner points with special handling for tiny creatures
 * @param {Object} token - Token object
 * @param {Object} rect - Optional pre-calculated rectangle
 * @param {string} sizeValue - Optional size override
 * @returns {Array} Array of corner point objects with x, y properties
 */
export function getTokenCorners(token, rect, sizeValue) {
  try {
    const actualRect = rect || getTokenRect(token);
    const size = sizeValue ?? token?.actor?.system?.traits?.size?.value ?? 'med';

    if (size === 'tiny') {
      const centerX = (actualRect.x1 + actualRect.x2) / 2;
      const centerY = (actualRect.y1 + actualRect.y2) / 2;
      const gridSize = canvas?.grid?.size || 50;
      // Use 0.7-square effective area for cover (35% from center in each direction)
      const halfEffective = gridSize * 0.35;
      return [
        { x: centerX - halfEffective, y: centerY - halfEffective }, // top-left
        { x: centerX + halfEffective, y: centerY - halfEffective }, // top-right
        { x: centerX + halfEffective, y: centerY + halfEffective }, // bottom-right
        { x: centerX - halfEffective, y: centerY + halfEffective }, // bottom-left
      ];
    }

    // Regular creatures use document boundaries
    return [
      { x: actualRect.x1, y: actualRect.y1 }, // top-left
      { x: actualRect.x2, y: actualRect.y1 }, // top-right
      { x: actualRect.x2, y: actualRect.y2 }, // bottom-right
      { x: actualRect.x1, y: actualRect.y2 }, // bottom-left
    ];
  } catch (_) {
    // Fallback to token center if anything goes wrong
    const c = token.center ?? token.getCenterPoint?.() ?? { x: 0, y: 0 };
    return [c, c, c, c];
  }
}

/**
 * Get token boundary points including corners, midpoints, and center
 * @param {Object} token - Token object
 * @returns {Array} Array of boundary point objects with x, y properties
 */
export function getTokenBoundaryPoints(token) {
  try {
    const rect = getTokenRect(token);
    const cx = (rect.x1 + rect.x2) / 2;
    const cy = (rect.y1 + rect.y2) / 2;
    return [
      { x: rect.x1, y: rect.y1 }, // top-left
      { x: rect.x2, y: rect.y1 }, // top-right
      { x: rect.x2, y: rect.y2 }, // bottom-right
      { x: rect.x1, y: rect.y2 }, // bottom-left
      { x: cx, y: rect.y1 }, // mid-top
      { x: rect.x2, y: cy }, // mid-right
      { x: cx, y: rect.y2 }, // mid-bottom
      { x: rect.x1, y: cy }, // mid-left
      { x: cx, y: cy }, // center
    ];
  } catch (_) {
    const c = token.center ?? token.getCenterPoint?.() ?? { x: 0, y: 0 };
    return [c];
  }
}
