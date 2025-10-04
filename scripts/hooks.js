/**
 * FoundryVTT hooks registration and handling - OPTIMIZED VERSION
 */

/**
 * Register all FoundryVTT hooks - using optimized zero-delay versions
 */
export function registerHooks() {
  // Always delegate to modular registration
  (async () => {
    try {
      const { registerHooks: registerModular } = await import('./hooks/registration.js');
      registerModular();

      // Register party token hooks
      const { registerPartyTokenHooks } = await import('./hooks/party-token-hooks.js');
      registerPartyTokenHooks();
    } catch (e) {
      console.error('PF2E Visioner: failed to register modular hooks', e);
    }
  })();
}
