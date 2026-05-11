function getWallSenseTypes() {
  return (
    globalThis.CONST?.EDGE_SENSE_TYPES ??
    globalThis.CONST?.WALL_SENSE_TYPES ?? {
      NONE: 0,
      LIMITED: 10,
      NORMAL: 20,
      PROXIMITY: 30,
      DISTANCE: 40,
    }
  );
}

function getSceneDistanceScale() {
  const gridSize =
    Number(globalThis.canvas?.grid?.size) ||
    Number(globalThis.canvas?.scene?.grid?.size) ||
    Number(globalThis.canvas?.dimensions?.size) ||
    100;
  const gridDistance =
    Number(globalThis.canvas?.scene?.grid?.distance) ||
    Number(globalThis.canvas?.grid?.distance) ||
    Number(globalThis.canvas?.dimensions?.distance) ||
    5;

  return {
    gridSize: Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 100,
    gridDistance: Number.isFinite(gridDistance) && gridDistance > 0 ? gridDistance : 5,
  };
}

function pixelsToSceneUnits(pixels) {
  const { gridSize, gridDistance } = getSceneDistanceScale();
  return (pixels / gridSize) * gridDistance;
}

export function pixelsToWallSenseUnits(pixels) {
  return pixelsToSceneUnits(pixels);
}

export function distancePointToSegment(point, coords) {
  const [x1, y1, x2, y2] = coords.map((value) => Number(value));
  const px = Number(point?.x);
  const py = Number(point?.y);

  if (![x1, y1, x2, y2, px, py].every(Number.isFinite)) {
    return Infinity;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

export function getWallSenseThreshold(wallDocument, senseType = 'sight') {
  const candidates = [
    wallDocument?.threshold?.[senseType],
    wallDocument?.threshold?.sight,
    wallDocument?.threshold?.vision,
    wallDocument?.threshold?.sound,
    wallDocument?.threshold?.senses,
    wallDocument?.threshold?.wall,
    wallDocument?.threshold,
    wallDocument?.[`${senseType}Threshold`],
    wallDocument?.[`${senseType}Distance`],
    wallDocument?.sightThreshold,
    wallDocument?.sightDistance,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'object' && candidate !== null) {
      const nested = Number(candidate.sight ?? candidate.vision ?? candidate.value);
      if (Number.isFinite(nested) && nested >= 0) return nested;
      continue;
    }

    const threshold = Number(candidate);
    if (Number.isFinite(threshold) && threshold >= 0) return threshold;
  }

  return 0;
}

export function getWallSightThreshold(wallDocument) {
  return getWallSenseThreshold(wallDocument, 'sight');
}

function getWallThresholdAttenuation(wallDocument) {
  return wallDocument?.threshold?.attenuation === true || wallDocument?.thresholdAttenuation === true;
}

export function doesWallSenseBlockFromPoint(
  wallDocument,
  sourcePoint,
  coords,
  senseType = 'sight',
  debugContext = {},
) {
  const senseTypes = getWallSenseTypes();
  const wallSense = Number(wallDocument?.[senseType] ?? senseTypes.NONE);

  if (wallSense === senseTypes.NONE) return false;
  if (wallSense === senseTypes.PROXIMITY || wallSense === senseTypes.DISTANCE) {
    const threshold = getWallSenseThreshold(wallDocument, senseType);
    const distancePixels = distancePointToSegment(sourcePoint, coords);
    const distanceFeet = pixelsToSceneUnits(distancePixels);
    const isWithinThreshold = distanceFeet <= threshold;
    let blocks = wallSense === senseTypes.PROXIMITY ? !isWithinThreshold : isWithinThreshold;
    const attenuationApplies =
      !blocks && senseType !== 'sound' && getWallThresholdAttenuation(wallDocument);

    if (attenuationApplies) {
      const targetPoint = debugContext?.toPoint ?? debugContext?.targetPoint ?? null;
      const targetDistancePixels = targetPoint ? distancePointToSegment(targetPoint, coords) : 0;
      const targetDistanceFeet = pixelsToSceneUnits(targetDistancePixels);
      const penetrationFeet =
        wallSense === senseTypes.PROXIMITY
          ? Math.max(0, threshold - distanceFeet)
          : Math.max(0, distanceFeet - threshold);

      blocks = targetDistanceFeet > penetrationFeet;
    }

    return blocks;
  }

  return true;
}

export { getWallSenseTypes };
