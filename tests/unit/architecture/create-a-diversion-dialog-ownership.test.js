import fs from 'fs';
import path from 'path';

describe('create a diversion dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const dialogPath = path.join(root, 'scripts/chat/dialogs/CreateADiversionPreviewDialog.js');
  const contextPath = path.join(
    root,
    'scripts/chat/dialogs/CreateADiversion/create-a-diversion-dialog-context.js',
  );
  const actionsPath = path.join(
    root,
    'scripts/chat/dialogs/CreateADiversion/create-a-diversion-dialog-actions.js',
  );

  test('create a diversion dialog delegates render context assembly', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain(
      "from './CreateADiversion/create-a-diversion-dialog-context.js'",
    );
    expect(source).toContain('prepareCreateADiversionDialogContext(this, context)');
    expect(source).not.toContain('filterOutcomesByAllies');
    expect(source).not.toContain('filterOutcomesByDetection');
    expect(source).not.toContain('getDesiredOverrideStatesForAction');

    expect(contextSource).toContain(
      'export async function prepareCreateADiversionDialogContext',
    );
    expect(contextSource).toContain('filterOutcomesByAllies');
    expect(contextSource).toContain('filterOutcomesByDetection');
    expect(contextSource).toContain('getDesiredOverrideStatesForAction');
  });

  test('create a diversion dialog delegates apply and revert workflows', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const actionsSource = fs.readFileSync(actionsPath, 'utf8');

    expect(source).toContain(
      "from './CreateADiversion/create-a-diversion-dialog-actions.js'",
    );
    expect(source).toContain('applyDiversionChange(currentDiversionDialog, button)');
    expect(source).toContain('revertDiversionChange(currentDiversionDialog, button)');
    expect(source).toContain('applyAllDiversionChanges(currentDiversionDialog)');
    expect(source).toContain('revertAllDiversionChanges(currentDiversionDialog)');
    expect(source).not.toContain('applyNowDiversion');
    expect(source).not.toContain('revertNowDiversion');
    expect(source).not.toContain('applyVisibilityChanges');

    expect(actionsSource).toContain('export async function applyDiversionChange');
    expect(actionsSource).toContain('export async function revertDiversionChange');
    expect(actionsSource).toContain('export async function applyAllDiversionChanges');
    expect(actionsSource).toContain('export async function revertAllDiversionChanges');
    expect(actionsSource).toContain('applyNowDiversion');
    expect(actionsSource).toContain('revertNowDiversion');
    expect(actionsSource).toContain('applyVisibilityChanges');
  });
});
