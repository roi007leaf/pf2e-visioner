import fs from 'fs';
import path from 'path';

describe('AVS invalidation module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const coreRoot = path.join(root, 'scripts/visibility/auto-visibility/core');
  const coordinatorPath = path.join(coreRoot, 'AvsInvalidationCoordinator.js');
  const routerPath = path.join(coreRoot, 'AvsInvalidationReasonRouter.js');
  const movementWorkflowPath = path.join(coreRoot, 'AvsMovementInvalidationWorkflow.js');

  test('reason router owns invalidation dispatch registry and field admission', () => {
    expect(fs.existsSync(routerPath)).toBe(true);

    const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf8');
    const routerSource = fs.readFileSync(routerPath, 'utf8');

    expect(routerSource).toContain('AVS_INVALIDATION_REASON_HANDLERS');
    expect(routerSource).toContain('LIGHT_VISIBILITY_FIELDS');
    expect(routerSource).toContain('WALL_LOS_FIELDS');
    expect(routerSource).toContain('class AvsInvalidationReasonRouter');
    expect(coordinatorSource).toContain("from './AvsInvalidationReasonRouter.js'");
    expect(coordinatorSource).not.toContain('const LIGHT_VISIBILITY_FIELDS');
    expect(coordinatorSource).not.toContain('const WALL_LOS_FIELDS');
    expect(coordinatorSource).not.toContain('Object.entries(AVS_INVALIDATION_REASON_HANDLERS)');
    expect(coordinatorSource).not.toContain('#affectsVisibility');
    expect(coordinatorSource).not.toContain('#affectsLineOfSight');
  });

  test('movement workflow owns token movement invalidation side effects', () => {
    expect(fs.existsSync(movementWorkflowPath)).toBe(true);

    const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf8');
    const movementWorkflowSource = fs.readFileSync(movementWorkflowPath, 'utf8');

    expect(movementWorkflowSource).toContain('class AvsMovementInvalidationWorkflow');
    expect(movementWorkflowSource).toContain('tokenHasTakeCoverExpirationState');
    expect(movementWorkflowSource).toContain('handleTokenMovementCompleted');
    expect(movementWorkflowSource).toContain('handleTokenPositionUpdated');
    expect(movementWorkflowSource).toContain('notifyTokenMovementStart');
    expect(movementWorkflowSource).toContain('notifyTokenMovementComplete');
    expect(movementWorkflowSource).toContain('queueOverrideValidation');
    expect(coordinatorSource).toContain("from './AvsMovementInvalidationWorkflow.js'");
    expect(coordinatorSource).not.toContain('#clearTokenPositionCaches');
    expect(coordinatorSource).not.toContain('#queueMovementOverrideValidation');
    expect(coordinatorSource).not.toContain('#expireTakeCoverForMovement');
    expect(coordinatorSource).not.toContain('function tokenHasTakeCoverExpirationState');
  });
});
