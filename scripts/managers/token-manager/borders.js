/**
 * Token border utilities for VisionerTokenManager
 */

export function addTokenBorder(token, strong = false) {
  if (!token) return;
  removeTokenBorder(token);
  const border = new PIXI.Graphics();
  const padding = 4;
  const borderColor = strong ? 0xffd700 : 0xffa500;
  const borderWidth = strong ? 3 : 2;
  const alpha = strong ? 0.9 : 0.7;
  const tokenWidth = token.w;
  const tokenHeight = token.h;
  border.lineStyle(borderWidth, borderColor, alpha);
  border.drawRoundedRect(
    -tokenWidth / 2 - padding,
    -tokenHeight / 2 - padding,
    tokenWidth + padding * 2,
    tokenHeight + padding * 2,
    8,
  );
  border.x = token.document.x + tokenWidth / 2;
  border.y = token.document.y + tokenHeight / 2;
  canvas.tokens.addChild(border);
  token._highlightBorder = border;
}

export function removeTokenBorder(token) {
  if (token?._highlightBorder) {
    try {
      if (token._highlightBorder.parent) {
        token._highlightBorder.parent.removeChild(token._highlightBorder);
      }
    } catch (_) { }
    try {
      token._highlightBorder.destroy();
    } catch (_) { }
    delete token._highlightBorder;
  }
}
