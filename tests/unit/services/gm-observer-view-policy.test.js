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
    visionerHidden: false,
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
        visionerHidden: true,
      }),
    ).toBe('normal');
  });

  it('leaves a token perceived by Core and Visioner unchanged', () => {
    expect(resolveGmObserverTokenPresentation(base)).toBe('unchanged');
  });

  it('hatches a token outside Core perception', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, coreVisible: false })).toBe('unseen');
  });

  it('hatches a token hidden by Visioner even when Core reports it visible', () => {
    expect(resolveGmObserverTokenPresentation({ ...base, visionerHidden: true })).toBe('unseen');
  });
});
