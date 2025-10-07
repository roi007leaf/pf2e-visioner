/**
 * Core Token Manager actions: business logic for applying visibility and cover changes.
 * Split out from actions.js to keep files small and focused.
 */

import { MODULE_ID } from '../../../constants.js';
import { refreshEveryonesPerception } from '../../../services/socket.js';
import {
  getCoverMap,
  getSceneTargets,
  getVisibilityMap,
  setCoverMap,
  setVisibilityMap,
} from '../../../utils.js';
import { clearApplyButtonAnimation } from '../apply-button-animation.js';

// Helper: compute allowed token IDs according to current filters
function computeAllowedTokenIds(app) {
  try {
    const tokens = getSceneTargets(app.observer, app.encounterOnly, app.ignoreAllies) || [];
    const hideFoundryHidden =
      app?.hideFoundryHidden ?? game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    const ids = new Set();
    for (const t of tokens) {
      const id = t?.document?.id;
      if (!id) continue;
      if (hideFoundryHidden && t?.document?.hidden === true) continue;
      // off-table safety: ensure present on canvas
      try {
        if (!canvas.tokens.get(id)) continue;
      } catch { }
      ids.add(id);
    }
    return ids;
  } catch {
    return null;
  }
}

/**
 * ApplicationV2 form handler
 * @param {*} event - Form submission event
 * @param {*} form - Form element
 * @param {*} formData - Form data
 * @param {Object} options - Additional options
 * @param {boolean} options.forceOverride - Force override creation even when state matches current
 */
