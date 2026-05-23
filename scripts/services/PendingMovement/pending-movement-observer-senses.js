import {
  actorHasConditionSlug,
  observerCanHearTarget,
} from '../sense-distance.js';

export {
  actorHasConditionSlug,
  observerCanHearTarget,
};

function tokenDocOf(tokenOrDoc) {
  return tokenOrDoc?.document || tokenOrDoc || null;
}

function actorOf(tokenOrDoc) {
  return tokenOrDoc?.actor || tokenDocOf(tokenOrDoc)?.actor || null;
}

function getTokenDimensions(tokenOrDoc) {
  const doc = tokenDocOf(tokenOrDoc);
  return {
    width: Number(doc?.width ?? tokenOrDoc?.width ?? 1) || 1,
    height: Number(doc?.height ?? tokenOrDoc?.height ?? 1) || 1,
  };
}

function getGridSize() {
  return Number(canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100) || 100;
}

function getPositionCenter(tokenOrDoc, position) {
  const { width, height } = getTokenDimensions(tokenOrDoc);
  const gridSize = getGridSize();
  const doc = tokenDocOf(tokenOrDoc);
  const x = Number(position?.x ?? doc?.x ?? tokenOrDoc?.x ?? 0) || 0;
  const y = Number(position?.y ?? doc?.y ?? tokenOrDoc?.y ?? 0) || 0;

  return {
    x: x + (width * gridSize) / 2,
    y: y + (height * gridSize) / 2,
    elevation: Number(position?.elevation ?? doc?.elevation ?? tokenOrDoc?.elevation ?? 0) || 0,
  };
}

function calculateProxyDistanceInFeet(firstToken, secondToken) {
  const gridSize = getGridSize();
  const gridDistance = Number(canvas?.scene?.grid?.distance ?? 5) || 5;
  const first = firstToken?.center || getPositionCenter(firstToken);
  const second = secondToken?.center || getPositionCenter(secondToken);
  const dx = Math.abs((second?.x ?? 0) - (first?.x ?? 0));
  const dy = Math.abs((second?.y ?? 0) - (first?.y ?? 0));
  const gridX = Math.round(dx / gridSize);
  const gridY = Math.round(dy / gridSize);
  const diagonal = Math.min(gridX, gridY);
  const straight = Math.abs(gridX - gridY);
  const fullDiagonalPairs = Math.floor(diagonal / 2);
  const remainingDiagonal = diagonal % 2;
  const distance =
    fullDiagonalPairs * 3 * gridDistance +
    remainingDiagonal * gridDistance +
    straight * gridDistance;

  return Math.floor(distance / gridDistance) * gridDistance;
}

export function observerHasUsableSight(observer) {
  const doc = tokenDocOf(observer);
  if (actorHasConditionSlug(actorOf(observer), 'blinded')) return false;

  const sightEnabled = doc?.sight?.enabled ?? doc?.vision?.enabled ?? doc?.vision;
  if (sightEnabled === false) return false;

  const sightRange = Number(doc?.sight?.range ?? doc?.vision?.range ?? Infinity);
  return sightRange !== 0;
}

export function createPositionedTokenProxy(tokenOrDoc, position, { getTokenObjectForDocument } = {}) {
  const doc = tokenDocOf(tokenOrDoc);
  if (!doc) return tokenOrDoc;

  const token = tokenOrDoc?.document
    ? tokenOrDoc
    : getTokenObjectForDocument?.(doc) || tokenOrDoc;
  const x = Number(position?.x ?? doc.x ?? token?.x ?? 0) || 0;
  const y = Number(position?.y ?? doc.y ?? token?.y ?? 0) || 0;
  const elevation = Number(position?.elevation ?? doc.elevation ?? token?.elevation ?? 0) || 0;
  const center = getPositionCenter(doc, { x, y, elevation });
  let tokenProxy = null;

  const originFactory = () => () => ({ ...center });
  const docProxy = new Proxy(doc, {
    get(target, prop) {
      if (prop === 'x') return x;
      if (prop === 'y') return y;
      if (prop === 'elevation') return elevation;
      if (prop === 'object') return tokenProxy || target.object;
      if (
        prop === 'getMovementOrigin' ||
        prop === 'getVisionOrigin' ||
        prop === 'getSoundOrigin' ||
        prop === 'getLightOrigin' ||
        prop === 'getCenterPoint'
      ) {
        return originFactory();
      }

      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  tokenProxy = new Proxy(token || {}, {
    get(target, prop) {
      if (prop === 'document') return docProxy;
      if (prop === 'x') return x;
      if (prop === 'y') return y;
      if (prop === 'center') return center;
      if (prop === 'elevation') return elevation;
      if (prop === 'id') return doc.id;
      if (prop === 'name') return doc.name ?? target.name;
      if (prop === 'actor') return target.actor ?? doc.actor;
      if (prop === 'getCenterPoint') return () => ({ ...center });
      if (prop === 'distanceTo') return (other) => calculateProxyDistanceInFeet(tokenProxy, other);

      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return tokenProxy;
}
