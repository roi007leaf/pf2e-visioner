import {
  buildVisibilityFactorTooltipLines,
  buildVisibilityFactorIndicatorRequests,
  formatVisibilityFactors,
  getVisibilityFactorTargets,
  isDetectionFactorReason,
  normalizeVisibilityFactorLightingKey,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-factor-overlay.js';

function makeToken(id, isVisible = true) {
  return { id, isVisible };
}

describe('hover tooltip factor overlay', () => {
  test('normalizes rank-specific magical darkness lighting keys', () => {
    expect(normalizeVisibilityFactorLightingKey('magicalDarknessRank4')).toBe('magicalDarkness');
    expect(normalizeVisibilityFactorLightingKey('greaterMagicalDarkness')).toBe(
      'greaterMagicalDarkness',
    );
  });

  test('formats visibility factors with localized labels and emphasized detection reasons', () => {
    const factorText = formatVisibilityFactors(
      {
        state: 'concealed',
        lighting: 'magicalDarknessRank4',
        reasons: ['Detected by lifesense', 'Cover applies'],
      },
      {
        localize: (key) => `loc:${key}`,
        formatStateLabel: (state) => `state:${state}`,
      },
    );

    expect(factorText).toContain('loc:PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL');
    expect(factorText).toContain('state:concealed');
    expect(factorText).toContain('loc:PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING.magicalDarkness');
    expect(factorText).toContain('&bull; <strong>Detected by lifesense</strong>');
    expect(factorText).toContain('&bull; Cover applies');
  });

  test('builds structured factor tooltip lines for renderers', () => {
    const lines = buildVisibilityFactorTooltipLines(
      {
        state: 'hidden',
        lighting: 'magicalDarknessRank4',
        reasons: ['Detected by lifesense', 'Cover applies'],
      },
      {
        localize: (key) => `loc:${key}`,
        formatStateLabel: (state) => `state:${state}`,
      },
    );

    expect(lines).toEqual([
      { text: 'loc:PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL: state:hidden' },
      {
        text: 'loc:PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING_LABEL: loc:PF2E_VISIONER.VISIBILITY_FACTORS.LIGHTING.magicalDarkness',
      },
      { text: '' },
      { text: 'Detected by lifesense', bullet: true, emphasized: true },
      { text: 'Cover applies', bullet: true, emphasized: false },
    ]);
  });

  test('detects sense-related factor reasons', () => {
    expect(isDetectionFactorReason('Detected by thoughtsense')).toBe(true);
    expect(isDetectionFactorReason('Cover applies')).toBe(false);
  });

  test('filters factor overlay targets to visible non-observer tokens', () => {
    const observer = makeToken('observer');
    const target = makeToken('target');
    const hidden = makeToken('hidden', false);

    expect(getVisibilityFactorTargets([observer, target, hidden], observer)).toEqual([target]);
  });

  test('builds factor indicator requests without serial wait', async () => {
    const observer = makeToken('observer');
    const targetA = makeToken('target-a');
    const targetB = makeToken('target-b');
    let resolveFirstTarget;
    const getVisibilityFactors = jest.fn((_observerId, targetId) => {
      if (targetId === 'target-a') {
        return new Promise((resolve) => {
          resolveFirstTarget = resolve;
        });
      }
      return Promise.resolve({ state: 'hidden' });
    });

    const requestPromise = buildVisibilityFactorIndicatorRequests({
      observerToken: observer,
      targetTokens: [targetA, targetB],
      getVisibilityFactors,
      formatFactors: (factors) => `formatted:${factors.state}`,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getVisibilityFactors).toHaveBeenCalledWith('observer', 'target-a');
    expect(getVisibilityFactors).toHaveBeenCalledWith('observer', 'target-b');

    resolveFirstTarget({ state: 'concealed' });
    const requests = await requestPromise;

    expect(requests).toEqual([
      {
        observerToken: observer,
        targetToken: targetA,
        factorText: 'formatted:concealed',
        factorLines: [{ text: 'PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL: concealed' }],
        state: 'concealed',
        factors: { state: 'concealed' },
      },
      {
        observerToken: observer,
        targetToken: targetB,
        factorText: 'formatted:hidden',
        factorLines: [{ text: 'PF2E_VISIONER.VISIBILITY_FACTORS.STATE_LABEL: hidden' }],
        state: 'hidden',
        factors: { state: 'hidden' },
      },
    ]);
  });
});
