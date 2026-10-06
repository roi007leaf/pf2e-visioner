import { MODULE_ID } from '../constants.js';
import { observerViewStateForCurrentView } from '../services/Detection/current-view-hard-hide.js';
import { shouldBypassAvsForGmVision } from '../services/gm-vision-bypass.js';
import { isSceneTokenVisionDisabled } from '../services/scene-token-vision.js';

const BLOCKED_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const suppressedPanels = new WeakMap();

/** Apply the configured health-estimate audience to presence silhouettes. */
export function syncPf2eHudHealthStatus(app, html = app?.element) {
  if (app?.id !== 'pf2e-hud-tooltip' || !game.modules?.get?.('pf2e-hud')?.active) return;
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root) return;
  const token = app.token;
  const setting = game.settings.get(MODULE_ID, 'hideHiddenTokenHealthEstimates');
  // Preserve the earlier checkbox value, including Foundry's String coercion.
  const mode = setting === true || setting === 'true' ? 'players' : setting;
  const applies = mode === 'all' || (mode === 'players' && !game.user?.isGM);
  // Core can render a silhouette without selected observers (using owned vision sources).
  const filteredPresentation =
    !token?.controlled &&
    !!token?.detectionFilter &&
    !isSceneTokenVisionDisabled() &&
    !shouldBypassAvsForGmVision();
  const suppress =
    applies && (filteredPresentation || BLOCKED_STATES.has(observerViewStateForCurrentView(token)));
  for (const panel of root.querySelectorAll('[data-panel="health-status"]')) {
    if (suppress) {
      if (!suppressedPanels.has(panel)) {
        suppressedPanels.set(panel, {
          display: panel.style.getPropertyValue('display'),
          priority: panel.style.getPropertyPriority('display'),
        });
      }
      panel.style.setProperty('display', 'none', 'important');
    } else {
      const previous = suppressedPanels.get(panel);
      if (!previous) continue;
      if (previous.display) panel.style.setProperty('display', previous.display, previous.priority);
      else panel.style.removeProperty('display');
      suppressedPanels.delete(panel);
    }
  }
}

export function registerPf2eHudHealthStatusIntegration() {
  const apps = new Set();
  Hooks.on('renderApplicationV2', (app, html) => {
    if (app?.id !== 'pf2e-hud-tooltip') return;
    apps.add(app);
    syncPf2eHudHealthStatus(app, html);
  });
  Hooks.on('closeApplicationV2', (app) => apps.delete(app));
  const refresh = () => {
    for (const app of apps) syncPf2eHudHealthStatus(app);
  };
  for (const event of [
    'pf2e-visioner.visibilityMapUpdated',
    'pf2e-visioner.visibilityChanged',
    'controlToken',
    'refreshToken',
    'updateToken',
    'updateSetting',
    'updateUser',
    'renderSceneControls',
  ]) {
    // Let token presentation and the current-view caches settle before reading them.
    Hooks.on(event, () => queueMicrotask(refresh));
  }
  Hooks.on('canvasTearDown', () => apps.clear());
}
