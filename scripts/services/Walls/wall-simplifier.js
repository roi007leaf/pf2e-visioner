const WALL_DIRECTION_BOTH = 0;

function wallSource(doc) {
  const source = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  return source;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function wallSignature(doc) {
  const { _id, c, ...rest } = wallSource(doc);
  return stableStringify(rest);
}

export function isSimplifiableWall(doc) {
  if (!doc) return false;
  if (Number(doc.door ?? 0) !== 0) return false;
  if (Number(doc.dir ?? WALL_DIRECTION_BOTH) !== WALL_DIRECTION_BOTH) return false;
  return Array.isArray(doc.c) && doc.c.length === 4;
}

function pointKey(x, y) {
  return `${x},${y}`;
}

function endpoints(doc) {
  const [x1, y1, x2, y2] = doc.c;
  return [
    [x1, y1],
    [x2, y2],
  ];
}

function buildEndpointIndex(docs) {
  const index = new Map();
  for (const doc of docs) {
    for (const [x, y] of endpoints(doc)) {
      const key = pointKey(x, y);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(doc);
    }
  }
  return index;
}

function otherEndpoint(doc, key) {
  const [a, b] = endpoints(doc);
  return pointKey(a[0], a[1]) === key ? b : a;
}

function nextChainWall(index, key, current, signature, used) {
  const atJoint = index.get(key) ?? [];
  if (atJoint.length !== 2) return null;
  const next = atJoint.find((doc) => doc !== current);
  if (!next || used.has(next) || wallSignature(next) !== signature) return null;
  return next;
}

function extendChain(points, docs, start, index, signature, used, forward) {
  let current = start;
  let [x, y] = forward ? endpoints(start)[1] : endpoints(start)[0];
  let key = pointKey(x, y);
  for (;;) {
    const next = nextChainWall(index, key, current, signature, used);
    if (!next) return;
    used.add(next);
    const [nx, ny] = otherEndpoint(next, key);
    if (forward) {
      points.push([nx, ny]);
      docs.push(next);
    } else {
      points.unshift([nx, ny]);
      docs.unshift(next);
    }
    current = next;
    key = pointKey(nx, ny);
  }
}

export function buildWallChains(wallDocs) {
  const docs = (wallDocs ?? []).filter(isSimplifiableWall);
  const index = buildEndpointIndex(docs);
  const used = new Set();
  const chains = [];
  for (const doc of docs) {
    if (used.has(doc)) continue;
    used.add(doc);
    const signature = wallSignature(doc);
    const points = endpoints(doc);
    const chainDocs = [doc];
    extendChain(points, chainDocs, doc, index, signature, used, true);
    extendChain(points, chainDocs, doc, index, signature, used, false);
    chains.push({ points, docs: chainDocs, signature });
  }
  return chains;
}

function perpendicularDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  return Math.abs(dx * (a[1] - point[1]) - (a[0] - point[0]) * dy) / length;
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = -1;
  let splitAt = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitAt = i;
    }
  }
  if (maxDistance <= tolerance) return [first, last];
  const left = douglasPeucker(points.slice(0, splitAt + 1), tolerance);
  const right = douglasPeucker(points.slice(splitAt), tolerance);
  return left.slice(0, -1).concat(right);
}

function isClosedChain(points) {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function farthestPointIndex(points, from) {
  let best = 1;
  let bestDistance = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = Math.hypot(points[i][0] - from[0], points[i][1] - from[1]);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export function simplifyChainPoints(points, tolerance) {
  if (!isClosedChain(points)) return douglasPeucker(points, tolerance);
  const splitAt = farthestPointIndex(points, points[0]);
  const left = douglasPeucker(points.slice(0, splitAt + 1), tolerance);
  const right = douglasPeucker(points.slice(splitAt), tolerance);
  return left.slice(0, -1).concat(right);
}

function segmentsFromPoints(points, template) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    segments.push({ ...template, c: [x1, y1, x2, y2] });
  }
  return segments;
}

function chainTemplate(chain) {
  const { _id, c, ...rest } = wallSource(chain.docs[0]);
  return rest;
}

export function planWallSimplification(wallDocs, { tolerance = 10 } = {}) {
  const chains = buildWallChains(wallDocs);
  const deleteIds = [];
  const creates = [];
  let unchangedChains = 0;
  for (const chain of chains) {
    const simplified = simplifyChainPoints(chain.points, Math.max(0, Number(tolerance) || 0));
    if (simplified.length - 1 >= chain.docs.length) {
      unchangedChains++;
      continue;
    }
    for (const doc of chain.docs) deleteIds.push(doc.id ?? doc._id);
    creates.push(...segmentsFromPoints(simplified, chainTemplate(chain)));
  }
  const total = (wallDocs ?? []).length;
  return {
    tolerance,
    before: total,
    after: total - deleteIds.length + creates.length,
    deleteIds,
    creates,
    chains: chains.length,
    unchangedChains,
  };
}
