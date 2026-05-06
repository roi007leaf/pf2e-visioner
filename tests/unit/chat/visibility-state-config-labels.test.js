import '../../setup.js';

describe('visibility state display config labels', () => {
  test('uses observed plus concealed as the default concealed UI label', async () => {
    const { getVisibilityStateConfig } = await import(
      '../../../scripts/chat/services/data/visibility-states.js'
    );

    expect(getVisibilityStateConfig('concealed')).toMatchObject({
      label: 'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed',
      cssClass: 'visibility-concealed',
    });
  });

  test('can still request the raw concealed condition label explicitly', async () => {
    const { getVisibilityStateConfig } = await import(
      '../../../scripts/chat/services/data/visibility-states.js'
    );

    expect(getVisibilityStateConfig('concealed', { manual: false }).label).toBe(
      'PF2E_VISIONER.VISIBILITY_STATES.concealed',
    );
  });
});
