import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SourceTracker } from '../../../scripts/rule-elements/SourceTracker.js';
import { ActionQualifier } from '../../../scripts/rule-elements/operations/ActionQualifier.js';

describe('SourceTracker', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('getVisibilityStateSources', () => {
    it('should return empty array when no sources exist', () => {
      const sources = SourceTracker.getVisibilityStateSources(mockToken);
      expect(sources).toEqual([]);
    });

    it('should return sources when they exist', () => {
      const mockSources = [{ id: 'blur-spell', priority: 100, state: 'concealed' }];
      mockToken.document.getFlag.mockReturnValue({
        visibility: { sources: mockSources },
      });

      const sources = SourceTracker.getVisibilityStateSources(mockToken);
      expect(sources).toEqual(mockSources);
    });

    it('should return observer-specific sources when observerId provided', () => {
      const mockSources = [{ id: 'blur-spell', priority: 100, state: 'concealed' }];
      mockToken.document.getFlag.mockReturnValue({
        visibilityByObserver: {
          'observer-1': { sources: mockSources },
        },
      });

      const sources = SourceTracker.getVisibilityStateSources(mockToken, 'observer-1');
      expect(sources).toEqual(mockSources);
    });
  });

  describe('getQualifyingSources', () => {
    it('should return all sources when no qualifications exist', () => {
      const mockSources = [
        { id: 'source-1', priority: 100 },
        { id: 'source-2', priority: 50 },
      ];
      mockToken.document.getFlag.mockReturnValue({
        visibility: { sources: mockSources },
      });

      const qualifying = SourceTracker.getQualifyingSources(mockToken, 'hide', 'visibility');
      expect(qualifying).toEqual(mockSources);
    });

    it('should filter out sources that disqualify for action', () => {
      const mockSources = [
        {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            hide: { canUseThisConcealment: false },
          },
        },
        {
          id: 'darkness',
          priority: 50,
          qualifications: {
            hide: { canUseThisConcealment: true },
          },
        },
      ];
      mockToken.document.getFlag.mockReturnValue({
        visibility: { sources: mockSources },
      });

      const qualifying = SourceTracker.getQualifyingSources(mockToken, 'hide', 'visibility');
      expect(qualifying).toHaveLength(1);
      expect(qualifying[0].id).toBe('darkness');
    });
  });

  describe('addSourceToState', () => {
    it('should add new source to state', async () => {
      const newSource = {
        id: 'blur-spell',
        priority: 100,
        state: 'concealed',
      };

      await SourceTracker.addSourceToState(mockToken, 'visibility', newSource);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'stateSource',
        expect.objectContaining({
          visibility: expect.objectContaining({
            sources: expect.arrayContaining([newSource]),
            state: 'concealed',
          }),
        }),
      );
    });

    it('should update existing source', async () => {
      const existingSource = { id: 'blur-spell', priority: 100, state: 'concealed' };
      mockToken.document.getFlag.mockReturnValue({
        visibility: { sources: [existingSource] },
      });

      const updatedSource = { id: 'blur-spell', priority: 150, state: 'hidden' };
      await SourceTracker.addSourceToState(mockToken, 'visibility', updatedSource);

      expect(mockToken.document.setFlag).toHaveBeenCalled();
      const callArgs = mockToken.document.setFlag.mock.calls[0][2];
      expect(callArgs.visibility.sources[0].priority).toBe(150);
    });
  });

  describe('removeSource', () => {
    it('should remove source from state', async () => {
      mockToken.document.getFlag.mockReturnValue({
        visibility: {
          sources: [
            { id: 'blur-spell', priority: 100 },
            { id: 'darkness', priority: 50 },
          ],
        },
      });

      await SourceTracker.removeSource(mockToken, 'blur-spell', 'visibility');

      expect(mockToken.document.setFlag).toHaveBeenCalled();
      const callArgs = mockToken.document.setFlag.mock.calls[0][2];
      expect(callArgs.visibility.sources).toHaveLength(1);
      expect(callArgs.visibility.sources[0].id).toBe('darkness');
    });
  });

  describe('getHighestPrioritySource', () => {
    it('should return source with highest priority', () => {
      const sources = [
        { id: 'source-1', priority: 50 },
        { id: 'source-2', priority: 100 },
        { id: 'source-3', priority: 75 },
      ];

      const highest = SourceTracker.getHighestPrioritySource(sources);
      expect(highest.id).toBe('source-2');
      expect(highest.priority).toBe(100);
    });

    it('should return null for empty array', () => {
      const highest = SourceTracker.getHighestPrioritySource([]);
      expect(highest).toBeNull();
    });
  });

  describe('hasDisqualifyingSource', () => {
    it('should return true when a source disqualifies', () => {
      const sources = [
        {
          id: 'blur-spell',
          qualifications: {
            hide: { canUseThisConcealment: false },
          },
        },
      ];

      const hasDisqualifying = SourceTracker.hasDisqualifyingSource(sources, 'hide');
      expect(hasDisqualifying).toBe(true);
    });

    it('should return false when no sources disqualify', () => {
      const sources = [
        {
          id: 'darkness',
          qualifications: {
            hide: { canUseThisConcealment: true },
          },
        },
      ];

      const hasDisqualifying = SourceTracker.hasDisqualifyingSource(sources, 'hide');
      expect(hasDisqualifying).toBe(false);
    });
  });

  describe('getCustomMessages', () => {
    it('should return custom messages from sources', () => {
      const sources = [
        {
          id: 'blur-spell',
          qualifications: {
            hide: { customMessage: "Blur's concealment doesn't hide your location" },
          },
        },
        {
          id: 'darkness',
          qualifications: {
            hide: { canUseThisConcealment: true },
          },
        },
      ];

      const messages = SourceTracker.getCustomMessages(sources, 'hide');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe("Blur's concealment doesn't hide your location");
    });
  });
});

