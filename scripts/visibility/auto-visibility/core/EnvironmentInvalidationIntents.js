function documentIntent(reason, document, { options, userId } = {}) {
  return {
    reason,
    document,
    options,
    userId,
  };
}

function documentChangeIntent(reason, document, changeData, { options, userId } = {}) {
  return {
    reason,
    document,
    changeData,
    options,
    userId,
  };
}

export function ambientLightUpdated(document, changeData, context = {}) {
  return documentChangeIntent('ambient-light-updated', document, changeData, context);
}

export function ambientLightCreated(document, context = {}) {
  return documentIntent('ambient-light-created', document, context);
}

export function ambientLightDeleted(document, context = {}) {
  return documentIntent('ambient-light-deleted', document, context);
}

export function lightingRefresh() {
  return { reason: 'lighting-refresh' };
}

export function wallUpdated(document, changeData, context = {}) {
  return documentChangeIntent('wall-updated', document, changeData, context);
}

export function wallCreated(document, context = {}) {
  return documentIntent('wall-created', document, context);
}

export function wallDeleted(document, context = {}) {
  return documentIntent('wall-deleted', document, context);
}

export function sceneLightingUpdated(document, changeData, context = {}) {
  return documentChangeIntent('scene-lighting-updated', document, changeData, context);
}

export function sceneConfigLightingFlushed() {
  return { reason: 'scene-config-lighting-flushed' };
}

export function regionSurfaceUpdated(triggerReason, detail = {}) {
  return {
    reason: 'region-surface-updated',
    document: detail.document ?? null,
    changeData: detail.changes,
    options: detail.options,
    userId: detail.userId,
    metadata: {
      triggerReason,
      sceneId: detail.sceneId ?? null,
      sceneName: detail.sceneName ?? null,
      regionId: detail.regionId ?? null,
      regionName: detail.regionName ?? null,
      behaviorId: detail.behaviorId ?? null,
      placementLevelsChanged: detail.placementLevelsChanged ?? false,
      hasDefineSurface: detail.hasDefineSurface ?? false,
    },
  };
}

export function templateLightUpdated(document, { action, changes } = {}) {
  const intent = {
    reason: 'template-light-updated',
    document,
    metadata: { action },
  };
  if (changes !== undefined) intent.changeData = changes;
  return intent;
}
