import fs from 'fs';
import path from 'path';

describe('consequences dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const dialogPath = path.join(root, 'scripts/chat/dialogs/ConsequencesPreviewDialog.js');
  const contextPath = path.join(
    root,
    'scripts/chat/dialogs/Consequences/consequences-dialog-context.js',
  );

  test('consequences dialog delegates render context assembly', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './Consequences/consequences-dialog-context.js'");
    expect(source).toContain('prepareConsequencesDialogContext(this, context)');
    expect(source).not.toContain('filterOutcomesByAllies');
    expect(source).not.toContain('filterOutcomesByDetection');
    expect(source).not.toContain('getDesiredOverrideStatesForAction');
    expect(source).not.toContain('getVisibilityStateConfig');

    expect(contextSource).toContain('export async function prepareConsequencesDialogContext');
    expect(contextSource).toContain('filterOutcomesByAllies');
    expect(contextSource).toContain('filterOutcomesByDetection');
    expect(contextSource).toContain('getDesiredOverrideStatesForAction');
    expect(contextSource).toContain('getVisibilityStateConfig');
  });
});
