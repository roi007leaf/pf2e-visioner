import '../../setup.js';

function makeToken(id) {
  return {
    id,
    document: { id },
  };
}

describe('consequences legacy application', () => {
  test('returns noChanges when no outcomes changed', async () => {
    const { applyConsequencesLegacy } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-legacy-application.js'
    );

    const result = await applyConsequencesLegacy({
      actionData: {},
      subjects: [makeToken('observer')],
      analyzeOutcome: jest.fn(async (actionData, subject) => ({ target: subject, changed: false })),
      applyOverrides: jest.fn(),
      outcomeToChange: jest.fn(),
      getOutcomeTokenId: jest.fn(),
      applyChangesInternal: jest.fn(),
      groupChangesByObserver: jest.fn(),
      cacheAfterApply: jest.fn(),
    });

    expect(result).toEqual({ count: 0, noChanges: true });
  });

  test('applies changes, honors per-target overrides, persists visibility profiles, and caches', async () => {
    const { applyConsequencesLegacy } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-legacy-application.js'
    );
    const attacker = makeToken('attacker');
    const observer = makeToken('observer');
    const actionData = {
      actor: attacker,
      overrides: { observer: 'hidden' },
    };
    const applyChangesInternal = jest.fn().mockResolvedValue(undefined);
    const cacheAfterApply = jest.fn();
    const groupChangesByObserver = jest.fn((changes) => [{ observer, items: changes }]);
    canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);

    const result = await applyConsequencesLegacy({
      actionData,
      subjects: [observer],
      analyzeOutcome: jest.fn(async () => ({ target: observer, changed: true })),
      applyOverrides: jest.fn(),
      outcomeToChange: jest.fn(() => ({
        observer,
        target: attacker,
        newVisibility: 'observed',
      })),
      getOutcomeTokenId: jest.fn(() => 'observer'),
      applyChangesInternal,
      groupChangesByObserver,
      cacheAfterApply,
      getPerceptionProfileMap: jest.fn(() => ({})),
      legacyVisibilityToProfile: jest.fn((state) => ({ detectionState: state })),
    });

    expect(result).toEqual({ count: 1, noChanges: false });
    expect(applyChangesInternal).toHaveBeenCalledWith([
      {
        observer,
        target: attacker,
        newVisibility: 'observed',
        overrideState: 'hidden',
      },
    ]);
    expect(canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
      {
        _id: 'observer',
        'flags.pf2e-visioner.visibilityV2': {
          attacker: { detectionState: 'hidden' },
        },
      },
    ]);
    expect(cacheAfterApply).toHaveBeenCalled();
  });
});
