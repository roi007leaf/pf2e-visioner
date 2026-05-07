import fs from 'fs';
import path from 'path';

describe('AVS override v2 internal boundary', () => {
  const root = path.resolve(__dirname, '../../..');
  const internalOverrideLogicFiles = [
    'scripts/chat/services/infra/AvsOverrideManager.js',
    'scripts/services/TimedOverrideManager.js',
    'scripts/services/EncounterStealthInitiativeService.js',
    'scripts/visibility/auto-visibility/OverrideValidationSystem.js',
    'scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js',
    'scripts/visibility/auto-visibility/core/BatchOrchestrator.js',
    'scripts/visibility/auto-visibility/core/OverrideValidationManager.js',
  ];

  test.each(internalOverrideLogicFiles)(
    '%s consumes canonical override profiles instead of legacy override state conversion',
    (relativePath) => {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');

      expect(source).not.toContain('overrideToLegacyVisibility');
    },
  );
});
