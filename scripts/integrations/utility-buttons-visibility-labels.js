import { getVisibilityOverrideFactor } from '../rule-elements/visibility-override-factor.js';
import { getPerceptionProfileBetween, getVisibilityBetween } from '../stores/visibility-map.js';

const UTILITY_BUTTONS = 'pf2e-flatcheck-helper';

// Snapshot the label with the roll. Old cards must retain the source that affected
// that roll even if its effect is edited, removed, or the tokens move later.
export function snapshotUtilityButtonsVisibilityLabel(message) {
  const checks = message.getFlag(UTILITY_BUTTONS, 'flatchecks');
  const check = checks?.target;
  if (check?.origin?.slug !== 'rule-element-override') return;
  const observer = message.token?.object;
  const target = message.target?.token?.object;
  if (!observer || !target) return;
  const factor = getVisibilityOverrideFactor(
    observer,
    target,
    getVisibilityBetween(observer, target),
    () => getPerceptionProfileBetween(observer, target),
  );
  if (!factor?.label || !check.origin.reasons?.includes(factor.label)) return;
  message.updateSource({
    [`flags.${UTILITY_BUTTONS}.flatchecks.target.origin.label`]: factor.label,
  });
}

export function renderUtilityButtonsVisibilityLabel(message, element) {
  const checks = message.getFlag(UTILITY_BUTTONS, 'flatchecks');
  const label = checks?.target?.origin;
  if (label?.slug !== 'rule-element-override' || !label.label) return;
  const index = Object.entries(checks)
    .filter(([, check]) => 'type' in check)
    .findIndex(([key]) => key === 'target');
  const description = element
    ?.querySelectorAll('.fc-flatcheck-buttons .fc-check')
    [index]?.querySelector('.fc-description');
  if (description) description.textContent = label.label;
}

export function registerUtilityButtonsVisibilityLabels() {
  if (!game.modules.get(UTILITY_BUTTONS)?.active || !globalThis.libWrapper) return;
  globalThis.libWrapper.register(
    'pf2e-visioner',
    'ChatMessage.prototype._preCreate',
    async function (wrapped, ...args) {
      const result = await wrapped(...args);
      if (result !== false) snapshotUtilityButtonsVisibilityLabel(this);
      return result;
    },
    'WRAPPER',
  );
  globalThis.libWrapper.register(
    'pf2e-visioner',
    'ChatMessage.prototype.renderHTML',
    async function (wrapped, ...args) {
      const element = await wrapped(...args);
      renderUtilityButtonsVisibilityLabel(this, element);
      return element;
    },
    'WRAPPER',
  );
}
