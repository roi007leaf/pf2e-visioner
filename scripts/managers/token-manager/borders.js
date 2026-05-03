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
