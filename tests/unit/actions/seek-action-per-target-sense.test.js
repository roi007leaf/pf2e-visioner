describe('SeekActionHandler per-target sense labels', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('uses hearing for a target behind a wall after another target used low-light vision', async () => {
    const mockVisionAnalyzer = {
      getVisionCapabilities: jest.fn(() => ({
        hasVision: true,
        isBlinded: false,
        isDeafened: false,
        sensingSummary: {
          precise: [{ type: 'low-light-vision', range: Infinity }],
          imprecise: [],
        },
      })),
      distanceFeet: jest.fn(() => 20),
      hasLineOfSight: jest.fn((_observer, target) => target?.id !== 'behind-wall'),
      hasPreciseNonVisualInRange: jest.fn(() => false),
      canDetectWithSpecialSense: jest.fn(() => true),
    };

    jest.doMock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
      __esModule: true,
      VisionAnalyzer: {
        getInstance: jest.fn(() => mockVisionAnalyzer),
      },
    }));

    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getVisibilityBetween: jest.fn(() => 'hidden'),
      getWallImage: jest.fn(() => 'icons/svg/wall.svg'),
    }));

    const { SeekActionHandler } = await import(
      '../../../scripts/chat/services/actions/SeekAction.js'
    );

    const handler = new SeekActionHandler();
    const observer = {
      id: 'observer',
      name: 'Observer',
      center: { x: 0, y: 0 },
      document: { id: 'observer', getFlag: jest.fn(() => ({})) },
      actor: {
        id: 'observer-actor',
        type: 'character',
        getStatistic: jest.fn(() => ({ proficiency: { rank: 2 } })),
      },
    };
    const actionData = {
      actor: observer,
      actorToken: observer,
      roll: {
        total: 20,
        dice: [{ results: [{ result: 15 }], total: 15 }],
        terms: [{ total: 15 }],
      },
    };
    const makeTarget = (id) => ({
      id,
      name: id,
      center: { x: 100, y: 0 },
      document: { id, getFlag: jest.fn(() => null) },
      actor: {
        id: `${id}-actor`,
        type: 'npc',
        system: {
          skills: { stealth: { dc: 15 } },
          details: { creatureType: 'humanoid' },
        },
      },
    });

    const visibleTarget = await handler.analyzeOutcome(actionData, makeTarget('visible'));
    const wallTarget = await handler.analyzeOutcome(actionData, makeTarget('behind-wall'));

    expect(visibleTarget.usedSenseType).toBe('low-light-vision');
    expect(wallTarget.usedSenseType).toBe('hearing');
    expect(wallTarget.usedSensePrecision).toBe('imprecise');
  });
});
