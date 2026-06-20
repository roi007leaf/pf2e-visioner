import fs from 'fs';
import path from 'path';

describe('consequences action module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const consequencesActionPath = path.join(
    root,
    'scripts/chat/services/actions/ConsequencesAction.js',
  );

  test('consequences action delegates target discovery and outcome defaults', () => {
    const source = fs.readFileSync(consequencesActionPath, 'utf8');

    expect(source).toContain("from './Consequences/consequences-avs-application.js'");
    expect(source).toContain("from './Consequences/consequences-legacy-application.js'");
    expect(source).toContain("from './Consequences/consequences-targets.js'");
    expect(source).not.toContain('AvsOverrideManager');
    expect(source).not.toContain('OverrideValidationIndicator');
    expect(source).not.toContain('overrideToDisplayVisibility');
    expect(source).not.toContain('requestTakeCoverExpirationForToken');
    expect(source).not.toContain('filterOutcomesByEncounter');
    expect(source).not.toContain('getPerceptionProfileMap');
    expect(source).not.toContain('legacyVisibilityToProfile');
    expect(source).not.toContain('updateEmbeddedDocuments');
    expect(source).not.toContain('visibilityV2');
    expect(source).not.toContain('shouldFilterAlly');
    expect(source).not.toContain('getVisibilityStateLabelKey');
    expect(source).not.toContain('getVisibilityBetween');
    expect(source).not.toContain('_visionerConsequencesVisibility');
    expect(source).not.toContain('#isAVSEnabled');
    expect(source).not.toContain('#collectExistingOverrides');
    expect(source).not.toContain('#removeOverridesForConsequences');
    expect(source).not.toContain('#expireTakeCoverForAttack');
  });
});
