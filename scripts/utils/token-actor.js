function safelyRead(read) {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
}

function worldActorType(actorId) {
  if (!actorId) return null;
  return safelyRead(() => {
    const actors = globalThis.game?.actors;
    const actor =
      actors?.get?.(actorId) ??
      actors?.contents?.find?.((candidate) => candidate?.id === actorId);
    return actor?.type;
  });
}

export function isPartyActorToken(tokenOrDocument) {
  if (!tokenOrDocument) return false;
  const document = tokenOrDocument.document ?? tokenOrDocument;
  const placeableType = tokenOrDocument.document
    ? safelyRead(() => tokenOrDocument.actor?.type)
    : null;
  const actorId = safelyRead(() => document.actorId);
  const type =
    placeableType ??
    worldActorType(actorId) ??
    safelyRead(() => document.actor?.type);
  return type === 'party';
}
