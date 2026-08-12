import { MODULE_ID } from '../../constants.js';
import { createCanDetectVisibilityWrapper } from './detection-can-detect.js';
import { wrapCanvasVisibilityTest } from './detection-canvas-visibility.js';
import { wrapTokenRenderDetectionFilter } from './detection-filter-render.js';
import { testDetectionModeVisibility } from './detection-mode-visibility.js';
import {
  wrapTokenApplyRenderFlags,
  wrapTokenControl,
  wrapTokenRefreshState,
  wrapTokenRefreshTooltip,
  wrapTokenRefreshVisibility,
} from './detection-token-refresh.js';
import {
  wrapTokenDocumentPrepareBaseData,
  wrapTokenVisionSource,
} from './detection-vision-sharing.js';
import { startDuringMoveSoundwaveOnDrag } from '../during-move-soundwave.js';
import { wrapMultiLevelDragPreviewInitializeSources } from './multi-level-control-view.js';
import { VISIBILITY_DETECTION_THRESHOLDS } from './detection-visibility-context.js';
import { wrapTokenCanHover, wrapTokenHoverIn } from './current-view-hard-hide.js';

export function registerDetectionWrappers({
  libWrapperAdapter = libWrapper,
  warn = console.warn,
  foundryGeneration = Number(globalThis.game?.release?.generation),
} = {}) {
  registerCoreDetectionWrappers(libWrapperAdapter);
  registerTokenDetectionWrappers(libWrapperAdapter, warn, foundryGeneration);
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

function registerTokenDetectionWrappers(libWrapperAdapter, warn, foundryGeneration) {
  try {
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._canHover',
      wrapTokenCanHover,
      'MIXED',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._onHoverIn',
      wrapTokenHoverIn,
      'MIXED',
    );
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
      'foundry.canvas.placeables.Token.prototype._refreshTooltip',
      wrapTokenRefreshTooltip,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype.control',
      wrapTokenControl,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._renderDetectionFilter',
      wrapTokenRenderDetectionFilter,
      'WRAPPER',
    );
    if (Number(foundryGeneration) === 13) {
      // V13 refreshes token effect icons after its nested visibility refresh. Reassert current-view
      // hard-hide after the complete render-flag pass so Undetected tokens cannot leak icon sprites.
      libWrapperAdapter.register(
        MODULE_ID,
        'foundry.canvas.placeables.Token.prototype._applyRenderFlags',
        wrapTokenApplyRenderFlags,
        'WRAPPER',
      );
    }
    void wrapTokenRefreshState;
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._onDragLeftMove',
      startDuringMoveSoundwaveOnDrag,
      'WRAPPER',
    );
    libWrapperAdapter.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype.initializeSources',
      wrapMultiLevelDragPreviewInitializeSources,
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
}
