const probes = [];

// AVS must ask what Core can detect before applying Visioner's stored state.
// Keep the bypass synchronous and limited to this observer/target pair.
export function withNativeVisibilityProbe(observer, target, callback) {
  probes.push({ observer, target });
  try { return callback(); } finally { probes.pop(); }
}

export function isNativeVisibilityProbe(observer, target) {
  return probes.some((probe) => probe.observer === observer && probe.target === target);
}
