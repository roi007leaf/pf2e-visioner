import fs from 'fs';
import path from 'path';

describe('sneak action module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const sneakActionPath = path.join(root, 'scripts/chat/services/actions/SneakAction.js');

  test('sneak action delegates cover and roll concerns to owner modules', () => {
    const source = fs.readFileSync(sneakActionPath, 'utf8');

    expect(source).toContain("from './Sneak/sneak-cover-analysis.js'");
    expect(source).toContain("from './Sneak/sneak-cleanup.js'");
    expect(source).toContain("from './Sneak/sneak-position-qualification.js'");
    expect(source).toContain("from './Sneak/sneak-roll-outcome.js'");
    expect(source).toContain("from './Sneak/sneak-start-position.js'");
    expect(source).toContain("from './Sneak/sneak-start-state-enrichment.js'");
    expect(source).toContain("from './Sneak/sneak-subject-discovery.js'");
    expect(source).toContain("from './Sneak/sneak-token-resolution.js'");
    expect(source).toContain("from './Sneak/sneak-visibility-initialization.js'");
    expect(source).toContain("from './Sneak/sneak-visibility-outcome.js'");

    expect(source).not.toContain('COVER_STATES');
    expect(source).not.toContain('getCoverBetween');
    expect(source).not.toContain('calculateStealthRollTotals');
    expect(source).not.toContain('determineOutcome');
    expect(source).not.toContain('getOutcomeLabel');
    expect(source).not.toContain('getDefaultNewStateFor');
    expect(source).not.toContain('EnhancedSneakOutcome');
    expect(source).not.toContain('shouldSkipEndCoverRequirement');
    expect(source).not.toContain('recordRollOutcome');
    expect(source).not.toContain('_enrichOutcomesWithStartStates');
    expect(source).not.toContain('_checkPositionQualification');
    expect(source).not.toContain('ActionQualificationIntegration');
    expect(source).not.toContain('overridePrerequisites');
    expect(source).not.toContain('shouldDeferEndPositionCheck');
    expect(source).not.toContain('recordDeferredCheck');
    expect(source).not.toContain('getActiveTokens');
    expect(source).not.toContain('rollTimePosition');
    expect(source).not.toContain('actionData.actor?.token?.object');
    expect(source).not.toContain('SNEAK_FLAGS');
    expect(source).not.toContain('applySneakWalkSpeed');
    expect(source).not.toContain('calculateVisibilityBetweenTokens');
    expect(source).not.toContain('getVisibilityMap');
    expect(source).not.toContain('recalculateSneakingTokens');
    expect(source).not.toContain('canvas?.tokens?.placeables');
    expect(source).not.toContain('shouldFilterAlly');
    expect(source).not.toContain('restoreSneakWalkSpeed');
    expect(source).not.toContain("unsetFlag('pf2e-visioner', 'sneak-active')");
    expect(source).not.toContain('#hasSneakAdeptFeat');
  });
});
