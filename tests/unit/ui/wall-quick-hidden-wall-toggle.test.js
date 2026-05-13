import '../../setup.js';

describe('Visioner wall quick hidden wall fields', () => {
  test('checking hidden wall reveals identifier, DC, and connected wall fields immediately', async () => {
    const { VisionerWallQuickSettings } = await import(
      '../../../scripts/managers/wall-manager/WallQuick.js'
    );
    const app = new VisionerWallQuickSettings({ id: 'wall-1' });
    const content = document.createElement('div');

    app._replaceHTML(
      `
      <form class="pv-wall-quick">
        <input type="checkbox" name="hiddenWall" />
        <div class="form-group hidden-wall-section is-hidden">
          <input type="text" name="identifier" />
        </div>
        <div class="form-group hidden-wall-section is-hidden">
          <input type="number" name="dc" />
        </div>
        <div class="form-group hidden-wall-section is-hidden">
          <input type="text" name="connected" />
        </div>
      </form>
      `,
      content,
      {},
    );

    const checkbox = content.querySelector('input[name="hiddenWall"]');
    const sections = Array.from(content.querySelectorAll('.hidden-wall-section'));
    expect(sections).toHaveLength(3);
    expect(sections.every((section) => section.classList.contains('is-hidden'))).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(sections.every((section) => !section.classList.contains('is-hidden'))).toBe(true);
    expect(sections.every((section) => section.style.display !== 'none')).toBe(true);
  });
});