export async function formHandler(event, form, formData, options = {}) {
  const app = this;
  const { forceOverride = false } = options;
  const visibilityChanges = {};
  const coverChanges = {};
  const wallVisibilityChanges = {};

  // Respect all filters using scene-level computation
  const allowedTokenIds = computeAllowedTokenIds(app);

  // Convert FormData to object if needed
  let formDataObj;
  if (formData instanceof FormData) {
    formDataObj = Object.fromEntries(formData);
  } else {
    formDataObj = formData.object || formData;
  }

  for (const [key, value] of Object.entries(formDataObj)) {
    if (key.startsWith('visibility.')) {
      const tokenId = key.replace('visibility.', '');
      if (!allowedTokenIds || allowedTokenIds.has(tokenId)) visibilityChanges[tokenId] = value;
    } else if (key.startsWith('cover.')) {
      const tokenId = key.replace('cover.', '');
      if (!allowedTokenIds || allowedTokenIds.has(tokenId)) coverChanges[tokenId] = value;
    } else if (key.startsWith('walls.')) {
      const wallId = key.replace('walls.', '');
      wallVisibilityChanges[wallId] = value;
    }
  }

  if (app.mode === 'observer') {
    if (Object.keys(visibilityChanges).length > 0) {
      const currentMap = getVisibilityMap(app.observer) || {};
      const merged = { ...currentMap };
      // Track changes for AVS overrides (manual_action)
      const overrideMap = new Map();
      const avsRemovals = new Set();
      for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
        if (newState === 'avs') {
          // AVS state means remove override, don't set a manual state
          avsRemovals.add(tokenId);
        } else {
          if (merged[tokenId] !== newState) merged[tokenId] = newState;
        }
      }
      await setVisibilityMap(app.observer, merged);

      try {
        const { batchUpdateVisibilityEffects } = await import('../../../visibility/ephemeral.js');
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (!targetToken) continue;
          const currentState = currentMap?.[tokenId];

          if (newState === 'avs') {
            // AVS state: no visual update, just mark for override removal
            continue;
          }

          const stateChanged = currentState !== newState;

          // Skip visual updates if state hasn't changed, but always create override if forced
          if (stateChanged) {
            targetUpdates.push({ target: targetToken, state: newState });
          }

          // Create override if state changed OR if forceOverride is true
          if (stateChanged || forceOverride) {
            const expectedCover = coverChanges?.[tokenId];
            overrideMap.set(tokenId, {
              target: targetToken,
              state: newState,
              hasCover: expectedCover ? expectedCover !== 'none' : undefined,
              expectedCover,
            });
          }
        }
        if (overrideMap.size > 0) {
          try {
            const { default: AvsOverrideManager } = await import(
              '../../../chat/services/infra/AvsOverrideManager.js'
            );
            await AvsOverrideManager.applyOverrides(app.observer, overrideMap, {
              source: 'manual_action',
            });
          } catch (e) {
            console.warn('Token Manager: failed to create AVS overrides (observer mode):', e);
          }
        }

        // Remove AVS overrides for tokens set to AVS state
        if (avsRemovals.size > 0) {
          try {
            const { default: AvsOverrideManager } = await import(
              '../../../chat/services/infra/AvsOverrideManager.js'
            );
            const tokenNames = [];
            for (const tokenId of avsRemovals) {
              const token = canvas.tokens.get(tokenId);
              if (token) tokenNames.push(token.document.name);
              await AvsOverrideManager.removeOverride(app.observer.document.id, tokenId);
            }
            if (tokenNames.length > 0) {
              const { notify } = await import('../../../chat/services/infra/notifications.js');
              notify.info(
                `AVS will now control visibility for ${tokenNames.length} token${tokenNames.length === 1 ? '' : 's'}`,
              );
            }
          } catch (e) {
            console.warn('Token Manager: failed to remove AVS overrides (observer mode):', e);
          }
        }
        if (targetUpdates.length > 0) {
          await batchUpdateVisibilityEffects(app.observer, targetUpdates, {
            direction: 'observer_to_target',
          });
        }
      } catch (error) {
        console.warn('Token Manager: batch visibility update failed', error);
      }
    }

    if (Object.keys(coverChanges).length > 0) {
      const currentCover = getCoverMap(app.observer) || {};
      const mergedCover = { ...currentCover };
      for (const [tokenId, newState] of Object.entries(coverChanges)) {
        if (mergedCover[tokenId] !== newState) mergedCover[tokenId] = newState;
      }
      await setCoverMap(app.observer, mergedCover);

      try {
        const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(coverChanges)) {
          const prev = currentCover?.[tokenId];
          if (prev === newState) continue;
          const targetToken = canvas.tokens.get(tokenId);
          if (!targetToken) continue;
          targetUpdates.push({ target: targetToken, state: newState });
        }
        if (targetUpdates.length > 0) {
          await batchUpdateCoverEffects(app.observer, targetUpdates);
        }
      } catch (error) {
        console.warn('Token Manager: batch cover update failed', error);
      }
    }

    // Persist wall visibility states under observer's flags (observer→walls map)
    if (Object.keys(wallVisibilityChanges).length > 0) {
      try {
        const currentWalls = app.observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        const merged = { ...currentWalls };
        const { expandWallIdWithConnected } = await import('../../../services/connected-walls.js');
        for (const [wallId, state] of Object.entries(wallVisibilityChanges)) {
          if (state !== 'hidden' && state !== 'observed') continue;
          const ids = expandWallIdWithConnected(wallId);
          for (const id of ids) merged[id] = state;
        }
        await app.observer.document.setFlag(MODULE_ID, 'walls', merged);

        // Sync wall visibility to all other tokens of the same actor
        try {
          const actorId = app.observer?.actor?.id;
          if (actorId) {
            const allTokensOfSameActor = canvas.tokens.placeables.filter(
              t => t.actor?.id === actorId && t.document.id !== app.observer.document.id
            );

            for (const token of allTokensOfSameActor) {
              await token.document.setFlag(MODULE_ID, 'walls', merged);
            }
          }
        } catch (syncError) {
          console.warn('Token Manager: failed to sync wall visibility to other tokens', syncError);
        }
      } catch (error) {
        console.warn('Token Manager: failed to persist wall visibility states', error);
      }
    }
  } else {
    const perObserverChanges = new Map();
    const avsRemovals = new Set();
    for (const [observerTokenId, newVisibilityState] of Object.entries(visibilityChanges)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (!observerToken) continue;
      try {
        if (['loot', 'vehicle', 'party'].includes(observerToken?.actor?.type)) continue;
      } catch { }

      if (newVisibilityState === 'avs') {
        // AVS state means remove override, don't set a manual state
        avsRemovals.add(observerTokenId);
        continue;
      }

      const current = getVisibilityMap(observerToken) || {};
      const currentState = current[app.observer.document.id];
      const stateChanged = currentState !== newVisibilityState;
      if (!stateChanged && !forceOverride) continue;
      if (!perObserverChanges.has(observerTokenId))
        perObserverChanges.set(observerTokenId, { token: observerToken, map: current });
      perObserverChanges.get(observerTokenId).map[app.observer.document.id] = newVisibilityState;
    }
    for (const { token: observerToken, map } of perObserverChanges.values()) {
      await setVisibilityMap(observerToken, map);
    }
    try {
      const { batchUpdateVisibilityEffects } = await import('../../../visibility/ephemeral.js');
      const observerUpdates = [];
      // Prepare AVS overrides per observer
      const overridesByObserver = new Map();
      // Include tokens that changed OR if forceOverride is true
      const changedIds = new Set(perObserverChanges.keys());
      for (const [observerTokenId, newVisibilityState] of Object.entries(visibilityChanges)) {
        if (newVisibilityState === 'avs') {
          // AVS state: no visual update, just mark for override removal
          continue;
        }

        const hasChanged = changedIds.has(observerTokenId);
        if (!hasChanged && !forceOverride) continue;
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        try {
          if (['loot', 'vehicle', 'party'].includes(observerToken?.actor?.type)) continue;
        } catch { }
        // Only add visual updates for actual state changes
        if (hasChanged) {
          observerUpdates.push({
            target: app.observer,
            state: newVisibilityState,
            observer: observerToken,
          });
        }
        const expectedCover = coverChanges?.[observerTokenId];
        if (!overridesByObserver.has(observerTokenId))
          overridesByObserver.set(observerTokenId, new Map());
        overridesByObserver.get(observerTokenId).set(app.observer.document.id, {
          target: app.observer,
          state: newVisibilityState,
          hasCover: expectedCover ? expectedCover !== 'none' : undefined,
          expectedCover,
        });
      }
      for (const [observerTokenId, map] of overridesByObserver.entries()) {
        try {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (observerToken && map.size > 0) {
            const { default: AvsOverrideManager } = await import(
              '../../../chat/services/infra/AvsOverrideManager.js'
            );
            await AvsOverrideManager.applyOverrides(observerToken, map, {
              source: 'manual_action',
            });
          }
        } catch (e) {
          console.warn('Token Manager: failed to create AVS overrides (target mode):', e);
        }
      }

      // Remove AVS overrides for tokens set to AVS state
      if (avsRemovals.size > 0) {
        try {
          const { default: AvsOverrideManager } = await import(
            '../../../chat/services/infra/AvsOverrideManager.js'
          );
          const tokenNames = [];
          for (const observerTokenId of avsRemovals) {
            const token = canvas.tokens.get(observerTokenId);
            if (token) tokenNames.push(token.document.name);
            await AvsOverrideManager.removeOverride(observerTokenId, app.observer.document.id);
          }
          if (tokenNames.length > 0) {
            const { notify } = await import('../../../chat/services/infra/notifications.js');
            notify.info(
              `AVS will now control visibility for ${tokenNames.length} token${tokenNames.length === 1 ? '' : 's'}`,
            );
          }
        } catch (e) {
          console.warn('Token Manager: failed to remove AVS overrides (target mode):', e);
        }
      }
      if (observerUpdates.length > 0) {
        const updatesByObserver = new Map();
        for (const update of observerUpdates) {
          if (!updatesByObserver.has(update.observer.id)) {
            updatesByObserver.set(update.observer.id, { observer: update.observer, updates: [] });
          }
          updatesByObserver
            .get(update.observer.id)
            .updates.push({ target: update.target, state: update.state });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          await batchUpdateVisibilityEffects(observer, updates, {
            direction: 'observer_to_target',
          });
        }
      }
    } catch (error) {
      console.warn('Token Manager: batch visibility update failed in target mode', error);
    }

    const perObserverCover = new Map();
    for (const [observerTokenId, newCoverState] of Object.entries(coverChanges)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (!observerToken) continue;
      const current = getCoverMap(observerToken) || {};
      const currentState = current[app.observer.document.id];
      try {
        const t = observerToken.actor?.type;
        if (t === 'loot' || t === 'vehicle' || t === 'party') {
          if (currentState && currentState !== 'none') {
            current[app.observer.document.id] = 'none';
            await setCoverMap(observerToken, current);
          }
          continue;
        }
      } catch { }
      if (currentState === newCoverState && newCoverState !== 'none') continue;
      if (!perObserverCover.has(observerTokenId))
        perObserverCover.set(observerTokenId, { token: observerToken, map: current });
      perObserverCover.get(observerTokenId).map[app.observer.document.id] = newCoverState;
    }
    for (const { token: observerToken, map } of perObserverCover.values()) {
      await setCoverMap(observerToken, map);
    }
    try {
      const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
      const observerUpdates = [];
      for (const [observerTokenId, newCoverState] of Object.entries(coverChanges)) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        try {
          if (['loot', 'vehicle', 'party'].includes(observerToken?.actor?.type)) continue;
        } catch { }
        observerUpdates.push({
          target: app.observer,
          state: newCoverState,
          observer: observerToken,
        });
      }
      if (observerUpdates.length > 0) {
        const updatesByObserver = new Map();
        for (const update of observerUpdates) {
          if (!updatesByObserver.has(update.observer.id)) {
            updatesByObserver.set(update.observer.id, { observer: update.observer, updates: [] });
          }
          updatesByObserver
            .get(update.observer.id)
            .updates.push({ target: update.target, state: update.state });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          await batchUpdateCoverEffects(observer, updates);
        }
        // Reconciliation is handled internally by batchUpdateCoverEffects
      }
    } catch (error) {
      console.warn('Token Manager: batch cover update failed in target mode', error);
    }
  }

  (async () => {
    try {
      try {
        const { autoVisibilitySystem } = await import('../../../visibility/auto-visibility/index.js');
        if (autoVisibilitySystem?.orchestrator?.clearPersistentCaches) {
          autoVisibilitySystem.orchestrator.clearPersistentCaches();
        }
      } catch { }
      refreshEveryonesPerception();
      const { updateSpecificTokenPairs } = await import('../../../services/visual-effects.js');
      try {
        await updateSpecificTokenPairs([]);
      } catch { }
      // Removed redundant updateWallVisuals call - wall visual updates are properly handled
      // by TokenEventHandler._handleWallFlagChanges when wall flags actually change
    } catch { }
  })();
  return app.render();
}

