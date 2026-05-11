/**
 * Expose compatibility globals used by rule elements and integrations.
 *
 * Other startup helpers may attach their own state under window.pf2eVisioner,
 * so always merge into the existing object instead of replacing it.
 */
export function exposeVisionerGlobals({ autoVisibilitySystem, AuraVisibility } = {}) {
  const root = (globalThis.window ?? globalThis);
  root.pf2eVisioner = root.pf2eVisioner || {};

  if (autoVisibilitySystem) {
    root.pf2eVisioner.services = root.pf2eVisioner.services || {};
    root.pf2eVisioner.services.autoVisibilitySystem = autoVisibilitySystem;
  }

  if (AuraVisibility) {
    root.pf2eVisioner.ruleElements = root.pf2eVisioner.ruleElements || {};
    root.pf2eVisioner.ruleElements.AuraVisibility = AuraVisibility;
  }

  return root.pf2eVisioner;
}

export async function exposeVisionerGlobalsAsync({
  autoVisibilitySystem,
  AuraVisibility,
  loadAutoVisibilitySystem,
} = {}) {
  let resolvedAutoVisibilitySystem = autoVisibilitySystem;
  if (!resolvedAutoVisibilitySystem && typeof loadAutoVisibilitySystem === 'function') {
    resolvedAutoVisibilitySystem = await loadAutoVisibilitySystem();
  }

  return exposeVisionerGlobals({
    autoVisibilitySystem: resolvedAutoVisibilitySystem,
    AuraVisibility,
  });
}
