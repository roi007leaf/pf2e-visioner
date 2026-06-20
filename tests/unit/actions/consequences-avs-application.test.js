import '../../setup.js';

function makeToken(id, flagMap = {}) {
  return {
    id,
    name: id,
    actor: { id: `${id}-actor` },
    document: {
      id,
      name: id,
      flags: { 'pf2e-visioner': flagMap },
      getFlag: jest.fn((moduleId, key) =>
        moduleId === 'pf2e-visioner' ? flagMap[key] : undefined,
      ),
    },
  };
}

describe('consequences AVS application', () => {
  test('removes existing overrides, creates new consequences overrides, and caches revert data', async () => {
    const { applyConsequencesAvs } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-avs-application.js'
    );
    const attacker = makeToken('attacker', {
      'avs-override-from-observer': { detectionState: 'hidden', source: 'prior' },
    });
    const observer = makeToken('observer');
    const cache = new Map([['message-1', [{ type: 'old-entry' }]]]);
    const avsOverrideManager = {
      removeOverride: jest.fn().mockResolvedValue(true),
      setPairOverrides: jest.fn().mockResolvedValue(true),
    };
    const overrideIndicator = {
      hide: jest.fn(),
      update: jest.fn(),
    };

    const result = await applyConsequencesAvs({
      actionData: { actor: attacker, messageId: 'message-1' },
      subjects: [observer],
      attacker,
      analyzeOutcome: jest.fn(async () => ({
        target: observer,
        changed: true,
        newVisibility: 'hidden',
      })),
      applyOverrides: jest.fn(),
      cache,
      avsOverrideManager,
      overrideIndicator,
    });

    expect(result.overridesCreated).toBe(1);
    expect(avsOverrideManager.removeOverride).toHaveBeenCalledWith('observer', 'attacker');
    expect(avsOverrideManager.removeOverride).toHaveBeenCalledWith('attacker', 'observer');
    expect(avsOverrideManager.setPairOverrides).toHaveBeenCalledWith(
      observer,
      expect.any(Map),
      { source: 'consequences_action' },
    );
    expect(cache.get('message-1').map((entry) => entry.type)).toEqual([
      'old-entry',
      'avs-removed',
      'avs-created',
    ]);
  });

  test('revert removes created overrides and restores removed overrides', async () => {
    const { revertConsequencesAvs } = await import(
      '../../../scripts/chat/services/actions/Consequences/consequences-avs-application.js'
    );
    const observer = makeToken('observer');
    const attacker = makeToken('attacker');
    const cache = new Map([
      [
        'message-1',
        [
          { type: 'avs-created', observerId: 'observer', targetId: 'attacker' },
          {
            type: 'avs-removed',
            observerId: 'observer',
            targetId: 'attacker',
            original: {
              state: 'hidden',
              source: 'prior',
              hasCover: false,
              hasConcealment: false,
              expectedCover: null,
            },
          },
        ],
      ],
    ]);
    const avsOverrideManager = {
      removeOverride: jest.fn().mockResolvedValue(true),
      setPairOverrides: jest.fn().mockResolvedValue(true),
    };
    const getTokenById = jest.fn((id) => ({ observer, attacker })[id]);

    const result = await revertConsequencesAvs({
      actionData: { messageId: 'message-1' },
      cache,
      getTokenById,
      avsOverrideManager,
    });

    expect(result).toMatchObject({
      performed: true,
      actionsPerformed: 2,
    });
    expect(avsOverrideManager.removeOverride).toHaveBeenCalledWith('observer', 'attacker');
    expect(avsOverrideManager.setPairOverrides).toHaveBeenCalledWith(
      observer,
      expect.any(Map),
      { source: 'prior' },
    );
    expect(cache.has('message-1')).toBe(false);
  });
});
