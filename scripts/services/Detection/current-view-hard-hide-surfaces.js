export function currentViewHardHideSurfaces(token) {
  return [
    token?.border,
    token?.effects,
    token?.nameplate,
    token?.bars,
    token?.tooltip,
    token?.levelIndicator,
    token?.targetArrows,
    token?.targetPips,
    token?.turnMarker,
    token?.turnMarker?.mesh,
  ].filter((surface) => surface && 'visible' in surface);
}

export function reassertCurrentViewHardHideSurfaces(
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
) {
  let hidden = 0;
  for (const token of tokens ?? []) {
    if (token?._pvCurrentViewHardHidden !== true) continue;
    for (const surface of currentViewHardHideSurfaces(token)) surface.visible = false;
    hidden += 1;
  }
  return hidden;
}
