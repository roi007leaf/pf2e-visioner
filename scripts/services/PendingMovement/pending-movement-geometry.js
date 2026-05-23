const PENDING_MOVEMENT_MAX_ROUTE_POINTS = 96;
const PENDING_MOVEMENT_MAX_ACTIVE_ROUTE_POINTS = 256;
const PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX = 1;

function tokenDocOf(tokenOrDoc) {
  return tokenOrDoc?.document || tokenOrDoc || null;
}

function tokenDimensions(tokenOrDoc) {
  const doc = tokenDocOf(tokenOrDoc);
  const gridSize = canvas?.grid?.size || 1;
  return {
    width: Number(doc?.width ?? 1) * gridSize,
    height: Number(doc?.height ?? 1) * gridSize,
  };
}

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneMovementPosition(position) {
  const x = finiteCoordinate(position?.x);
  const y = finiteCoordinate(position?.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function movementPositionFromCenter(tokenOrDoc, center) {
  const x = finiteCoordinate(center?.x);
  const y = finiteCoordinate(center?.y);
  if (x === null || y === null) return null;

  const dimensions = tokenDimensions(tokenOrDoc);
  return {
    x: x - dimensions.width / 2,
    y: y - dimensions.height / 2,
  };
}

function movementPositionFromWaypoint(tokenOrDoc, waypoint) {
  if (!waypoint) return null;

  if (Array.isArray(waypoint)) {
    return cloneMovementPosition({ x: waypoint[0], y: waypoint[1] });
  }

  if (waypoint.center) return movementPositionFromCenter(tokenOrDoc, waypoint.center);
  if (waypoint.destination) return cloneMovementPosition(waypoint.destination);
  if (waypoint.position) return cloneMovementPosition(waypoint.position);
  if (waypoint.point) return cloneMovementPosition(waypoint.point);
  if (waypoint.B) return movementPositionFromCenter(tokenOrDoc, waypoint.B);
  if (waypoint.ray?.B) return movementPositionFromCenter(tokenOrDoc, waypoint.ray.B);

  return cloneMovementPosition(waypoint);
}

function movementWaypointArraysFromOptions(options = {}, changes = {}) {
  const hookOptions = options.hookOptions || options.options || null;
  const candidates = [
    options.waypoints,
    options.path,
    options.route,
    options.movement?.waypoints,
    options.movement?.path,
    options.movement?.route,
    options.animation?.waypoints,
    options.animation?.path,
    options.animation?.route,
    options.animation?.movement?.waypoints,
    hookOptions?.waypoints,
    hookOptions?.path,
    hookOptions?.route,
    hookOptions?.movement?.waypoints,
    hookOptions?.movement?.path,
    hookOptions?.movement?.route,
    hookOptions?.animation?.waypoints,
    hookOptions?.animation?.path,
    hookOptions?.animation?.route,
    hookOptions?.animation?.movement?.waypoints,
    changes.waypoints,
    changes.path,
    changes.route,
    changes.movement?.waypoints,
    changes.movement?.path,
    changes.movement?.route,
  ];

  return candidates.filter((candidate) => Array.isArray(candidate) && candidate.length);
}

function pushUniqueMovementPosition(positions, position) {
  if (!position) return;
  if (positions.length && positionsEqual(positions[positions.length - 1], position)) return;
  positions.push(position);
}

function downsampleRoutePoints(routePoints, budget) {
  if (!routePoints?.length || budget <= 0) return [];
  if (routePoints.length <= budget) return routePoints;
  if (budget === 1) return [routePoints[0]];

  const sampled = [];
  let lastIndex = -1;
  for (let index = 0; index < budget; index += 1) {
    const sourceIndex = Math.round(((routePoints.length - 1) * index) / (budget - 1));
    if (sourceIndex === lastIndex) continue;
    sampled.push(routePoints[sourceIndex]);
    lastIndex = sourceIndex;
  }

  return sampled;
}

export function centerForToken(tokenOrDoc, positionOverride = null) {
  if (!tokenOrDoc) return null;

  const doc = tokenDocOf(tokenOrDoc);
  const dimensions = tokenDimensions(tokenOrDoc);

  if (positionOverride) {
    return {
      x: Number(positionOverride.x ?? doc?.x ?? 0) + dimensions.width / 2,
      y: Number(positionOverride.y ?? doc?.y ?? 0) + dimensions.height / 2,
    };
  }

  return (
    tokenOrDoc.center ||
    tokenOrDoc.getCenterPoint?.() || {
      x: Number(doc?.x ?? tokenOrDoc?.x ?? 0) + dimensions.width / 2,
      y: Number(doc?.y ?? tokenOrDoc?.y ?? 0) + dimensions.height / 2,
    }
  );
}

export function positionsEqual(a, b) {
  return a && b && Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

export function tokenVisualMovementPosition(tokenOrDoc) {
  const token = tokenOrDoc?.object || (tokenOrDoc?.document ? tokenOrDoc : null);
  return cloneMovementPosition({ x: token?.x, y: token?.y });
}

export function tokenVisualPositionReached(token, position) {
  if (!token || !position) return true;

  const tokenX = finiteCoordinate(token.x ?? token.document?.x);
  const tokenY = finiteCoordinate(token.y ?? token.document?.y);
  const positionX = finiteCoordinate(position.x);
  const positionY = finiteCoordinate(position.y);
  if (tokenX === null || tokenY === null || positionX === null || positionY === null) return true;

  return (
    Math.abs(tokenX - positionX) <= PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX &&
    Math.abs(tokenY - positionY) <= PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX
  );
}

export function tokenSamplePoints(tokenOrDoc, positionOverride = null) {
  const center = centerForToken(tokenOrDoc, positionOverride);
  if (!center) return [];

  const dimensions = tokenDimensions(tokenOrDoc);
  const x = center.x - dimensions.width / 2;
  const y = center.y - dimensions.height / 2;
  const inset = Math.min(2, dimensions.width / 2, dimensions.height / 2);

  return [
    center,
    { x: x + inset, y: y + inset },
    { x: x + dimensions.width - inset, y: y + inset },
    { x: x + inset, y: y + dimensions.height - inset },
    { x: x + dimensions.width - inset, y: y + dimensions.height - inset },
    { x: x + dimensions.width * 0.5, y: y + inset },
    { x: x + dimensions.width * 0.5, y: y + dimensions.height - inset },
    { x: x + inset, y: y + dimensions.height * 0.5 },
    { x: x + dimensions.width - inset, y: y + dimensions.height * 0.5 },
  ];
}

export function buildPendingMovementRoutePositions(tokenDoc, changes = {}, options = {}) {
  const routePositions = [];
  pushUniqueMovementPosition(
    routePositions,
    tokenVisualMovementPosition(tokenDoc) ||
      cloneMovementPosition({
        x: tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
        y: tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
      }),
  );

  for (const waypoints of movementWaypointArraysFromOptions(options, changes)) {
    for (const waypoint of waypoints) {
      pushUniqueMovementPosition(routePositions, movementPositionFromWaypoint(tokenDoc, waypoint));
    }
  }

  pushUniqueMovementPosition(
    routePositions,
    cloneMovementPosition({
      x: changes.x ?? tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
      y: changes.y ?? tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
    }),
  );
  return routePositions;
}

export function sampleMovementRoutePoints(tokenDoc, routePositions) {
  const gridSize = Math.max(1, Number(canvas?.grid?.size ?? 50));
  const sampleDistance = Math.max(1, gridSize / 2);
  const maxSamplesPerSegment = 32;
  const centers = routePositions.map((position) => centerForToken(tokenDoc, position)).filter(Boolean);
  if (centers.length <= 1) return centers;

  const segmentLengths = [];
  let uncappedPointCount = 1;
  let totalDistance = 0;
  for (let i = 0; i < centers.length - 1; i += 1) {
    const start = centers[i];
    const end = centers[i + 1];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(distance);
    const steps = Math.max(
      1,
      Math.min(maxSamplesPerSegment, Math.ceil(distance / sampleDistance)),
    );
    uncappedPointCount += steps;
    totalDistance += distance;
  }

  if (uncappedPointCount <= PENDING_MOVEMENT_MAX_ROUTE_POINTS || totalDistance <= 0) {
    const routePoints = [];
    for (let i = 0; i < centers.length; i += 1) {
      const start = centers[i];
      const end = centers[i + 1];
      if (!end) {
        routePoints.push(start);
        continue;
      }

      const distance = segmentLengths[i];
      const steps = Math.max(
        1,
        Math.min(maxSamplesPerSegment, Math.ceil(distance / sampleDistance)),
      );
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        routePoints.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        });
      }
    }

    return routePoints;
  }

  const routePoints = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;
  for (let sampleIndex = 0; sampleIndex < PENDING_MOVEMENT_MAX_ROUTE_POINTS; sampleIndex += 1) {
    const distanceAlongRoute =
      (totalDistance * sampleIndex) / (PENDING_MOVEMENT_MAX_ROUTE_POINTS - 1);
    while (
      segmentIndex < segmentLengths.length - 1 &&
      distanceAlongRoute > segmentStartDistance + segmentLengths[segmentIndex]
    ) {
      segmentStartDistance += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }

    const start = centers[segmentIndex];
    const end = centers[segmentIndex + 1] ?? start;
    const segmentLength = segmentLengths[segmentIndex] || 0;
    if (segmentLength <= 0) {
      routePoints.push(start);
    } else {
      const t = (distanceAlongRoute - segmentStartDistance) / segmentLength;
      routePoints.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  return routePoints;
}

export function rebalancePendingMovementRoutePointBudgets(entriesSource) {
  const sourceEntries =
    typeof entriesSource?.values === 'function'
      ? [...entriesSource.values()]
      : [...(entriesSource || [])];
  const entries = sourceEntries.filter((entry) => entry?.routePoints?.length);
  const totalRoutePoints = entries.reduce(
    (total, entry) => total + entry.routePoints.length,
    0,
  );

  if (totalRoutePoints <= PENDING_MOVEMENT_MAX_ACTIVE_ROUTE_POINTS) {
    for (const entry of entries) {
      entry.budgetedRoutePoints = entry.routePoints;
    }
    return;
  }

  const budgets = new Map(entries.map((entry) => [entry, 0]));
  let remainingBudget = PENDING_MOVEMENT_MAX_ACTIVE_ROUTE_POINTS;

  for (const entry of entries) {
    if (remainingBudget <= 0) break;
    budgets.set(entry, 1);
    remainingBudget -= 1;
  }

  for (const entry of entries) {
    if (remainingBudget <= 0) break;
    if (entry.routePoints.length <= 1 || budgets.get(entry) < 1) continue;
    budgets.set(entry, budgets.get(entry) + 1);
    remainingBudget -= 1;
  }

  const weightedEntries = entries
    .map((entry) => ({
      entry,
      weight: Math.max(0, entry.routePoints.length - budgets.get(entry)),
      fraction: 0,
    }))
    .filter(({ weight }) => weight > 0);
  const totalWeight = weightedEntries.reduce((total, { weight }) => total + weight, 0);
  if (remainingBudget > 0 && totalWeight > 0) {
    for (const weightedEntry of weightedEntries) {
      const exactShare = (remainingBudget * weightedEntry.weight) / totalWeight;
      const share = Math.floor(exactShare);
      budgets.set(weightedEntry.entry, budgets.get(weightedEntry.entry) + share);
      weightedEntry.fraction = exactShare - share;
    }

    let unassignedBudget =
      PENDING_MOVEMENT_MAX_ACTIVE_ROUTE_POINTS -
      [...budgets.values()].reduce((total, budget) => total + budget, 0);
    weightedEntries.sort((a, b) => b.fraction - a.fraction);
    for (const { entry } of weightedEntries) {
      if (unassignedBudget <= 0) break;
      if (budgets.get(entry) >= entry.routePoints.length) continue;
      budgets.set(entry, budgets.get(entry) + 1);
      unassignedBudget -= 1;
    }
  }

  for (const entry of entries) {
    entry.budgetedRoutePoints = downsampleRoutePoints(entry.routePoints, budgets.get(entry));
  }
}