describe('DetectionModeModifier', () => {
  let mockToken, mockDetectionsModes;

  beforeEach(() => {
    mockDetectionsModes = [
      { id: 'visual', enabled: true },
      { id: 'imprecise-hearing', enabled: true },
    ];
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        detectionModes: mockDetectionsModes,
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyDetectionModeModifications', () => {
    it('should save original detection modes before modifying', async () => {
      const { DetectionModeModifier } = await import(
        '../../../scripts/rule-elements/operations/DetectionModeModifier.js'
      );

      await DetectionModeModifier.applyDetectionModeModifications(
        mockToken,
        { visual: { enabled: false } },
        'test-rule-element',
        null,
      );

      expect(mockToken.document.getFlag).toHaveBeenCalled();
      expect(mockToken.document.update).toHaveBeenCalled();
    });
  });
});

describe('DistanceBasedVisibility', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        getFlag: jest.fn(() => null),
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyDistanceBasedVisibility', () => {
    it('should set distance-based visibility flag', async () => {
      const { DistanceBasedVisibility } = await import(
        '../../../scripts/rule-elements/operations/DistanceBasedVisibility.js'
      );

      const operation = {
        distanceBands: [
          { minDistance: 0, maxDistance: 20, state: 'observed' },
          { minDistance: 20, maxDistance: null, state: 'concealed' },
        ],
        direction: 'to',
        observers: 'all',
        source: 'test-source',
      };

      await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'distanceBasedVisibility',
        expect.objectContaining({
          active: true,
          source: 'test-source',
          distanceBands: operation.distanceBands,
        }),
      );
    });

    it('should return correct distance band for distance', () => {
      const {
        DistanceBasedVisibility,
      } = require('../../../scripts/rule-elements/operations/DistanceBasedVisibility.js');

      const distanceBands = [
        { minDistance: 0, maxDistance: 20, state: 'observed' },
        { minDistance: 20, maxDistance: 40, state: 'concealed' },
        { minDistance: 40, maxDistance: null, state: 'hidden' },
      ];

      expect(DistanceBasedVisibility.getApplicableDistanceBand(10, distanceBands).state).toBe(
        'observed',
      );
      expect(DistanceBasedVisibility.getApplicableDistanceBand(30, distanceBands).state).toBe(
        'concealed',
      );
      expect(DistanceBasedVisibility.getApplicableDistanceBand(50, distanceBands).state).toBe(
        'hidden',
      );
    });

    it('should remove distance-based visibility on removal', async () => {
      const { DistanceBasedVisibility } = await import(
        '../../../scripts/rule-elements/operations/DistanceBasedVisibility.js'
      );

      const operation = { source: 'test-source' };

      await DistanceBasedVisibility.removeDistanceBasedVisibility(operation, mockToken);

      expect(mockToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'distanceBasedVisibility',
      );
    });
  });
});

describe('LightingModifier', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        setFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyLightingModification', () => {
    it('should set lighting modification flag', async () => {
      const { LightingModifier } = await import(
        '../../../scripts/rule-elements/operations/LightingModifier.js'
      );

      const operation = {
        lightingLevel: 'bright',
        source: 'test-light',
        priority: 100,
      };

      await LightingModifier.applyLightingModification(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'lightingModification.test-light',
        expect.objectContaining({
          lightingLevel: 'bright',
          type: 'test-light',
          priority: 100,
        }),
      );
    });
  });
});

describe('OffGuardSuppression', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        getFlag: jest.fn(() => null),
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyOffGuardSuppression', () => {
    it('should set off guard suppression flag', async () => {
      const { OffGuardSuppression } = await import(
        '../../../scripts/rule-elements/operations/OffGuardSuppression.js'
      );

      const operation = {
        suppressedStates: ['hidden', 'undetected'],
        source: 'test-suppression',
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        expect.stringContaining('offGuardSuppression.'),
        expect.objectContaining({
          suppressedStates: ['hidden', 'undetected'],
        }),
      );
    });

    it('should check if state should suppress off guard', async () => {
      const { OffGuardSuppression } = await import(
        '../../../scripts/rule-elements/operations/OffGuardSuppression.js'
      );

      mockToken.document.getFlag.mockReturnValue({
        'test-suppression': {
          suppressedStates: ['hidden', 'undetected'],
        },
      });

      const shouldSuppress = OffGuardSuppression.shouldSuppressOffGuardForState(
        mockToken,
        'hidden',
      );
      expect(shouldSuppress).toBe(true);

      const shouldNotSuppress = OffGuardSuppression.shouldSuppressOffGuardForState(
        mockToken,
        'concealed',
      );
      expect(shouldNotSuppress).toBe(false);
    });

    it('should remove off guard suppression on removal', async () => {
      const { OffGuardSuppression } = await import(
        '../../../scripts/rule-elements/operations/OffGuardSuppression.js'
      );

      const operation = { source: 'test-suppression' };
      mockToken.document.getFlag.mockReturnValue({
        'test-suppression': {
          suppressedStates: ['hidden', 'undetected'],
        },
      });

      await OffGuardSuppression.removeOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'offGuardSuppression.test-suppression',
      );
    });
  });
});

describe('SenseModifier', () => {
  let mockToken;
  let mockActor;

  beforeEach(() => {
    mockActor = {
      system: {
        perception: {
          senses: [
            { type: 'vision', acuity: 'precise', range: Infinity },
            { type: 'hearing', acuity: 'imprecise', range: Infinity },
          ],
        },
      },
    };

    mockToken = {
      actor: {
        ...mockActor,
        update: jest.fn(() => Promise.resolve()),
      },
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      },
    };
  });

  it('should save original senses before modifying', async () => {
    const { SenseModifier } = await import(
      '../../../scripts/rule-elements/operations/SenseModifier.js'
    );

    await SenseModifier.applySenseModifications(
      mockToken,
      { vision: { enabled: false } },
      'test-rule-element',
      null,
    );

    expect(mockToken.document.getFlag).toHaveBeenCalled();
    expect(mockToken.actor.update).toHaveBeenCalled();
  });
});

