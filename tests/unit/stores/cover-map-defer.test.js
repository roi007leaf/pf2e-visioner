import '../../setup.js';

const mockWaitForTokenDocumentUpdateSafe = jest.fn(() => Promise.resolve());
jest.mock('../../../scripts/stores/document-update-guard.js', () => ({
  waitForTokenDocumentUpdateSafe: (...args) => mockWaitForTokenDocumentUpdateSafe(...args),
}));

import { setCoverMap } from '../../../scripts/stores/cover-map.js';

describe('cover-map - defers writes during movement', () => {
  beforeEach(() => {
    mockWaitForTokenDocumentUpdateSafe.mockClear();
    global.game = { ...(global.game || {}), user: { isGM: true } };
  });

  test('setCoverMap awaits the movement guard before writing the flag', async () => {
    const order = [];
    mockWaitForTokenDocumentUpdateSafe.mockImplementation(async () => { order.push('guard'); });
    const token = {
      document: {
        id: 'tok-1',
        getFlag: jest.fn(() => ({})),
        update: jest.fn(async () => { order.push('update'); }),
        unsetFlag: jest.fn(async () => { order.push('unset'); }),
      },
    };

    await setCoverMap(token, { 'target-1': 'standard' });

    expect(mockWaitForTokenDocumentUpdateSafe).toHaveBeenCalledWith(token);
    expect(order[0]).toBe('guard');
    expect(order).toContain('update');
  });

  test('setCoverMap awaits the movement guard before unsetting an empty cover map', async () => {
    const order = [];
    mockWaitForTokenDocumentUpdateSafe.mockImplementation(async () => { order.push('guard'); });
    const token = {
      document: {
        id: 'tok-1',
        getFlag: jest.fn(() => ({ 'target-1': 'standard' })),
        update: jest.fn(async () => { order.push('update'); }),
        unsetFlag: jest.fn(async () => { order.push('unset'); }),
      },
    };

    await setCoverMap(token, {});

    expect(mockWaitForTokenDocumentUpdateSafe).toHaveBeenCalledWith(token);
    expect(order[0]).toBe('guard');
    expect(order).toContain('unset');
  });
});
