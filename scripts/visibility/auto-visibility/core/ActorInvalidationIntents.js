function tokenIdsFor(tokens = []) {
  return (tokens || []).map((token) => token.document.id);
}

export function actorVisibilityUpdated(document, changeData, { phase, tokens } = {}) {
  return {
    reason: 'actor-visibility-updated',
    document,
    changeData,
    metadata: {
      phase,
      tokenIds: tokenIdsFor(tokens),
    },
  };
}