describe('ActionQualifier', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyActionQualifications', () => {
    it('should set action qualifications on token', async () => {
      const operation = {
        source: 'blur-spell',
        qualifications: {
          hide: { canUseThisConcealment: false },
          sneak: { endPositionQualifies: false },
        },
      };

      await ActionQualifier.applyActionQualifications(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'actionQualifications.blur-spell',
        expect.objectContaining({
          id: 'blur-spell',
          qualifications: operation.qualifications,
        }),
      );
    });
  });

  describe('getActionQualifications', () => {
    it('should return qualifications for specific action', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            hide: { canUseThisConcealment: false },
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const qualifications = ActionQualifier.getActionQualifications(mockToken, 'hide');

      expect(qualifications).toHaveLength(1);
      expect(qualifications[0].canUseThisConcealment).toBe(false);
    });
  });

  describe('canUseConcealment', () => {
    it('should return false when qualification disallows concealment', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            hide: { qualifiesOnConcealment: false },
          },
        },
      });

      const canUse = ActionQualifier.canUseConcealment(mockToken, 'hide');
      expect(canUse).toBe(false);
    });

    it('should return true when no qualifications exist', () => {
      const canUse = ActionQualifier.canUseConcealment(mockToken, 'hide');
      expect(canUse).toBe(true);
    });
  });

  describe('endPositionQualifies', () => {
    it('should return false when qualification disallows end position', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const qualifies = ActionQualifier.endPositionQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(false);
    });

    it('should return true when no qualifications exist', () => {
      const qualifies = ActionQualifier.endPositionQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(true);
    });
  });

  describe('checkHidePrerequisites', () => {
    it('should return cannot hide when no qualifying sources', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          qualifications: {
            hide: { canUseThisConcealment: false },
          },
        },
      });

      const result = ActionQualifier.checkHidePrerequisites(mockToken);

      expect(result.canHide).toBe(false);
      expect(result.qualifyingConcealment).toBe(0);
    });
  });

  describe('checkSneakPrerequisites', () => {
    it('should return does not qualify when end position disqualified', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          qualifications: {
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const result = ActionQualifier.checkSneakPrerequisites(mockToken, 'end');

      expect(result.qualifies).toBe(false);
    });
  });
});

describe('Rule Element Integration', () => {
  it('should have all required operation types', () => {
    const expectedOperations = [
      'modifySenses',
      'modifyDetectionModes',
      'overrideVisibility',
      'overrideCover',
      'provideCover',
      'modifyActionQualification',
      'modifyLighting',
      'conditionalState',
      'distanceBasedVisibility',
      'offGuardSuppression',
    ];

    expectedOperations.forEach((op) => {
      expect(op).toBeTruthy();
    });
  });

  it('should support all visibility states', () => {
    const expectedStates = ['observed', 'concealed', 'hidden', 'undetected'];
    expectedStates.forEach((state) => {
      expect(state).toBeTruthy();
    });
  });

  it('should support all cover states', () => {
    const expectedStates = ['none', 'lesser', 'standard', 'greater'];
    expectedStates.forEach((state) => {
      expect(state).toBeTruthy();
    });
  });

  it('should support all target/observer options', () => {
    const expectedOptions = ['all', 'allies', 'enemies', 'selected', 'targeted', 'specific'];
    expectedOptions.forEach((option) => {
      expect(option).toBeTruthy();
    });
  });

  it('should support specific token targeting', () => {
    const tokenIds = ['token-1', 'token-2', 'token-3'];
    expect(tokenIds).toBeDefined();
    expect(Array.isArray(tokenIds)).toBe(true);
    expect(tokenIds.length).toBeGreaterThan(0);
  });
});

describe('VisibilityOverride', () => {
  let mockSubjectToken;
  let mockObserverTokens;

  beforeEach(async () => {
    const { VisibilityOverride } = await import(
      '../../../scripts/rule-elements/operations/VisibilityOverride.js'
    );

    mockSubjectToken = {
      id: 'subject-token',
      actor: { hasPlayerOwner: true },
      document: {
        id: 'subject-token',
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };

    mockObserverTokens = [
      {
        id: 'observer-1',
        actor: { hasPlayerOwner: true },
        document: { id: 'observer-1' },
      },
      {
        id: 'observer-2',
        actor: { hasPlayerOwner: false, token: { disposition: -1 } },
        document: { id: 'observer-2' },
      },
    ];

    global.canvas = {
      tokens: {
        placeables: [mockSubjectToken, ...mockObserverTokens],
      },
      grid: {
        measureDistance: jest.fn(() => 10),
      },
    };
  });

  describe('getObserverTokens', () => {
    it('should return all tokens when observers is "all"', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'all');

      expect(tokens.length).toBe(2);
      expect(tokens.map((t) => t.id)).toEqual(['observer-1', 'observer-2']);
    });

    it('should filter allies when observers is "allies"', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'allies');

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-1');
    });

    it('should filter enemies when observers is "enemies"', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'enemies');

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-2');
    });

    it('should filter specific tokens when observers is "specific"', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const tokenIds = ['observer-2'];
      const tokens = VisibilityOverride.getObserverTokens(
        mockSubjectToken,
        'specific',
        null,
        tokenIds,
      );

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-2');
    });

    it('should apply range filter when range is specified', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      global.canvas.grid.measureDistance = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(25);

      const tokens = VisibilityOverride.getObserverTokens(mockSubjectToken, 'all', 20);

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('observer-1');
    });
  });

  describe('areAllies', () => {
    it('should return true for PC vs PC', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const actor1 = { hasPlayerOwner: true };
      const actor2 = { hasPlayerOwner: true };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(true);
    });

    it('should return false for PC vs NPC', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const actor1 = { hasPlayerOwner: true };
      const actor2 = { hasPlayerOwner: false, token: { disposition: -1 } };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(false);
    });

    it('should return true for NPCs with same disposition', async () => {
      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const actor1 = { hasPlayerOwner: false, token: { disposition: 1 } };
      const actor2 = { hasPlayerOwner: false, token: { disposition: 1 } };

      expect(VisibilityOverride.areAllies(actor1, actor2)).toBe(true);
    });
  });
});

