import '../../setup.js';

describe('sneak roll outcome resolution', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/chat/services/FeatsHandler.js');
    jest.resetModules();
  });

  test('uses the unbonused roll for outcome while preserving original override display data', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        getOutcomeAdjustment: jest.fn(() => ({ shift: 0, notes: [] })),
      },
    }));

    const { resolveSneakRollOutcome } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-roll-outcome.js'
    );

    const result = await resolveSneakRollOutcome({
      actionData: {
        actor: { id: 'sneaker' },
        roll: {
          total: 20,
          dice: [{ results: [{ result: 10 }] }],
        },
        context: {
          _visionerStealth: { bonus: 2 },
        },
      },
      dc: 19,
    });

    expect(result).toMatchObject({
      baseTotal: 20,
      total: 18,
      originalTotal: 20,
      die: 10,
      margin: -1,
      originalMargin: 1,
      outcome: 'failure',
      adjustedOutcome: 'failure',
      originalOutcome: 'success',
      originalOutcomeLabel: 'Success',
      sneakAdeptApplied: false,
    });
  });

  test('upgrades failure to success for Sneak Adept without touching critical failure', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        getOutcomeAdjustment: jest.fn(() => ({ shift: 0, notes: [] })),
      },
    }));

    const { resolveSneakRollOutcome } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-roll-outcome.js'
    );

    const result = await resolveSneakRollOutcome({
      actionData: {
        actor: {
          itemTypes: {
            feat: [{ name: 'Sneak Adept', type: 'feat' }],
          },
        },
        roll: {
          total: 17,
          dice: [{ results: [{ result: 10 }] }],
        },
      },
      dc: 18,
    });

    expect(result.outcome).toBe('failure');
    expect(result.adjustedOutcome).toBe('success');
    expect(result.sneakAdeptApplied).toBe(true);
    expect(result.featNotes).toContain('Sneak Adept: failure upgraded to success');
  });
});
