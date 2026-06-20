import { actorHasFeature, getActorLevel } from '../../../utils/actor-features.js';

export const BLIND_FIGHT_ADJACENT_RANGE_FEET = 5;
export const BLIND_FIGHT_ADJACENT_PRIORITY = 120;

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function gridSizePixels() {
  return finiteNumber(globalThis.canvas?.grid?.size, globalThis.canvas?.dimensions?.size, 100) || 100;
}

function tokenBounds(token) {
  if (!token) return null;
  const bounds = token.bounds;
  const left = finiteNumber(bounds?.left, bounds?.x);
  const top = finiteNumber(bounds?.top, bounds?.y);
  const right = finiteNumber(bounds?.right);
  const bottom = finiteNumber(bounds?.bottom);
  const width = finiteNumber(bounds?.width);
  const height = finiteNumber(bounds?.height);

  if (left !== null && top !== null && (right !== null || width !== null) && (bottom !== null || height !== null)) {
    return {
      left,
      top,
      right: right ?? left + width,
      bottom: bottom ?? top + height,
    };
  }

  const gridSize = gridSizePixels();
  const document = token.document ?? token;
  const widthPixels = finiteNumber(token.w, document.width * gridSize, gridSize) || gridSize;
  const heightPixels = finiteNumber(token.h, document.height * gridSize, gridSize) || gridSize;
  const x = finiteNumber(document.x, token.x, token.center?.x - widthPixels / 2);
  const y = finiteNumber(document.y, token.y, token.center?.y - heightPixels / 2);
  if (x === null || y === null) return null;

  return {
    left: x,
    top: y,
    right: x + widthPixels,
    bottom: y + heightPixels,
  };
}

function tokenBoundsTouchOrOverlap(observerToken, targetToken) {
  const observerBounds = tokenBounds(observerToken);
  const targetBounds = tokenBounds(targetToken);
  if (!observerBounds || !targetBounds) return false;

  const horizontalGap = Math.max(
    0,
    observerBounds.left - targetBounds.right,
    targetBounds.left - observerBounds.right,
  );
  const verticalGap = Math.max(
    0,
    observerBounds.top - targetBounds.bottom,
    targetBounds.top - observerBounds.bottom,
  );
  const epsilon = Math.max(1, gridSizePixels() * 0.01);
  return horizontalGap <= epsilon && verticalGap <= epsilon;
}

export function hasBlindFight(tokenOrActor) {
  return actorHasFeature(tokenOrActor, 'blind-fight');
}

export function tokensAreBlindFightAdjacent(observerToken, targetToken) {
  try {
    const distance = Number(observerToken?.distanceTo?.(targetToken));
    if (Number.isFinite(distance) && distance <= BLIND_FIGHT_ADJACENT_RANGE_FEET) return true;
  } catch {
    /* fall through to token bounds */
  }

  return tokenBoundsTouchOrOverlap(observerToken, targetToken);
}

export function getBlindFightAdjacentVisibilityReplacement(
  observerToken,
  targetToken,
  currentVisibility,
) {
  const state = String(currentVisibility ?? '').toLowerCase();
  if (state !== 'undetected') return null;
  if (!hasBlindFight(observerToken)) return null;
  if (!tokensAreBlindFightAdjacent(observerToken, targetToken)) return null;

  const observerLevel = getActorLevel(observerToken);
  const targetLevel = getActorLevel(targetToken);
  if (observerLevel === null || targetLevel === null || targetLevel > observerLevel) return null;

  return {
    state: 'hidden',
    source: 'blind-fight-adjacent',
    priority: BLIND_FIGHT_ADJACENT_PRIORITY,
    type: 'visibilityReplacement',
    fromState: currentVisibility,
  };
}

export function getNativeVisibilityReplacement(observerToken, targetToken, currentVisibility) {
  return getBlindFightAdjacentVisibilityReplacement(observerToken, targetToken, currentVisibility);
}
