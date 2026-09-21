import { hasActivePendingTokenMovement } from '../movement-tracking.js';

export const HEARING_RECHECK_INTERVAL_MS = 100;

const hearingResults = new Map();

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function pairKey(observerToken, targetToken) {
  const observerId = observerToken?.document?.id ?? observerToken?.id ?? '';
  const targetId = targetToken?.document?.id ?? targetToken?.id ?? '';
  return `${observerId}:${targetId}`;
}

function staggerOffset(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % HEARING_RECHECK_INTERVAL_MS;
}

function usesHearingCache(modeId, visibility) {
  if (modeId !== 'hearing') return false;
  return visibility === 'observed' || visibility === 'concealed';
}

function testPointCoords(test) {
  const point = test?.point ?? test;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function centerMostTest(tests, targetToken) {
  if (!Array.isArray(tests) || tests.length <= 1) return tests;
  const cx = Number(targetToken?.center?.x);
  const cy = Number(targetToken?.center?.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [tests[0]];
  let best = tests[0];
  let bestDistance = Infinity;
  for (const test of tests) {
    const point = testPointCoords(test);
    if (!point) continue;
    const distance = (point.x - cx) ** 2 + (point.y - cy) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = test;
    }
  }
  return [best];
}

export function clearDuringMoveHearingCache() {
  hearingResults.clear();
}

export function cachedHearingPointTestDuringMove(
  observerToken,
  targetToken,
  modeId,
  visibility,
  config,
  runPointTests,
) {
  if (!usesHearingCache(modeId, visibility)) return runPointTests(config);
  if (!hasActivePendingTokenMovement()) {
    clearDuringMoveHearingCache();
    return runPointTests(config);
  }
  const key = pairKey(observerToken, targetToken);
  const at = now();
  const hit = hearingResults.get(key);
  if (hit && at - hit.at < HEARING_RECHECK_INTERVAL_MS) return hit.value;
  const value = runPointTests({ ...config, tests: centerMostTest(config?.tests, targetToken) });
  hearingResults.set(key, { value, at: hit ? at : at - staggerOffset(key) });
  return value;
}
