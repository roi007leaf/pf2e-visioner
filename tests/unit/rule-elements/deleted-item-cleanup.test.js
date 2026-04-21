import '../../setup.js';

describe('Deleted item rule-element cleanup', () => {
  test('cleans up Visioner operations from item.system.rules even when item.rules is missing', async () => {
    jest.resetModules();

    jest.doMock('../../../scripts/rule-elements/operations/VisibilityOverride.js', () => ({
      VisibilityOverride: {
        removeVisibilityOverride: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/CoverOverride.js', () => ({
      CoverOverride: {
        removeCoverOverride: jest.fn(() => Promise.resolve()),
        removeProvideCover: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/SenseModifier.js', () => ({
      SenseModifier: {
        restoreSenses: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/DetectionModeModifier.js', () => ({
      DetectionModeModifier: {
        restoreDetectionModes: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/ActionQualifier.js', () => ({
      ActionQualifier: {
        removeActionQualifications: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/LightingModifier.js', () => ({
      LightingModifier: {
        removeLightingModification: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/DistanceBasedVisibility.js', () => ({
      DistanceBasedVisibility: {
        removeDistanceBasedVisibility: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/OffGuardSuppression.js', () => ({
      OffGuardSuppression: {
        removeOffGuardSuppression: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/AuraVisibility.js', () => ({
      AuraVisibility: {
        removeAuraVisibility: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('../../../scripts/rule-elements/operations/ShareVision.js', () => ({
      ShareVision: {
        removeShareVision: jest.fn(() => Promise.resolve()),
      },
    }));

    const { cleanupDeletedVisionerRuleElements } = await import(
      '../../../scripts/rule-elements/deleted-item-cleanup.js'
    );
    const { VisibilityOverride } = await import(
      '../../../scripts/rule-elements/operations/VisibilityOverride.js'
    );
    const { CoverOverride } = await import(
      '../../../scripts/rule-elements/operations/CoverOverride.js'
    );

    const token = {
      id: 'token-a',
      name: 'Token A',
      document: {
        getFlag: jest.fn((scope, key) => {
          if (key === 'ruleElementRegistry') {
            return {
              'item-item-1': ['ruleElementOverride', 'visibilityReplacement', 'overrideCover'],
            };
          }
          return null;
        }),
        update: jest.fn(() => Promise.resolve()),
      },
    };

    const item = {
      id: 'item-1',
      name: 'Ear Sight',
      type: 'effect',
      parent: { id: 'actor-1' },
      system: {
        rules: [
          {
            key: 'PF2eVisionerEffect',
            slug: 'effect',
            operations: [
              {
                type: 'overrideVisibility',
                source: 'ear-sight-broken',
                direction: 'to',
                observers: 'all',
              },
              {
                type: 'overrideCover',
                source: 'cover-test',
                direction: 'from',
                targets: 'all',
                state: 'greater',
              },
            ],
          },
        ],
      },
    };

    await cleanupDeletedVisionerRuleElements(item, [token]);

    expect(VisibilityOverride.removeVisibilityOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ear-sight-broken',
        direction: 'to',
      }),
      token,
      'item-1-effect',
    );
    expect(CoverOverride.removeCoverOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cover-test',
        direction: 'from',
      }),
      token,
      expect.objectContaining({
        item,
        slug: 'effect',
        ruleElementId: 'item-1-effect',
      }),
    );
    expect(token.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        'flags.pf2e-visioner.ruleElementOverride': null,
        'flags.pf2e-visioner.visibilityReplacement': null,
        'flags.pf2e-visioner.overrideCover': null,
        'flags.pf2e-visioner.ruleElementRegistry.-=item-item-1': null,
      }),
    );
  });
});
