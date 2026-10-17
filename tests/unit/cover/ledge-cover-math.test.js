import {
  coverFromVisibleFraction,
  visibleFractionOverLedge,
} from '../../../scripts/cover/ledge/ledge-cover-math.js';

describe('ledge cover math', () => {
  const lowSpan = { bottom: 0, top: 5 };
  const highSpan = { bottom: 10, top: 15 };

  test('lower viewer sees 80% of higher creature set back 10ft with edge 50ft away', () => {
    const fraction = visibleFractionOverLedge({
      viewerSpan: lowSpan,
      targetSpan: highSpan,
      ledgeHeight: 10,
      edgeT: 50 / 60,
    });
    expect(fraction).toBeCloseTo(0.8);
  });

  test('higher viewer sees all of a distant lower creature', () => {
    const fraction = visibleFractionOverLedge({
      viewerSpan: highSpan,
      targetSpan: lowSpan,
      ledgeHeight: 10,
      edgeT: 10 / 60,
    });
    expect(fraction).toBe(1);
  });

  test('creature hugging the base of a tall cliff is hidden from above', () => {
    const fraction = visibleFractionOverLedge({
      viewerSpan: { bottom: 20, top: 25 },
      targetSpan: lowSpan,
      ledgeHeight: 20,
      edgeT: 30 / 32.5,
    });
    expect(fraction).toBe(0);
  });

  test('viewer standing on the edge sees over it when eyes clear the ledge', () => {
    expect(
      visibleFractionOverLedge({ viewerSpan: highSpan, targetSpan: lowSpan, ledgeHeight: 10, edgeT: 0 }),
    ).toBe(1);
    expect(
      visibleFractionOverLedge({ viewerSpan: lowSpan, targetSpan: highSpan, ledgeHeight: 10, edgeT: 0 }),
    ).toBe(0);
  });

  test.each([
    [0, 'greater'],
    [0.3, 'greater'],
    [0.31, 'standard'],
    [0.5, 'standard'],
    [0.51, 'none'],
    [1, 'none'],
  ])('visible fraction %p maps to %s cover with default wall thresholds', (fraction, expected) => {
    expect(coverFromVisibleFraction(fraction)).toBe(expected);
  });

  test('ledges never grant lesser cover', () => {
    for (let fraction = 0; fraction <= 1; fraction += 0.05) {
      expect(coverFromVisibleFraction(fraction)).not.toBe('lesser');
    }
  });

  test('greater cover is capped to standard when greater wall cover is disallowed', () => {
    expect(coverFromVisibleFraction(0, { allowGreater: false })).toBe('standard');
  });

  test('custom wall thresholds are respected', () => {
    expect(coverFromVisibleFraction(0.75, { standardThreshold: 20, greaterThreshold: 90 })).toBe(
      'standard',
    );
  });
});
