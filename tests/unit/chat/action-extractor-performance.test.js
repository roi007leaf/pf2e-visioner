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
});
