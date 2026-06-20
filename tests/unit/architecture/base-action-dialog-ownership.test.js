import fs from 'fs';
import path from 'path';

describe('base action dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const dialogPath = path.join(root, 'scripts/chat/dialogs/base-action-dialog.js');
  const rowTimersPath = path.join(root, 'scripts/chat/dialogs/BaseAction/base-action-row-timers.js');
  const dropdownsPath = path.join(root, 'scripts/chat/dialogs/BaseAction/base-action-dropdowns.js');
  const bulkPath = path.join(root, 'scripts/chat/dialogs/BaseAction/base-action-bulk-overrides.js');
  const rowActionsPath = path.join(root, 'scripts/chat/dialogs/BaseAction/base-action-row-actions.js');
  const applyRevertPath = path.join(
    root,
    'scripts/chat/dialogs/BaseAction/base-action-apply-revert.js',
  );

  test('base dialog delegates row timer DOM workflow', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const helperSource = fs.readFileSync(rowTimersPath, 'utf8');

    expect(source).toContain("from './BaseAction/base-action-row-timers.js'");
    expect(source).toContain('attachRowTimerHandlers(this)');
    expect(source).toContain('toggleRowTimer(this, event, button)');
    expect(source).toContain('updateRowTimerButton(this, tokenId)');
    expect(helperSource).toContain('export function attachRowTimerHandlers');
    expect(helperSource).toContain('export async function toggleRowTimer');
    expect(helperSource).toContain('TimerDurationDialog');
    expect(helperSource).toContain('row-timer-toggle');
  });

  test('base dialog delegates dropdown DOM workflow', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const helperSource = fs.readFileSync(dropdownsPath, 'utf8');

    expect(source).toContain("from './BaseAction/base-action-dropdowns.js'");
    expect(source).toContain('attachDropdownHandlers(this)');
    expect(source).toContain('detachDropdownDocumentHandler(this)');
    expect(source).toContain('closeAllDropdowns(this)');
    expect(helperSource).toContain('export function attachDropdownHandlers');
    expect(helperSource).toContain('export function detachDropdownDocumentHandler');
    expect(helperSource).toContain('row-action-dropdown');
  });

  test('base dialog delegates bulk override workflow', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const helperSource = fs.readFileSync(bulkPath, 'utf8');

    expect(source).toContain("from './BaseAction/base-action-bulk-overrides.js'");
    expect(source).toContain('buildBulkOverrideStates(this)');
    expect(source).toContain('attachBulkOverrideHandlers(this)');
    expect(source).toContain('setBulkOverrideState(this, event, button)');
    expect(source).toContain('clearBulkOverrideState(this)');
    expect(helperSource).toContain('export function buildBulkOverrideStates');
    expect(helperSource).toContain('export function setBulkOverrideState');
    expect(helperSource).toContain('bulkOverrideSet');
  });

  test('base dialog delegates generic apply and revert workflow', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const helperSource = fs.readFileSync(applyRevertPath, 'utf8');

    expect(source).toContain("from './BaseAction/base-action-apply-revert.js'");
    expect(source).toContain('return applyBaseActionChange(event, target, context)');
    expect(source).toContain('return applyBaseActionTimedChange(event, target, context)');
    expect(source).toContain('return revertBaseActionChange(event, target, context)');
    expect(source).toContain('return applyAllBaseActionChanges(event, target, context)');
    expect(source).toContain('return revertAllBaseActionChanges(event, target, context)');
    expect(source).not.toContain('AvsOverrideManager');
    expect(source).not.toContain('TimedOverrideManager');
    expect(source).not.toContain('TimerDurationDialog');
    expect(helperSource).toContain('export async function applyBaseActionChange');
    expect(helperSource).toContain('export async function revertAllBaseActionChanges');
    expect(helperSource).toContain('AvsOverrideManager');
  });

  test('base dialog delegates row action rendering and state icon workflow', () => {
    const source = fs.readFileSync(dialogPath, 'utf8');
    const helperSource = fs.readFileSync(rowActionsPath, 'utf8');

    expect(source).toContain("from './BaseAction/base-action-row-actions.js'");
    expect(source).toContain(
      'updateActionButtonsForTokenInDom(this, tokenId, hasActionableChange, opts)',
    );
    expect(source).toContain('addIconClickHandlersToRows(this)');
    expect(source).toContain('onStateIconClick(this, event)');
    expect(source).toContain('refreshRowActionButtonsInDom(this)');
    expect(source).not.toContain('buildActionButtonsHtml');
    expect(source).not.toContain('stateIconDelegated');
    expect(helperSource).toContain('export function updateActionButtonsForToken');
    expect(helperSource).toContain('export function onStateIconClick');
    expect(helperSource).toContain('row-action-btn apply-change');
  });
});
