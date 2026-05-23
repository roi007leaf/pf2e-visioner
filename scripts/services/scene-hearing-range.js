const PF2E_SYSTEM_ID = 'pf2e';

export function normalizeSceneHearingRange(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readSceneRangeCandidate(scene) {
  if (!scene || typeof scene !== 'object') return null;

  const candidates = [
    () => scene.hearingRange,
    () => scene.value?.hearingRange,
    () => scene.flags?.[PF2E_SYSTEM_ID]?.hearingRange,
    () => scene.value?.flags?.[PF2E_SYSTEM_ID]?.hearingRange,
    () => scene._source?.flags?.[PF2E_SYSTEM_ID]?.hearingRange,
    () => scene.value?._source?.flags?.[PF2E_SYSTEM_ID]?.hearingRange,
    () => scene.getFlag?.(PF2E_SYSTEM_ID, 'hearingRange'),
    () => scene.value?.getFlag?.(PF2E_SYSTEM_ID, 'hearingRange'),
  ];

  for (const read of candidates) {
    try {
      const range = normalizeSceneHearingRange(read());
      if (range !== null) return range;
    } catch {
      /* best effort */
    }
  }

  return null;
}

function sceneIdOf(scene) {
  return scene?.id ?? scene?._id ?? scene?.value?.id ?? scene?.value?._id ?? null;
}

function sceneCollectionValues(scenes) {
  if (!scenes) return [];
  if (Array.isArray(scenes)) return scenes;
  if (Array.isArray(scenes.contents)) return scenes.contents;
  if (typeof scenes.values === 'function') {
    try {
      return Array.from(scenes.values());
    } catch {
      /* fall through */
    }
  }
  if (scenes.value && typeof scenes.value === 'object') return [scenes.value];
  if (typeof scenes === 'object') return Object.values(scenes);
  return [];
}

export function getActiveSceneHearingRange({
  canvasRef = globalThis.canvas,
  gameRef = globalThis.game,
  sceneId = canvasRef?.scene?.id ?? canvasRef?.scene?._id ?? null,
} = {}) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (scene) => {
    if (!scene || typeof scene !== 'object') return;
    const id = sceneIdOf(scene);
    if (sceneId && id && id !== sceneId) return;
    const key = scene;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(scene);
  };

  addCandidate(canvasRef?.scene);

  const scenes = gameRef?.scenes;
  if (sceneId && typeof scenes?.get === 'function') {
    try {
      addCandidate(scenes.get(sceneId));
    } catch {
      /* best effort */
    }
  }
  for (const scene of sceneCollectionValues(scenes)) {
    addCandidate(scene);
  }

  for (const scene of candidates) {
    const range = readSceneRangeCandidate(scene);
    if (range !== null) return range;
  }

  return null;
}

export function applyActiveSceneHearingRangeLimit(range, options = {}) {
  const sceneRange = getActiveSceneHearingRange(options);
  if (sceneRange === null) return range ?? null;
  if (range === null || range === undefined) return sceneRange;

  const numeric = Number(range);
  if (!Number.isFinite(numeric)) return sceneRange;
  if (numeric <= 0) return numeric;
  return Math.min(numeric, sceneRange);
}
