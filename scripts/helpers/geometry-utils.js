/**
 * Basic Geometry Utilities
 * Pure mathematical functions for point, line, and rectangle calculations
 * No external dependencies - safe to extract first
 */

/**
 * Calculate distance between two positions in feet (PF2e rules)
 * Uses Euclidean distance rounded down to nearest 5-foot increment
 * 
 * @param {Object} posA - First position with x, y properties
 * @param {Object} posB - Second position with x, y properties
 * @param {number} [gridSize=100] - Grid size in pixels (default: 100)
 * @param {number} [gridDistance=5] - Distance per grid square in feet (default: 5)
 * @returns {number} Distance in feet, rounded down to nearest 5-foot increment
 */
export function calculateDistanceInFeet(posA, posB, gridSize = 100, gridDistance = 5) {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const pixels = Math.sqrt(dx * dx + dy * dy);
  const gridUnits = pixels / gridSize;
  const rawFeet = gridUnits * gridDistance;

  // PF2e uses 5-foot increments for range measurement
  // Round down to nearest 5-foot increment
  return Math.floor(rawFeet / 5) * 5;
}

/**
 * Check if a point is inside a rectangle
 * @param {number} px - Point x coordinate
 * @param {number} py - Point y coordinate
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @returns {boolean} True if point is inside rectangle
 */
export function pointInRect(px, py, rect) {
  return px >= rect.x1 && px <= rect.x2 && py >= rect.y1 && py <= rect.y2;
}

/**
 * Calculate distance from a point to a line segment
 * @param {Object} pt - Point with x, y properties
 * @param {Object} a - Line start point with x, y properties
 * @param {Object} b - Line end point with x, y properties
 * @returns {number} Distance from point to line segment
 */
export function distancePointToSegment(pt, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = pt.x - a.x;
  const apy = pt.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(pt.x - cx, pt.y - cy);
}

/**
 * Check if a point lies between two other points on a line segment
 * @param {Object} pt - Point to check
 * @param {Object} a - Line start point
 * @param {Object} b - Line end point
 * @returns {boolean} True if point is between a and b
 */
export function pointBetweenOnSegment(pt, a, b) {
  const minX = Math.min(a.x, b.x) - 1e-6;
  const maxX = Math.max(a.x, b.x) + 1e-6;
  const minY = Math.min(a.y, b.y) - 1e-6;
  const maxY = Math.max(a.y, b.y) + 1e-6;
  return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
}

/**
 * Calculate orientation of three points (clockwise, counterclockwise, or collinear)
 * @param {Object} a - First point
 * @param {Object} b - Second point
 * @param {Object} c - Third point
 * @returns {number} Sign of orientation (-1, 0, or 1)
 */
function orientation(a, b, c) {
  return Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
}

/**
 * Check if point c lies on line segment ab
 * @param {Object} a - Line start point
 * @param {Object} b - Line end point
 * @param {Object} c - Point to check
 * @returns {boolean} True if c is on segment ab
 */
function onSegment(a, b, c) {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/**
 * Check if two line segments intersect
 * @param {Object} p1 - First segment start point
 * @param {Object} p2 - First segment end point
 * @param {Object} q1 - Second segment start point
 * @param {Object} q2 - Second segment end point
 * @returns {boolean} True if segments intersect
 */
export function segmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

/**
 * Check if a line segment intersects with a rectangle
 * @param {Object} p1 - Segment start point
 * @param {Object} p2 - Segment end point
 * @param {Object} rect - Rectangle with x1, y1, x2, y2 properties
 * @returns {boolean} True if segment intersects rectangle
 */
export function segmentIntersectsRect(p1, p2, rect) {
  if (pointInRect(p1.x, p1.y, rect) || pointInRect(p2.x, p2.y, rect)) return true;

  const r1 = { x: rect.x1, y: rect.y1 };
  const r2 = { x: rect.x2, y: rect.y1 };
  const r3 = { x: rect.x2, y: rect.y2 };
  const r4 = { x: rect.x1, y: rect.y2 };

  return (
    segmentsIntersect(p1, p2, r1, r2) ||
    segmentsIntersect(p1, p2, r2, r3) ||
    segmentsIntersect(p1, p2, r3, r4) ||
    segmentsIntersect(p1, p2, r4, r1)
  );
}
