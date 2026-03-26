import '../../setup.js';
import { jest } from '@jest/globals';

const mockDetectCover = jest.fn(() => 'standard');
const mockGetCoverMap = jest.fn(() => null);

jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  __esModule: true,
  default: {
    detectCoverBetweenTokens: (...args) => mockDetectCover(...args),
  },
}));

jest.mock('../../../scripts/stores/cover-map.js', () => ({
  getCoverMap: (...args) => mockGetCoverMap(...args),
}));

const { Pf2eVisionerApi } = require('../../../scripts/api.js');

const makeToken = (id) => ({
  id,
  document: { getFlag: jest.fn(() => ({})) },
});

describe('getAutoCoverState cache lookup', () => {
  let observerToken;
  let targetToken;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDetectCover.mockReturnValue('standard');
    mockGetCoverMap.mockReturnValue(null);

    observerToken = makeToken('obs1');
    targetToken = makeToken('tgt1');

    global.canvas.tokens.get = jest.fn((id) => {
      if (id === 'obs1') return observerToken;
      if (id === 'tgt1') return targetToken;
      return undefined;
    });

    game.settings.get = jest.fn((mod, key) => {
      if (key === 'autoCover') return true;
      return false;
    });
  });

  test('uses cached cover from getCoverMap when available', () => {
    mockGetCoverMap.mockReturnValue({ tgt1: 'greater' });

    const result = Pf2eVisionerApi.getAutoCoverState(observerToken, targetToken);

    expect(mockGetCoverMap).toHaveBeenCalledWith(observerToken);
    expect(mockDetectCover).not.toHaveBeenCalled();
    expect(result).toBe('greater');
  });

  test('falls back to fresh calculation when cache has no entry', () => {
    mockGetCoverMap.mockReturnValue({});

    const result = Pf2eVisionerApi.getAutoCoverState(observerToken, targetToken);

    expect(mockDetectCover).toHaveBeenCalled();
    expect(result).toBe('standard');
  });

  test('falls back to fresh calculation when cache returns none', () => {
    mockGetCoverMap.mockReturnValue({ tgt1: 'none' });

    const result = Pf2eVisionerApi.getAutoCoverState(observerToken, targetToken);

    expect(mockDetectCover).toHaveBeenCalled();
    expect(result).toBe('standard');
  });

  test('skips cache when forceRecalculate is true', () => {
    mockGetCoverMap.mockReturnValue({ tgt1: 'greater' });

    const result = Pf2eVisionerApi.getAutoCoverState(observerToken, targetToken, {
      forceRecalculate: true,
    });

    expect(mockGetCoverMap).not.toHaveBeenCalled();
    expect(mockDetectCover).toHaveBeenCalled();
    expect(result).toBe('standard');
  });

  test('falls back when getCoverMap returns null', () => {
    mockGetCoverMap.mockReturnValue(null);

    const result = Pf2eVisionerApi.getAutoCoverState(observerToken, targetToken);

    expect(mockDetectCover).toHaveBeenCalled();
    expect(result).toBe('standard');
  });
});
