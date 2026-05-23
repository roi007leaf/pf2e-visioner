export const LIGHT_VISIBILITY_FIELDS = Object.freeze([
  'x',
  'y',
  'elevation',
  'config.dim',
  'config.bright',
  'config.angle',
  'rotation',
  'config.alpha',
  'config.darkness.min',
  'config.darkness.max',
  'hidden',
  'config.walls',
]);

export const WALL_LOS_FIELDS = Object.freeze([
  'c',
  'ds',
  'door',
  'sense',
  'dir',
  'sight',
  'sound',
  'threshold',
  'threshold.sight',
  'threshold.sound',
  'threshold.attenuation',
]);

export const AVS_INVALIDATION_REASON_HANDLERS = Object.freeze({
  'ambient-light-updated': 'ambientLightUpdated',
  'ambient-light-created': 'ambientLightCreatedOrDeleted',
  'ambient-light-deleted': 'ambientLightCreatedOrDeleted',
  'lighting-refresh': 'lightingRefresh',
  'wall-updated': 'wallUpdated',
  'wall-created': 'wallCreatedOrDeleted',
  'wall-deleted': 'wallCreatedOrDeleted',
  'scene-lighting-updated': 'fullSceneImmediateInvalidation',
  'scene-config-lighting-flushed': 'fullSceneImmediateInvalidation',
  'region-surface-updated': 'fullSceneImmediateInvalidation',
  'token-light-updated': 'tokenLightUpdated',
  'token-light-emitter-moved': 'tokenLightEmitterMoved',
  'token-light-recalculation-required': 'tokenLightRecalculationRequired',
  'token-position-updated': 'tokenPositionUpdated',
  'token-movement-completed': 'tokenMovementCompleted',
  'token-movement-override-validation-required': 'tokenMovementOverrideValidationRequired',
  'token-movement-action-cache-invalidated': 'tokenMovementActionCacheInvalidated',
  'token-movement-action-updated': 'tokenMovementActionUpdated',
  'token-hidden-toggled': 'tokenHiddenToggled',
  'token-created': 'tokenCreated',
  'token-deleted': 'tokenDeleted',
  'token-visibility-affecting-updated': 'tokenVisibilityAffectingUpdated',
  'effect-visibility-updated': 'effectVisibilityUpdated',
  'effect-light-emitter-updated': 'effectLightEmitterUpdated',
  'item-visibility-updated': 'itemVisibilityUpdated',
  'item-vision-equipment-updated': 'itemVisionEquipmentUpdated',
  'item-light-emitter-updated': 'itemLightEmitterUpdated',
  'actor-visibility-updated': 'actorVisibilityUpdated',
  'template-light-updated': 'templateLightUpdated',
});

function changeAffectsAnyField(
  changeData,
  fields,
  hasProperty = globalThis.foundry?.utils?.hasProperty,
) {
  if (!changeData) return true;
  return fields.some((field) => hasProperty?.(changeData, field));
}

export function changeAffectsVisibility(changeData, hasProperty) {
  return changeAffectsAnyField(changeData, LIGHT_VISIBILITY_FIELDS, hasProperty);
}

export function changeAffectsLineOfSight(changeData, hasProperty) {
  return changeAffectsAnyField(changeData, WALL_LOS_FIELDS, hasProperty);
}

export class AvsInvalidationReasonRouter {
  constructor({
    reasonHandlers = AVS_INVALIDATION_REASON_HANDLERS,
    handlersByName = {},
  } = {}) {
    this.reasonHandlers = reasonHandlers;
    this.handlersByName = handlersByName;
  }

  dispatch(change = {}) {
    const handlerName = this.reasonHandlers?.[change.reason];
    const handler = handlerName ? this.handlersByName?.[handlerName] : null;
    return handler ? handler(change) : false;
  }
}
