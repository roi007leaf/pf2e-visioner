export function isWallHeightActive() {
  return !!game.modules?.get('wall-height')?.active;
}

export function getWallElevationBounds(wallDocument) {
  if (!isWallHeightActive()) {
    return null;
  }

  try {
    const flagData = wallDocument.flags?.['wall-height'];
    if (flagData && typeof flagData.top === 'number' && typeof flagData.bottom === 'number') {
      const bottom = Number(flagData.bottom);
      const top = Number(flagData.top);
      
      if (Number.isFinite(bottom) && Number.isFinite(top)) {
        return { bottom, top };
      }
    }
    
    const bounds = window.WallHeight?.getSourceElevationBounds?.(wallDocument);
    
    if (!bounds) {
      return null;
    }

    const bottom = Number(bounds.bottom);
    const top = Number(bounds.top);

    if (!Number.isFinite(bottom) || !Number.isFinite(top)) {
      return null;
    }

    return { bottom, top };
  } catch (error) {
    return null;
  }
}

export function doesWallBlockAtElevation(wallDocument, elevationRange) {
  const wallBounds = getWallElevationBounds(wallDocument);

  if (!wallBounds) {
    return true;
  }

  const wallBottom = wallBounds.bottom;
  const wallTop = wallBounds.top;

  const rangeBottom =
    typeof elevationRange === 'object' ? elevationRange.bottom : elevationRange;
  const rangeTop = typeof elevationRange === 'object' ? elevationRange.top : elevationRange;

  if (rangeBottom >= wallTop) {
    return false;
  }

  if (rangeTop <= wallBottom) {
    return false;
  }

  return true;
}

export function doesWallBlockLineOfSight(wallDocument, attackerSpan, targetSpan, t) {
  const wallBounds = getWallElevationBounds(wallDocument);

  if (!wallBounds) {
    return true;
  }

  const attackerMid = (attackerSpan.bottom + attackerSpan.top) / 2;
  const targetMid = (targetSpan.bottom + targetSpan.top) / 2;
  const sightZ = attackerMid + t * (targetMid - attackerMid);

  if (sightZ >= wallBounds.top) {
    return false;
  }
  if (sightZ <= wallBounds.bottom) {
    return false;
  }

  return true;
}
