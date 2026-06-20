import fs from 'fs';
import path from 'path';

describe('seek action module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const seekActionPath = path.join(root, 'scripts/chat/services/actions/SeekAction.js');

  test('seek action delegates hidden-wall and LOS details to owner modules', () => {
    const source = fs.readFileSync(seekActionPath, 'utf8');

    expect(source).toContain("from './Seek/seek-los-partition.js'");
    expect(source).toContain("from './Seek/seek-change-application.js'");
    expect(source).toContain("from './Seek/seek-outcome-analysis.js'");
    expect(source).toContain("from './Seek/seek-subject-discovery.js'");
    expect(source).not.toContain('LevelsIntegration');
    expect(source).not.toContain('#calculateDistanceToWall');
    expect(source).not.toContain('wallIdentifier');
    expect(source).not.toContain('getWallImage');
    expect(source).not.toContain('targetActorType');
    expect(source).not.toContain('observerAlliance');
    expect(source).not.toContain('targetAlliance');
    expect(source).not.toContain('setPreparedActorTokenVisibility');
    expect(source).not.toContain('setPreparedActorWallVisibility');
    expect(source).not.toContain('expandWallIdWithConnected');
    expect(source).not.toContain('updateWallVisuals');
    expect(source).not.toContain('wallStealthDC');
    expect(source).not.toContain('limitSeekRangeInCombat');
    expect(source).not.toContain('limitSeekRangeOutOfCombat');
    expect(source).not.toContain('calculateTokenDistance');
    expect(source).not.toContain('SeekDialogAdapter');
    expect(source).not.toContain('minPerceptionRank');
    expect(source).not.toContain('determineSenseUsed');
    expect(source).not.toContain('getVisibilityStateLabelKey');
    expect(source).not.toContain('buildSeekWallMetadata');
    expect(source).not.toContain('getSeekWallCurrentVisibility');
  });
});
