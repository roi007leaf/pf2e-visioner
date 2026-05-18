import '../../setup.js';

import {
  MESSAGE_CACHE_ENTRY_LIMIT,
  appliedConsequencesChangesByMessage,
  appliedDiversionChangesByMessage,
  appliedHideChangesByMessage,
  appliedPointOutChangesByMessage,
  appliedSeekChangesByMessage,
  appliedSneakChangesByMessage,
  appliedTakeCoverChangesByMessage,
  processedMessages,
} from '../../../scripts/chat/services/data/message-cache.js';

const actionCaches = [
  appliedSeekChangesByMessage,
  appliedHideChangesByMessage,
  appliedSneakChangesByMessage,
  appliedDiversionChangesByMessage,
  appliedConsequencesChangesByMessage,
  appliedPointOutChangesByMessage,
  appliedTakeCoverChangesByMessage,
];

describe('message-scoped action caches', () => {
  beforeEach(() => {
    processedMessages.clear();
    for (const cache of actionCaches) cache.clear();
  });

  test('processed message dedupe cache evicts oldest entries at the shared limit', () => {
    for (let i = 0; i <= MESSAGE_CACHE_ENTRY_LIMIT; i++) {
      processedMessages.add(`message-${i}`);
    }

    expect(processedMessages.size).toBe(MESSAGE_CACHE_ENTRY_LIMIT);
    expect(processedMessages.has('message-0')).toBe(false);
    expect(processedMessages.has(`message-${MESSAGE_CACHE_ENTRY_LIMIT}`)).toBe(true);
  });

  test('all applied action caches evict oldest message entries at the shared limit', () => {
    for (const cache of actionCaches) {
      for (let i = 0; i <= MESSAGE_CACHE_ENTRY_LIMIT; i++) {
        cache.set(`message-${i}`, [{ tokenId: `token-${i}` }]);
      }

      expect(cache.size).toBe(MESSAGE_CACHE_ENTRY_LIMIT);
      expect(cache.has('message-0')).toBe(false);
      expect(cache.get(`message-${MESSAGE_CACHE_ENTRY_LIMIT}`)).toEqual([
        { tokenId: `token-${MESSAGE_CACHE_ENTRY_LIMIT}` },
      ]);
    }
  });
});
