import '../../setup.js';

import { processedMessages } from '../../../scripts/chat/services/data/message-cache.js';
import { handleRenderChatMessage } from '../../../scripts/chat/services/entry-service.js';

describe('chat entry service', () => {
  beforeEach(() => {
    processedMessages.clear();
    game.user.isGM = true;
  });

  afterEach(() => {
    processedMessages.clear();
    jest.restoreAllMocks();
  });

  test('skips processed messages with an existing automation panel before action extraction', async () => {
    const message = {
      id: 'message-1',
      author: { id: game.user.id },
      speaker: { token: 'token-1' },
      flags: {
        pf2e: {
          context: {
            type: 'skill-check',
            slug: 'hide',
            options: ['action:hide'],
          },
        },
      },
    };
    const html = {
      find: jest.fn((selector) => {
        if (selector === '.pf2e-visioner-automation-panel') return { length: 1 };
        return { length: 0 };
      }),
    };
    global.canvas.tokens.get = jest.fn();
    processedMessages.add(message.id);

    await handleRenderChatMessage(message, html);

    expect(global.canvas.tokens.get).not.toHaveBeenCalled();
    expect(html.find).toHaveBeenCalledWith('.pf2e-visioner-automation-panel');
  });
});
