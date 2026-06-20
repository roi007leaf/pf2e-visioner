import '../../setup.js';
import { MODULE_ID } from '../../../scripts/constants.js';

describe('Token HUD buttons', () => {
  beforeEach(() => {
    canvas.tokens.placeables = [];
    game.combat = null;
  });

  test('renders Search exploration target button for hidden loot even when loot visibility HUD is disabled', async () => {
    game.settings.set('pf2e-visioner', 'useHudButton', true);
    game.settings.set('pf2e-visioner', 'includeLootActors', false);
    const token = createMockToken({
      actor: createMockActor({
        type: 'loot',
        conditions: { conditions: [{ slug: 'hidden' }] },
      }),
    });
    const app = {
      object: token,
      render: jest.fn(),
    };
    const root = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'col left';
    root.appendChild(column);

    const { onRenderTokenHUD } = await import('../../../scripts/services/token-hud.js');
    onRenderTokenHUD(app, root);

    expect(root.querySelector('[data-action="pf2e-visioner-search-exploration"]')).not.toBeNull();
    expect(root.querySelector('[data-action="pf2e-visioner-visibility"]')).toBeNull();
  });

  test('renders Search exploration target button for loot prepped hidden without PC tokens', async () => {
    game.settings.set('pf2e-visioner', 'useHudButton', true);
    game.settings.set('pf2e-visioner', 'includeLootActors', false);
    const token = createMockToken({
      id: 'prepped-hidden-loot',
      actor: createMockActor({ type: 'loot' }),
      flags: { [MODULE_ID]: { defaultPlayerVisibility: 'hidden' } },
    });
    canvas.tokens.placeables = [token];
    const root = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'col left';
    root.appendChild(column);

    const { onRenderTokenHUD } = await import('../../../scripts/services/token-hud.js');
    onRenderTokenHUD({ object: token, render: jest.fn() }, root);

    expect(root.querySelector('[data-action="pf2e-visioner-search-exploration"]')).not.toBeNull();
    expect(root.querySelector('[data-action="pf2e-visioner-visibility"]')).toBeNull();
  });

  test('renders Search exploration target button for hidden NPCs but not visible NPCs', async () => {
    game.settings.set('pf2e-visioner', 'useHudButton', true);
    const { onRenderTokenHUD } = await import('../../../scripts/services/token-hud.js');

    const hiddenNpc = createMockToken({
      actor: createMockActor({
        type: 'npc',
        conditions: { conditions: [{ slug: 'undetected' }] },
      }),
    });
    const visibleNpc = createMockToken({
      actor: createMockActor({ type: 'npc' }),
    });

    const hiddenRoot = document.createElement('div');
    const hiddenColumn = document.createElement('div');
    hiddenColumn.className = 'col left';
    hiddenRoot.appendChild(hiddenColumn);
    onRenderTokenHUD({ object: hiddenNpc, render: jest.fn() }, hiddenRoot);

    const visibleRoot = document.createElement('div');
    const visibleColumn = document.createElement('div');
    visibleColumn.className = 'col left';
    visibleRoot.appendChild(visibleColumn);
    onRenderTokenHUD({ object: visibleNpc, render: jest.fn() }, visibleRoot);

    expect(
      hiddenRoot.querySelector('[data-action="pf2e-visioner-search-exploration"]'),
    ).not.toBeNull();
    expect(
      visibleRoot.querySelector('[data-action="pf2e-visioner-search-exploration"]'),
    ).toBeNull();
  });

  test('renders Search exploration target button for NPCs hidden by Visioner visibility', async () => {
    game.settings.set('pf2e-visioner', 'useHudButton', true);
    const hiddenNpc = createMockToken({
      id: 'visioner-hidden-npc',
      actor: createMockActor({ type: 'npc' }),
    });
    const pc = createMockToken({
      id: 'searching-pc',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      flags: {
        [MODULE_ID]: {
          visibilityV2: { 'visioner-hidden-npc': { detectionState: 'hidden' } },
        },
      },
    });
    canvas.tokens.placeables = [pc, hiddenNpc];

    const root = document.createElement('div');
    const column = document.createElement('div');
    column.className = 'col left';
    root.appendChild(column);

    const { onRenderTokenHUD } = await import('../../../scripts/services/token-hud.js');
    onRenderTokenHUD({ object: hiddenNpc, render: jest.fn() }, root);

    expect(root.querySelector('[data-action="pf2e-visioner-search-exploration"]')).not.toBeNull();
  });
});
