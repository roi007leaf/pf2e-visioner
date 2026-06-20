import { scheduleRAF } from '../../utils/scheduler.js';

export const WALL_INDICATOR_COLORS = {
  door: 0xffd166,
  wall: 0x9b59b6,
  darkerDoor: 0xcc9900,
  darkerWall: 0x7a4d8a,
};

export function getWallIndicatorColor(wallDocument) {
  return Number(wallDocument?.door) > 0 ? WALL_INDICATOR_COLORS.door : WALL_INDICATOR_COLORS.wall;
}

export function getWallIndicatorDarkerColor(color) {
  return color === WALL_INDICATOR_COLORS.door
    ? WALL_INDICATOR_COLORS.darkerDoor
    : WALL_INDICATOR_COLORS.darkerWall;
}

export function getWallSegment(wallDocument) {
  const c = Array.isArray(wallDocument?.c)
    ? wallDocument.c
    : [wallDocument?.x, wallDocument?.y, wallDocument?.x2, wallDocument?.y2];
  const [x1, y1, x2, y2] = c;
  if (![x1, y1, x2, y2].every((n) => typeof n === 'number')) return null;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1,
    y1,
    x2,
    y2,
    dx,
    dy,
    len,
    nx: -dy / len,
    ny: dx / len,
  };
}

export function buildWallIndicatorPolygon(segment, half) {
  return [
    segment.x1 + segment.nx * half,
    segment.y1 + segment.ny * half,
    segment.x2 + segment.nx * half,
    segment.y2 + segment.ny * half,
    segment.x2 - segment.nx * half,
    segment.y2 - segment.ny * half,
    segment.x1 - segment.nx * half,
    segment.y1 - segment.ny * half,
  ];
}

export function markWallDisplayObject(displayObject, wallId) {
  displayObject._pvWallId = wallId;
  displayObject._wallDocumentId = wallId;
}

export function drawWallIndicatorShape({
  graphics,
  segment,
  half,
  color,
  lineWidth = 2,
  lineAlpha = 0.9,
  fillAlpha = 0.3,
} = {}) {
  graphics.lineStyle(lineWidth, color, lineAlpha);
  graphics.beginFill(color, fillAlpha);
  graphics.drawPolygon(buildWallIndicatorPolygon(segment, half));
  graphics.endFill();
}

function createWallSparkles({ pixi, wallId, container, sparkleCount, random = Math.random }) {
  const sparkles = [];
  for (let i = 0; i < sparkleCount; i += 1) {
    const sparkle = new pixi.Graphics();
    sparkle.beginFill(0xffffff, 0.8);
    const size = 1.5 + random() * 1.5;
    sparkle.drawCircle(0, 0, size);
    sparkle.endFill();

    markWallDisplayObject(sparkle, wallId);
    container.addChild(sparkle);

    sparkle._moveSpeed = 0.2 + random() * 0.3;
    sparkle._curveX = random() * Math.PI * 2;
    sparkle._curveY = random() * Math.PI * 2;
    sparkle._floatRange = 8 + random() * 12;
    sparkles.push(sparkle);
  }
  return sparkles;
}

function attachWallIndicatorAnimation({
  indicator,
  wall,
  wallId,
  segment,
  half,
  color,
  pixi,
  sparkleCount,
  includeInnerHighlight,
  scheduleFrame,
  random,
}) {
  const effectContainer = new pixi.Container();
  markWallDisplayObject(effectContainer, wallId);
  indicator.addChild(effectContainer);

  const shimmer = new pixi.Graphics();
  markWallDisplayObject(shimmer, wallId);
  effectContainer.addChild(shimmer);

  const sparkles = createWallSparkles({
    pixi,
    wallId,
    container: effectContainer,
    sparkleCount,
    random,
  });

  wall._pvAnimationActive = true;
  const startTime = Date.now();

  const animate = () => {
    try {
      if (!indicator.parent || !wall._pvAnimationActive) return;

      const elapsed = (Date.now() - startTime) / 1000;
      indicator.alpha = 1.0;
      shimmer.clear();

      const breathe = 1.0 + 0.12 * Math.sin(elapsed * 1.2);
      const glowAlpha = 0.35 + 0.2 * Math.sin(elapsed * 0.8);
      const darkerColor = getWallIndicatorDarkerColor(color);
      const glowExpansion = 6 * breathe;

      shimmer.lineStyle(5, darkerColor, glowAlpha);
      shimmer.drawPolygon(buildWallIndicatorPolygon(segment, half + glowExpansion));

      if (includeInnerHighlight) {
        const highlightAlpha = 0.05 + 0.03 * Math.sin(elapsed * 1.5);
        shimmer.lineStyle(1, 0xffffff, highlightAlpha);
        shimmer.drawPolygon(buildWallIndicatorPolygon(segment, half - 2));
      }

      sparkles.forEach((sparkle, i) => {
        const sparkleTime = elapsed * sparkle._moveSpeed + i * 0.8;
        const progress = (sparkleTime * 0.3) % 1;
        const baseX = segment.x1 + segment.dx * progress;
        const baseY = segment.y1 + segment.dy * progress;
        const curveTimeX = sparkleTime + sparkle._curveX;
        const curveTimeY = sparkleTime + sparkle._curveY;
        const floatX =
          (sparkle._floatRange *
            (0.6 * Math.sin(curveTimeX * 2.1) +
              0.3 * Math.sin(curveTimeX * 3.7) +
              0.1 * Math.sin(curveTimeX * 6.2))) /
          3;
        const floatY =
          (sparkle._floatRange *
            (0.6 * Math.cos(curveTimeY * 1.8) +
              0.3 * Math.cos(curveTimeY * 4.1) +
              0.1 * Math.cos(curveTimeY * 5.9))) /
          3;
        const maxFloat = half * 0.7;
        const constrainedFloatX = Math.max(-maxFloat, Math.min(maxFloat, floatX * 0.3));
        const constrainedFloatY = Math.max(-maxFloat, Math.min(maxFloat, floatY * 0.3));

        sparkle.x = baseX + segment.nx * constrainedFloatX;
        sparkle.y = baseY + segment.ny * constrainedFloatY;
        sparkle.alpha = 0.3 + 0.5 * Math.sin(sparkleTime * 4 + i * 0.7);
        const sizeVariation = 0.7 + 0.4 * Math.sin(sparkleTime * 3.2 + i * 1.1);
        sparkle.scale.set(sizeVariation);
      });

      indicator._pvAnimationFrameId = scheduleFrame(animate, true) || null;
    } catch (error) {
      console.error(`[PF2E-Visioner] Animation error:`, error);
    }
  };

  indicator._pvAnimateFunction = animate;
  const cancelFn = scheduleFrame(animate, true);
  if (cancelFn) {
    indicator._pvAnimationFrameId = cancelFn;
  }
}

