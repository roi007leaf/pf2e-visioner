import {
  actorHasConditionSlug,
  observerCanHearTarget,
} from '../sense-distance.js';
import { VisionAnalyzer } from '../../visibility/auto-visibility/VisionAnalyzer.js';

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

function normalizeSenseCollection(senses) {
  if (!senses) return [];
  if (Array.isArray(senses)) return senses;
  if (Array.isArray(senses.contents)) return senses.contents;
  if (typeof senses.values === 'function') {
    try {
      return Array.from(senses.values());
    } catch {
      return [];
    }
  }
  if (typeof senses[Symbol.iterator] === 'function') {
    try {
      return Array.from(senses);
    } catch {
      return [];
    }
  }
  if (typeof senses === 'object') {
    return Object.entries(senses).map(([type, sense]) => ({
      ...(sense && typeof sense === 'object' ? sense : {}),
      type: sense?.type ?? sense?.slug ?? sense?.id ?? type,
    }));
  }
  return [];
}

function hasExplicitVisualSense(senses) {
  return normalizeSenseCollection(senses).some((sense) => {
    const type = String(sense?.type ?? sense?.slug ?? sense?.id ?? sense ?? '').toLowerCase();
    return (
      type === 'vision' ||
      type === 'sight' ||
      type === 'basic-sight' ||
      type === 'basicsight' ||
      type === 'darkvision' ||
      type === 'greater-darkvision' ||
      type === 'greaterdarkvision' ||
      type === 'low-light-vision' ||
      type === 'lowlightvision'
    );
  });
}

function actorExplicitlyProvidesSight(observer) {
  const actor = actorOf(observer);
  const perception = actor?.system?.perception;
  if (perception?.vision === false) return false;
  if (perception?.vision === true) return true;
  return hasExplicitVisualSense(perception?.senses) || hasExplicitVisualSense(actor?.perception?.senses);
}

function observerHasActorVisionCapability(observer) {
  if (!actorExplicitlyProvidesSight(observer)) return false;

  try {
    const capabilities = VisionAnalyzer.getInstance()?.getVisionCapabilities?.(observer);
    if (!capabilities) return false;
    if (capabilities.hasVision === true) return true;
    if (capabilities.hasDarkvision === true) return true;
    if (capabilities.hasLowLightVision === true) return true;
    if (capabilities.hasGreaterDarkvision === true) return true;

    const preciseSenses = capabilities.sensingSummary?.precise || [];
    return preciseSenses.some((sense) => {
      const type = String(sense?.type ?? sense ?? '').toLowerCase();
      return (
        type === 'vision' ||
        type === 'sight' ||
        type === 'basic-sight' ||
        type === 'basicsight' ||
        type === 'darkvision' ||
        type === 'greater-darkvision' ||
        type === 'greaterdarkvision' ||
        type === 'low-light-vision' ||
        type === 'lowlightvision'
      );
    });
  } catch {
    return false;
  }
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

function calculateProxyDistanceInFeet(firstToken, secondToken, nativeDistanceTo = null) {
  if (typeof nativeDistanceTo === 'function') {
    try {
      const nativeDistance = Number(nativeDistanceTo.call(firstToken, secondToken));
      if (Number.isFinite(nativeDistance)) return nativeDistance;
    } catch (_) {}
  }

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
  if (sightRange !== 0) return true;
  if (observerHasActorVisionCapability(observer)) return true;

  const token = observer?.object || (observer?.document ? observer : null);
  if (!token) return false;
  const visionSource = token.vision || token.visionSource;
  if (visionSource?.active && visionSource?.los) return true;
  for (const source of canvas?.effects?.visionSources?.values?.() ?? []) {
    if (source?.active && source?.object && source.object === token) return true;
  }
  return false;
}

export function createPositionedTokenProxy(tokenOrDoc, position, { getTokenObjectForDocument } = {}) {
  const doc = tokenDocOf(tokenOrDoc);
  if (!doc) return tokenOrDoc;

  const token = tokenOrDoc?.document
    ? tokenOrDoc
    : getTokenObjectForDocument?.(doc) || tokenOrDoc;
  const nativeDistanceTo = typeof token?.distanceTo === 'function' ? token.distanceTo : null;
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
      if (prop === 'getVisibilityTestPoints') {
        return () => [{ ...center }];
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
      if (prop === 'distanceTo') {
        return (other) => calculateProxyDistanceInFeet(tokenProxy, other, nativeDistanceTo);
      }

      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return tokenProxy;
}
