describe('hide position qualification', () => {
  test('uses the dialog actor for concealment restrictions, while still allowing independent cover', async () => {
    const { hideEndPositionQualifies } = await import('../../../scripts/chat/dialogs/Hide/hide-position-qualification.js');
    const app = { actorToken: { document: { getFlag: () => ({ blur: { id: 'blur', qualifications: { hide: { qualifiesOnConcealment: false } } } }) } } };
    expect(hideEndPositionQualifies(app, { effectiveVisibility: 'concealed', coverState: 'none' })).toBe(false);
    expect(hideEndPositionQualifies(app, { effectiveVisibility: 'concealed', coverState: 'standard' })).toBe(true);
  });
  test('actionability uses dialog AVS helpers after prerequisite toggles', async () => {
    const { getHidePositionActionableChange } = await import(
      '../../../scripts/chat/dialogs/Hide/hide-position-qualification.js'
    );
    const app = {
      isOldStateAvsControlled: jest.fn(() => true),
      isCurrentStateAvsControlled: jest.fn(() => true),
    };

    expect(
      getHidePositionActionableChange(app, {
        oldVisibility: 'hidden',
        newVisibility: 'hidden',
        overrideState: null,
      }),
    ).toBe(true);
    expect(
      getHidePositionActionableChange(app, {
        oldVisibility: 'hidden',
        newVisibility: 'hidden',
        overrideState: 'avs',
      }),
    ).toBe(false);
  });

  test('matching manual state is not actionable without AVS control', async () => {
    const { getHidePositionActionableChange } = await import(
      '../../../scripts/chat/dialogs/Hide/hide-position-qualification.js'
    );
    const app = {
      isOldStateAvsControlled: jest.fn(() => false),
      isCurrentStateAvsControlled: jest.fn(() => false),
    };

    expect(
      getHidePositionActionableChange(app, {
        oldVisibility: 'hidden',
        newVisibility: 'hidden',
      }),
    ).toBe(false);
    expect(
      getHidePositionActionableChange(app, {
        oldVisibility: 'observed',
        newVisibility: 'hidden',
      }),
    ).toBe(true);
  });
});
