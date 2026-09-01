import { getVisibilityBetween } from '../stores/visibility-map.js';
import { getDefaultPlayerVisibility } from './initial-scene-hidden-setup.js';

const UNDETECTED_HAZARD_INDICATOR_COLOR = 0xf44336;
const HIDDEN_HAZARD_INDICATOR_KEY = '_pvHiddenHazardIndicator';
const HIDDEN_INDICATOR_ACTOR_TYPES = new Set(['hazard', 'loot']);
const PLAYER_UNSEEN_VISIBILITY_STATES = new Set(['hidden', 'undetected', 'unnoticed']);

function actorIsType(actor, type) {
  try {
    return actor?.type === type || actor?.isOfType?.(type);
  } catch {
    return false;
  }
}

function tokenId(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function tokenDimensions(token, canvasLayer = globalThis.canvas) {
  const gridSize = canvasLayer?.grid?.size || 1;
  return {
    width: Number(token?.w) || (Number(token?.document?.width) || 1) * gridSize,
    height: Number(token?.h) || (Number(token?.document?.height) || 1) * gridSize,
  };
}

export function getHiddenHazardObservers(
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
  selectedTokens = globalThis.canvas?.tokens?.controlled ?? [],
) {
  const selected = (selectedTokens ?? []).filter((token) => !!tokenId(token));
  if (selected.length) return selected;
  return (tokens ?? []).filter((token) => !!tokenId(token));
}

function isHiddenIndicatorTarget(token) {
  for (const type of HIDDEN_INDICATOR_ACTOR_TYPES) {
    if (actorIsType(token?.actor, type)) return true;
  }
  return false;
}

function isPlayerUnseenVisibilityState(state) {
  return PLAYER_UNSEEN_VISIBILITY_STATES.has(state);
}

export function isHazardOrLootHiddenFromAnyObserver(
  token,
  observers = getHiddenHazardObservers(),
  {
    getVisibility = getVisibilityBetween,
    getDefaultVisibility = getDefaultPlayerVisibility,
  } = {},
) {
  const targetId = tokenId(token);
  if (!targetId || !isHiddenIndicatorTarget(token)) return false;
  const relevantObservers = (observers ?? []).filter(
    (observer) => !!tokenId(observer) && tokenId(observer) !== targetId,
  );
  if (!relevantObservers.length) {
    return isPlayerUnseenVisibilityState(getDefaultVisibility(token));
  }
  return relevantObservers.some((observer) =>
    isPlayerUnseenVisibilityState(getVisibility(observer, token)),
  );
}

export function shouldShowHiddenHazardIndicator(
  token,
  {
    user = globalThis.game?.user,
    scene = globalThis.canvas?.scene,
    observers = getHiddenHazardObservers(),
    getVisibility = getVisibilityBetween,
    getDefaultVisibility = getDefaultPlayerVisibility,
  } = {},
) {
  if (!user?.isGM || scene?.tokenVision === false) return false;
  return isHazardOrLootHiddenFromAnyObserver(token, observers, {
    getVisibility,
    getDefaultVisibility,
  });
}

export function drawHiddenHazardIndicator(
  graphics,
  { width, height, color = UNDETECTED_HAZARD_INDICATOR_COLOR } = {},
) {
  const inset = 3;
  const badgeRadius = Math.max(9, Math.min(14, Math.min(width, height) * 0.14));
  const badgeX = Math.max(badgeRadius + 2, width - badgeRadius - 2);
  const badgeY = badgeRadius + 2;

  graphics.clear();
  graphics.lineStyle(3, color, 0.9);
  graphics.drawRect(inset, inset, Math.max(0, width - inset * 2), Math.max(0, height - inset * 2));

  graphics.beginFill(0x111111, 0.9);
  graphics.drawCircle(badgeX, badgeY, badgeRadius);
  graphics.endFill();
  graphics.lineStyle(2.5, color, 1);

  // Red ghost matches Visioner's Undetected state. The same GM-only marker
  // covers current Undetected and legacy Hidden storage. Drawing it in PIXI
  // keeps the marker attached to the token so Foundry/Levels culling applies
  // to the whole indicator.
  const ghostRadius = badgeRadius * 0.58;
  const ghostHeadY = badgeY - badgeRadius * 0.08;
  const ghostBodyTop = badgeY - badgeRadius * 0.06;
  const ghostBodyHeight = badgeRadius * 0.62;
  graphics.lineStyle(0, color, 0);
  graphics.beginFill(color, 1);
  graphics.drawCircle(badgeX, ghostHeadY, ghostRadius);
  graphics.drawRect(
    badgeX - ghostRadius,
    ghostBodyTop,
    ghostRadius * 2,
    ghostBodyHeight,
  );
  graphics.endFill();

  graphics.beginFill(0x111111, 1);
  const eyeRadius = Math.max(1, badgeRadius * 0.09);
  graphics.drawCircle(badgeX - badgeRadius * 0.2, badgeY - badgeRadius * 0.15, eyeRadius);
  graphics.drawCircle(badgeX + badgeRadius * 0.2, badgeY - badgeRadius * 0.15, eyeRadius);

  const bottomY = ghostBodyTop + ghostBodyHeight;
  const cutoutRadius = badgeRadius * 0.16;
  graphics.drawCircle(badgeX - badgeRadius * 0.38, bottomY, cutoutRadius);
  graphics.drawCircle(badgeX, bottomY, cutoutRadius);
  graphics.drawCircle(badgeX + badgeRadius * 0.38, bottomY, cutoutRadius);
  graphics.endFill();
}

export function removeHiddenHazardIndicator(token) {
  const indicator = token?.[HIDDEN_HAZARD_INDICATOR_KEY];
  if (!indicator) return false;
  try {
    indicator.parent?.removeChild?.(indicator);
  } catch {
    /* stale indicator was already detached */
  }
  try {
    if (indicator.destroyed !== true) indicator.destroy?.({ children: true });
  } catch {
    /* stale indicator was already destroyed */
  }
  token[HIDDEN_HAZARD_INDICATOR_KEY] = null;
  return true;
}

export function createHiddenHazardIndicator(
  token,
  { canvasLayer = globalThis.canvas, pixi = globalThis.PIXI } = {},
) {
  if (!token?.addChild || !pixi?.Graphics) return null;
  removeHiddenHazardIndicator(token);

  const indicator = new pixi.Graphics();
  const dimensions = tokenDimensions(token, canvasLayer);
  drawHiddenHazardIndicator(indicator, dimensions);
  indicator.eventMode = 'none';
  indicator.interactive = false;
  indicator.zIndex = 1000;
  indicator._pvWidth = dimensions.width;
  indicator._pvHeight = dimensions.height;
  token.addChild(indicator);
  token[HIDDEN_HAZARD_INDICATOR_KEY] = indicator;
  return indicator;
}

export function syncHiddenHazardIndicator(
  token,
  {
    canvasLayer = globalThis.canvas,
    pixi = globalThis.PIXI,
    observers = getHiddenHazardObservers(canvasLayer?.tokens?.placeables),
    ...decisionOptions
  } = {},
) {
  if (!shouldShowHiddenHazardIndicator(token, { observers, ...decisionOptions })) {
    removeHiddenHazardIndicator(token);
    return false;
  }

  const dimensions = tokenDimensions(token, canvasLayer);
  const indicator = token?.[HIDDEN_HAZARD_INDICATOR_KEY];
  if (!indicator || indicator.destroyed === true || indicator.parent !== token) {
    removeHiddenHazardIndicator(token);
    return !!createHiddenHazardIndicator(token, { canvasLayer, pixi });
  }
  if (indicator._pvWidth !== dimensions.width || indicator._pvHeight !== dimensions.height) {
    drawHiddenHazardIndicator(indicator, dimensions);
    indicator._pvWidth = dimensions.width;
    indicator._pvHeight = dimensions.height;
  }
  return true;
}

export function refreshHiddenHazardIndicators(
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
  options = {},
) {
  const candidates = tokens ?? [];
  const observers = options.observers ?? getHiddenHazardObservers(
    options.canvasLayer?.tokens?.placeables ?? globalThis.canvas?.tokens?.placeables,
  );
  let shown = 0;
  for (const token of candidates) {
    if (syncHiddenHazardIndicator(token, { ...options, observers })) shown += 1;
  }
  return shown;
}

export function clearHiddenHazardIndicators(
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
) {
  let removed = 0;
  for (const token of tokens ?? []) {
    if (removeHiddenHazardIndicator(token)) removed += 1;
  }
  return removed;
}