export async function applyCurrent(event, button) {
  const app = this;
  // Touch params to satisfy linters in some environments
  void event; // unused
  void button; // unused

  try {
    // Extract current form values manually
    const allowedTokenIds = computeAllowedTokenIds(app);
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    const wallInputs = app.element.querySelectorAll('input[name^="walls."]');

    // Create form data object from current inputs
    const formDataObj = {};
    visibilityInputs.forEach((input) => {
      const tokenId = input.name.replace('visibility.', '');
      if (allowedTokenIds && !allowedTokenIds.has(tokenId)) return;
      formDataObj[input.name] = input.value;
    });
    coverInputs.forEach((input) => {
      const tokenId = input.name.replace('cover.', '');
      if (allowedTokenIds && !allowedTokenIds.has(tokenId)) return;
      formDataObj[input.name] = input.value;
    });
    wallInputs.forEach((input) => {
      const wallId = input.name.replace('walls.', '');
      formDataObj[input.name] = input.value;
    });

    // Call formHandler with forceOverride to create overrides even when state matches
    await formHandler.call(app, event, app.element, formDataObj, { forceOverride: true });

    // Save the current state for reference (existing behavior)
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode])
      app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };
    if (!app._savedModeData[app.mode].visibility) app._savedModeData[app.mode].visibility = {};
    if (!app._savedModeData[app.mode].cover) app._savedModeData[app.mode].cover = {};
    if (!app._savedModeData[app.mode].walls) app._savedModeData[app.mode].walls = {};

    // Use the same data we created for form submission
    for (const [key, value] of Object.entries(formDataObj)) {
      if (key.startsWith('visibility.')) {
        const tokenId = key.replace('visibility.', '');
        app._savedModeData[app.mode].visibility[tokenId] = value;
      } else if (key.startsWith('cover.')) {
        const tokenId = key.replace('cover.', '');
        app._savedModeData[app.mode].cover[tokenId] = value;
      } else if (key.startsWith('walls.')) {
        const wallId = key.replace('walls.', '');
        if (!app._savedModeData[app.mode].walls) app._savedModeData[app.mode].walls = {};
        app._savedModeData[app.mode].walls[wallId] = value;
      }
    }
  } catch (error) {
    console.error('Token Manager: Error applying current state:', error);
  }

  try {
    app.close();
  } catch (error) {
    console.warn('Token Manager: Error closing dialog:', error);
  }

  // Show progress indication
  const { runTasksWithProgress } = await import('../../progress.js');
  runTasksWithProgress(`${MODULE_ID}: Applying Current State`, [
    async () => await new Promise((r) => setTimeout(r, 100)),
  ]);

  try {
    const { batchUpdateVisibilityEffects } = await import('../../../visibility/ephemeral.js');
    const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
    const { updateWallVisuals } = await import('../../../services/visual-effects.js');
    const isVisibility = app.activeTab === 'visibility';
    const isCover = app.activeTab === 'cover';

    const allOperations = [];
    const visualUpdatePairs = [];

    if (isVisibility) {
      const allowedIds = computeAllowedTokenIds(app);
      // Apply BOTH observer and target mode saved changes
      const allObsVis = app._savedModeData.observer?.visibility || {};
      const obsVis = allowedIds
        ? Object.fromEntries(Object.entries(allObsVis).filter(([id]) => allowedIds.has(id)))
        : allObsVis;
      if (Object.keys(obsVis).length > 0) {
        const currentMap = getVisibilityMap(app.observer) || {};
        await setVisibilityMap(app.observer, { ...currentMap, ...obsVis });
        // Create AVS overrides for manual changes (observer mode)
        try {
          const changes = new Map();
          for (const [tokenId, newState] of Object.entries(obsVis)) {
            const targetToken = canvas.tokens.get(tokenId);
            // Only create override if visibility actually changes (treat undefined as 'observed')
            const prev = currentMap?.[tokenId] ?? 'observed';
            if (targetToken && prev !== newState) {
              const expectedCover = app._savedModeData.observer?.cover?.[tokenId];
              changes.set(tokenId, {
                target: targetToken,
                state: newState,
                hasCover: expectedCover ? expectedCover !== 'none' : undefined,
                expectedCover,
              });
            }
          }
          if (changes.size > 0) {
            const { default: AvsOverrideManager } = await import(
              '../../../chat/services/infra/AvsOverrideManager.js'
            );
            await AvsOverrideManager.applyOverrides(app.observer, changes, {
              source: 'manual_action',
            });
          }
        } catch (e) {
          console.warn('Token Manager: failed to create AVS overrides (applyCurrent observer):', e);
        }
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(obsVis)) {
          const targetToken = canvas.tokens.get(tokenId);
          // Only push updates for actual changes (treat undefined as 'observed')
          const prev = currentMap?.[tokenId] ?? 'observed';
          if (targetToken && prev !== newState)
            targetUpdates.push({ target: targetToken, state: newState });
        }
        if (targetUpdates.length > 0) {
          allOperations.push(async () => {
            await batchUpdateVisibilityEffects(app.observer, targetUpdates, {
              direction: 'observer_to_target',
            });
          });
          visualUpdatePairs.push(
            ...targetUpdates.map((u) => ({
              observerId: app.observer.id,
              targetId: u.target.id,
              visibility: u.state,
            })),
          );
        }
      }

      const allTgtVis = app._savedModeData.target?.visibility || {};
      const tgtVis = allowedIds
        ? Object.fromEntries(Object.entries(allTgtVis).filter(([id]) => allowedIds.has(id)))
        : allTgtVis;
      if (Object.keys(tgtVis).length > 0) {
        const updatesByObserver = new Map();
        for (const [observerTokenId, newState] of Object.entries(tgtVis)) {
          if (
            typeof newState !== 'string' ||
            !['observed', 'concealed', 'hidden', 'undetected'].includes(newState)
          )
            continue;
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          try {
            if (['loot', 'vehicle', 'party'].includes(observerToken?.actor?.type)) continue;
          } catch { }
          const observerVisibilityData = getVisibilityMap(observerToken) || {};
          // Skip if no actual change (treat undefined as 'observed')
          const prev = observerVisibilityData?.[app.observer.document.id] ?? 'observed';
          if (prev === newState) continue;
          await setVisibilityMap(observerToken, {
            ...observerVisibilityData,
            [app.observer.document.id]: newState,
          });
          if (!updatesByObserver.has(observerTokenId))
            updatesByObserver.set(observerTokenId, { observer: observerToken, updates: [] });
          updatesByObserver
            .get(observerTokenId)
            .updates.push({ target: app.observer, state: newState });
          // AVS override for target-mode edit
          try {
            const { default: AvsOverrideManager } = await import(
              '../../../chat/services/infra/AvsOverrideManager.js'
            );
            const map = new Map();
            const expectedCover = app._savedModeData.target?.cover?.[observerTokenId];
            map.set(app.observer.document.id, {
              target: app.observer,
              state: newState,
              hasCover: expectedCover ? expectedCover !== 'none' : undefined,
              expectedCover,
            });
            await AvsOverrideManager.applyOverrides(observerToken, map, {
              source: 'manual_action',
            });
          } catch (e) {
            console.warn('Token Manager: failed to create AVS overrides (applyCurrent target):', e);
          }
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          allOperations.push(async () => {
            await batchUpdateVisibilityEffects(observer, updates, {
              direction: 'observer_to_target',
            });
          });
          for (const update of updates) {
            visualUpdatePairs.push({
              observerId: observer.id,
              targetId: app.observer.id,
              visibility: update.state,
            });
          }
        }
      }

      // Walls (observer mode only): persist observer->walls map from saved data
      try {
        if (app.mode === 'observer') {
          const obsWalls = app._savedModeData.observer?.walls || {};
          if (Object.keys(obsWalls).length > 0) {
            const currentWalls = app.observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
            const merged = { ...currentWalls };
            for (const [wallId, state] of Object.entries(obsWalls)) {
              if (state === 'hidden' || state === 'observed') merged[wallId] = state;
            }
            allOperations.push(async () => {
              await app.observer?.document?.setFlag?.(MODULE_ID, 'walls', merged);
            });
          }
        }
      } catch { }
    }

    if (isCover) {
      const obsCov = app._savedModeData.observer?.cover || {};
      if (Object.keys(obsCov).length > 0) {
        const currentCover = getCoverMap(app.observer) || {};
        await setCoverMap(app.observer, { ...currentCover, ...obsCov });
        const targetUpdates = [];
        for (const [tokenId, state] of Object.entries(obsCov)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (targetToken) targetUpdates.push({ target: targetToken, state });
        }
        if (targetUpdates.length > 0) {
          allOperations.push(async () => {
            await batchUpdateCoverEffects(app.observer, targetUpdates);
          });
          // Reconciliation is handled internally by batchUpdateCoverEffects
          visualUpdatePairs.push(
            ...targetUpdates.map((u) => ({
              observerId: app.observer.id,
              targetId: u.target.id,
              cover: u.state,
            })),
          );
        }
      }

      const tgtCov = app._savedModeData.target?.cover || {};
      if (Object.keys(tgtCov).length > 0) {
        const updatesByObserver = new Map();
        for (const [observerTokenId, newState] of Object.entries(tgtCov)) {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          const observerCoverData = getCoverMap(observerToken) || {};
          await setCoverMap(observerToken, {
            ...observerCoverData,
            [app.observer.document.id]: newState,
          });
          if (!updatesByObserver.has(observerTokenId))
            updatesByObserver.set(observerTokenId, { observer: observerToken, updates: [] });
          updatesByObserver
            .get(observerTokenId)
            .updates.push({ target: app.observer, state: newState });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          try {
            const t = observer.actor?.type;
            if (t === 'loot' || t === 'vehicle' || t === 'party') continue;
          } catch { }
          allOperations.push(async () => {
            const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
            await batchUpdateCoverEffects(observer, updates);
            for (const { target, state } of updates) {
              visualUpdatePairs.push({
                observerId: observer.id,
                targetId: target.id,
                cover: state,
              });
            }
            // Reconciliation is handled internally by batchUpdateCoverEffects
          });
        }
      }
    }

    if (allOperations.length > 0) {
      await runTasksWithProgress(`${MODULE_ID}: Applying Changes`, allOperations);
      if (visualUpdatePairs.length > 0) {
        (async () => {
          try {
            const { updateSpecificTokenPairs } = await import(
              '../../../services/visual-effects.js'
            );
            await updateSpecificTokenPairs(visualUpdatePairs);
          } catch (error) {
            console.warn('Token Manager: Error updating visuals:', error);
          }
        })();
      }
      // Removed redundant updateWallVisuals call - wall visual updates are properly handled
      // by TokenEventHandler._handleWallFlagChanges when wall flags actually change
    }
  } catch (error) {
    console.error('Token Manager: Error applying current type for both modes:', error);
  }

  (async () => {
    try {
      refreshEveryonesPerception();
      canvas.perception.update({ refreshVision: true });
    } catch (error) {
      console.warn('Token Manager: Error refreshing perception:', error);
    }
  })();

  // Clear apply button animation since changes have been applied
  try {
    clearApplyButtonAnimation(app.element);
  } catch (error) {
    console.warn('Token Manager: Error clearing apply button animation:', error);
  }
}

