import fs from 'fs';
import path from 'path';

describe('seek dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const seekDialogPath = path.join(root, 'scripts/chat/dialogs/SeekPreviewDialog.js');
  const contextPath = path.join(root, 'scripts/chat/dialogs/Seek/seek-dialog-context.js');

  test('seek dialog delegates context assembly to owner module', () => {
    const source = fs.readFileSync(seekDialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './Seek/seek-dialog-context.js'");
    expect(source).toContain("from './Seek/seek-dialog-lifecycle.js'");
    expect(source).not.toContain("from './Seek/seek-dialog-filtering.js'");
    expect(source).not.toContain("from './Seek/seek-sense-context.js'");
    expect(source).not.toContain('prepareSeekOutcomeContexts');
    expect(source).not.toContain('buildSeekSenseContext');
    expect(source).not.toContain('deleteEmbeddedDocuments');
    expect(source).not.toContain("Hooks.off('controlToken'");
    expect(contextSource).toContain('prepareSeekDialogContext');
    expect(contextSource).toContain('getSeekDisplayOutcomes');
  });
});
