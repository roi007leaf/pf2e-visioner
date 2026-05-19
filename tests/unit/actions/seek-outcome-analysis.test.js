import { analyzeSeekOutcome } from '../../../scripts/chat/services/actions/Seek/seek-outcome-analysis.js';

describe('seek outcome analysis', () => {
  function makeActionData() {
    return {
      actor: { id: 'seeker' },
      roll: {
        total: 20,
        dice: [{ results: [{ result: 12 }] }],
      },
    };
  }

  function baseDeps(overrides = {}) {
    return {
      extractStealthDC: jest.fn(() => 15),
      determineOutcome: jest.fn(() => 'success'),
      isTokenWithinTemplate: jest.fn(() => true),
      getVisibilityBetween: jest.fn(() => 'hidden'),
      getDefaultNewStateFor: jest.fn(() => 'observed'),
      featsHandler: {
        hasFeat: jest.fn(() => false),
        adjustVisibility: jest.fn((action, actor, current, next) => next),
      },
      ...overrides,
    };
  }

  test('wall success records precise vision and returns wall metadata', async () => {
    const actionData = makeActionData();
    const wall = { id: 'wall-a' };
    const recordSenseUsed = jest.fn();

    const result = await analyzeSeekOutcome(
      actionData,
      { _isWall: true, wall, dc: 15 },
      baseDeps({
        getSeekWallCurrentVisibility: jest.fn(() => 'hidden'),
        buildSeekWallMetadata: jest.fn(async () => ({ _isWall: true, wallId: 'wall-a' })),
        recordSenseUsed,
      }),
    );

    expect(result).toMatchObject({
      target: actionData.actor,
      wallId: 'wall-a',
      currentVisibility: 'hidden',
      newVisibility: 'observed',
      changed: true,
      usedSenseType: 'vision',
      usedSensePrecision: 'precise',
    });
    expect(recordSenseUsed).toHaveBeenCalledWith('vision', 'precise');
  });

  test('unmet sense condition returns blocked outcome', async () => {
    const subject = { id: 'target', actor: { type: 'character' } };

    const result = await analyzeSeekOutcome(
      makeActionData(),
      subject,
      baseDeps({
        createSeekDialogAdapter: jest.fn(() => ({
          determineSenseUsed: jest.fn(async () => ({
            canDetect: false,
            unmetCondition: true,
            reason: 'not-living',
            senseType: 'lifesense',
            range: 30,
          })),
        })),
        visionAnalyzer: {},
      }),
    );

    expect(result).toMatchObject({
      target: subject,
      outcome: 'unmet-conditions',
      changed: false,
      unmetConditions: true,
      unmetCondition: 'not-living',
      senseType: 'lifesense',
      senseRange: 30,
    });
  });

  test('imprecise-only detection cannot raise target to observed', async () => {
    const subject = { id: 'target', actor: { type: 'character' } };
    const visionAnalyzer = {
      getVisionCapabilities: jest.fn(() => ({
        hasVision: false,
        isBlinded: false,
        sensingSummary: { precise: [] },
      })),
      hasLineOfSight: jest.fn(() => true),
      hasPreciseNonVisualInRange: jest.fn(() => false),
    };

    const result = await analyzeSeekOutcome(
      makeActionData(),
      subject,
      baseDeps({
        createSeekDialogAdapter: jest.fn(() => ({
          determineSenseUsed: jest.fn(async () => ({
            canDetect: true,
            precision: 'imprecise',
            senseType: 'hearing',
            range: 30,
          })),
        })),
        visionAnalyzer,
      }),
    );

    expect(result).toMatchObject({
      target: subject,
      newVisibility: 'hidden',
      usedImprecise: true,
      usedImpreciseSenseType: 'hearing',
      usedImpreciseSenseRange: 30,
    });
  });
});
