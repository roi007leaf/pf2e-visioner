const TARGET_STATE_PREFIX = 'target:condition:';
const STATE_PRIORITY = new Map([
  ['concealed', 1],
  ['hidden', 2],
  ['undetected', 3],
]);
const activeOverrides = [];

function tokenId(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function contextualTargetState(options) {
  let selectedState = null;
  let selectedPriority = 0;
  for (const option of options || []) {
    if (typeof option !== 'string' || !option.startsWith(TARGET_STATE_PREFIX)) continue;
    const state = option.slice(TARGET_STATE_PREFIX.length);
    const priority = STATE_PRIORITY.get(state) ?? 0;
    if (priority <= selectedPriority) continue;
    selectedState = state;
    selectedPriority = priority;
  }
  return selectedState;
}

function overrideFromContext(context) {
  if (context?.type !== 'attack-roll') return null;
  const observerId = tokenId(context.origin?.token);
  const targetId = tokenId(context.target?.token);
  const state = contextualTargetState(context.options);
  if (!(observerId && targetId && state)) return null;
  return {
    observerId,
    targetId,
    state,
    source: 'roll-context',
  };
}

export function getActiveRollContextVisibilityOverride(observerId, targetId) {
  for (let index = activeOverrides.length - 1; index >= 0; index -= 1) {
    const override = activeOverrides[index];
    if (override.observerId !== observerId || override.targetId !== targetId) continue;
    return {
      state: override.state,
      source: override.source,
    };
  }
  return null;
}

export async function withRollContextVisibilityOverride(context, callback) {
  const override = overrideFromContext(context);
  if (!override) return callback();

  activeOverrides.push(override);
  try {
    return await callback();
  } finally {
    const index = activeOverrides.lastIndexOf(override);
    if (index >= 0) activeOverrides.splice(index, 1);
  }
}
