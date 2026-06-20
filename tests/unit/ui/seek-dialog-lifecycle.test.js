/**
 * @jest-environment jsdom
 */

import {
  cleanupSeekDialogLifecycle,
  cleanupSeekPreviewTemplate,
  cleanupSeekSelectionHook,
} from '../../../scripts/chat/dialogs/Seek/seek-dialog-lifecycle.js';

describe('seek dialog lifecycle cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    global.Hooks.off = jest.fn();
    global.canvas = {
      scene: {
        templates: new Map([['template-1', { id: 'template-1' }]]),
        getEmbeddedDocument: jest.fn(),
        deleteEmbeddedDocuments: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('removes auto-created seek preview template', () => {
    cleanupSeekPreviewTemplate({ templateId: 'template-1' });

    expect(canvas.scene.deleteEmbeddedDocuments).toHaveBeenCalledWith('MeasuredTemplate', [
      'template-1',
    ]);
  });

  test('keeps manual template placement cleanup out of dialog close', () => {
    cleanupSeekPreviewTemplate({ templateId: 'template-1', templateCenter: { x: 10, y: 20 } });

    expect(canvas.scene.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('removes selection hook and clears tooltip', () => {
    const tooltip = document.createElement('div');
    document.body.appendChild(tooltip);
    const app = { _selectionHookId: 42, _currentTooltip: tooltip };

    cleanupSeekDialogLifecycle(app);
    jest.advanceTimersByTime(200);

    expect(Hooks.off).toHaveBeenCalledWith('controlToken', 42);
    expect(app._selectionHookId).toBeNull();
    expect(document.body.contains(tooltip)).toBe(false);
  });

  test('selection hook cleanup tolerates missing hook id', () => {
    const app = {};

    cleanupSeekSelectionHook(app);

    expect(Hooks.off).not.toHaveBeenCalled();
  });
});
