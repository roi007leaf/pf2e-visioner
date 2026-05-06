import '../../setup.js';

describe('BaseActionDialog bulk visibility labels', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.game.settings.get.mockImplementation((_moduleId, settingId) => {
      if (settingId === 'autoVisibilityEnabled') return true;
      return false;
    });
  });

  test('labels concealed bulk overrides as observed plus concealed while preserving value', async () => {
    const { BaseActionDialog } = await import(
      '../../../scripts/chat/dialogs/base-action-dialog.js'
    );

    const app = new BaseActionDialog();
    const concealed = app
      ._buildBulkOverrideStates()
      .find((state) => state.value === 'concealed');

    expect(concealed).toMatchObject({
      value: 'concealed',
      label: 'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed',
      cssClass: 'visibility-concealed',
    });
  });
});
