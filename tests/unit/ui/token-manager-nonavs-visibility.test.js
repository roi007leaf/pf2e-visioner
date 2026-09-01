import fs from 'fs';
import path from 'path';

describe('Visioner Token Manager non-AVS visibility controls', () => {
  test('offers Undetected instead of Hidden for hazards and loot', () => {
    const template = fs.readFileSync(
      path.resolve(process.cwd(), 'templates/visibility-tab.hbs'),
      'utf8',
    );

    expect(template).toContain('data-action="bulkHazardsUndetected" data-state="undetected"');
    expect(template).toContain("type='Hazards' state='Undetected'");
    expect(template).toContain('data-action="bulkLootUndetected" data-state="undetected"');
    expect(template).toContain("type='Loot' state='Undetected'");
    expect(template).not.toContain('data-action="bulkHazardsHidden"');
    expect(template).not.toContain('data-action="bulkLootHidden"');
  });
});
