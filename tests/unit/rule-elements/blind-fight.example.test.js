import { VisibilityOverride } from '../../../scripts/rule-elements/operations/VisibilityOverride.js';

describe('Blind-Fight example sanity', () => {
  it('stores predicate on visibilityReplacement flag when provided', async () => {
    const token = {
      id: 's1',
      document: {
        setFlag: jest.fn(() => Promise.resolve()),
      },
    };

    const operation = {
      type: 'overrideVisibility',
      fromStates: ['undetected'],
      toState: 'hidden',
      direction: 'to',
      observers: 'enemies',
      range: 5,
      predicate: ['self:trait:human'],
      source: 'blind-fight',
    };

    await VisibilityOverride.applyVisibilityOverride(operation, token);

    expect(token.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityReplacement',
      expect.objectContaining({ predicate: ['self:trait:human'] })
    );
  });
});
