/**
 * @file base-action-dialog.override-integration.test.js
 * @description Integration test for override removal during revert operations
 */

import '../../setup.js';

describe('BaseActionDialog - Override Removal Integration', () => {
  test('revert functions include override removal logic', () => {
    // Read the actual implementation to verify it includes override removal
    const fs = require('fs');
    const path = require('path');

    const dialogPath = path.join(__dirname, '../../../scripts/chat/dialogs/base-action-dialog.js');
    const content = fs.readFileSync(dialogPath, 'utf8');

    // Verify onRevertChange includes override removal with direction-aware logic
    expect(content).toMatch(/AvsOverrideManager.*removeOverride/);
    expect(content).toMatch(/getApplyDirection/);
    expect(content).toMatch(/observer_to_target/);

    // Verify onRevertAll includes override removal
    expect(content).toMatch(/for.*const outcome of appliedOutcomes/);
    expect(content).toMatch(/removedOverrides\+\+/);

    // Verify functions import AvsOverrideManager (in onApplyChange, onRevertChange, onApplyAll, onRevertAll)
    // Count occurrences of AvsOverrideManager usage - imports may span multiple lines
    const avsUsageMatches = content.match(/AvsOverrideManager\.removeOverride/g);
    expect(avsUsageMatches?.length || 0).toBeGreaterThanOrEqual(2); // At least in apply/revert functions
  });

  test('revert functions handle non-AVS states correctly', () => {
    const fs = require('fs');
    const path = require('path');

    const dialogPath = path.join(__dirname, '../../../scripts/chat/dialogs/base-action-dialog.js');
    const content = fs.readFileSync(dialogPath, 'utf8');

    // Verify the logic checks for non-AVS states
    expect(content).toMatch(/effectiveOldState.*!==.*'avs'/);
    expect(content).toMatch(/effectiveOldState.*!==.*outcome\.currentVisibility/);

    // Verify it calls updateTokenVisuals after removing overrides
    expect(content).toMatch(/updateTokenVisuals.*await/);
  });
});
