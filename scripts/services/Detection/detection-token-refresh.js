import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { applyCurrentViewHardHide } from './current-view-hard-hide.js';

function afterCoreRefresh(token) {
  try {
    applyCurrentViewHardHide(token);
  } catch {
    /* keep Foundry visibility if the guard fails */
  }
}

export function wrapTokenRefreshState(wrapped, ...args) {
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this);
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this);
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this);
  return result;
}
