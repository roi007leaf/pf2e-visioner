import '../../setup.js';

import { extractActionData } from '../../../scripts/chat/services/action-extractor.js';

describe('action extractor hot path', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not resolve speaker token for non-action messages', async () => {
    global.canvas.tokens.get = jest.fn();

    const result = await extractActionData({
      id: 'message-1',
      content: 'A plain chat message',
      flavor: 'Plain message',
      speaker: { token: 'token-1' },
      flags: { pf2e: { context: { type: 'text' } } },
    });

    expect(result).toBeNull();
    expect(global.canvas.tokens.get).not.toHaveBeenCalled();
  });

  test('normalizes flavor once while checking action markers', async () => {
    const toLowerCase = jest.fn(() => 'point out');
    const trim = jest.fn(() => 'Point Out');
    const actorToken = createMockToken({ id: 'actor-token' });

    const result = await extractActionData({
      id: 'message-1',
      content: '',
      flavor: { toLowerCase, trim },
      token: { object: actorToken },
      speaker: { token: 'actor-token' },
      flags: { pf2e: { context: { type: 'action', options: [] } } },
    });

    expect(result?.actionType).toBe('point-out');
    expect(toLowerCase).toHaveBeenCalledTimes(1);
  });
});
