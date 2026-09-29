import '../../setup.js';
import { MODULE_ID } from '../../../scripts/constants.js';
import { VisionerWallQuickSettings } from '../../../scripts/managers/wall-manager/WallQuick.js';

function wall(door, flags = {}) {
  return {
    id: 'wall-1', door,
    getFlag: (_module, key) => flags[key],
    parent: { updateEmbeddedDocuments: jest.fn() },
  };
}

test('popup context shows door peek values only for doors', async () => {
  const doorApp = new VisionerWallQuickSettings(wall(1, {
    peekAllowed: true, peekDC: 15, peekSlitAngle: 12, peekSweepAngle: 0, peekRange: 30,
  }));
  expect(await doorApp._prepareContext()).toEqual(expect.objectContaining({
    isDoor: true, peekAllowed: true, peekDC: 15,
    peekSlitAngle: 12, peekSweepAngle: 0, peekRange: 30,
  }));
  expect((await new VisionerWallQuickSettings(wall(0))._prepareContext()).isDoor).toBe(false);
});

test('popup apply saves door peek values as wall flags', async () => {
  const doc = wall(1);
  const app = new VisionerWallQuickSettings(doc);
  app.element = document.createElement('div');
  app.element.innerHTML = `
    <form class="pv-wall-quick">
      <input type="checkbox" name="peekAllowed" checked />
      <input type="number" name="peekDC" value="15" />
      <input type="number" name="peekSlitAngle" value="12" />
      <input type="number" name="peekSweepAngle" value="0" />
      <input type="number" name="peekRange" value="30" />
    </form>`;
  await VisionerWallQuickSettings._onApply.call(app);
  expect(doc.parent.updateEmbeddedDocuments).toHaveBeenCalledWith('Wall', [expect.objectContaining({
    [`flags.${MODULE_ID}.peekAllowed`]: true,
    [`flags.${MODULE_ID}.peekDC`]: 15,
    [`flags.${MODULE_ID}.peekSlitAngle`]: 12,
    [`flags.${MODULE_ID}.peekSweepAngle`]: 0,
    [`flags.${MODULE_ID}.peekRange`]: 30,
  })], { diff: false });
});

test('popup apply leaves peek flags alone on an ordinary wall', async () => {
  const doc = wall(0);
  const app = new VisionerWallQuickSettings(doc);
  app.element = document.createElement('div');
  app.element.innerHTML = '<form class="pv-wall-quick"></form>';
  await VisionerWallQuickSettings._onApply.call(app);
  const patch = doc.parent.updateEmbeddedDocuments.mock.calls[0][1][0];
  expect(Object.keys(patch).some((key) => key.includes('peek'))).toBe(false);
});

test('unchecked Allow Peeking hides and disables options, then restores them when checked', () => {
  const app = new VisionerWallQuickSettings(wall(1));
  const content = document.createElement('div');
  app._replaceHTML(`
    <form class="pv-wall-quick">
      <input type="checkbox" name="peekAllowed" />
      <div class="pv-peek-options">
        <input type="number" name="peekDC" value="15" />
        <input type="number" name="peekSlitAngle" value="10" required />
      </div>
    </form>`, content, {});
  const checkbox = content.querySelector('[name="peekAllowed"]');
  const options = content.querySelector('.pv-peek-options');
  expect(options.hidden).toBe(true);
  expect([...options.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  expect(options.hidden).toBe(false);
  expect([...options.querySelectorAll('input')].every((input) => !input.disabled)).toBe(true);
});

test('disabling peeking preserves the saved DC and geometry', async () => {
  const doc = wall(1, { peekDC: 15, peekSlitAngle: 10, peekSweepAngle: 10, peekRange: 0 });
  const app = new VisionerWallQuickSettings(doc);
  app.element = document.createElement('div');
  app._replaceHTML(`
    <form class="pv-wall-quick">
      <input type="checkbox" name="peekAllowed" />
      <div class="pv-peek-options">
        <input type="number" name="peekDC" value="15" />
        <input type="number" name="peekSlitAngle" value="10" required />
      </div>
    </form>`, app.element, {});
  await VisionerWallQuickSettings._onApply.call(app);
  const patch = doc.parent.updateEmbeddedDocuments.mock.calls[0][1][0];
  expect(patch[`flags.${MODULE_ID}.peekAllowed`]).toBe(false);
  expect(Object.keys(patch).filter((key) => key.startsWith(`flags.${MODULE_ID}.peek`))).toEqual([
    `flags.${MODULE_ID}.peekAllowed`,
  ]);
});
