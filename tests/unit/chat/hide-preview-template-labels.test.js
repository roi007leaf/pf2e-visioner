import fs from 'fs';
import path from 'path';

describe('Hide preview visibility labels', () => {
  test('uses prepared display labels for concealed tooltips instead of raw state names', () => {
    const templatePath = path.join(process.cwd(), 'templates/hide-preview.hbs');
    const source = fs.readFileSync(templatePath, 'utf8');

    expect(source).toContain('data-tooltip="{{outcome.oldVisibilityState.label}}"');
    expect(source).toContain('data-tooltip="{{state.label}}"');
    expect(source).not.toContain('data-tooltip="{{capitalize outcome.oldVisibility}}"');
    expect(source).not.toContain('data-tooltip="{{capitalize state.label}}"');
  });
});
