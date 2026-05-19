import fs from 'fs';
import path from 'path';

describe('hide dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const hideDialogPath = path.join(root, 'scripts/chat/dialogs/HidePreviewDialog.js');
  const overridePath = path.join(
    root,
    'scripts/chat/dialogs/Hide/hide-override-visibility.js',
  );
  const contextPath = path.join(root, 'scripts/chat/dialogs/Hide/hide-dialog-context.js');
  const actionsPath = path.join(root, 'scripts/chat/dialogs/Hide/hide-dialog-actions.js');
  const positionPath = path.join(
    root,
    'scripts/chat/dialogs/Hide/hide-position-qualification.js',
  );

  test('hide dialog delegates multi-token override visibility lookup', () => {
    const source = fs.readFileSync(hideDialogPath, 'utf8');
    const overrideSource = fs.readFileSync(overridePath, 'utf8');

    expect(source).toContain("from './Hide/hide-override-visibility.js'");
    expect(source).not.toContain('overrideToDisplayVisibility');
    expect(overrideSource).toContain('getHideOverrideVisibilityForActor');
    expect(overrideSource).toContain('avs-override-from-');
  });

  test('hide dialog delegates context and filtering pipeline', () => {
    const source = fs.readFileSync(hideDialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './Hide/hide-dialog-context.js'");
    expect(source).toContain('prepareHideDialogContext(this, context)');
    expect(source).toContain('getHideDialogFilteredOutcomes(this)');
    expect(source).not.toContain('filterOutcomesByAllies');
    expect(source).not.toContain('_capturePositionState');
    expect(source).not.toContain('legacyVisibilityToProfile');
    expect(source).not.toContain('getVisibilityStateConfig');

    expect(contextSource).toContain('export async function prepareHideDialogContext');
    expect(contextSource).toContain('export async function getHideDialogFilteredOutcomes');
    expect(contextSource).toContain('filterOutcomesByAllies');
    expect(contextSource).toContain('_capturePositionState');
    expect(contextSource).toContain('legacyVisibilityToProfile');
    expect(contextSource).toContain('getVisibilityStateConfig');
  });

  test('hide dialog delegates apply and revert action workflows', () => {
    const source = fs.readFileSync(hideDialogPath, 'utf8');
    const actionsSource = fs.readFileSync(actionsPath, 'utf8');

    expect(source).toContain("from './Hide/hide-dialog-actions.js'");
    expect(source).toContain('applyAllHideDialogChanges(currentHideDialog)');
    expect(source).toContain('revertAllHideDialogChanges(currentHideDialog)');
    expect(source).toContain('applyHideDialogChange(currentHideDialog, target)');
    expect(source).toContain('revertHideDialogChange(currentHideDialog, target)');
    expect(source).not.toContain('applyNowHide');
    expect(source).not.toContain('revertNowHide');

    expect(actionsSource).toContain('export async function applyAllHideDialogChanges');
    expect(actionsSource).toContain('export async function revertAllHideDialogChanges');
    expect(actionsSource).toContain('export async function applyHideDialogChange');
    expect(actionsSource).toContain('export async function revertHideDialogChange');
    expect(actionsSource).toContain('applyNowHide');
    expect(actionsSource).toContain('revertNowHide');
  });

  test('hide dialog delegates position prerequisite workflow', () => {
    const source = fs.readFileSync(hideDialogPath, 'utf8');
    const positionSource = fs.readFileSync(positionPath, 'utf8');

    expect(source).toContain("from './Hide/hide-position-qualification.js'");
    expect(source).toContain('hideEndPositionQualifies(this, endPos)');
    expect(source).toContain('recalculateHideOutcomeVisibility(this, outcome)');
    expect(source).toContain('toggleHidePositionPrerequisite(currentHideDialog, target)');
    expect(source).not.toContain('ActionQualifier');
    expect(source).not.toContain('setVisibilityBetween');

    expect(positionSource).toContain('export function hideEndPositionQualifies');
    expect(positionSource).toContain('export async function recalculateHideOutcomeVisibility');
    expect(positionSource).toContain('export async function toggleHidePositionPrerequisite');
    expect(positionSource).toContain('ActionQualifier');
    expect(positionSource).toContain('setVisibilityBetween');
  });
});
