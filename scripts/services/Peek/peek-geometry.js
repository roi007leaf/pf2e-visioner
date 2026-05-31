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

export function clampCornerPeek({ footprint, mouse, band, fov, tokenCenter, maxSweep }) {
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
  let direction = Math.atan2(mouse.y - origin.y, mouse.x - origin.x);
  if (Number.isNaN(direction)) direction = 0;
  let outFov = fov;
  if (tokenCenter && typeof maxSweep === 'number' && !(origin.x === tokenCenter.x && origin.y === tokenCenter.y)) {
    const base = Math.atan2(origin.y - tokenCenter.y, origin.x - tokenCenter.x);
    const bounded = boundConeToSweep(base, direction, fov, maxSweep);
    direction = bounded.direction;
    outFov = bounded.fov;
  }
  return { origin, direction, fov: outFov };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function clampDoorPeek({ door, tokenCenter, nudge, fov, aim, maxSweep }) {
  const [x1, y1, x2, y2] = door.c;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  let nx = -(y2 - y1);
  let ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const toTokenX = tokenCenter.x - mid.x;
  const toTokenY = tokenCenter.y - mid.y;
  if (nx * toTokenX + ny * toTokenY > 0) {
    nx = -nx;
    ny = -ny;
  }
  const origin = { x: mid.x - nx * nudge, y: mid.y - ny * nudge };
  const base = Math.atan2(ny, nx);
  let direction = base;
  let outFov = fov;
  if (typeof maxSweep === 'number') {
    const raw = aim ? Math.atan2(aim.y - origin.y, aim.x - origin.x) : base;
    const bounded = boundConeToSweep(base, raw, fov, maxSweep);
    direction = bounded.direction;
    outFov = bounded.fov;
  }
  return { origin, direction, fov: outFov };
}

export function clampDirectionToArc(base, target, maxSweep) {
  let delta = target - base;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (delta > maxSweep) delta = maxSweep;
  else if (delta < -maxSweep) delta = -maxSweep;
  return base + delta;
}

export const STATIC_SLIT_THRESHOLD_DEG = 40;

export function boundConeToSweep(base, rawAim, fovDeg, maxSweep) {
  if (fovDeg >= STATIC_SLIT_THRESHOLD_DEG) {
    return { direction: base, fov: fovDeg };
  }
  const direction = clampDirectionToArc(base, rawAim, maxSweep);
  return { direction, fov: fovDeg };
}

export function distancePointToSegment(point, segment) {
  const [x1, y1, x2, y2] = segment;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point.x - x1, point.y - y1);
  let t = ((point.x - x1) * dx + (point.y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
}

export function isWithinDoorPeekRange(tokenCenter, door, maxDistance) {
  return distancePointToSegment(tokenCenter, door.c) <= maxDistance;
}

export function pullBackOrigin(from, to, hit, margin) {
  const dx = hit.x - from.x;
  const dy = hit.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: from.x, y: from.y };
  const back = Math.max(0, len - margin);
  const out = { x: from.x + (dx / len) * back, y: from.y + (dy / len) * back };
  if (to?.elevation !== undefined) out.elevation = to.elevation;
  return out;
}
