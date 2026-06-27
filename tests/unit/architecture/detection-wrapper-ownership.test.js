import fs from 'fs';
import path from 'path';

describe('detection wrapper module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const servicesRoot = path.join(root, 'scripts/services');
  const detectionRoot = path.join(servicesRoot, 'Detection');
  const pendingMovementRoot = path.join(servicesRoot, 'PendingMovement');
  const detectionWrapperPath = path.join(detectionRoot, 'DetectionWrapper.js');
  const registrationPath = path.join(detectionRoot, 'detection-wrapper-registration.js');

  test('DetectionWrapper is only the lifecycle adapter', () => {
    const mainSource = fs.readFileSync(path.join(root, 'scripts/main.js'), 'utf8');
    const source = fs.readFileSync(detectionWrapperPath, 'utf8');

    expect(mainSource).toContain("from './services/Detection/DetectionWrapper.js'");
    expect(mainSource).not.toContain("from './services/DetectionWrapper.js'");
    expect(source).toContain("from './detection-wrapper-registration.js'");
    expect(source).toContain('registerDetectionWrappers()');
    expect(source).not.toContain('libWrapper.register');
    expect(source).not.toContain('DetectionFrameCache');
    expect(source).not.toContain('pending-token-movement');
    expect(source).not.toContain('createCanDetectVisibilityWrapper');
    expect(source).not.toContain('testDetectionModeVisibility');
    expect(source).not.toContain('wrapTokenVisionSource');
  });

  test('registration module wires named detection behavior modules', () => {
    const source = fs.readFileSync(registrationPath, 'utf8');

    expect(source).toContain("from './detection-mode-visibility.js'");
    expect(source).toContain("from './detection-canvas-visibility.js'");
    expect(source).toContain("from './detection-filter-render.js'");
    expect(source).toContain("from './detection-can-detect.js'");
    expect(source).toContain("from './detection-token-refresh.js'");
    expect(source).toContain("from './detection-vision-sharing.js'");
    expect(source).toContain('testDetectionModeVisibility');
    expect(source).toContain('wrapCanvasVisibilityTest');
    expect(source).toContain('wrapTokenRenderDetectionFilter');
    expect(source).toContain('createCanDetectVisibilityWrapper');
    expect(source).toContain('wrapTokenRefreshVisibility');
    expect(source).toContain('wrapTokenVisionSource');
    expect(source).toContain('wrapTokenDocumentPrepareBaseData');
  });

  test('the PendingMovement during-move layer no longer exists', () => {
    expect(fs.existsSync(pendingMovementRoot)).toBe(false);
  });

  test('detection-can-detect owns the move-aware gate via movement-tracking signal', () => {
    const source = fs.readFileSync(path.join(detectionRoot, 'detection-can-detect.js'), 'utf8');

    expect(source).toContain("from '../movement-tracking.js'");
    expect(source).toContain('hasActivePendingTokenMovement');
    expect(source).not.toContain('PendingMovement/');
    expect(source).not.toContain('pending-movement-detection-gate');
    expect(source).not.toContain("from './pending-token-movement.js'");
  });

  test('token visibility wrappers use the current-view hard-hide seam', () => {
    const tokenRefreshSource = fs.readFileSync(
      path.join(detectionRoot, 'detection-token-refresh.js'),
      'utf8',
    );
    const hardHidePath = path.join(detectionRoot, 'current-view-hard-hide.js');

    expect(fs.existsSync(hardHidePath)).toBe(true);
    expect(tokenRefreshSource).toContain("from './current-view-hard-hide.js'");
    expect(tokenRefreshSource).toContain('applyCurrentViewHardHide');
    expect(tokenRefreshSource).not.toContain('PendingMovement/');
    expect(tokenRefreshSource).not.toContain('pending-movement-render-lock');

    const filterRenderSource = fs.readFileSync(
      path.join(detectionRoot, 'detection-filter-render.js'),
      'utf8',
    );
    expect(filterRenderSource).not.toContain('PendingMovement/');
    expect(filterRenderSource).not.toContain('pending-movement-render-lock');
  });

  test('current-view hard-hide module owns the stored-visibility render decision', () => {
    const source = fs.readFileSync(path.join(detectionRoot, 'current-view-hard-hide.js'), 'utf8');

    expect(source).toContain('targetIsHardHiddenFromCurrentView');
    expect(source).toContain('applyCurrentViewHardHide');
    expect(source).toContain('currentViewObservers');
    expect(source).not.toContain('PendingMovement/');
  });

  test('move-tracking module owns pending token movement state', () => {
    const source = fs.readFileSync(path.join(servicesRoot, 'movement-tracking.js'), 'utf8');

    expect(source).toContain('export function hasActivePendingTokenMovement');
    expect(source).toContain('export function setPendingTokenMovementPosition');
    expect(source).toContain('export function schedulePendingTokenMovementCompletion');
    expect(source).toContain("'pf2e-visioner.pendingTokenMovementComplete'");
    expect(source).not.toContain('PendingMovement/');
  });

  test('BatchOrchestrator does not own pending movement render-lock side effects', () => {
    const orchestratorPath = path.join(
      root,
      'scripts/visibility/auto-visibility/core/BatchOrchestrator.js',
    );
    const orchestratorSource = fs.readFileSync(orchestratorPath, 'utf8');

    expect(orchestratorSource).not.toContain('pending-movement-render-lock');
    expect(orchestratorSource).not.toContain('forceTokenInvisibleForObserverVisibility');
    expect(orchestratorSource).not.toContain('refreshPendingMovementTokenVisibility');
  });
});