function getDefaultWallIndicatorParent(canvasLayer, wall) {
  return canvasLayer?.effects?.foreground || canvasLayer?.effects || canvasLayer?.walls || wall;
}

export function createHiddenWallIndicator({
  wall,
  wallDocument = wall?.document,
  half,
  pixi = globalThis.PIXI,
  canvasLayer = globalThis.canvas,
  parent = getDefaultWallIndicatorParent(canvasLayer, wall),
  animated = true,
  sparkleCount = 50,
  includeInnerHighlight = true,
  scheduleFrame = scheduleRAF,
  random = Math.random,
} = {}) {
  const segment = getWallSegment(wallDocument);
  if (!segment) return null;

  const wallId = wallDocument.id;
  const color = getWallIndicatorColor(wallDocument);
  const indicator = new pixi.Graphics();
  drawWallIndicatorShape({
    graphics: indicator,
    segment,
    half,
    color,
  });

  markWallDisplayObject(indicator, wallId);
  indicator.zIndex = 1000;
  indicator.eventMode = 'none';
  indicator.alpha = 1.0;

  if (animated) {
    attachWallIndicatorAnimation({
      indicator,
      wall,
      wallId,
      segment,
      half,
      color,
      pixi,
      sparkleCount,
      includeInnerHighlight,
      scheduleFrame,
      random,
    });
  }

  parent?.addChild?.(indicator);
  wall._pvHiddenIndicator = indicator;
  return indicator;
}

export function removeHiddenWallIndicator(wall) {
  try {
    if (!wall?._pvHiddenIndicator) return false;
    wall._pvHiddenIndicator.parent?.removeChild?.(wall._pvHiddenIndicator);
    wall._pvHiddenIndicator.destroy?.();
    wall._pvHiddenIndicator = null;
    return true;
  } catch (_) {
    return false;
  }
}

export function replaceHiddenWallIndicator(options = {}) {
  removeHiddenWallIndicator(options.wall);
  return createHiddenWallIndicator(options);
}

export function createWallSeeThroughMask({
  wall,
  wallDocument = wall?.document,
  half = 3,
  pixi = globalThis.PIXI,
  canvasLayer = globalThis.canvas,
  parent = canvasLayer?.walls || wall,
} = {}) {
  const segment = getWallSegment(wallDocument);
  if (!segment) return null;

  const mask = new pixi.Graphics();
  drawWallIndicatorShape({
    graphics: mask,
    segment,
    half,
    color: getWallIndicatorColor(wallDocument),
    lineWidth: 0,
    lineAlpha: 0,
    fillAlpha: 1.0,
  });
  markWallDisplayObject(mask, wallDocument.id);
  mask.alpha = 1;
  mask.zIndex = 999;
  mask.eventMode = 'none';
  parent?.addChild?.(mask);
  if (!wall._pvSeeThroughMasks) wall._pvSeeThroughMasks = [];
  wall._pvSeeThroughMasks.push(mask);
  return mask;
}

export function clearWallSeeThroughMasks(wall) {
  if (!wall?._pvSeeThroughMasks) return;
  try {
    wall._pvSeeThroughMasks.forEach((mask) => mask.parent?.removeChild(mask));
  } catch (_) {}
  wall._pvSeeThroughMasks = [];
}
