import '../../setup.js';

import { handlePreCreateChatMessage } from '../../../scripts/chat/services/pre-create-message.js';

describe('pre-create chat message service', () => {
  test('captures roll-time position before expiring Take Cover on attack messages', async () => {
    const calls = [];
    const captureRollTimePosition = jest.fn(async () => calls.push('capture'));
    const expireTakeCoverOnAttackMessage = jest.fn(async () => calls.push('expire'));
    const message = { id: 'message-1' };

    const result = await handlePreCreateChatMessage(message, {
      captureRollTimePosition,
      expireTakeCoverOnAttackMessage,
    });

    expect(result).toEqual({ positionCaptured: true, takeCoverExpired: true });
    expect(captureRollTimePosition).toHaveBeenCalledWith(message);
    expect(expireTakeCoverOnAttackMessage).toHaveBeenCalledWith(message);
    expect(calls).toEqual(['capture', 'expire']);
  });

  test('continues to Take Cover expiration when position capture fails', async () => {
    const failure = new Error('capture failed');
    const warn = jest.fn();
    const expireTakeCoverOnAttackMessage = jest.fn().mockResolvedValue(undefined);

    const result = await handlePreCreateChatMessage(
      { id: 'message-1' },
      {
        captureRollTimePosition: jest.fn().mockRejectedValue(failure),
        expireTakeCoverOnAttackMessage,
        warn,
      },
    );

    expect(result).toEqual({ positionCaptured: false, takeCoverExpired: true });
    expect(expireTakeCoverOnAttackMessage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to capture roll-time position:',
      failure,
    );
  });

  test('reports Take Cover expiration failure without throwing', async () => {
    const failure = new Error('expiration failed');
    const warn = jest.fn();

    const result = await handlePreCreateChatMessage(
      { id: 'message-1' },
      {
        captureRollTimePosition: jest.fn().mockResolvedValue(undefined),
        expireTakeCoverOnAttackMessage: jest.fn().mockRejectedValue(failure),
        warn,
      },
    );

    expect(result).toEqual({ positionCaptured: true, takeCoverExpired: false });
    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to expire Take Cover on attack:',
      failure,
    );
  });
});
