import '../../setup.js';
import { MODULE_ID } from '../../../scripts/constants.js';
import { VisionerWallQuickSettings } from '../../../scripts/managers/wall-manager/WallQuick.js';

function previewWall() {
  return { id: null, getFlag: () => undefined, parent: null };
}

function appWithForm(doc) {
  const app = new VisionerWallQuickSettings(doc);
  app.element = document.createElement('div');
  app.element.innerHTML = `
    <form class="pv-wall-quick">
      <input type="checkbox" name="ledge" checked />
      <input type="number" name="ledgeElevation" value="10" />
    </form>`;
  return app;
}

describe('wall quick settings opened from the wall palette', () => {
  let originalScene;

  beforeEach(() => {
    originalScene = canvas.scene;
    canvas.scene = { updateEmbeddedDocuments: jest.fn() };
    ui.notifications.warn = jest.fn();
  });

  afterEach(() => {
    canvas.scene = originalScene;
  });

  test('apply updates every selected wall with its own id', async () => {
    canvas.walls.controlled = [{ document: { id: 'wall-a' } }, { document: { id: 'wall-b' } }];
    await VisionerWallQuickSettings._onApply.call(appWithForm(previewWall()));
    const [docName, updates, options] = canvas.scene.updateEmbeddedDocuments.mock.calls[0];
    expect(docName).toBe('Wall');
    expect(updates.map((u) => u._id)).toEqual(['wall-a', 'wall-b']);
    expect(updates[1]).toEqual(
      expect.objectContaining({
        [`flags.${MODULE_ID}.ledge`]: true,
        [`flags.${MODULE_ID}.ledgeElevation`]: 10,
      }),
    );
    expect(options).toEqual({ diff: false });
  });

  test('apply warns instead of sending updates without ids when no wall is selected', async () => {
    canvas.walls.controlled = [];
    await VisionerWallQuickSettings._onApply.call(appWithForm(previewWall()));
    expect(canvas.scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });
});
