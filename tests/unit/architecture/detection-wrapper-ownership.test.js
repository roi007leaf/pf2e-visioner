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

  test('detection wrappers use the pending movement detection gate seam', () => {
    const gatePath = path.join(pendingMovementRoot, 'pending-movement-detection-gate.js');
    const detectionModulePaths = [
      'detection-can-detect.js',
      'detection-canvas-visibility.js',
      'detection-mode-visibility.js',
    ].map((fileName) => path.join(detectionRoot, fileName));

    expect(fs.existsSync(gatePath)).toBe(true);
    for (const modulePath of detectionModulePaths) {
      const source = fs.readFileSync(modulePath, 'utf8');
      expect(source).toContain("from '../PendingMovement/pending-movement-detection-gate.js'");
      expect(source).not.toContain("from './pending-token-movement.js'");
    }
  });

  test('token visibility wrappers use the pending movement render lock seam', () => {
    const renderLockPath = path.join(pendingMovementRoot, 'pending-movement-render-lock.js');
    const tokenVisibilityModulePaths = [
      'detection-token-refresh.js',
      'detection-filter-render.js',
    ].map((fileName) => path.join(detectionRoot, fileName));

    expect(fs.existsSync(renderLockPath)).toBe(true);
    for (const modulePath of tokenVisibilityModulePaths) {
      const source = fs.readFileSync(modulePath, 'utf8');
      expect(source).toContain("from '../PendingMovement/pending-movement-render-lock.js'");
      expect(source).not.toContain("from './PendingMovement/pending-token-movement.js'");
    }
  });

  test('pending movement render-state module owns render-lock storage', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const renderStatePath = path.join(pendingMovementRoot, 'pending-movement-render-state.js');

    expect(fs.existsSync(renderStatePath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const renderStateSource = fs.readFileSync(renderStatePath, 'utf8');

    expect(renderStateSource).toContain('PENDING_MOVEMENT_RENDER_STATE_KEY');
    expect(renderStateSource).toContain('pendingMovementRenderLockedTokens');
    expect(renderStateSource).toContain('capturePendingRenderState');
    expect(pendingSource).toContain("from './pending-movement-render-state.js'");
    expect(pendingSource).not.toContain('const PENDING_MOVEMENT_RENDER_STATE_KEY');
    expect(pendingSource).not.toContain('const pendingMovementRenderLockedTokens');
    expect(pendingSource).not.toContain('function tokenInterfaceSurfaces');
  });

  test('pending movement geometry module owns route sampling and position math', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const geometryPath = path.join(pendingMovementRoot, 'pending-movement-geometry.js');

    expect(fs.existsSync(geometryPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const geometrySource = fs.readFileSync(geometryPath, 'utf8');

    expect(geometrySource).toContain('PENDING_MOVEMENT_MAX_ROUTE_POINTS');
    expect(geometrySource).toContain('buildPendingMovementRoutePositions');
    expect(geometrySource).toContain('sampleMovementRoutePoints');
    expect(geometrySource).toContain('tokenSamplePoints');
    expect(pendingSource).toContain("from './pending-movement-geometry.js'");
    expect(pendingSource).not.toContain('function buildPendingMovementRoutePositions');
    expect(pendingSource).not.toContain('function sampleMovementRoutePoints');
    expect(pendingSource).not.toContain('function tokenSamplePoints');
    expect(pendingSource).not.toContain('const PENDING_MOVEMENT_MAX_ROUTE_POINTS');
  });

  test('pending movement refresh scheduler owns timeout maps and delayed refresh cadence', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const schedulerPath = path.join(pendingMovementRoot, 'pending-movement-refresh-scheduler.js');

    expect(fs.existsSync(schedulerPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const schedulerSource = fs.readFileSync(schedulerPath, 'utf8');

    expect(schedulerSource).toContain('PENDING_MOVEMENT_ANIMATION_REFRESH_DELAYS_MS');
    expect(schedulerSource).toContain('pendingMovementAnimationRefreshTimeouts');
    expect(schedulerSource).toContain('pendingMovementPostCompletionRefreshTimeouts');
    expect(schedulerSource).toContain('pendingMovementDetectionFilterRestoreTimeouts');
    expect(pendingSource).toContain("from './pending-movement-refresh-scheduler.js'");
    expect(pendingSource).not.toContain('const PENDING_MOVEMENT_ANIMATION_REFRESH_DELAYS_MS');
    expect(pendingSource).not.toContain('const pendingMovementAnimationRefreshTimeouts');
    expect(pendingSource).not.toContain('function addAnimationRefreshTimeout');
    expect(pendingSource).not.toContain('function removePostCompletionRefreshTimeout');
    expect(pendingSource).not.toContain('function addDetectionFilterRestoreTimeout');
  });

  test('pending movement wall-blocking module owns sight and sound ray checks', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const wallBlockingPath = path.join(pendingMovementRoot, 'pending-movement-wall-blocking.js');

    expect(fs.existsSync(wallBlockingPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const wallBlockingSource = fs.readFileSync(wallBlockingPath, 'utf8');

    expect(wallBlockingSource).toContain('lineOfSightBlockedByWall');
    expect(wallBlockingSource).toContain('lineOfSoundBlockedByWall');
    expect(wallBlockingSource).toContain('doesWallSenseBlockFromPoint');
    expect(wallBlockingSource).toContain('getWallSenseTypes');
    expect(pendingSource).toContain("from './pending-movement-wall-blocking.js'");
    expect(pendingSource).not.toContain("from '../helpers/wall-sense-utils.js'");
    expect(pendingSource).not.toContain('function wallBlocksSight');
    expect(pendingSource).not.toContain('function wallBlocksSound');
    expect(pendingSource).not.toContain('function segmentsIntersect');
  });

  test('pending movement detection-filter visuals module owns visual capture and clearing', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const visualsPath = path.join(pendingMovementRoot, 'pending-movement-detection-filter-visuals.js');

    expect(fs.existsSync(visualsPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const visualsSource = fs.readFileSync(visualsPath, 'utf8');

    expect(visualsSource).toContain('capturePendingMovementDetectionFilterVisualState');
    expect(visualsSource).toContain('restorePendingMovementDetectionFilterState');
    expect(visualsSource).toContain('clearDetectionFilterVisuals');
    expect(visualsSource).toContain('tokenHasDetectionFilterVisual');
    expect(pendingSource).toContain("from './pending-movement-detection-filter-visuals.js'");
    expect(pendingSource).not.toContain('function captureDetectionFilterMeshState');
    expect(pendingSource).not.toContain('function tokenHasDetectionFilterVisual');
    expect(pendingSource).not.toContain('function clearDetectionFilterVisuals');
    expect(pendingSource).not.toContain('export function clearNoObserverDetectionFilterVisuals');
  });

  test('pending movement controlled-drag intent module owns intent state and timers', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const dragIntentPath = path.join(pendingMovementRoot, 'pending-movement-controlled-drag-intent.js');

    expect(fs.existsSync(dragIntentPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const dragIntentSource = fs.readFileSync(dragIntentPath, 'utf8');

    expect(dragIntentSource).toContain('PENDING_MOVEMENT_CONTROLLED_DRAG_REFRESH_DELAYS_MS');
    expect(dragIntentSource).toContain('pendingControlledTokenDragIntentState');
    expect(dragIntentSource).toContain('__pf2eVisionerPendingControlledDragIntent');
    expect(dragIntentSource).toContain('primeControlledTokenDragIntent');
    expect(dragIntentSource).toContain('releaseControlledTokenDragIntent');
    expect(pendingSource).toContain("from './pending-movement-controlled-drag-intent.js'");
    expect(pendingSource).not.toContain('const PENDING_MOVEMENT_CONTROLLED_DRAG_REFRESH_DELAYS_MS');
    expect(pendingSource).not.toContain('const pendingControlledTokenDragIntentState');
    expect(pendingSource).not.toContain('function clearControlledTokenDragIntentRefreshes');
    expect(pendingSource).not.toContain('function prunePendingControlledTokenDragIntents');
  });

  test('pending movement observer-senses module owns condition and sense probes', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const observerSensesPath = path.join(pendingMovementRoot, 'pending-movement-observer-senses.js');

    expect(fs.existsSync(observerSensesPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const observerSensesSource = fs.readFileSync(observerSensesPath, 'utf8');

    expect(observerSensesSource).toContain('actorHasConditionSlug');
    expect(observerSensesSource).toContain('observerHasUsableSight');
    expect(observerSensesSource).toContain('observerCanHearTarget');
    expect(observerSensesSource).toContain('explicitHearingRange');
    expect(pendingSource).toContain("from './pending-movement-observer-senses.js'");
    expect(pendingSource).not.toContain('function actorHasConditionSlug');
    expect(pendingSource).not.toContain('function observerHasUsableSight');
    expect(pendingSource).not.toContain('function observerCanHearTarget');
    expect(pendingSource).not.toContain('function explicitHearingRange');
  });

  test('pending movement final-visibility module owns final state prediction', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const finalVisibilityPath = path.join(pendingMovementRoot, 'pending-movement-final-visibility.js');

    expect(fs.existsSync(finalVisibilityPath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const finalVisibilitySource = fs.readFileSync(finalVisibilityPath, 'utf8');

    expect(finalVisibilitySource).toContain('createPendingMovementFinalVisibilityController');
    expect(finalVisibilitySource).toContain('predictCheapFinalVisibilityStates');
    expect(finalVisibilitySource).toContain('scheduleFinalVisibilityPrediction');
    expect(finalVisibilitySource).toContain('PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_DELAY_MS');
    expect(pendingSource).toContain("from './pending-movement-final-visibility.js'");
    expect(pendingSource).not.toContain('function calculateCheapFinalRenderVisibilityState');
    expect(pendingSource).not.toContain('function predictCheapPendingFinalVisibilityStates');
    expect(pendingSource).not.toContain('function calculatePendingFinalVisibilityState');
    expect(pendingSource).not.toContain('function schedulePendingFinalVisibilityPrediction');
  });

  test('pending movement current-view soundwave module owns selected-observer soundwave transitions', () => {
    const pendingMovementPath = path.join(pendingMovementRoot, 'pending-token-movement.js');
    const currentViewSoundwavePath = path.join(
      pendingMovementRoot,
      'pending-movement-current-view-soundwave.js',
    );

    expect(fs.existsSync(currentViewSoundwavePath)).toBe(true);

    const pendingSource = fs.readFileSync(pendingMovementPath, 'utf8');
    const currentViewSoundwaveSource = fs.readFileSync(currentViewSoundwavePath, 'utf8');

    expect(currentViewSoundwaveSource).toContain('createPendingMovementCurrentViewSoundwaveController');
    expect(currentViewSoundwaveSource).toContain('observedHiddenSoundwaveGraceContexts');
    expect(currentViewSoundwaveSource).toContain('observedDetectionFilterSuppressionTokens');
    expect(currentViewSoundwaveSource).toContain('currentViewObservedDetectionShouldYieldToCore');
    expect(pendingSource).toContain("from './pending-movement-current-view-soundwave.js'");
    expect(pendingSource).not.toContain('const pendingMovementObservedHiddenSoundwaveGraceContexts');
    expect(pendingSource).not.toContain('const pendingObservedDetectionFilterSuppressionTokens');
    expect(pendingSource).not.toContain('function shouldPreserveHiddenSoundwaveForCurrentView');
    expect(pendingSource).not.toContain('function currentViewObservedDetectionShouldYieldToCore');
    expect(pendingSource).not.toContain('function rememberObservedHiddenSoundwaveGrace');
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
