async function loadDefaultTurnSneakTracker() {
  return import('../chat/services/TurnSneakTracker.js');
}

async function loadDefaultDeferredSeekManager() {
  const deferredSeekManager = (await import('../chat/services/infra/DeferredSeekManager.js'))
    .default;
  return deferredSeekManager;
}

async function loadDefaultTimedOverrideManager() {
  const { TimedOverrideManager } = await import('../services/TimedOverrideManager.js');
  return TimedOverrideManager;
}

async function loadDefaultEffectPerceptionHooks() {
  return import('./effect-perception.js');
}

export async function initializeTurnSneakTracker({
  loadTurnSneakTracker = loadDefaultTurnSneakTracker,
  error = console.error,
} = {}) {
  try {
    await loadTurnSneakTracker();
    return { initialized: true };
  } catch (caughtError) {
    error('PF2E Visioner | Failed to initialize turn sneak tracker:', caughtError);
    return { initialized: false, reason: 'error' };
  }
}

export async function initializeDeferredSeekManager({
  loadDeferredSeekManager = loadDefaultDeferredSeekManager,
} = {}) {
  try {
    const deferredSeekManager = await loadDeferredSeekManager();
    deferredSeekManager.initialize();
    return { initialized: true };
  } catch {
    return { initialized: false, reason: 'error' };
  }
}

export async function registerTimedOverrideHooks({
  loadTimedOverrideManager = loadDefaultTimedOverrideManager,
  error = console.error,
} = {}) {
  try {
    const TimedOverrideManager = await loadTimedOverrideManager();
    TimedOverrideManager.registerHooks();
    return { registered: true };
  } catch (caughtError) {
    error('PF2E Visioner | Failed to register timed override hooks:', caughtError);
    return { registered: false, reason: 'error' };
  }
}

export async function registerEffectPerceptionHooks({
  hooks = globalThis.Hooks,
  loadEffectPerceptionHooks = loadDefaultEffectPerceptionHooks,
} = {}) {
  const { onCreateActiveEffect, onUpdateActiveEffect, onDeleteActiveEffect } =
    await loadEffectPerceptionHooks();

  hooks.on('createActiveEffect', onCreateActiveEffect);
  hooks.on('updateActiveEffect', onUpdateActiveEffect);
  hooks.on('deleteActiveEffect', onDeleteActiveEffect);

  return { registered: true };
}
