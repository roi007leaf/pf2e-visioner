import '../../setup.js';

describe('EnhancedSneakOutcome', () => {
  let originalSettings;

  beforeEach(() => {
    originalSettings = {
      sneakAllowHiddenUndetectedEndPosition: game.settings.get('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition'),
    };
  });

  afterEach(() => {
    Object.keys(originalSettings).forEach((key) => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });
  });

  describe('doesPositionQualifyForSneak', () => {
    test('start position requires hidden or undetected', async () => {
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('hidden', true)).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('undetected', true)).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', true)).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', true)).toBe(false);
    });

    test('end position qualifies with concealed', async () => {
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'none')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'lesser')).toBe(true);
    });

    test('end position qualifies with concealed even when setting is disabled', async () => {
      game.settings.set('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition', false);
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'none')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'lesser')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'standard')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('concealed', false, 'greater')).toBe(true);
    });

    test('end position qualifies with standard or greater cover', async () => {
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'standard')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'greater')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'lesser')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'none')).toBe(false);
    });

    test('end position qualifies with hidden/undetected when setting enabled', async () => {
      game.settings.set('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition', true);
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('hidden', false, 'none')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('undetected', false, 'none')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('hidden', false, 'lesser')).toBe(true);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('undetected', false, 'lesser')).toBe(true);
    });

    test('end position does not qualify with hidden/undetected when setting disabled', async () => {
      game.settings.set('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition', false);
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('hidden', false, 'none')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('undetected', false, 'none')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('hidden', false, 'lesser')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('undetected', false, 'lesser')).toBe(false);
    });

    test('end position does not qualify with observed and no cover', async () => {
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'none')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('observed', false, 'lesser')).toBe(false);
    });

    test('end position handles null/undefined visibility state', async () => {
      const { EnhancedSneakOutcome } = await import('../../../scripts/chat/services/actions/EnhancedSneakOutcome.js');

      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak(null, false, 'none')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak(undefined, false, 'none')).toBe(false);
      expect(EnhancedSneakOutcome.doesPositionQualifyForSneak('', false, 'none')).toBe(false);
    });
  });
});

