import '../../setup.js';

describe('hide visibility outcome resolution', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/chat/services/FeatsHandler.js');
    jest.resetModules();
  });

  test('resolves adjusted and original visibility through the centralized action map', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        isEnvironmentActive: jest.fn(() => false),
        adjustVisibility: jest.fn((_action, _actor, _current, newVisibility) => newVisibility),
      },
    }));

    const { resolveHideVisibilityOutcomes } = await import(
      '../../../scripts/chat/services/actions/Hide/hide-visibility-outcome.js'
    );

    const result = await resolveHideVisibilityOutcomes({
      actionData: { actor: { id: 'hider' } },
      current: 'observed',
      adjustedOutcome: 'success',
      originalOutcome: 'failure',
      originalTotal: 12,
    });

    expect(result).toEqual({
      newVisibility: 'hidden',
      originalNewVisibility: 'avs',
    });
  });

  test('runs feat visibility adjustment for the displayed result', async () => {
    const adjustVisibility = jest.fn(() => 'undetected');
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        isEnvironmentActive: jest.fn(() => true),
        adjustVisibility,
      },
    }));

    const { resolveHideVisibilityOutcomes } = await import(
      '../../../scripts/chat/services/actions/Hide/hide-visibility-outcome.js'
    );

    const result = await resolveHideVisibilityOutcomes({
      actionData: { actor: { id: 'hider' } },
      current: 'concealed',
      adjustedOutcome: 'success',
      originalOutcome: 'success',
      originalTotal: null,
    });

    expect(result.newVisibility).toBe('undetected');
    expect(adjustVisibility).toHaveBeenCalledWith(
      'hide',
      { id: 'hider' },
      'concealed',
      'hidden',
      {
        inNaturalTerrain: true,
        outcome: 'success',
      },
    );
  });
});
