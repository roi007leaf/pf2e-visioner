import fs from 'fs';
import path from 'path';

describe('Hazard/Loot manager template styling', () => {
  test('uses compact Visioner controls instead of stacked raw form controls', () => {
    const template = fs.readFileSync(
      path.resolve(process.cwd(), 'templates/hazard-loot-manager.hbs'),
      'utf8',
    );
    const css = fs.readFileSync(
      path.resolve(process.cwd(), 'styles/dialog-layout.css'),
      'utf8',
    );

    expect(template).toContain('class="pf2e-visioner-hazard-loot-manager"');
    expect(template).toContain('hazard-loot-filter-toolbar');
    expect(template).toContain('hazard-loot-filter-pill');
    expect(template).toContain('class="visioner-icon-btn hazard-loot-clear-filters"');
    expect(template).toContain('class="visibility-table sticky-header-table hazard-loot-table"');
    expect(template).toContain('class="hazard-loot-section hazard-loot-section-loot"');
    expect(template).toContain('class="hazard-loot-section hazard-loot-section-hazards"');
    expect(template).toContain('class="hazard-loot-section-actions hazard-loot-bulk-actions"');
    expect(template).toContain('{{#each lootRows as |row|}}');
    expect(template).toContain('{{#each hazardRows as |row|}}');
    expect(template).toContain('class="hazard-loot-state-buttons"');
    expect(template).toContain('class="visioner-icon-btn hazard-loot-state-btn');
    expect(template).toContain('type="hidden"');
    expect(template).toContain('name="token.{{row.id}}.visibility"');
    expect(template).toContain('name="token.{{row.id}}.minPerceptionRank"');
    expect(template).toContain('class="hazard-loot-rank-buttons"');
    expect(template).toContain('class="visioner-icon-btn hazard-loot-rank-btn');
    expect(template).toContain('Sheet DC');
    expect(template).toContain('class="hazard-loot-row-actions"');
    expect(template).toContain('fa-eye-slash visibility-hidden');
    expect(template).toContain('fa-eye visibility-observed');
    expect(template).toContain('fa-table-list hazard-loot-dc-icon');
    expect(template).toContain('fa-check hazard-loot-apply-icon');
    expect(template).toContain('fa-times hazard-loot-close-icon');
    expect(template).not.toContain('<i class="fas fa-times"></i> Clear');
    expect(template).not.toContain('hazard-loot-state-select');
    expect(template).not.toContain('hazard-loot-rank-select');
    expect(template).not.toContain('bulk-hidden-buttons hazard-loot-bulk-actions');

    expect(css).toContain('.pf2e-visioner-hazard-loot-manager');
    expect(css).toContain('.hazard-loot-filter-toolbar');
    expect(css).toContain('.hazard-loot-table');
    expect(css).toContain('.hazard-loot-section');
    expect(css).toContain('.hazard-loot-section-actions');
    expect(css).toContain('.hazard-loot-state-buttons');
    expect(css).toContain('.hazard-loot-rank-buttons');
    expect(css).toContain('.hazard-loot-rank-btn');
    expect(css).toContain('.hazard-loot-dc-icon');
    expect(css).toContain('.hazard-loot-apply-icon');
    expect(css).toContain('.hazard-loot-close-icon');
  });
});