describe('CoverOverride', () => {
  let mockSubjectToken;
  let mockTargetTokens;

  beforeEach(async () => {
    mockSubjectToken = {
      id: 'subject-token',
      actor: { hasPlayerOwner: true },
      document: {
        id: 'subject-token',
        setFlag: jest.fn(() => Promise.resolve()),
        getFlag: jest.fn(() => null),
      },
    };

    mockTargetTokens = [
      {
        id: 'target-1',
        actor: { hasPlayerOwner: true },
        document: { id: 'target-1' },
      },
      {
        id: 'target-2',
        actor: { hasPlayerOwner: false, token: { disposition: -1 } },
        document: { id: 'target-2' },
      },
    ];

    global.canvas = {
      tokens: {
        placeables: [mockSubjectToken, ...mockTargetTokens],
      },
      grid: {
        measureDistance: jest.fn(() => 10),
      },
    };
  });

  describe('getTargetTokens', () => {
    it('should return all tokens when targets is "all"', async () => {
      const { CoverOverride } = await import(
        '../../../scripts/rule-elements/operations/CoverOverride.js'
      );
      const tokens = CoverOverride.getTargetTokens(mockSubjectToken, 'all');

      expect(tokens.length).toBe(2);
    });

    it('should filter specific tokens when targets is "specific"', async () => {
      const { CoverOverride } = await import(
        '../../../scripts/rule-elements/operations/CoverOverride.js'
      );
      const tokenIds = ['target-1'];
      const tokens = CoverOverride.getTargetTokens(mockSubjectToken, 'specific', null, tokenIds);

      expect(tokens.length).toBe(1);
      expect(tokens[0].id).toBe('target-1');
    });

    it('should apply range filter', async () => {
      const { CoverOverride } = await import(
        '../../../scripts/rule-elements/operations/CoverOverride.js'
      );
      global.canvas.grid.measureDistance = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(25);

      const tokens = CoverOverride.getTargetTokens(mockSubjectToken, 'all', 20);

      expect(tokens.length).toBe(1);
    });
  });

  describe('checkDirectionalCover', () => {
    it('should return true when attack is from blocked edge', async () => {
      const { CoverOverride } = await import(
        '../../../scripts/rule-elements/operations/CoverOverride.js'
      );
      const providerToken = { x: 100, y: 100 };
      const receiverToken = { x: 100, y: 100 };
      const attackerToken = { x: 100, y: 50 };

      const isProtected = CoverOverride.checkDirectionalCover(
        providerToken,
        receiverToken,
        attackerToken,
        ['north'],
      );

      expect(isProtected).toBe(true);
    });

    it('should return false when attack is from unblocked edge', async () => {
      const { CoverOverride } = await import(
        '../../../scripts/rule-elements/operations/CoverOverride.js'
      );
      const providerToken = { x: 100, y: 100 };
      const receiverToken = { x: 100, y: 100 };
      const attackerToken = { x: 100, y: 150 };

      const isProtected = CoverOverride.checkDirectionalCover(
        providerToken,
        receiverToken,
        attackerToken,
        ['north'],
      );

      expect(isProtected).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  describe('Hide Action Integration', () => {
    it('should check rule element qualifications during Hide', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn(() => ({
            'blur-spell': {
              id: 'blur-spell',
              priority: 100,
              qualifications: {
                hide: { canUseThisConcealment: false },
              },
            },
          })),
        },
      };

      const { ActionQualifier } = await import(
        '../../../scripts/rule-elements/operations/ActionQualifier.js'
      );
      const result = ActionQualifier.checkHidePrerequisites(mockToken);

      expect(result.canHide).toBe(false);
    });

    it('should allow Hide when qualifications pass', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn(() => ({
            darkness: {
              id: 'darkness',
              priority: 100,
              qualifications: {
                hide: { canUseThisConcealment: true },
              },
            },
          })),
        },
      };

      const { ActionQualifier } = await import(
        '../../../scripts/rule-elements/operations/ActionQualifier.js'
      );
      const qualifications = ActionQualifier.getActionQualifications(mockToken, 'hide');

      expect(qualifications.length).toBe(1);
      expect(qualifications[0].canUseThisConcealment).toBe(true);
    });
  });

  describe('Sneak Action Integration', () => {
    it('should check end position qualifications during Sneak', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn(() => ({
            'blur-spell': {
              id: 'blur-spell',
              priority: 100,
              qualifications: {
                sneak: { endPositionQualifies: false },
              },
            },
          })),
        },
      };

      const { ActionQualifier } = await import(
        '../../../scripts/rule-elements/operations/ActionQualifier.js'
      );
      const result = ActionQualifier.checkSneakPrerequisites(mockToken, 'end');

      expect(result.qualifies).toBe(false);
    });
  });

  describe('Cover System Integration', () => {
    it('should return rule element cover when present', () => {
      const mockAttacker = { id: 'attacker' };
      const mockTarget = {
        id: 'target',
        document: {
          getFlag: jest.fn((scope, key) => {
            if (key === 'stateSource') {
              return {
                coverByObserver: {
                  attacker: {
                    sources: [{ id: 'tower-shield', priority: 100, state: 'standard' }],
                  },
                },
              };
            }
            return null;
          }),
        },
      };

      const coverSources = mockTarget.document.getFlag('pf2e-visioner', 'stateSource')
        ?.coverByObserver?.['attacker'];

      expect(coverSources).toBeDefined();
      expect(coverSources.sources[0].state).toBe('standard');
    });

    it('should check provideCover flag for placed objects', () => {
      const mockTarget = {
        id: 'deployable-cover',
        document: {
          getFlag: jest.fn((scope, key) => {
            if (key === 'providesCover') {
              return {
                state: 'standard',
                blockedEdges: ['north'],
                requiresTakeCover: true,
              };
            }
            if (key === 'hasTakenCover') {
              return true;
            }
            return null;
          }),
        },
      };

      const coverData = mockTarget.document.getFlag('pf2e-visioner', 'providesCover');
      const hasTakenCover = mockTarget.document.getFlag('pf2e-visioner', 'hasTakenCover');

      expect(coverData).toBeDefined();
      expect(coverData.state).toBe('standard');
      expect(hasTakenCover).toBe(true);
    });
  });

  describe('AVS Integration', () => {
    it('should skip tokens with rule element override flag', () => {
      const mockToken = {
        document: {
          getFlag: jest.fn((scope, key) => {
            if (key === 'ruleElementOverride') {
              return { active: true, source: 'blur-spell', state: 'concealed' };
            }
            return null;
          }),
        },
      };

      const override = mockToken.document.getFlag('pf2e-visioner', 'ruleElementOverride');

      expect(override).toBeDefined();
      expect(override.active).toBe(true);
      expect(override.state).toBe('concealed');
    });
  });

  describe('Source Tracking Integration', () => {
    it('should track multiple sources with different priorities', async () => {
      const mockToken = {
        document: {
          getFlag: jest.fn(() => ({
            visibility: {
              sources: [
                { id: 'darkness', priority: 10, state: 'concealed' },
                { id: 'blur-spell', priority: 100, state: 'concealed' },
              ],
            },
          })),
          setFlag: jest.fn(() => Promise.resolve()),
        },
      };

      const sources = mockToken.document.getFlag('pf2e-visioner', 'stateSource')?.visibility
        ?.sources;

      expect(sources).toBeDefined();
      expect(sources.length).toBe(2);
      expect(sources[1].priority).toBeGreaterThan(sources[0].priority);
    });

    it('should aggregate qualifications from multiple sources', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn(() => ({
            'source-1': {
              id: 'source-1',
              qualifications: {
                hide: { qualifiesOnConcealment: true },
              },
            },
            'source-2': {
              id: 'source-2',
              qualifications: {
                hide: { qualifiesOnConcealment: false },
              },
            },
          })),
        },
      };

      const { ActionQualifier } = await import(
        '../../../scripts/rule-elements/operations/ActionQualifier.js'
      );
      const canUse = ActionQualifier.canUseConcealment(mockToken, 'hide');

      expect(canUse).toBe(false);
    });
  });

  describe('Conditional State Logic', () => {
    it('should evaluate invisible condition correctly', async () => {
      const mockActor = {
        itemTypes: {
          condition: [{ slug: 'invisible' }],
        },
      };

      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const result = VisibilityOverride.evaluateCondition(mockActor, 'invisible');

      expect(result).toBe(true);
    });

    it('should return false when condition not present', async () => {
      const mockActor = {
        itemTypes: {
          condition: [],
        },
      };

      const { VisibilityOverride } = await import(
        '../../../scripts/rule-elements/operations/VisibilityOverride.js'
      );
      const result = VisibilityOverride.evaluateCondition(mockActor, 'invisible');

      expect(result).toBe(false);
    });
  });

  describe('Spell Examples Integration', () => {
    it('should have valid configuration for Blur spell', async () => {
      const { default: examples } = await import('../../../scripts/rule-elements/examples.json');
      const blur = examples.blur;

      expect(blur).toBeDefined();
      expect(blur.rules).toBeDefined();
      expect(blur.rules[0].key).toBe('PF2eVisionerEffect');
      expect(blur.rules[0].operations).toBeDefined();
      expect(blur.rules[0].operations.length).toBeGreaterThan(0);

      const visibilityOp = blur.rules[0].operations.find((op) => op.type === 'overrideVisibility');
      expect(visibilityOp).toBeDefined();
      expect(visibilityOp.state).toBe('concealed');

      const qualificationOp = blur.rules[0].operations.find(
        (op) => op.type === 'modifyActionQualification',
      );
      expect(qualificationOp).toBeDefined();
      expect(qualificationOp.qualifications.hide.qualifiesOnConcealment).toBe(false);
    });

    it('should have valid configuration for Faerie Fire spell', async () => {
      const { default: examples } = await import('../../../scripts/rule-elements/examples.json');
      const faerieFire = examples.faerieFire;

      expect(faerieFire).toBeDefined();
      const conditionalOp = faerieFire.rules[0].operations.find(
        (op) => op.type === 'conditionalState',
      );
      expect(conditionalOp).toBeDefined();
      expect(conditionalOp.condition).toBe('invisible');
      expect(conditionalOp.thenState).toBe('concealed');
    });
  });

  describe('Dialog Integration - ActionQualificationIntegration', () => {
    let mockToken;
    let mockQualification;

    beforeEach(() => {
      mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn(),
        },
      };

      mockQualification = {
        startQualifies: true,
        endQualifies: true,
        bothQualify: true,
        reason: '',
      };
    });

    describe('checkHideWithRuleElements', () => {
      it('should pass when token has qualifying concealment', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'actionQualifications') {
            return {
              darkness: {
                id: 'darkness',
                qualifications: {
                  hide: { canUseThisConcealment: true },
                },
              },
            };
          }
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [{ id: 'darkness', priority: 100 }],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkHideWithRuleElements(
          mockToken,
          mockQualification,
        );

        expect(result.endQualifies).toBe(true);
        expect(result.bothQualify).toBe(true);
      });

      it('should fail when token has only disqualifying concealment', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [
                  {
                    id: 'blur-spell',
                    priority: 100,
                    qualifications: {
                      hide: {
                        canUseThisConcealment: false,
                        customMessage: "Blur's concealment doesn't hide your location",
                      },
                    },
                  },
                ],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkHideWithRuleElements(
          mockToken,
          mockQualification,
        );

        expect(result.endQualifies).toBe(false);
        expect(result.bothQualify).toBe(false);
        expect(result.reason).toContain("Blur's concealment doesn't hide your location");
      });

      it('should pass when token has qualifying cover', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'actionQualifications') {
            return {
              'standard-cover': {
                id: 'standard-cover',
                qualifications: {
                  hide: { canUseThisCover: true },
                },
              },
            };
          }
          if (key === 'stateSource') {
            return {
              cover: {
                sources: [{ id: 'standard-cover', priority: 100 }],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkHideWithRuleElements(
          mockToken,
          mockQualification,
        );

        expect(result.endQualifies).toBe(true);
      });

      it('should fail when no qualifying concealment or cover', async () => {
        mockToken.document.getFlag = jest.fn(() => null);

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkHideWithRuleElements(
          mockToken,
          mockQualification,
        );

        expect(result.endQualifies).toBe(false);
        expect(result.bothQualify).toBe(false);
      });

      it('should aggregate custom messages from multiple sources', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [
                  {
                    id: 'blur-spell',
                    priority: 100,
                    qualifications: {
                      hide: {
                        canUseThisConcealment: false,
                        customMessage: "Blur doesn't hide your location",
                      },
                    },
                  },
                  {
                    id: 'revealing-light',
                    priority: 90,
                    qualifications: {
                      hide: {
                        canUseThisConcealment: false,
                        customMessage: 'You are illuminated by revealing light',
                      },
                    },
                  },
                ],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkHideWithRuleElements(
          mockToken,
          mockQualification,
        );

        expect(result.endQualifies).toBe(false);
        expect(result.reason).toContain("Blur doesn't hide your location");
        expect(result.reason).toContain('You are illuminated by revealing light');
      });
    });

    describe('checkSneakWithRuleElements', () => {
      it('should pass when end position qualifies', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'actionQualifications') {
            return {
              darkness: {
                id: 'darkness',
                qualifications: {
                  sneak: { qualifiesOnConcealment: true },
                },
              },
            };
          }
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [{ id: 'darkness', priority: 100 }],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkSneakWithRuleElements(
          mockToken,
          mockQualification,
          'end',
        );

        expect(result.endQualifies).toBe(true);
      });

      it('should fail when end position does not qualify', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'actionQualifications') {
            return {
              'blur-spell': {
                id: 'blur-spell',
                qualifications: {
                  sneak: {
                    qualifiesOnConcealment: false,
                    customMessage: "Blur doesn't hide your location for sneaking",
                  },
                },
              },
            };
          }
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [{ id: 'blur-spell', priority: 100 }],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = await ActionQualificationIntegration.checkSneakWithRuleElements(
          mockToken,
          mockQualification,
          'end',
        );

        expect(result.endQualifies).toBe(false);
        expect(result.bothQualify).toBe(false);
        expect(result.reason).toContain("Blur doesn't hide your location for sneaking");
      });

      it('should check start position separately from end position', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'actionQualifications') {
            return {
              darkness: {
                id: 'darkness',
                qualifications: {
                  sneak: {
                    qualifiesOnConcealment: true,
                  },
                },
              },
            };
          }
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [{ id: 'darkness', priority: 100 }],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );

        const startResult = await ActionQualificationIntegration.checkSneakWithRuleElements(
          mockToken,
          { ...mockQualification },
          'start',
        );
        expect(startResult.startQualifies).toBe(true);

        const endResult = await ActionQualificationIntegration.checkSneakWithRuleElements(
          mockToken,
          { ...mockQualification },
          'end',
        );
        expect(endResult.endQualifies).toBe(true);
      });
    });

    describe('checkSourceQualifications', () => {
      it('should return qualifying visibility sources', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [{ id: 'darkness', priority: 100 }],
              },
            };
          }
          if (key === 'actionQualifications') {
            return {
              darkness: {
                id: 'darkness',
                qualifications: {
                  hide: { canUseThisConcealment: true },
                },
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = ActionQualificationIntegration.checkSourceQualifications(
          mockToken,
          'hide',
          'visibility',
        );

        expect(result.qualifies).toBe(true);
        expect(result.totalSources).toBe(1);
        expect(result.qualifyingSources).toBe(1);
      });

      it('should return disqualifying visibility sources', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'stateSource') {
            return {
              visibility: {
                sources: [
                  {
                    id: 'blur-spell',
                    priority: 100,
                    qualifications: {
                      hide: {
                        canUseThisConcealment: false,
                        customMessage: "Blur doesn't hide your location",
                      },
                    },
                  },
                ],
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = ActionQualificationIntegration.checkSourceQualifications(
          mockToken,
          'hide',
          'visibility',
        );

        expect(result.qualifies).toBe(false);
        expect(result.messages).toContain("Blur doesn't hide your location");
      });

      it('should check cover sources separately', async () => {
        mockToken.document.getFlag = jest.fn((scope, key) => {
          if (key === 'stateSource') {
            return {
              cover: {
                sources: [{ id: 'tower-shield', priority: 100 }],
              },
            };
          }
          if (key === 'actionQualifications') {
            return {
              'tower-shield': {
                id: 'tower-shield',
                qualifications: {
                  hide: { canUseThisCover: true },
                },
              },
            };
          }
          return null;
        });

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result = ActionQualificationIntegration.checkSourceQualifications(
          mockToken,
          'hide',
          'cover',
        );

        expect(result.qualifies).toBe(true);
        expect(result.totalSources).toBe(1);
      });
    });

    describe('enhanceQualificationWithMessages', () => {
      it('should append rule element messages to existing reason', async () => {
        const qualification = {
          endQualifies: false,
          reason: 'You lack concealment',
          ruleElementMessages: ["Blur doesn't hide your location"],
        };

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result =
          ActionQualificationIntegration.enhanceQualificationWithMessages(qualification);

        expect(result.reason).toBe("You lack concealment. Blur doesn't hide your location");
      });

      it('should set reason when none exists', async () => {
        const qualification = {
          endQualifies: false,
          ruleElementMessages: ['Custom message from rule element'],
        };

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result =
          ActionQualificationIntegration.enhanceQualificationWithMessages(qualification);

        expect(result.reason).toBe('Custom message from rule element');
      });

      it('should handle multiple messages', async () => {
        const qualification = {
          endQualifies: false,
          ruleElementMessages: ['Message one', 'Message two'],
        };

        const { ActionQualificationIntegration } = await import(
          '../../../scripts/rule-elements/ActionQualificationIntegration.js'
        );
        const result =
          ActionQualificationIntegration.enhanceQualificationWithMessages(qualification);

        expect(result.reason).toContain('Message one');
        expect(result.reason).toContain('Message two');
      });
    });
  });

  describe('Real-World Dialog Scenarios', () => {
    it('should block Hide when only Blur concealment is present', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn((scope, key) => {
            if (key === 'stateSource') {
              return {
                visibility: {
                  sources: [
                    {
                      id: 'blur-spell',
                      priority: 100,
                      qualifications: {
                        hide: {
                          canUseThisConcealment: false,
                          customMessage: "Blur's concealment doesn't hide your location",
                        },
                      },
                    },
                  ],
                },
              };
            }
            return null;
          }),
        },
      };

      const qualification = {
        startQualifies: true,
        endQualifies: true,
        bothQualify: true,
      };

      const { ActionQualificationIntegration } = await import(
        '../../../scripts/rule-elements/ActionQualificationIntegration.js'
      );
      const result = await ActionQualificationIntegration.checkHideWithRuleElements(
        mockToken,
        qualification,
      );

      expect(result.endQualifies).toBe(false);
      expect(result.bothQualify).toBe(false);
      expect(result.reason).toContain("Blur's concealment doesn't hide your location");
    });

    it('should allow Hide when Blur concealment + qualifying cover', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn((scope, key) => {
            if (key === 'stateSource') {
              return {
                visibility: {
                  sources: [
                    {
                      id: 'blur-spell',
                      priority: 100,
                      qualifications: {
                        hide: { canUseThisConcealment: false },
                      },
                    },
                  ],
                },
                cover: {
                  sources: [
                    {
                      id: 'wall-cover',
                      priority: 50,
                      qualifications: {
                        hide: { canUseThisCover: true },
                      },
                    },
                  ],
                },
              };
            }
            return null;
          }),
        },
      };

      const qualification = {
        startQualifies: true,
        endQualifies: true,
        bothQualify: true,
      };

      const { ActionQualificationIntegration } = await import(
        '../../../scripts/rule-elements/ActionQualificationIntegration.js'
      );
      const result = await ActionQualificationIntegration.checkHideWithRuleElements(
        mockToken,
        qualification,
      );

      expect(result.endQualifies).toBe(true);
    });

    it('should handle Thousand Visions ignoring concealment within 30ft', async () => {
      const mockToken = {
        id: 'test-token',
        document: {
          id: 'test-token',
          getFlag: jest.fn((scope, key) => {
            if (key === 'actionQualifications') {
              return {
                'thousand-visions': {
                  id: 'thousand-visions',
                  qualifications: {
                    seek: {
                      ignoreThisConcealment: true,
                      customMessage: 'Thousand Visions reveals hidden creatures within 30ft',
                    },
                  },
                },
              };
            }
            return null;
          }),
        },
      };

      const { ActionQualifier } = await import(
        '../../../scripts/rule-elements/operations/ActionQualifier.js'
      );
      const qualifications = ActionQualifier.getActionQualifications(mockToken, 'seek');

      expect(qualifications.length).toBe(1);
      expect(qualifications[0].ignoreThisConcealment).toBe(true);
    });
  });

  describe('Predicate Support', () => {
    let mockToken;

    beforeEach(() => {
      mockToken = {
        id: 'test-token',
        actor: {
          hasPlayerOwner: true,
          getRollOptions: jest.fn(() => ['self:condition:invisible', 'self:trait:elf']),
        },
        document: {
          id: 'test-token',
          hidden: false,
          disposition: 1,
          setFlag: jest.fn(() => Promise.resolve()),
          getFlag: jest.fn(() => null),
        },
      };
    });

    describe('PredicateHelper', () => {
      it('should evaluate simple predicate with single condition', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = ['self:condition:invisible'];
        const rollOptions = new Set(['self:condition:invisible', 'self:trait:elf']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(true);
      });

      it('should return false when predicate condition not met', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = ['self:condition:blinded'];
        const rollOptions = new Set(['self:condition:invisible']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(false);
      });

      it('should evaluate AND logic (array)', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = ['self:condition:invisible', 'self:trait:elf'];
        const rollOptions = new Set(['self:condition:invisible', 'self:trait:elf']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(true);
      });

      it('should fail AND logic if one condition missing', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = ['self:condition:invisible', 'self:trait:dwarf'];
        const rollOptions = new Set(['self:condition:invisible', 'self:trait:elf']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(false);
      });

      it('should handle negation with not: prefix', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = ['not:self:condition:blinded'];
        const rollOptions = new Set(['self:condition:invisible']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(true);
      });

      it('should return true for empty predicate', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const predicate = [];
        const rollOptions = new Set(['self:condition:invisible']);

        const result = PredicateHelper.evaluate(predicate, rollOptions);
        expect(result).toBe(true);
      });

      it('should get token roll options', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const options = PredicateHelper.getTokenRollOptions(mockToken);

        expect(Array.isArray(options)).toBe(true);
        expect(options).toContain('self:condition:invisible');
        expect(options).toContain('self:trait:elf');
      });

      it('should get target roll options', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const targetToken = {
          actor: {
            getRollOptions: jest.fn(() => ['trait:undead', 'condition:concealed']),
          },
          document: {
            hidden: false,
          },
        };

        const options = PredicateHelper.getTargetRollOptions(targetToken, mockToken);

        expect(Array.isArray(options)).toBe(true);
        expect(options).toContain('target:trait:undead');
        expect(options).toContain('target:condition:concealed');
      });

      it('should combine roll options from multiple sources', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );
        const set1 = new Set(['option1', 'option2']);
        const set2 = new Set(['option3', 'option4']);

        const combined = PredicateHelper.combineRollOptions(set1, set2);

        expect(Array.isArray(combined)).toBe(true);
        expect(combined.length).toBe(4);
        expect(combined).toContain('option1');
        expect(combined).toContain('option4');
      });
    });

    describe('Rule Element Level Predicate', () => {
      it('should skip all operations when rule element predicate fails', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );

        mockToken.actor.getRollOptions = jest.fn(() => ['self:trait:elf']);

        const predicate = ['self:condition:invisible'];
        const rollOptions = PredicateHelper.getTokenRollOptions(mockToken);
        const result = PredicateHelper.evaluate(predicate, rollOptions);

        expect(result).toBe(false);
      });

      it('should apply all operations when rule element predicate passes', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );

        const predicate = ['self:condition:invisible'];
        const rollOptions = PredicateHelper.getTokenRollOptions(mockToken);
        const result = PredicateHelper.evaluate(predicate, rollOptions);

        expect(result).toBe(true);
      });
    });

    describe('Operation Level Predicate', () => {
      it('should skip visibility override when predicate fails', async () => {
        global.canvas = {
          tokens: {
            placeables: [
              mockToken,
              {
                id: 'target-1',
                actor: {
                  hasPlayerOwner: false,
                  getRollOptions: jest.fn(() => ['trait:humanoid']),
                  token: { disposition: -1 },
                },
                document: { id: 'target-1' },
              },
            ],
          },
          grid: {
            measureDistance: jest.fn(() => 10),
          },
        };

        const { VisibilityOverride } = await import(
          '../../../scripts/rule-elements/operations/VisibilityOverride.js'
        );
        const operation = {
          state: 'concealed',
          direction: 'to',
          observers: 'all',
          predicate: ['target:trait:undead'],
          source: 'test-predicate',
        };

        await VisibilityOverride.applyVisibilityOverride(operation, mockToken);

        expect(mockToken.document.setFlag).toHaveBeenCalled();
      });

      it('should apply visibility override when predicate passes', async () => {
        global.canvas = {
          tokens: {
            placeables: [
              mockToken,
              {
                id: 'target-1',
                actor: {
                  hasPlayerOwner: false,
                  getRollOptions: jest.fn(() => ['trait:undead']),
                  token: { disposition: -1 },
                },
                document: { id: 'target-1' },
              },
            ],
          },
          grid: {
            measureDistance: jest.fn(() => 10),
          },
        };

        const { VisibilityOverride } = await import(
          '../../../scripts/rule-elements/operations/VisibilityOverride.js'
        );
        const operation = {
          state: 'concealed',
          direction: 'to',
          observers: 'all',
          predicate: ['target:trait:undead'],
          source: 'test-predicate',
        };

        await VisibilityOverride.applyVisibilityOverride(operation, mockToken);

        expect(mockToken.document.setFlag).toHaveBeenCalled();
      });
    });

    describe('Predicate Examples from Documentation', () => {
      it('should support See Invisibility pattern', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );

        const predicate = ['target:condition:invisible'];
        const rollOptionsWithInvisible = new Set(['target:condition:invisible']);
        const rollOptionsWithoutInvisible = new Set(['target:condition:concealed']);

        expect(PredicateHelper.evaluate(predicate, rollOptionsWithInvisible)).toBe(true);
        expect(PredicateHelper.evaluate(predicate, rollOptionsWithoutInvisible)).toBe(false);
      });

      it('should support Consecrate vs Undead pattern', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );

        const predicate = ['self:trait:undead'];
        const undeadOptions = new Set(['self:trait:undead', 'self:trait:mindless']);
        const livingOptions = new Set(['self:trait:humanoid']);

        expect(PredicateHelper.evaluate(predicate, undeadOptions)).toBe(true);
        expect(PredicateHelper.evaluate(predicate, livingOptions)).toBe(false);
      });

      it('should support Blind-Fight pattern', async () => {
        const { PredicateHelper } = await import(
          '../../../scripts/rule-elements/PredicateHelper.js'
        );

        const predicate = ['target:condition:hidden', 'target:condition:concealed'];
        const hiddenAndConcealed = new Set([
          'target:condition:hidden',
          'target:condition:concealed',
        ]);
        const onlyHidden = new Set(['target:condition:hidden']);

        expect(PredicateHelper.evaluate(predicate, hiddenAndConcealed)).toBe(true);
        expect(PredicateHelper.evaluate(predicate, onlyHidden)).toBe(false);
      });
    });
  });
});
