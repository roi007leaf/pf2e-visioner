import '../../setup.js';

describe('hide roll outcome resolution', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/chat/services/FeatsHandler.js');
    jest.resetModules();
  });

  test('computes override totals, margins, and labels from cover data', async () => {
    const { resolveHideRollOutcome } = await import(
      '../../../scripts/chat/services/actions/Hide/hide-roll-outcome.js'
    );

    const result = await resolveHideRollOutcome({
      actionData: {
        actor: { id: 'hider' },
        roll: {
          total: 20,
          dice: [{ results: [{ result: 12 }] }],
        },
        context: {
          _visionerStealth: { bonus: 2 },
        },
      },
      adjustedDC: 19,
      autoCover: {
        state: 'greater',
        isOverride: true,
        overrideDetails: {
          originalState: 'standard',
          finalState: 'greater',
        },
      },
    });

    expect(result).toMatchObject({
      total: 22,
      originalTotal: 20,
      baseRollTotal: 18,
      die: 12,
      margin: 3,
      originalMargin: 1,
      baseMargin: -1,
      outcome: 'success',
      adjustedOutcome: 'success',
      originalOutcome: 'success',
      originalOutcomeLabel: 'Success',
    });
  });

  test('applies hide feat outcome shifts without losing the raw outcome', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        getOutcomeAdjustment: jest.fn(() => ({ shift: 1, notes: ['feat-note'] })),
        applyOutcomeShift: jest.fn(() => 'critical-success'),
      },
    }));

    const { resolveHideRollOutcome } = await import(
      '../../../scripts/chat/services/actions/Hide/hide-roll-outcome.js'
    );

    const result = await resolveHideRollOutcome({
      actionData: {
        actor: { id: 'hider' },
        roll: {
          total: 20,
          dice: [{ results: [{ result: 10 }] }],
        },
      },
      adjustedDC: 18,
      autoCover: undefined,
    });

    expect(result.outcome).toBe('success');
    expect(result.adjustedOutcome).toBe('critical-success');
    expect(result.featNotes).toEqual(['feat-note']);
  });
});
