/**
 * Token border utilities for VisionerTokenManager
 */

export function addTokenBorder(token, strong = false, options = {}) {
  if (!token) return;

  const key = options.key || '_highlightBorder';
  let border = token[key];
  if (!border) {
    border = new PIXI.Graphics();
    token[key] = border;
    canvas.tokens.addChild(border);
  } else {
    border.clear();
  }

  const padding = options.padding ?? 4;
  const borderColor = options.color ?? (strong ? 0xffd700 : 0xffa500);
  const borderWidth = options.width ?? (strong ? 3 : 2);
  const alpha = options.alpha ?? (strong ? 0.9 : 0.7);
  const radius = options.radius ?? 8;
  const tokenWidth = token.document.width * canvas.grid.size;
  const tokenHeight = token.document.height * canvas.grid.size;
  border.lineStyle(borderWidth, borderColor, alpha);
  border.drawRoundedRect(
    -tokenWidth / 2 - padding,
    -tokenHeight / 2 - padding,
    tokenWidth + padding * 2,
    tokenHeight + padding * 2,
    radius,
  );
  border.x = token.document.x + tokenWidth / 2;
  border.y = token.document.y + tokenHeight / 2;
}

export function removeTokenBorder(token, options = {}) {
  const key = options.key || '_highlightBorder';
  if (token?.[key]) {
    try {
      if (token[key].parent) {
        token[key].parent.removeChild(token[key]);
      }
    } catch (_) {}
    try {
      token[key].destroy();
    } catch (_) {}
    delete token[key];
  }
}

export function computeTokenLabelZoomScale(zoom) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  return Math.max(0.25, Math.min(5, Math.pow(1 / safeZoom, 1.15)));
}

export function addTokenLabel(token, text, options = {}) {
  if (!token || !text) return;

  const key = options.key || '_highlightLabel';
  removeTokenLabel(token, { key });

  const container = new PIXI.Container();
  const fontSize = options.fontSize ?? 13;
  const paddingX = options.paddingX ?? 7;
  const paddingY = options.paddingY ?? 4;
  const style = new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize,
    fontWeight: 'bold',
    fill: options.textColor ?? 0xffffff,
    stroke: 0x000000,
    strokeThickness: 2,
  });
  const label = new PIXI.Text(text, style);
  label.anchor.set(0.5, 0.5);

  const background = new PIXI.Graphics();
  background.beginFill(options.backgroundColor ?? 0x111111, options.backgroundAlpha ?? 0.92);
  background.lineStyle(2, options.borderColor ?? 0xffffff, 1);
  background.drawRoundedRect(
    -label.width / 2 - paddingX,
    -label.height / 2 - paddingY,
    label.width + paddingX * 2,
    label.height + paddingY * 2,
    options.radius ?? 6,
  );
  background.endFill();

  container.addChild(background, label);
  container.zIndex = 10000;
  container.interactive = false;
  container.interactiveChildren = false;

  const offset = options.offset ?? 16;
  const updateForZoom = (requestedZoom) => {
    const numericZoom = Number(requestedZoom);
    const zoom = Number.isFinite(numericZoom) && numericZoom > 0
      ? numericZoom
      : canvas?.stage?.scale?.x || 1;
    const zoomScale = computeTokenLabelZoomScale(zoom);
    if (container._pvZoomScale !== zoomScale) {
      container.scale.set(zoomScale);
      container._pvZoomScale = zoomScale;
    }
    const tokenWidth = token.document.width * canvas.grid.size;
    const tokenHeight = token.document.height * canvas.grid.size;
    container.x = token.document.x + tokenWidth / 2;
    container.y =
      options.position === 'bottom'
        ? token.document.y + tokenHeight + offset * zoomScale
        : token.document.y - offset * zoomScale;
  };
  updateForZoom();

  const ticker = canvas?.app?.ticker;
  if (ticker?.add) {
    const tick = () => updateForZoom();
    container._pvZoomTicker = ticker;
    container._pvZoomUpdater = tick;
    ticker.add(tick);
  }
  container._pvApplyZoom = updateForZoom;

  token[key] = container;
  canvas.tokens.addChild(container);
}

export function removeTokenLabel(token, options = {}) {
  const key = options.key || '_highlightLabel';
  const label = token?.[key];
  if (!label) return;
  try {
    label._pvZoomTicker?.remove?.(label._pvZoomUpdater);
  } catch (_) {}
  try {
    if (label.parent) label.parent.removeChild(label);
  } catch (_) {}
  try {
    label.destroy({ children: true });
  } catch (_) {}
  delete token[key];
}

export function updateTokenLabelZoom(token, zoom, options = {}) {
  const key = options.key || '_highlightLabel';
  token?.[key]?._pvApplyZoom?.(zoom);
}
