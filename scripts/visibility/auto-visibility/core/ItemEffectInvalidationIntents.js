function tokenIdsFor(tokens = []) {
  return (tokens || []).map((token) => token.document.id);
}

function itemMetadata({ action, actor, tokens, recalculateAllTokenPairs = false }) {
  return {
    action,
    actorId: actor.id,
    tokenIds: tokenIdsFor(tokens),
    tokens,
    ...(recalculateAllTokenPairs ? { recalculateAllTokenPairs: true } : {}),
  };
}

function effectMetadata({ action, actor, tokens }) {
  return {
    action,
    actorId: actor.id,
    tokenIds: tokenIdsFor(tokens),
  };
}

export function itemVisibilityUpdated(document, context) {
  return {
    reason: 'item-visibility-updated',
    document,
    metadata: itemMetadata(context),
  };
}

export function itemLightEmitterUpdated(document, context) {
  return {
    reason: 'item-light-emitter-updated',
    document,
    metadata: itemMetadata(context),
  };
}

export function itemVisionEquipmentUpdated(document, { actor, tokens, changes }) {
  return {
    reason: 'item-vision-equipment-updated',
    document,
    changeData: changes,
    metadata: {
      actorId: actor.id,
      tokenIds: tokenIdsFor(tokens),
      tokens,
    },
  };
}

export function effectVisibilityUpdated(document, context) {
  return {
    reason: 'effect-visibility-updated',
    document,
    metadata: effectMetadata(context),
  };
}

export function effectLightEmitterUpdated(document, context) {
  return {
    reason: 'effect-light-emitter-updated',
    document,
    metadata: effectMetadata(context),
  };
}
