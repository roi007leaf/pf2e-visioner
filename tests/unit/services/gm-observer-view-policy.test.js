import { resolveGmObserverTokenPresentation } from '../../../scripts/services/GmObserverView/gm-observer-view-policy.js';

describe('GM Observer View presentation policy', () => {
  const base = {
    active: true,
    controlled: false,
    preview: false,
    filteredOut: false,
    culled: false,
    hasObservers: true,
    coreVisible: true,
    visionerState: null,
  };

  it('leaves rendering untouched outside observer view', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, active: false })).toBe('unchanged');
  });

  it.each([
    ['controlled token', { controlled: true }],
    ['preview token', { preview: true }],
    ['filtered token', { filteredOut: true }],
    ['culled token', { culled: true }],
  ])('leaves an ineligible %s untouched', (_label, change) => {
    expect(resolveGmObserverTokenPresentation({ ...base, ...change })).toBe('unchanged');
  });

  it('shows eligible tokens normally when no observer is selected', () => {
    expect(
      resolveGmObserverTokenPresentation({
        ...base,
        hasObservers: false,
        coreVisible: false,
        visionerState: 'undetected',
      }),
    ).toBe('normal');
  });

  it('leaves a token perceived by Core and Visioner unchanged', () => {
    expect(resolveGmObserverTokenPresentation(base)).toBe('unchanged');
  });

  it('uses undetected treatment outside Core perception', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, coreVisible: false })).toBe(
      'undetected',
    );
  });

  it('uses outline-only hidden treatment for a Visioner-hidden token', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, visionerState: 'hidden' })).toBe(
      'hidden',
    );
  });

  it('uses undetected treatment for a Visioner-undetected token', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, visionerState: 'undetected' })).toBe(
      'undetected',
    );
  });

  it('uses unnoticed treatment for a Visioner-unnoticed token', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, visionerState: 'unnoticed' })).toBe(
      'unnoticed',
    );
  });
});
