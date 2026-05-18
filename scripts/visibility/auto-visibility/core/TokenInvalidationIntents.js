function tokenUpdateIntent(reason, document, changeData, context = {}) {
  return {
    reason,
    document,
    changeData,
    options: context.options,
    userId: context.userId,
  };
}

export function tokenMovementCompleted(document, changeData, context = {}) {
  return tokenUpdateIntent('token-movement-completed', document, changeData, context);
}

export function tokenLightUpdated(document, changeData, context = {}) {
  return tokenUpdateIntent('token-light-updated', document, changeData, context);
}

export function tokenMovementActionCacheInvalidated(document, changeData, context = {}) {
  return tokenUpdateIntent(
    'token-movement-action-cache-invalidated',
    document,
    changeData,
    context,
  );
}

export function tokenHiddenToggled(document, changeData, context = {}) {
  return tokenUpdateIntent('token-hidden-toggled', document, changeData, context);
}

export function tokenLightEmitterMoved(document, changeData, context = {}) {
  return tokenUpdateIntent('token-light-emitter-moved', document, changeData, context);
}

export function tokenMovementOverrideValidationRequired(document, changeData, context = {}) {
  return tokenUpdateIntent(
    'token-movement-override-validation-required',
    document,
    changeData,
    context,
  );
}

export function tokenLightRecalculationRequired(document, changeData, context = {}) {
  return tokenUpdateIntent('token-light-recalculation-required', document, changeData, context);
}

export function tokenMovementActionUpdated(document, changeData, context = {}) {
  return tokenUpdateIntent('token-movement-action-updated', document, changeData, context);
}

export function tokenPositionUpdated(document, changeData, context = {}) {
  return tokenUpdateIntent('token-position-updated', document, changeData, context);
}

export function tokenVisibilityAffectingUpdated(document, changeData, context = {}) {
  return tokenUpdateIntent('token-visibility-affecting-updated', document, changeData, context);
}

export function tokenCreated(document) {
  return {
    reason: 'token-created',
    document,
  };
}

export function tokenDeleted(document) {
  return {
    reason: 'token-deleted',
    document,
  };
}
