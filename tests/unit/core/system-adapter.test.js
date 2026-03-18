import {
  getSystemId,
  isSF2E,
  systemIconPath,
  systemCompendiumId,
  systemSettingGet,
  isSystemSetting,
  resetSystemId,
} from '../../../scripts/system-adapter.js';

describe('system-adapter', () => {
  beforeEach(() => {
    resetSystemId();
  });

  describe('getSystemId', () => {
    it('returns pf2e when system is pf2e', () => {
      game.system.id = 'pf2e';
      expect(getSystemId()).toBe('pf2e');
    });

    it('returns sf2e when system is sf2e', () => {
      game.system.id = 'sf2e';
      expect(getSystemId()).toBe('sf2e');
    });

    it('defaults to pf2e for unknown system', () => {
      game.system.id = 'unknown';
      expect(getSystemId()).toBe('pf2e');
    });

    it('caches the result', () => {
      game.system.id = 'sf2e';
      expect(getSystemId()).toBe('sf2e');
      game.system.id = 'pf2e';
      expect(getSystemId()).toBe('sf2e');
    });
  });

  describe('isSF2E', () => {
    it('returns false for pf2e', () => {
      game.system.id = 'pf2e';
      expect(isSF2E()).toBe(false);
    });

    it('returns true for sf2e', () => {
      game.system.id = 'sf2e';
      expect(isSF2E()).toBe(true);
    });
  });

  describe('systemIconPath', () => {
    it('returns pf2e icon path for pf2e system', () => {
      game.system.id = 'pf2e';
      expect(systemIconPath('equipment/shields/buckler.webp')).toBe(
        'systems/pf2e/icons/equipment/shields/buckler.webp',
      );
    });

    it('returns sf2e icon path for sf2e system', () => {
      game.system.id = 'sf2e';
      expect(systemIconPath('equipment/shields/buckler.webp')).toBe(
        'systems/sf2e/icons/equipment/shields/buckler.webp',
      );
    });
  });

  describe('systemCompendiumId', () => {
    it('returns pf2e compendium id for pf2e system', () => {
      game.system.id = 'pf2e';
      expect(systemCompendiumId('conditionitems.AJh5ex99aV6VTggg')).toBe(
        'pf2e.conditionitems.AJh5ex99aV6VTggg',
      );
    });

    it('returns sf2e compendium id for sf2e system', () => {
      game.system.id = 'sf2e';
      expect(systemCompendiumId('conditionitems.AJh5ex99aV6VTggg')).toBe(
        'sf2e.conditionitems.AJh5ex99aV6VTggg',
      );
    });
  });

  describe('systemSettingGet', () => {
    it('calls game.settings.get with active system id', () => {
      game.system.id = 'sf2e';
      game.settings.get.mockReturnValueOnce(true);
      const result = systemSettingGet('gmVision');
      expect(game.settings.get).toHaveBeenCalledWith('sf2e', 'gmVision');
    });
  });

  describe('isSystemSetting', () => {
    it('matches setting for pf2e system', () => {
      game.system.id = 'pf2e';
      expect(isSystemSetting({ key: 'pf2e.gmVision' }, 'gmVision')).toBe(true);
    });

    it('matches setting for sf2e system', () => {
      game.system.id = 'sf2e';
      expect(isSystemSetting({ key: 'sf2e.gmVision' }, 'gmVision')).toBe(true);
    });

    it('rejects mismatched system setting', () => {
      game.system.id = 'pf2e';
      expect(isSystemSetting({ key: 'sf2e.gmVision' }, 'gmVision')).toBe(false);
    });
  });
});
