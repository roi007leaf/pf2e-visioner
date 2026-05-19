import fs from 'fs';
import path from 'path';

describe('point out dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const dialogPath = path.join(root, 'scripts/chat/dialogs/PointOutPreviewDialog.js');
  const contextPath = path.join(root, 'scripts/chat/dialogs/PointOut/point-out-dialog-context.js');
  const actionsPath = path.join(root, 'scripts/chat/dialogs/PointOut/point-out-dialog-actions.js');

  test('point out dialog delegates render context and filtering', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './PointOut/point-out-dialog-context.js'");
    expect(source).toContain('preparePointOutDialogContext(this, context)');
    expect(source).toContain('getPointOutDialogFilteredOutcomes(this)');
    expect(source).not.toContain('getDesiredOverrideStatesForAction');
    expect(source).not.toContain('filterOutcomesByAllies');
    expect(source).not.toContain('filterOutcomesByDetection');

    expect(contextSource).toContain('export async function preparePointOutDialogContext');
    expect(contextSource).toContain('export async function getPointOutDialogFilteredOutcomes');
    expect(contextSource).toContain('getDesiredOverrideStatesForAction');
    expect(contextSource).toContain('filterOutcomesByAllies');
    expect(contextSource).toContain('filterOutcomesByDetection');
  });

  test('point out dialog delegates apply and revert workflows', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const actionsSource = fs.readFileSync(actionsPath, 'utf8');

    expect(source).toContain("from './PointOut/point-out-dialog-actions.js'");
    expect(source).toContain('applyAllPointOutChanges(currentPointOutDialog)');
    expect(source).toContain('revertAllPointOutChanges(currentPointOutDialog)');
    expect(source).toContain('applyPointOutChange(currentPointOutDialog, button)');
    expect(source).toContain('revertPointOutChange(currentPointOutDialog, button)');
    expect(source).not.toContain('applyNowPointOut');
    expect(source).not.toContain('revertNowPointOut');

    expect(actionsSource).toContain('export async function applyAllPointOutChanges');
    expect(actionsSource).toContain('export async function revertAllPointOutChanges');
    expect(actionsSource).toContain('export async function applyPointOutChange');
    expect(actionsSource).toContain('export async function revertPointOutChange');
    expect(actionsSource).toContain('applyNowPointOut');
    expect(actionsSource).toContain('revertNowPointOut');
  });
});