export async function applyBoth(_event, _button) {
  // Mark parameters as used to satisfy linters in some environments
  void _event; // unused
  void _button; // unused
  const app = this;
  const { runTasksWithProgress } = await import('../../progress.js');

  try {
    app.close();
  } catch (error) {
    console.warn('Token Manager: Error closing dialog:', error);
  }
  runTasksWithProgress(`${MODULE_ID}: Preparing Changes`, [
    async () => await new Promise((r) => setTimeout(r, 100)),
  ]);

  try {
    const allowedTokenIds = computeAllowedTokenIds(app);
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    const wallInputs = app.element.querySelectorAll('input[name^="walls."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };
    visibilityInputs.forEach((input) => {
      const row = typeof input?.closest === 'function' ? input.closest('tr.token-row') : null;
      const tokenId = input.name.replace('visibility.', '');
      if (allowedTokenIds && !allowedTokenIds.has(tokenId)) return;
      app._savedModeData[app.mode].visibility[tokenId] = input.value;
    });
    coverInputs.forEach((input) => {
      const row = typeof input?.closest === 'function' ? input.closest('tr.token-row') : null;
      const tokenId = input.name.replace('cover.', '');
      if (allowedTokenIds && !allowedTokenIds.has(tokenId)) return;
      app._savedModeData[app.mode].cover[tokenId] = input.value;
    });
    wallInputs.forEach((input) => {
      const wallId = input.name.replace('walls.', '');
      if (!app._savedModeData[app.mode].walls) app._savedModeData[app.mode].walls = {};
      app._savedModeData[app.mode].walls[wallId] = input.value;
    });
  } catch (error) {
    console.error('Token Manager: Error saving current form state:', error);
  }

  try {
    const { batchUpdateVisibilityEffects } = await import('../../../visibility/ephemeral.js');
    const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
    const allOperations = [];
    const visualUpdatePairs = [];

    const observerVisUpdates = [];
    const observerCovUpdates = [];

    const vis = app._savedModeData.observer?.visibility || {};
    if (Object.keys(vis).length > 0) {
      const currentMap = getVisibilityMap(app.observer) || {};
      await setVisibilityMap(app.observer, { ...currentMap, ...vis });
      // AVS overrides for observer-mode changes
      try {
        const { default: AvsOverrideManager } = await import(
          '../../../chat/services/infra/AvsOverrideManager.js'
        );
        const map = new Map();
        for (const [tokenId, newState] of Object.entries(vis)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (!targetToken) continue;
          // Only create override if visibility actually changes
          if (currentMap?.[tokenId] === newState) continue;
          const expectedCover = app._savedModeData.observer?.cover?.[tokenId];
          map.set(tokenId, {
            target: targetToken,
            state: newState,
            hasCover: expectedCover ? expectedCover !== 'none' : undefined,
            expectedCover,
          });
        }
        if (map.size > 0)
          await AvsOverrideManager.applyOverrides(app.observer, map, { source: 'manual_action' });
      } catch (e) {
        console.warn('Token Manager: failed to create AVS overrides (applyBoth observer):', e);
      }
      for (const [tokenId, newState] of Object.entries(vis)) {
        const targetToken = canvas.tokens.get(tokenId);
        // Only push updates for actual changes
        if (targetToken && currentMap?.[tokenId] !== newState) {
          observerVisUpdates.push({ target: targetToken, state: newState });
          visualUpdatePairs.push({
            observerId: app.observer.id,
            targetId: targetToken.id,
            visibility: newState,
          });
        }
      }
    }

    const cov = app._savedModeData.observer?.cover || {};
    if (Object.keys(cov).length > 0) {
      const currentCover = getCoverMap(app.observer) || {};
      await setCoverMap(app.observer, { ...currentCover, ...cov });
      for (const [tokenId, state] of Object.entries(cov)) {
        const targetToken = canvas.tokens.get(tokenId);
        if (targetToken) {
          observerCovUpdates.push({ target: targetToken, state });
          visualUpdatePairs.push({
            observerId: app.observer.id,
            targetId: targetToken.id,
            cover: state,
          });
        }
      }
    }

    const walls = app._savedModeData.observer?.walls || {};
    if (Object.keys(walls).length > 0) {
      try {
        const currentWalls = app.observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        const merged = { ...currentWalls };
        const { expandWallIdWithConnected } = await import('../../../services/connected-walls.js');
        for (const [wallId, state] of Object.entries(walls)) {
          if (state !== 'hidden' && state !== 'observed') continue;
          const ids = expandWallIdWithConnected(wallId);
          for (const id of ids) merged[id] = state;
        }
        await app.observer.document.setFlag(MODULE_ID, 'walls', merged);
      } catch (error) {
        console.warn('Token Manager: failed to persist wall visibility states (applyBoth):', error);
      }
    }

    const targetVisUpdates = new Map();
    const targetCovUpdates = new Map();

    const targetVis = app._savedModeData.target?.visibility || {};
    for (const [observerTokenId, newState] of Object.entries(targetVis)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (observerToken) {
        const observerVisibilityData = getVisibilityMap(observerToken) || {};
        // Skip if no actual change
        if (observerVisibilityData?.[app.observer.document.id] === newState) {
          continue;
        }
        await setVisibilityMap(observerToken, {
          ...observerVisibilityData,
          [app.observer.document.id]: newState,
        });
        // AVS overrides for target-mode changes
        try {
          const { default: AvsOverrideManager } = await import(
            '../../../chat/services/infra/AvsOverrideManager.js'
          );
          const map = new Map();
          const expectedCover = app._savedModeData.target?.cover?.[observerTokenId];
          map.set(app.observer.document.id, {
            target: app.observer,
            state: newState,
            hasCover: expectedCover ? expectedCover !== 'none' : undefined,
            expectedCover,
          });
          await AvsOverrideManager.applyOverrides(observerToken, map, { source: 'manual_action' });
        } catch (e) {
          console.warn('Token Manager: failed to create AVS overrides (applyBoth target):', e);
        }
        if (!targetVisUpdates.has(observerTokenId))
          targetVisUpdates.set(observerTokenId, { observer: observerToken, updates: [] });
        targetVisUpdates
          .get(observerTokenId)
          .updates.push({ target: app.observer, state: newState });
        visualUpdatePairs.push({
          observerId: observerToken.id,
          targetId: app.observer.id,
          visibility: newState,
        });
      }
    }

    const targetCov = app._savedModeData.target?.cover || {};
    for (const [observerTokenId, newState] of Object.entries(targetCov)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (observerToken) {
        const observerCoverData = getCoverMap(observerToken) || {};
        await setCoverMap(observerToken, {
          ...observerCoverData,
          [app.observer.document.id]: newState,
        });
        if (!targetCovUpdates.has(observerTokenId))
          targetCovUpdates.set(observerTokenId, { observer: observerToken, updates: [] });
        targetCovUpdates
          .get(observerTokenId)
          .updates.push({ target: app.observer, state: newState });
        visualUpdatePairs.push({
          observerId: observerToken.id,
          targetId: app.observer.id,
          cover: newState,
        });
      }
    }

    if (observerVisUpdates.length > 0) {
      allOperations.push(async () => {
        await batchUpdateVisibilityEffects(app.observer, observerVisUpdates, {
          direction: 'observer_to_target',
        });
      });
    }
    if (observerCovUpdates.length > 0) {
      allOperations.push(async () => {
        await batchUpdateCoverEffects(app.observer, observerCovUpdates);
      });
    }
    for (const { observer, updates } of targetVisUpdates.values()) {
      allOperations.push(async () => {
        await batchUpdateVisibilityEffects(observer, updates, { direction: 'observer_to_target' });
      });
    }
    for (const { observer, updates } of targetCovUpdates.values()) {
      allOperations.push(async () => {
        const { batchUpdateCoverEffects } = await import('../../../cover/ephemeral.js');
        await batchUpdateCoverEffects(observer, updates);
      });
    }

    // Reconciliation is handled internally by each batchUpdateCoverEffects call

    if (allOperations.length > 0) {
      await runTasksWithProgress(`${MODULE_ID}: Applying Changes`, allOperations);
      if (visualUpdatePairs.length > 0) {
        (async () => {
          try {
            const { updateSpecificTokenPairs } = await import(
              '../../../services/visual-effects.js'
            );
            await updateSpecificTokenPairs(visualUpdatePairs);
          } catch (error) {
            console.warn('Token Manager: Error updating visuals:', error);
          }
        })();
      }
    }
  } catch (error) {
    console.error('Token Manager: Error applying both types for both modes:', error);
  }

  (async () => {
    try {
      refreshEveryonesPerception();
      canvas.perception.update({ refreshVision: true });
    } catch (error) {
      console.warn('Token Manager: Error refreshing perception:', error);
    }
  })();

  // Clear apply button animation since changes have been applied
  try {
    clearApplyButtonAnimation(app.element);
  } catch (error) {
    console.warn('Token Manager: Error clearing apply button animation:', error);
  }
}

export async function resetAll(_event, _button) {
  void _event; // unused
  void _button; // unused
  const app = this;
  await setVisibilityMap(app.observer, {});
  await setCoverMap(app.observer, {});
  refreshEveryonesPerception();
  return app.render();
}
