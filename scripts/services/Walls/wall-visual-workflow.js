import { MODULE_ID } from '../../constants.js';
import { refreshTokenVisuals } from '../token-visual-refresh.js';
import { updateHiddenTokenEchoes } from '../hidden-token-echoes.js';
import { cleanupWallHiddenIndicatorReferences } from './wall-indicator-cleanup.js';
import {
  clearWallSeeThroughMasks,
  getWallSegment,
  replaceHiddenWallIndicator,
} from './wall-indicator-rendering.js';
import { buildHiddenWallSightUpdate } from './wall-sight-policy.js';
import { applyWallSightUpdates } from './wall-visual-update-application.js';
import {
  controlledTokenCanSeeWall,
  expandObservedWallIds,
  getHiddenIndicatorHalf,
  getObservedWallIds,
  getWallMapForObserver,
  isHiddenWallDocument,
  resolveControlledWallObserver,
  resolveStrictControlledWallObserver,
} from './wall-visual-state.js';

function getDefaultConnectedWallDocsBySourceId() {
  return import('./connected-walls.js').then((module) => module.getConnectedWallDocsBySourceId);
}

export function resolveStandardWallVisualObserver({ observerId = null, tokensLayer } = {}) {
  const { observer, allowed } = resolveControlledWallObserver({ observerId, tokensLayer });
  return { observer, allowed, clearIndicators: false };
}

export function resolveStrictWallVisualObserver({ observerId = null, tokensLayer } = {}) {
  const observer = resolveStrictControlledWallObserver({ observerId, tokensLayer });
  return { observer, allowed: !!observer, clearIndicators: !observer };
}

export function shouldRenderObserverWallIndicator({ wallDocument, wallMap } = {}) {
  return wallMap?.[wallDocument?.id] === 'observed';
}

export function shouldRenderControlledWallIndicator({
  wallDocument,
  canvasLayer = globalThis.canvas,
  gameRef = globalThis.game,
  moduleId = MODULE_ID,
} = {}) {
  const controlledToken = canvasLayer?.tokens?.controlled?.[0] || null;
  return controlledTokenCanSeeWall(controlledToken, wallDocument?.id, gameRef?.user, moduleId);
}

export async function getExpandedObservedWallIds({
  wallMap,
  walls,
  getConnectedWallDocsBySourceId = getDefaultConnectedWallDocsBySourceId,
} = {}) {
  const observedWallIds = getObservedWallIds(wallMap);
  try {
    const resolver = await getConnectedWallDocsBySourceId();
    return expandObservedWallIds({
      observedWallIds,
      walls,
      getConnectedWallDocsBySourceId: resolver,
    });
  } catch (_) {
    return observedWallIds;
  }
}

function resolveRenderOptions(renderOptions, { canvasLayer }) {
  return typeof renderOptions === 'function' ? renderOptions({ canvasLayer }) : renderOptions;
}

function cleanupWallIndicators(walls) {
  for (const wall of walls || []) {
    cleanupWallHiddenIndicatorReferences(wall);
  }
}

function maybeAddSightRestore({ updates, isGM, applySightUpdates, wallDocument, moduleId }) {
  if (!isGM || !applySightUpdates) return;
  const restoreUpdate = buildHiddenWallSightUpdate({
    wallDocument,
    moduleId,
  });
  if (restoreUpdate) updates.push(restoreUpdate);
}

export async function runWallVisualWorkflow({
  observerId = null,
  moduleId = MODULE_ID,
  canvasLayer = globalThis.canvas,
  gameRef = globalThis.game,
  isPanning = () => false,
  skipDuringPan = false,
  resolveObserver = resolveStandardWallVisualObserver,
  shouldRenderIndicator = shouldRenderObserverWallIndicator,
  renderOptions = {},
  applySightUpdates = true,
  updateEchoes = true,
  refreshTokens = refreshTokenVisuals,
  getConnectedWallDocsBySourceId = getDefaultConnectedWallDocsBySourceId,
} = {}) {
  try {
    if (skipDuringPan && isPanning()) return { skipped: 'panning' };

    if (!gameRef?.settings?.get?.(moduleId, 'hiddenWallsEnabled')) {
      return { skipped: 'disabled' };
    }

    const walls = canvasLayer?.walls?.placeables || [];
    if (!walls.length) return { processed: 0 };

    const observerResult = resolveObserver({
      observerId,
      tokensLayer: canvasLayer.tokens,
      canvasLayer,
      gameRef,
      moduleId,
    });
    const observer = observerResult?.observer || null;
    if (!observerResult?.allowed) {
      if (observerResult?.clearIndicators) cleanupWallIndicators(walls);
      return { skipped: 'observer' };
    }

    const updates = [];
    const isGM = !!gameRef?.user?.isGM;
    const wallMap = getWallMapForObserver(observer, moduleId);
    const expandedObserved = await getExpandedObservedWallIds({
      wallMap,
      walls,
      getConnectedWallDocsBySourceId,
    });

    for (const wall of walls) {
      const wallDocument = wall.document;
      if (!wallDocument) continue;

      const flagHidden = isHiddenWallDocument(wallDocument, moduleId);
      cleanupWallHiddenIndicatorReferences(wall);

      const isExpandedObserved = expandedObserved.has(wallDocument.id);
      if (!flagHidden && !isExpandedObserved) {
        maybeAddSightRestore({
          updates,
          isGM,
          applySightUpdates,
          wallDocument,
          moduleId,
        });
        continue;
      }

      try {
        if (!getWallSegment(wallDocument)) continue;

        const renderIndicator = shouldRenderIndicator({
          wall,
          wallDocument,
          observer,
          wallMap,
          expandedObserved,
          canvasLayer,
          gameRef,
          moduleId,
        });

        if (renderIndicator) {
          replaceHiddenWallIndicator({
            wall,
            half: getHiddenIndicatorHalf(canvasLayer?.scene, moduleId),
            ...resolveRenderOptions(renderOptions, { canvasLayer }),
          });
        }

        if (wall._pvSeeThroughMasks) {
          clearWallSeeThroughMasks(wall);
        }

        if (isGM && applySightUpdates) {
          const sightUpdate = buildHiddenWallSightUpdate({
            wallDocument,
            moduleId,
            sceneTokens: canvasLayer.tokens?.placeables || [],
          });
          if (sightUpdate) updates.push(sightUpdate);
        }
      } catch (_) {}
    }

    if (isGM && applySightUpdates && updates.length > 0) {
      await applyWallSightUpdates({
        updates,
        scene: canvasLayer.scene,
        perception: canvasLayer.perception,
        refreshTokens,
        tokens: canvasLayer.tokens?.placeables || [],
      });
    }

    if (updateEchoes) {
      await updateHiddenTokenEchoes(observer, { canvasLayer, moduleId });
    }

    return { processed: walls.length, updates: updates.length };
  } catch (_) {
    return { failed: true };
  }
}
