import { clearSneakFlag } from '../../../scripts/chat/services/actions/Sneak/sneak-cleanup.js';

describe('sneak cleanup', () => {
  test('does nothing when AVS is disabled', async () => {
    const token = {
      document: { unsetFlag: jest.fn() },
    };

    await clearSneakFlag(
      { sneakingToken: token },
      {
        getSetting: jest.fn(() => false),
        sneakSpeedService: { restoreSneakWalkSpeed: jest.fn() },
      },
    );

    expect(token.document.unsetFlag).not.toHaveBeenCalled();
  });

  test('clears sneak flag and restores speed when AVS is enabled', async () => {
    const token = {
      document: { unsetFlag: jest.fn().mockResolvedValue(undefined) },
    };
    const sneakSpeedService = {
      restoreSneakWalkSpeed: jest.fn().mockResolvedValue(undefined),
    };

    await clearSneakFlag(
      { sneakingToken: token },
      {
        getSetting: jest.fn(() => true),
        sneakSpeedService,
      },
    );

    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'sneak-active');
    expect(sneakSpeedService.restoreSneakWalkSpeed).toHaveBeenCalledWith(token);
  });
});
