function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

async function loadDefaultVisualEffects() {
  return import('./visual-effects.js');
}

export function getMatchingControlledTokenForRefresh(token, controlledTokens) {
  const tokenId = token?.document?.id;
  if (!tokenId) return null;
  return (
    controlledTokens?.find?.((controlledToken) => controlledToken?.document?.id === tokenId) ?? null
  );
}

export function buildMovedTokenHighlightRequests(tokenDoc, changes, controlledTokens) {
  if (!hasPositionChange(changes)) return [];
  if ((controlledTokens?.length ?? 0) === 0) return [];

  const movedTokenId = tokenDoc?.id;
  const targetPosition = {
    x: changes.x ?? tokenDoc?.x,
    y: changes.y ?? tokenDoc?.y,
  };

  return controlledTokens
    .map((controlledToken) => {
      const tokenId = controlledToken?.document?.id;
      if (!tokenId) return null;
      return {
        tokenId,
        positionOverride: tokenId === movedTokenId ? targetPosition : null,
      };
    })
    .filter(Boolean);
}

export async function refreshSystemHiddenHighlightsForMovedToken(
  tokenDoc,
  changes,
  {
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const requests = buildMovedTokenHighlightRequests(tokenDoc, changes, getControlledTokens());
  if (requests.length === 0) {
    return { refreshed: 0 };
  }

  const { updateSystemHiddenTokenHighlights } = await loadVisualEffects();
  for (const request of requests) {
    await updateSystemHiddenTokenHighlights(request.tokenId, request.positionOverride);
  }

  return { refreshed: requests.length };
}

export async function refreshSystemHiddenHighlightsForRenderedToken(
  token,
  {
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const controlledToken = getMatchingControlledTokenForRefresh(token, getControlledTokens());
  if (!controlledToken) {
    return { refreshed: false };
  }

  const { updateSystemHiddenTokenHighlights } = await loadVisualEffects();
  await updateSystemHiddenTokenHighlights(controlledToken.document.id);
  return { refreshed: true };
}
