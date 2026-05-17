import autoCoverSystem from './AutoCoverSystem.js';
import { getCoverMap } from '../../utils.js';

function getTokenId(token) {
  return token?.document?.id || token?.id || null;
}

export function getCoverOverlayState(sourceToken, targetToken) {
  const targetId = getTokenId(targetToken);
  if (!sourceToken || !targetToken || !targetId) {
    return { state: 'none', isManualCover: false };
  }

  try {
    const manualCover = getCoverMap(sourceToken)?.[targetId];
    if (manualCover && manualCover !== 'none') {
      return { state: manualCover, isManualCover: true };
    }
  } catch {
    // Fall back to live auto-cover detection below.
  }

  try {
    const state = autoCoverSystem.detectCoverBetweenTokens(sourceToken, targetToken) || 'none';
    return { state, isManualCover: false };
  } catch {
    return { state: 'none', isManualCover: false };
  }
}
