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
