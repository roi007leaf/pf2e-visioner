import fs from 'fs';
import path from 'path';

describe('hide action module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const actionsRoot = path.join(root, 'scripts/chat/services/actions');
  const legacyHidePath = path.join(actionsRoot, 'hide-action.js');
  const canonicalHidePath = path.join(actionsRoot, 'HideAction.js');

  test('legacy lowercase hide module is only a compatibility re-export', () => {
    const source = fs.readFileSync(legacyHidePath, 'utf8').trim();

    expect(source).toBe("export * from './HideAction.js';");
  });

  test('canonical hide action delegates specialized behavior to owner modules', () => {
    const source = fs.readFileSync(canonicalHidePath, 'utf8');

    expect(source).toContain("from './Hide/hide-cover-analysis.js'");
    expect(source).toContain("from './Hide/hide-position-qualification.js'");
    expect(source).toContain("from './Hide/hide-roll-outcome.js'");
    expect(source).toContain("from './Hide/hide-subject-discovery.js'");
    expect(source).toContain("from './Hide/hide-visibility-outcome.js'");

    expect(source).not.toContain('COVER_STATES');
    expect(source).not.toContain('getCoverBetween');
    expect(source).not.toContain('PositionTracker.js');
    expect(source).not.toContain('calculateStealthRollTotals');
    expect(source).not.toContain('determineOutcome');
    expect(source).not.toContain('getDefaultNewStateFor');
    expect(source).not.toContain('canvas?.tokens?.placeables');
    expect(source).not.toContain('shouldFilterAlly');
  });
});
