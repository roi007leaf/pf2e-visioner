import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';
import { VisionerWallQuickSettings } from '../../../scripts/managers/wall-manager/WallQuick.js';

test('wall configuration uses the compact popup button for doors and ordinary walls', () => {
  registerUIHooks();
  const hook = Hooks.on.mock.calls.filter(([name]) => name === 'renderWallConfig').at(-1)[1];
  const root = document.createElement('form');
  hook({ document: { door: 1 } }, root);
  expect(root.querySelector('[data-action="open-visioner-wall-quick"]')).not.toBeNull();
  expect(root.querySelector(`[name^="flags.${MODULE_ID}."]`)).toBeNull();

  const wallRoot = document.createElement('form');
  hook({ document: { door: 0, getFlag: () => undefined } }, wallRoot);
  expect(wallRoot.querySelector('[data-action="open-visioner-wall-quick"]')).not.toBeNull();
  expect(wallRoot.querySelector(`[name="flags.${MODULE_ID}.peekSlitAngle"]`)).toBeNull();
});

test('popup uses the current door selection in Wall Configuration', async () => {
  registerUIHooks();
  const hook = Hooks.on.mock.calls.filter(([name]) => name === 'renderWallConfig').at(-1)[1];
  const root = document.createElement('div');
  root.innerHTML = '<form><select name="door"><option value="0" selected>Wall</option><option value="1">Door</option></select></form>';
  const render = jest.spyOn(VisionerWallQuickSettings.prototype, 'render').mockResolvedValue();
  try {
    hook({ document: { id: 'wall-1', door: 1 } }, root);
    root.querySelector('[data-action="open-visioner-wall-quick"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render).toHaveBeenCalledTimes(1);
    expect((await render.mock.contexts[0]._prepareContext()).isDoor).toBe(false);
  } finally {
    render.mockRestore();
  }
});
