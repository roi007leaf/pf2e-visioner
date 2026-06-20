import '../../setup.js';

describe('direct Apply Changes actionability', () => {
  test('sneak direct apply keeps only changed outcomes', async () => {
    const { getDirectSneakOutcomesToApply } = await import(
      '../../../scripts/chat/services/apply-service.js'
    );

    const changed = { token: { id: 'observer-1' }, changed: true, newVisibility: 'undetected' };
    const unchanged = { token: { id: 'observer-2' }, changed: false, newVisibility: 'concealed' };

    expect(getDirectSneakOutcomesToApply([changed, unchanged], {})).toEqual([changed]);
  });

  test('sneak direct apply honors explicit per-row overrides after filtering changes', async () => {
    const { getDirectSneakOutcomesToApply } = await import(
      '../../../scripts/chat/services/apply-service.js'
    );

    const selected = { token: { id: 'observer-1' }, changed: true, newVisibility: 'undetected' };
    const otherChanged = { token: { id: 'observer-2' }, changed: true, newVisibility: 'hidden' };

    expect(
      getDirectSneakOutcomesToApply([selected, otherChanged], {
        overrides: { 'observer-1': 'undetected' },
      }),
    ).toEqual([selected]);
  });

  test('hide direct preflight treats AVS-controlled matching states as actionable', async () => {
    const { getDirectHideChangedOutcomes } = await import(
      '../../../scripts/chat/ui/event-binder.js'
    );

    const outcome = {
      target: { id: 'observer-1' },
      oldVisibility: 'hidden',
      currentVisibility: 'hidden',
      newVisibility: 'hidden',
      changed: false,
    };
    const actionData = { actor: { id: 'hider-1' } };
    const handler = { isOldStateAvsControlled: jest.fn(() => true) };

    expect(getDirectHideChangedOutcomes(handler, [outcome], actionData)).toEqual([outcome]);
    expect(handler.isOldStateAvsControlled).toHaveBeenCalledWith(outcome, actionData);
  });

  test('base direct visibility actions treat AVS-controlled matching states as actionable', async () => {
    const { ActionHandlerBase } = await import(
      '../../../scripts/chat/services/actions/BaseAction.js'
    );
    const handler = new ActionHandlerBase('point-out');
    handler.isOldStateAvsControlled = jest.fn(() => true);

    expect(
      handler.isOutcomeActionable(
        { actor: { id: 'actor-1' } },
        {
          oldVisibility: 'hidden',
          currentVisibility: 'hidden',
          newVisibility: 'hidden',
          changed: false,
        },
      ),
    ).toBe(true);
  });

  test('seek direct apply treats AVS-controlled matching states as actionable', async () => {
    const { SeekActionHandler } = await import(
      '../../../scripts/chat/services/actions/SeekAction.js'
    );
    const handler = new SeekActionHandler();
    handler.isOldStateAvsControlled = jest.fn(() => true);

    expect(
      handler.isOutcomeActionable(
        { actor: { id: 'actor-1' } },
        {
          target: { id: 'target-1' },
          oldVisibility: 'hidden',
          currentVisibility: 'hidden',
          newVisibility: 'hidden',
          changed: false,
        },
      ),
    ).toBe(true);
  });

  test('take cover direct apply does not use visibility AVS same-state actionability', async () => {
    const { TakeCoverActionHandler } = await import(
      '../../../scripts/chat/services/actions/TakeCoverAction.js'
    );
    const handler = new TakeCoverActionHandler();
    handler.isOldStateAvsControlled = jest.fn(() => true);

    expect(
      handler.isOutcomeActionable(
        { actor: { id: 'actor-1' } },
        {
          oldVisibility: 'standard',
          currentVisibility: 'standard',
          newVisibility: 'standard',
          changed: false,
        },
      ),
    ).toBe(false);
  });
});
