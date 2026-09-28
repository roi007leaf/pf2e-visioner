import fs from 'node:fs';
import path from 'node:path';

import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';

function getRenderTileConfigHook() {
  registerUIHooks();
  const calls = Hooks.on.mock.calls.filter(([hookName]) => hookName === 'renderTileConfig');
  return calls.at(-1)?.[1];
}

function makeRoot() {
  const root = document.createElement('div');
  root.innerHTML =
    '<header class="window-header"></header><section class="window-content standard-form"><section class="tab active" data-tab="position"><footer class="form-footer"></footer></section></section>';
  return root;
}

describe('Tile config cover controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers Tile Config hook and renders persisted cover override', () => {
    const hook = getRenderTileConfigHook();
    const root = makeRoot();
    const app = {
      document: {
        getFlag: jest.fn((moduleId, key) =>
          moduleId === MODULE_ID && key === 'coverOverride' ? 'standard' : undefined,
        ),
      },
    };

    expect(hook).toBeInstanceOf(Function);
    hook(app, root);

    const input = root.querySelector(`input[name="flags.${MODULE_ID}.coverOverride"]`);
    const standard = root.querySelector('[data-cover-override="standard"]');
    expect(input?.value).toBe('standard');
    expect(standard?.classList.contains('active')).toBe(true);
    const fieldset = root.querySelector('.pf2e-visioner-tile-cover-settings');
    const footer = root.querySelector('.form-footer');
    expect(fieldset.parentElement).toBe(footer.parentElement);
    expect(fieldset.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('updates hidden flag input when cover button is clicked', () => {
    const hook = getRenderTileConfigHook();
    const root = makeRoot();
    const app = { document: { getFlag: jest.fn(() => null) } };
    hook(app, root);

    const input = root.querySelector(`input[name="flags.${MODULE_ID}.coverOverride"]`);
    const greater = root.querySelector('[data-cover-override="greater"]');
    greater.click();

    expect(input.value).toBe('greater');
    expect(greater.classList.contains('active')).toBe(true);
    expect(root.querySelectorAll('.pf2e-visioner-tile-cover-settings')).toHaveLength(1);

    hook(app, root);
    expect(root.querySelectorAll('.pf2e-visioner-tile-cover-settings')).toHaveLength(1);
  });

  test('GM can toggle a typed hidden-tile flag; players cannot edit it', () => {
    const hook = getRenderTileConfigHook();
    const originalUser = game.user;
    const app = { document: { getFlag: jest.fn((_module, key) => key === 'hiddenTile') } };
    try {
      game.user = { ...originalUser, isGM: true };
      const gmRoot = makeRoot();
      hook(app, gmRoot);
      const toggle = gmRoot.querySelector('[data-hidden-tile-toggle]');
      const input = gmRoot.querySelector(`input[name="flags.${MODULE_ID}.hiddenTile"]`);
      expect(toggle.checked).toBe(true);
      expect(input.dataset.dtype).toBe('Boolean');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      expect(input.value).toBe('false');

      game.user = { ...originalUser, isGM: false };
      const playerRoot = makeRoot();
      hook(app, playerRoot);
      expect(playerRoot.querySelector('[data-hidden-tile-toggle]')).toBeNull();
      expect(playerRoot.querySelector(`input[name="flags.${MODULE_ID}.hiddenTile"]`)).toBeNull();
    } finally {
      game.user = originalUser;
    }
  });

  test('GM can edit persisted tile Stealth DC; players cannot see the field', () => {
    const hook = getRenderTileConfigHook();
    const originalUser = game.user;
    const app = {
      document: {
        getFlag: jest.fn((_module, key) => key === 'stealthDC' ? 22 : undefined),
      },
    };
    try {
      game.user = { ...originalUser, isGM: true };
      const gmRoot = makeRoot();
      hook(app, gmRoot);
      const input = gmRoot.querySelector(`input[name="flags.${MODULE_ID}.stealthDC"]`);
      expect(input?.type).toBe('number');
      expect(input?.value).toBe('22');

      game.user = { ...originalUser, isGM: false };
      const playerRoot = makeRoot();
      hook(app, playerRoot);
      expect(playerRoot.querySelector(`input[name="flags.${MODULE_ID}.stealthDC"]`)).toBeNull();
    } finally {
      game.user = originalUser;
    }
  });

  test('ships row layout and state colors in loaded base stylesheet', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'styles/base.css'), 'utf8');

    expect(css).toMatch(/\.pf2e-visioner-tile-cover-settings \.cover-override-buttons\s*{[^}]*display:\s*flex/is);
    expect(css).toMatch(/data-cover-override=['"]none['"][^{]*{[^}]*--pvv-tile-cover-color:\s*#4caf50/is);
    expect(css).toMatch(/data-cover-override=['"]lesser['"][^{]*{[^}]*--pvv-tile-cover-color:\s*#ffc107/is);
    expect(css).toMatch(/data-cover-override=['"]standard['"][^{]*{[^}]*--pvv-tile-cover-color:\s*#ff6600/is);
    expect(css).toMatch(/data-cover-override=['"]greater['"][^{]*{[^}]*--pvv-tile-cover-color:\s*#f44336/is);
  });
});
