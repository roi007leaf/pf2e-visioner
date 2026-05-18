/**
 * FoundryVTT hooks registration and handling - OPTIMIZED VERSION
 */

import { registerOnceAsync } from './utils/register-once.js';

export const HOOK_REGISTRATION_KEY = 'hooks:top-level';

/**
 * Register all FoundryVTT hooks - using optimized zero-delay versions
 */
export async function registerHooks() {
  await registerOnceAsync(HOOK_REGISTRATION_KEY, async () => {
    const { registerHooks: registerModular } = await import('./hooks/registration.js');
    await registerModular();

    const { registerPartyTokenHooks } = await import('./hooks/party-token-hooks.js');
    registerPartyTokenHooks();
  });
}
