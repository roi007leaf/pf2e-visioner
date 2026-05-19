export async function applyWallSightUpdates({
  updates,
  scene,
  perception,
  refreshTokens,
  tokens = [],
} = {}) {
  if (!updates?.length) return false;

  await scene?.updateEmbeddedDocuments?.('Wall', updates, { diff: false });
  perception?.update?.({
    refreshVision: true,
    refreshOcclusion: true,
  });
  refreshTokens?.(tokens);
  return true;
}
