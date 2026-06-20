import '../../../setup.js';

jest.mock('../../../../scripts/utils.js', () => ({
  getCoverBetween: jest.fn(() => 'none'),
}));

import { getCoverBetween } from '../../../../scripts/utils.js';
import {
  analyzeStealthObserverCover,
  collectStealthObservers,
  higherStealthCoverState,
  isHostileToHider,
} from '../../../../scripts/cover/auto-cover/usecases/stealth-observer-analysis.js';

function token(id, alliance = 'opposition') {
  return {
    id,
    actor: { alliance },
    name: id,
  };
}

describe('stealth observer analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.canvas.tokens.placeables = [];
  });

  test('collects hostile observers relative to hider alliance', () => {
    const hider = token('hider', 'opposition');
    const ally = token('ally', 'opposition');
    const enemy = token('enemy', 'party');
    const neutral = token('neutral', 'neutral');
    global.canvas.tokens.placeables = [hider, ally, enemy, neutral];

    expect(isHostileToHider(enemy, hider)).toBe(true);
    expect(collectStealthObservers(hider)).toEqual([enemy]);
  });

  test('uses non-party observer mode for legacy stealth roll behavior', () => {
    const hider = token('hider', 'party');
    const party = token('party', 'party');
    const opposition = token('opposition', 'opposition');
    const neutral = token('neutral', 'neutral');
    global.canvas.tokens.placeables = [hider, party, opposition, neutral];

    expect(collectStealthObservers(hider, { mode: 'non-party' })).toEqual([opposition]);
  });

  test('manual cover skips auto-detection and still contributes highest manual state', () => {
    const hider = token('hider', 'party');
    const manual = token('manual', 'opposition');
    const auto = token('auto', 'opposition');
    global.canvas.tokens.placeables = [hider, manual, auto];
    getCoverBetween.mockImplementation((observer) =>
      observer.id === 'manual' ? 'greater' : 'none',
    );
    const detectCover = jest.fn((observer) => (observer.id === 'auto' ? 'standard' : 'none'));

    const result = analyzeStealthObserverCover({ hider, detectCover });

    expect(detectCover).not.toHaveBeenCalledWith(manual, hider);
    expect(detectCover).toHaveBeenCalledWith(auto, hider);
    expect(result.detectedState).toBe('greater');
    expect(result.highestFoundManualCover).toBe('greater');
  });

  test('cover precedence keeps strongest state', () => {
    expect(higherStealthCoverState('standard', 'lesser')).toBe('standard');
    expect(higherStealthCoverState('standard', 'greater')).toBe('greater');
  });
});
