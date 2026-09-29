import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';

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
