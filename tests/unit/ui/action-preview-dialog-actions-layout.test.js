import fs from 'fs';
import path from 'path';

describe('Action preview dialog actions layout', () => {
  const cssPath = path.join(process.cwd(), 'styles', 'dialog-layout.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  test('keeps row action controls from wrapping inside the action cell', () => {
    expect(css).toMatch(
      /\.sneak-preview-dialog\s+\.sneak-results-table\s+td\.actions\s*\{[^}]*white-space:\s*nowrap;[^}]*text-align:\s*center;[^}]*min-width:\s*112px;/s,
    );
  });

  test('keeps timer, apply, and revert buttons fixed-size on the same row', () => {
    expect(css).toMatch(
      /\.sneak-preview-dialog\s+\.sneak-results-table\s+td\.actions\s+\.row-action-btn,\s*\.sneak-preview-dialog\s+\.sneak-results-table\s+td\.actions\s+\.row-timer-toggle\s*\{[^}]*flex:\s*0\s+0\s+30px;[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*display:\s*inline-flex/s,
    );
  });

  test('keeps seek row action controls from wrapping inside the action cell', () => {
    expect(css).toMatch(
      /\.seek-preview-dialog\s+\.seek-results-table\s+td\.actions\s*\{[^}]*white-space:\s*nowrap;[^}]*text-align:\s*center;[^}]*min-width:\s*112px;/s,
    );
  });

  test('keeps seek timer, apply, and revert buttons fixed-size on the same row', () => {
    expect(css).toMatch(
      /\.seek-preview-dialog\s+\.seek-results-table\s+td\.actions\s+\.row-action-btn,\s*\.seek-preview-dialog\s+\.seek-results-table\s+td\.actions\s+\.row-timer-toggle\s*\{[^}]*flex:\s*0\s+0\s+30px;[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*display:\s*inline-flex/s,
    );
  });

  test('keeps hide row action controls from wrapping inside the action cell', () => {
    expect(css).toMatch(
      /\.hide-preview-dialog\s+\.hide-results-table\s+td\.actions\s*\{[^}]*white-space:\s*nowrap;[^}]*text-align:\s*center;[^}]*min-width:\s*112px;/s,
    );
  });

  test('keeps hide timer, apply, and revert buttons fixed-size on the same row', () => {
    expect(css).toMatch(
      /\.hide-preview-dialog\s+\.hide-results-table\s+td\.actions\s+\.row-action-btn,\s*\.hide-preview-dialog\s+\.hide-results-table\s+td\.actions\s+\.row-timer-toggle\s*\{[^}]*flex:\s*0\s+0\s+30px;[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*display:\s*inline-flex/s,
    );
  });
});
