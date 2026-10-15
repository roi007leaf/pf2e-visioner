import '../../setup.js';
import { MODULE_ID } from '../../../scripts/constants.js';
import { DoorSoundEditor } from '../../../scripts/managers/wall-manager/DoorSoundEditor.js';

function editor() {
  const wall = { id: 'door', getFlag: () => undefined, update: jest.fn() };
  const app = new DoorSoundEditor(wall);
  app.element = document.createElement('div');
  app.element.innerHTML = `<form>
    <input name="enabled" type="checkbox" checked><input name="separateClosing" type="checkbox" checked>
    <section data-range data-direction="opening" data-index="0">
      <input data-field="from" value="0"><input data-field="to" value="90">
      <file-picker data-field="src"></file-picker>
      <input data-field="start" value="1"><input data-field="end" value="4">
      <input data-field="volume" value="0.4"><input data-field="loop" type="checkbox" checked>
    </section></form>`;
  app.element.querySelector('file-picker').value = 'wood.ogg';
  return { app, wall };
}

test('saves native picker values, trim, loops, direction settings only to this wall', async () => {
  const { app, wall } = editor();
  await DoorSoundEditor._save.call(app);
  expect(wall.update).toHaveBeenCalledWith({ [`flags.${MODULE_ID}.slowDoorSoundTimeline`]: {
    enabled: true, separateClosing: true,
    opening: [{ from: 0, to: 90, src: 'wood.ogg', start: 1, end: 4, volume: 0.4, loop: true }], closing: [],
  } });
});

test('invalid edits remain unsaved; non-GM cannot save', async () => {
  const { app, wall } = editor();
  app.element.querySelector('[data-field="to"]').value = '0';
  await DoorSoundEditor._save.call(app);
  expect(wall.update).not.toHaveBeenCalled();
  const previousUser = game.user;
  try {
    game.user = { isGM: false };
    await DoorSoundEditor._save.call(app);
    expect(wall.update).not.toHaveBeenCalled();
  } finally { game.user = previousUser; }
});
