import { FLANKING_SIZE_RULES, findFlankingPair, readFlankingSizeRule } from './flanking-size-rule.js';

const PATCHED = Symbol.for('pf2e-visioner.flankingHighlightPatched');

function resolveLinePoints(renderer, buddy, target, rule) {
  const gridSize = canvas?.grid?.size;
  const pair = findFlankingPair(
    renderer.token?.mechanicalBounds,
    buddy?.mechanicalBounds,
    target?.mechanicalBounds,
    gridSize,
    rule,
  );
  return pair ?? { from: renderer.token.center, to: buddy.center };
}

function drawLine(renderer, from, to) {
  const thickness = CONFIG.Canvas.objectBorderThickness;
  const outline = Math.round(thickness * 1.5);
  const radius = Math.round(thickness * 2);
  const layer = renderer.layer;
  layer.lineStyle(outline, 0, 0.5).moveTo(from.x, from.y).lineTo(to.x, to.y);
  layer.lineStyle(thickness, renderer.lineColor, 0.5).moveTo(from.x, from.y).lineTo(to.x, to.y);
  layer.beginFill(renderer.lineColor).lineStyle(1, 0).drawCircle(from.x, from.y, radius);
  layer.beginFill(renderer.lineColor).lineStyle(1, 0).drawCircle(to.x, to.y, radius);
}

function labelFontSize() {
  const size = canvas.dimensions.size;
  if (size >= 200) return 28;
  if (size < 50) return 20;
  return 24;
}

function drawLabel(renderer, from, to) {
  const midX = Math.round((from.x + to.x) / 2);
  const midY = Math.round((from.y + to.y) / 2);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const perpX = dx <= -dx ? -dy : dy;
  const perpY = dx <= -dx ? dx : -dx;
  const scale = 20 / Math.sqrt(perpX ** 2 + perpY ** 2);
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = labelFontSize();
  style.fill = renderer.lineColor;
  style.stroke = 0;
  const text = new foundry.canvas.containers.PreciseText(renderer.labelText, style);
  text.anchor.set(0.5, 0.5);
  let rotation = Math.atan2(dy, dx);
  if (rotation > Math.PI / 2) rotation -= Math.PI;
  else if (rotation < -Math.PI / 2) rotation += Math.PI;
  text.rotation = rotation;
  text.position.set(midX + Math.round(perpX * scale), midY + Math.round(perpY * scale));
  renderer.layer.addChild(text);
}

export function drawForTargetWithRule(original, renderer, target) {
  const rule = readFlankingSizeRule();
  if (rule === FLANKING_SIZE_RULES.raw) return original.call(renderer, target);
  const buddies = renderer.token.buddiesFlanking(target, { ignoreFlankable: true });
  for (const buddy of buddies) {
    const { from, to } = resolveLinePoints(renderer, buddy, target, rule);
    drawLine(renderer, from, to);
    drawLabel(renderer, from, to);
  }
}

export function ensureFlankingHighlightPatched(tokenObject) {
  const renderer = tokenObject?.flankingHighlight;
  if (!renderer) return false;
  const proto = Object.getPrototypeOf(renderer);
  if (!proto || proto[PATCHED] || typeof proto.drawForTarget !== 'function') return false;
  const original = proto.drawForTarget;
  proto.drawForTarget = function (target) {
    return drawForTargetWithRule(original, this, target);
  };
  proto[PATCHED] = true;
  return true;
}

export function registerFlankingHighlightOriginHooks() {
  Hooks.on('drawToken', (tokenObject) => ensureFlankingHighlightPatched(tokenObject));
}
