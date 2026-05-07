describe('Take Cover preview layout', () => {
  it('keeps filters, table, and footer inside the flex content wrapper', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    document.body.innerHTML = await fs.readFile(
      path.join(process.cwd(), 'templates/take-cover-preview.hbs'),
      'utf8',
    );

    const content = document.querySelector('.take-cover-preview-content');

    expect(content?.querySelector(':scope > .actor-info')).toBeTruthy();
    expect(content?.querySelector(':scope > .encounter-filter-section')).toBeTruthy();
    expect(content?.querySelector(':scope > .results-table-container')).toBeTruthy();
    expect(content?.querySelector(':scope > .take-cover-preview-dialog-bulk-actions-header')).toBeTruthy();
  });

  it('defines Take Cover action cells as horizontal button rows', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.take-cover-results-table td.actions');
    expect(css).toContain('display: flex');
    expect(css).toContain('flex-direction: row');
  });

  it('defines horizontal action buttons for all action preview dialogs', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    const tableSelectors = [
      '.point-out-results-table td.actions',
      '.seek-results-table td.actions',
      '.hide-results-table td.actions',
      '.sneak-results-table td.actions',
      '.create-a-diversion-results-table td.actions',
      '.consequences-results-table td.actions',
      '.take-cover-results-table td.actions',
    ];

    for (const selector of tableSelectors) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('display: inline-flex');
    expect(css).toContain('white-space: nowrap');
  });

  it('gives row apply and revert buttons the shared rounded icon-button styling', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');
    const scopedButtonRule = css.match(/\.pf2e-visioner \.row-action-btn \{[\s\S]*?\}/)?.[0] ?? '';

    expect(css).toContain('.pf2e-visioner .row-action-btn');
    expect(scopedButtonRule).toContain('width: 30px');
    expect(scopedButtonRule).toContain('height: 20px');
    expect(scopedButtonRule).toContain('border-radius: 4px');
    expect(css).toContain('.pf2e-visioner .row-action-btn.apply-change');
    expect(css).toContain('.pf2e-visioner .row-action-btn.revert-change');
  });

  it('keeps the Seek detected-by column compact', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.seek-results-table th.detected-by');
    expect(css).toContain('.seek-results-table td.detected-by');
    expect(css).toContain('width: 64px');
    expect(css).toContain('max-width: 64px');
  });

  it('keeps Consequences rows full width while pushing extra space after the controls', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.consequences-results-table {');
    expect(css).toContain('table-layout: fixed');
    expect(css).toContain('width: 100%');
    expect(css).toContain('min-width: 700px');
    expect(css).toContain('.consequences-results-table th.token-name');
    expect(css).toContain('.consequences-results-table td.token-name');
    expect(css).toContain('width: 180px');
    expect(css).toContain('.consequences-results-table th.visibility-change');
    expect(css).toContain('.consequences-results-table td.visibility-change');
    expect(css).toContain('width: 360px');
    expect(css).toContain('.consequences-results-table th.actions');
    expect(css).toContain('.consequences-results-table td.actions');
    expect(css).toContain('width: 130px');
    expect(css).toContain('.consequences-results-table th.row-spacer');
    expect(css).toContain('.consequences-results-table td.row-spacer');
    expect(css).toContain('width: auto');
  });

  it('colors Hide old visibility icon borders from their visibility state', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.hide-preview-dialog .old-visibility-state .state-icon');
    expect(css).toContain('border-color: currentColor');
    expect(css).toContain('box-shadow: 0 0 8px color-mix(in srgb, currentColor 55%, transparent)');
  });

  it('colors Hide and Sneak prerequisite standard-cover legends orange', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.hide-preview-dialog th.end-position .legend-icon.cover-standard');
    expect(css).toContain('.sneak-preview-dialog th.end-position .legend-icon.cover-standard');
    expect(css).toContain('color: var(--cover-standard, #ff6600)');
  });

  it('defines horizontal footer bulk buttons for all action preview dialogs', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    const footerSelectors = [
      '.point-out-preview-dialog-bulk-actions-buttons',
      '.seek-preview-dialog-bulk-actions-buttons',
      '.hide-preview-dialog-bulk-actions-buttons',
      '.sneak-preview-dialog-bulk-actions-buttons',
      '.create-a-diversion-preview-dialog-bulk-actions-buttons',
      '.consequences-preview-dialog-bulk-actions-buttons',
      '.take-cover-preview-dialog-bulk-actions-buttons',
    ];

    for (const selector of footerSelectors) {
      expect(css).toContain(selector);
      expect(css).toContain(`${selector} .bulk-action-btn`);
    }
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('width: auto');
  });

  it('renders a bulk cover override bar', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const template = await fs.readFile(
      path.join(process.cwd(), 'templates/take-cover-preview.hbs'),
      'utf8',
    );

    expect(template).toContain('{{> "pf2e-visioner.bulk-override"}}');
    expect(template).toContain('bulkOverrideStates');
  });

  it('builds bulk override buttons from cover states', async () => {
    const { TakeCoverPreviewDialog } = await import(
      '../../../scripts/chat/dialogs/TakeCoverPreviewDialog.js'
    );
    const dialog = new TakeCoverPreviewDialog(
      { id: 'taker', name: 'Taker', actor: {} },
      [],
      [],
      {},
    );

    const states = dialog._deriveBulkStatesFromOutcomes([
      {
        availableStates: [
          { value: 'none' },
          { value: 'lesser' },
          { value: 'standard' },
          { value: 'greater' },
        ],
      },
    ]);

    expect(states.map((state) => state.value)).toEqual(['none', 'standard', 'greater']);
    expect(states.map((state) => state.cssClass)).toEqual([
      'cover-none',
      'cover-standard',
      'cover-greater',
    ]);
  });

  it('colors bulk cover override buttons from cover state classes', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles/dialog-layout.css'), 'utf8');

    expect(css).toContain('.bulk-override-state-btn.cover-none');
    expect(css).toContain('color: var(--cover-none');
    expect(css).toContain('.bulk-override-state-btn.cover-lesser');
    expect(css).toContain('color: var(--cover-lesser');
    expect(css).toContain('.bulk-override-state-btn.cover-standard');
    expect(css).toContain('color: var(--cover-standard');
    expect(css).toContain('.bulk-override-state-btn.cover-greater');
    expect(css).toContain('color: var(--cover-greater');
  });
});
