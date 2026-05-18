// Centralized visibility state configuration (icon, color, label, cssClass)
import { VISIBILITY_STATES, getVisibilityStateLabelKey } from '../../../constants.js';

export function getVisibilityStateConfig(state, options = {}) {
  if (!state) return null;
  const entry = VISIBILITY_STATES[state];
  if (!entry) return null;
  const manual = options.manual ?? true;
  // Resolve label at call time for i18n and include cssClass
  return {
    icon: entry.icon,
    color: entry.color,
    cssClass: entry.cssClass,
    label: game.i18n.localize(getVisibilityStateLabelKey(state, { ...options, manual })),
  };
}
