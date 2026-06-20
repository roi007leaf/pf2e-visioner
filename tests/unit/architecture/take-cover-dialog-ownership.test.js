import fs from 'fs';
import path from 'path';

describe('take cover dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const dialogPath = path.join(root, 'scripts/chat/dialogs/TakeCoverPreviewDialog.js');
  const contextPath = path.join(root, 'scripts/chat/dialogs/TakeCover/take-cover-dialog-context.js');
  const actionsPath = path.join(root, 'scripts/chat/dialogs/TakeCover/take-cover-dialog-actions.js');

  test('take cover dialog delegates cover context and filtering', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './TakeCover/take-cover-dialog-context.js'");
    expect(source).toContain('prepareTakeCoverDialogContext(this, context)');
    expect(source).toContain('getTakeCoverDialogFilteredOutcomes(this)');
    expect(source).not.toContain('filterOutcomesByAllies');
    expect(source).not.toContain('filterOutcomesByDetection');
    expect(source).not.toContain('FeatsHandler');

    expect(contextSource).toContain('export async function prepareTakeCoverDialogContext');
    expect(contextSource).toContain('export async function getTakeCoverDialogFilteredOutcomes');
    expect(contextSource).toContain('FeatsHandler');
    expect(contextSource).toContain('filterOutcomesByAllies');
    expect(contextSource).toContain('filterOutcomesByDetection');
  });

  test('take cover dialog delegates apply and revert workflows', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const actionsSource = fs.readFileSync(actionsPath, 'utf8');

    expect(source).toContain("from './TakeCover/take-cover-dialog-actions.js'");
    expect(source).toContain('applyAllTakeCoverChanges(currentTakeCoverDialog)');
    expect(source).toContain('revertAllTakeCoverChanges(currentTakeCoverDialog)');
    expect(source).toContain('applyTakeCoverChange(currentTakeCoverDialog, target)');
    expect(source).toContain('revertTakeCoverChange(currentTakeCoverDialog, target)');
    expect(source).not.toContain('applyNowTakeCover');
    expect(source).not.toContain('revertNowTakeCover');

    expect(actionsSource).toContain('export async function applyAllTakeCoverChanges');
    expect(actionsSource).toContain('export async function revertAllTakeCoverChanges');
    expect(actionsSource).toContain('export async function applyTakeCoverChange');
    expect(actionsSource).toContain('export async function revertTakeCoverChange');
    expect(actionsSource).toContain('applyNowTakeCover');
    expect(actionsSource).toContain('revertNowTakeCover');
  });
});
