import { MODULE_ID } from '../../constants.js';
import { createCanDetectVisibilityWrapper } from './detection-can-detect.js';
import { wrapCanvasVisibilityTest } from './detection-canvas-visibility.js';
import { wrapTokenRenderDetectionFilter } from './detection-filter-render.js';
import { testDetectionModeVisibility } from './detection-mode-visibility.js';
import { wrapCanvasPerceptionUpdate } from './detection-perception-update.js';
import { wrapPrimarySpriteMeshRender } from './detection-primary-mesh-render.js';
import { wrapTokenRefreshVisibility } from './detection-token-refresh.js';
import {
  wrapTokenDocumentPrepareBaseData,
  wrapTokenVisionSource,
} from './detection-vision-sharing.js';
import { VISIBILITY_DETECTION_THRESHOLDS } from './detection-visibility-context.js';

export function registerDetectionWrappers({
  libWrapperAdapter = libWrapper,
  warn = console.warn,
} = {}) {
  registerCoreDetectionWrappers(libWrapperAdapter);
  registerTokenDetectionWrappers(libWrapperAdapter, warn);
}

function registerCoreDetectionWrappers(libWrapperAdapter) {
  libWrapperAdapter.register(
    MODULE_ID,
    'foundry.canvas.perception.DetectionMode.prototype.testVisibility',
    testDetectionModeVisibility,
    'OVERRIDE',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'foundry.canvas.groups.CanvasVisibility.prototype.testVisibility',
    wrapCanvasVisibilityTest,
    'WRAPPER',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'foundry.canvas.perception.PerceptionManager.prototype.update',
    wrapCanvasPerceptionUpdate,
    'MIXED',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'CONFIG.Canvas.detectionModes.basicSight._canDetect',
    createCanDetectVisibilityWrapper(VISIBILITY_DETECTION_THRESHOLDS.hidden),
    'WRAPPER',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'CONFIG.Canvas.detectionModes.lightPerception._canDetect',
    createCanDetectVisibilityWrapper(VISIBILITY_DETECTION_THRESHOLDS.hidden),
    'WRAPPER',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'CONFIG.Canvas.detectionModes.hearing._canDetect',
    createCanDetectVisibilityWrapper(VISIBILITY_DETECTION_THRESHOLDS.undetected),
    'WRAPPER',
  );
  libWrapperAdapter.register(
    MODULE_ID,
    'CONFIG.Canvas.detectionModes.feelTremor._canDetect',
    createCanDetectVisibilityWrapper(VISIBILITY_DETECTION_THRESHOLDS.undetected),
    'WRAPPER',
  );
}

function registerTokenDetectionWrappers(libWrapperAdapter, warn) {
  try {
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._isVisionSource',
      wrapTokenVisionSource,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._refreshVisibility',
      wrapTokenRefreshVisibility,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._renderDetectionFilter',
      wrapTokenRenderDetectionFilter,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'TokenDocument.prototype.prepareBaseData',
      wrapTokenDocumentPrepareBaseData,
      'WRAPPER',
    );
  } catch (error) {
    warn('[PF2E-Visioner] Failed to register Token wrapper:', error);
  }

  try {
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.primary.PrimarySpriteMesh.prototype.render',
      wrapPrimarySpriteMeshRender,
      'WRAPPER',
    );
  } catch (error) {
    warn('[PF2E-Visioner] Failed to register primary token mesh wrapper:', error);
  }
}
