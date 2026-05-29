import '../../setup.js';

jest.mock('../../../scripts/utils/logger.js', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../../../scripts/constants.js', () => ({
  MODULE_ID: 'pf2e-visioner',
}));

describe('SeekAction LOS partition and filtering', () => {
  describe('#partitionByLOS code patterns', () => {
    let actionCode;
    let partitionCode;

    beforeAll(() => {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      actionCode = readFileSync(
        join(__dirname, '../../../scripts/chat/services/actions/SeekAction.js'),
        'utf8'
      );
      partitionCode = readFileSync(
        join(__dirname, '../../../scripts/chat/services/actions/Seek/seek-los-partition.js'),
        'utf8'
      );
    });

    test('partitions changes by LOS', () => {
      expect(actionCode).toContain('partitionSeekChangesByLOS');
      expect(partitionCode).toContain('immediateChanges');
      expect(partitionCode).toContain('deferredResults');
    });

    test('walls always go to immediate', () => {
      expect(partitionCode).toContain('change.wallId || outcome?._isWall');
      expect(partitionCode).toContain('immediateChanges.push(change)');
    });

    test('loot tokens without configured DC skip deferral', () => {
      expect(partitionCode).toMatch(/targetActorType === 'loot'/);
      expect(partitionCode).toMatch(/getFlag.*stealthDC/);
    });

    test('allies skip deferral', () => {
      expect(partitionCode).toContain('observerAlliance');
      expect(partitionCode).toContain('targetAlliance');
      expect(partitionCode).toContain('observerAlliance === targetAlliance');
    });

    test('stores deferred results via DeferredSeekManager', () => {
      expect(actionCode).toContain('DeferredSeekManager');
      expect(actionCode).toContain('storeDeferredResults');
    });
  });

  describe('seek apply filtering', () => {
    let code;

    beforeAll(() => {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      code = readFileSync(
        join(__dirname, '../../../scripts/chat/services/actions/SeekAction.js'),
        'utf8'
      );
    });

    test('filters allies when ignoreAllies setting is enabled', () => {
      expect(code).toContain('ignoreAllies');
      expect(code).toContain('shouldFilterAlly');
    });

    test('shows deferred count notification', () => {
      expect(code).toContain('SEEK_DEFERRED_COUNT');
    });
  });
});

describe('DeferredSeekManager integration patterns', () => {
  let managerCode;
  let registrationCode;
  let wallLifecycleCode;
  let doorRefreshCode;
  let batchCode;
  let batchWorkflowFactoryCode;
  let batchFinalizationCode;
  let combatCode;

  beforeAll(() => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    managerCode = readFileSync(
      join(__dirname, '../../../scripts/chat/services/infra/DeferredSeekManager.js'),
      'utf8'
    );
    registrationCode = readFileSync(
      join(__dirname, '../../../scripts/hooks/registration.js'),
      'utf8'
    );
    wallLifecycleCode = readFileSync(
      join(__dirname, '../../../scripts/services/Walls/wall-lifecycle.js'),
      'utf8'
    );
    doorRefreshCode = readFileSync(
      join(__dirname, '../../../scripts/services/door-state-visibility-refresh.js'),
      'utf8'
    );
    batchCode = readFileSync(
      join(__dirname, '../../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js'),
      'utf8'
    );
    batchWorkflowFactoryCode = readFileSync(
      join(
        __dirname,
        '../../../scripts/visibility/auto-visibility/core/BatchWorkflowFactory.js'
      ),
      'utf8'
    );
    batchFinalizationCode = readFileSync(
      join(
        __dirname,
        '../../../scripts/visibility/auto-visibility/core/BatchFinalizationWorkflow.js'
      ),
      'utf8'
    );
    combatCode = readFileSync(
      join(__dirname, '../../../scripts/hooks/combat.js'),
      'utf8'
    );
  });

  test('DeferredSeekManager listens for tokenMovementComplete hook', () => {
    expect(managerCode).toContain('pf2e-visioner.tokenMovementComplete');
  });

  test('DeferredSeekManager clears VisionAnalyzer cache before LOS checks', () => {
    expect(managerCode).toContain('va.clearCache()');
  });

  test('DeferredSeekManager uses skipIndicatorRefresh when applying', () => {
    expect(managerCode).toContain('skipIndicatorRefresh: true');
  });

  test('BatchOrchestrator emits batchComplete hook', () => {
    expect(batchCode).toContain('createDefaultBatchWorkflowFactory');
    expect(batchWorkflowFactoryCode).toContain('BatchFinalizationWorkflow');
    expect(batchFinalizationCode).toContain("'pf2e-visioner.batchComplete'");
  });

  test('door handler listens for batchComplete to check deferred seek', () => {
    expect(registrationCode).toContain('handleWallUpdated');
    expect(wallLifecycleCode).toContain('handleDoorStateVisibilityRefresh');
    expect(doorRefreshCode).toContain("pf2e-visioner.batchComplete");
    expect(doorRefreshCode).toContain('checkAndApplyDeferred');
  });

  test('combat turn change clears deferred results', () => {
    expect(combatCode).toContain('clearDeferredForToken');
  });

  test('combat end clears all deferred results', () => {
    expect(combatCode).toContain('clearAll');
  });

  test('deferred results stored on token flag', () => {
    expect(managerCode).toContain('deferredSeekResults');
  });
});
