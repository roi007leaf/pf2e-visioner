export function isPointInCone(origin, direction, fov, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (dx === 0 && dy === 0) return true;
  const angleTo = Math.atan2(dy, dx);
  const dir = typeof direction === 'number' ? direction : Math.atan2(direction.y, direction.x);
  const delta = Math.abs(normalizeAngle(angleTo - dir));
  return delta <= toRadians(fov) / 2 + 1e-9;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function clampCornerPeek({ footprint, gridSize, mouse, band, fov }) {
  const expanded = {
    minX: footprint.x - band,
    minY: footprint.y - band,
    maxX: footprint.x + footprint.width + band,
    maxY: footprint.y + footprint.height + band,
  };
  const clampedX = clamp(mouse.x, expanded.minX, expanded.maxX);
  const clampedY = clamp(mouse.y, expanded.minY, expanded.maxY);
  const origin = { x: clampedX, y: clampedY };
  if (footprint.elevation !== undefined) origin.elevation = footprint.elevation;
  const direction = Math.atan2(mouse.y - origin.y, mouse.x - origin.x);
  return { origin, direction: Number.isNaN(direction) ? 0 : direction, fov };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
