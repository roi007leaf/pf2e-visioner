import { VisionerConfirmDialog } from '../../../scripts/ui/dialogs/ConfirmDialog.js';

function makeRenderedDialog() {
  const dialog = new VisionerConfirmDialog({
    title: 'Hidden Scene Visibility',
    content: '<p>Choose how to update hidden scene prep.</p>',
    yes: 'Set Hidden',
    yesValue: 'set-hidden',
    no: 'Cancel',
    noValue: null,
    extra: {
      label: 'Clear Prep',
      value: 'clear-prep',
      icon: 'fas fa-eye',
      variant: 'danger',
    },
  });

  dialog.element = document.createElement('div');
  dialog.element.innerHTML = `
    <button type="button" data-action="no"></button>
    <button type="button" data-action="extra"></button>
    <button type="button" data-action="yes"></button>
  `;
  return dialog;
}

describe('VisionerConfirmDialog actions', () => {
  test('prepares optional extra action context for three-button dialogs', async () => {
    const dialog = makeRenderedDialog();

    const context = await dialog._prepareContext({});

    expect(context).toMatchObject({
      yes: 'Set Hidden',
      no: 'Cancel',
      yesValue: 'set-hidden',
      noValue: null,
      extra: {
        label: 'Clear Prep',
        value: 'clear-prep',
        icon: 'fas fa-eye',
        variant: 'danger',
      },
    });
  });

  test('resolves configured yes, no, and extra action values', () => {
    const clickAndResolve = (action) => {
      const dialog = makeRenderedDialog();
      const resolved = [];
      dialog._resolver = (value) => resolved.push(value);
      dialog._onRender({}, {});

      dialog.element.querySelector(`[data-action="${action}"]`).click();

      return resolved[0];
    };

    expect(clickAndResolve('yes')).toBe('set-hidden');
    expect(clickAndResolve('extra')).toBe('clear-prep');
    expect(clickAndResolve('no')).toBeNull();
  });
});
