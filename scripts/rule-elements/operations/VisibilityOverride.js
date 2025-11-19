import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class VisibilityOverride {
  static async applyVisibilityOverride(operation, subjectToken, options = {}) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyVisibilityOverride');
      return;
    }

    const {
      observers,
      direction,
      state,
      source,
      applyOffGuard = true,
      fromStates,
      toState,
      priority = 100,
      tokenIds,
      predicate,
      triggerRecalculation = false,
    } = operation;

    console.log('PF2E Visioner | applyVisibilityOverride - full operation:', {
      observers,
      direction,
      state,
      predicate,
      operationKeys: Object.keys(operation),
    });

    const observerTokens = this.getObserverTokens(
      subjectToken,
      observers,
      operation.range,
      tokenIds,
    );

    // If this is a visibility replacement (fromStates → toState), handle it separately
    if (fromStates && fromStates.length > 0 && toState) {
      const sourceData = {
        id: source || `visibility-replacement-${Date.now()}`,
        type: source,
        priority,
        fromStates,
        toState,
        direction,
        predicate,
        range: operation.range,
        levelComparison: operation.levelComparison,
      };

      await subjectToken.document.setFlag('pf2e-visioner', 'visibilityReplacement', {
        active: true,
        ...sourceData,
      });

      if (triggerRecalculation) {
        if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([
            subjectToken.id,
          ]);
        } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
        } else if (canvas?.perception) {
          canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
        }
      }
      return;
    }

    // Otherwise, it's a direct state override
    const sourceData = {
      id: source || `visibility-${Date.now()}`,
      type: source,
      priority,
      state,
      qualifications: operation.qualifications || {},
      direction,
      predicate: predicate && predicate.length > 0 ? predicate : undefined,
    };

    // Check if predicates are being used (affects whether we set global override flag)
    const hasPredicates = predicate && predicate.length > 0;

    let appliedToAnyToken = false;

    for (const observerToken of observerTokens) {
      if (observerToken.id === subjectToken.id) {
        continue;
      }

      const [targetToken, observingToken] =
        direction === 'from' ? [subjectToken, observerToken] : [observerToken, subjectToken];

      // Check predicate using PF2e's standard domain prefix system:
      // - target: prefix checks the target token
      // - origin: prefix checks the origin/observer token
      // - self: prefix checks context-specific token
      // Example: predicate: ["target:trait:undead"] only affects undead targets
      if (hasPredicates) {
        // Predicate evaluation context:
        // - direction 'to': subject sees others → predicate checks the target (observerToken becomes target in roll context)
        // - direction 'from': others see subject → predicate checks the observer (observerToken becomes target in roll context)
        // In both cases, 'target:' in predicate refers to the one being checked (observer for 'from', target for 'to')
        // 'self:' in predicate refers to the subject token's perspective
        let originOptions, targetOptions;
        if (direction === 'from') {
          // When 'from': we want to check if observer matches predicate
          // So observerToken is the target in roll context, subjectToken is the origin
          originOptions = PredicateHelper.getTokenRollOptions(subjectToken);
          targetOptions = PredicateHelper.getTargetRollOptions(observerToken, subjectToken);
        } else {
          // When 'to': we want to check if target matches predicate
          // So targetToken is the target in roll context, observingToken (subject) is the origin
          originOptions = PredicateHelper.getTokenRollOptions(observingToken);
          targetOptions = PredicateHelper.getTargetRollOptions(targetToken, observingToken);
        }
        const combinedOptions = PredicateHelper.combineRollOptions(originOptions, targetOptions);

        const passes = PredicateHelper.evaluate(predicate, combinedOptions);
        const targetTraitOptions = combinedOptions.filter((o) => o.includes('target:trait'));
        const allUndeadOptions = combinedOptions.filter((o) => o.includes('undead'));
        const allGiantOptions = combinedOptions.filter((o) => o.includes('giant'));

        console.log('PF2E Visioner | Predicate check:', {
          observer: observingToken.name,
          target: targetToken.name,
          predicate,
          predicateType: Array.isArray(predicate) ? 'array' : typeof predicate,
          predicateString: JSON.stringify(predicate),
          passes,
          targetTraitOptions: targetTraitOptions.slice(0, 20),
          allUndeadOptions,
          allGiantOptions,
          hasTargetTraitUndead: targetTraitOptions.some((o) => o.includes('undead')),
          hasTargetTraitGiant: targetTraitOptions.some((o) => o.includes('giant')),
        });

        if (!passes) {
          continue;
        }
      }

      console.log('PF2E Visioner | Applying visibility state:', {
        observer: observingToken.name,
        target: targetToken.name,
        state,
        direction,
      });

      console.log(
        `PF2E Visioner | setVisibilityState: storing source on ${targetToken.name} with observerId=${observingToken.id} (direction=${direction})`,
      );
      await this.setVisibilityState(observingToken, targetToken, state, sourceData, applyOffGuard);
      appliedToAnyToken = true;
    }

    console.log('PF2E Visioner | Visibility override complete:', {
      appliedToAnyToken,
      hasPredicates,
      willSetGlobalFlag: appliedToAnyToken && !hasPredicates,
      willRefreshVisuals: appliedToAnyToken,
    });

    // Only set the ruleElementOverride flag if:
    // 1. We actually applied the state to at least one token, AND
    // 2. There are no predicates (predicates require per-pair state, not global override)
    // The ruleElementOverride flag is a global override that applies to all tokens,
    // so it's incompatible with predicates which filter specific tokens.

    if (appliedToAnyToken && !hasPredicates) {
      await subjectToken.document.setFlag('pf2e-visioner', 'ruleElementOverride', {
        active: true,
        source: sourceData.id,
        state,
        direction,
      });
    }

    // When predicates are used, we need to refresh visuals to show the per-pair states
    // (since we're not setting the global ruleElementOverride flag)
    const shouldRefreshVisuals = triggerRecalculation || (appliedToAnyToken && hasPredicates);

    console.log('PF2E Visioner | Checking if should refresh visuals:', {
      triggerRecalculation,
      appliedToAnyToken,
      hasPredicates,
      shouldRefreshVisuals,
    });

    // Trigger visibility recalculation to update visibility maps from sources
    if (shouldRefreshVisuals) {
      // Collect all affected token IDs for recalculation
      const affectedTokenIds = [subjectToken.id];
      for (const observerToken of observerTokens) {
        if (observerToken.id !== subjectToken.id && !affectedTokenIds.includes(observerToken.id)) {
          affectedTokenIds.push(observerToken.id);
        }
      }

      // Trigger full recalculation to update visibility maps from sources
      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(
          affectedTokenIds,
        );
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
      }
    }
  }

  static async setVisibilityState(
    observerToken,
    targetToken,
    state,
    sourceData,
    applyOffGuard = true,
  ) {
    try {
      // Add the source to the state tracker
      await SourceTracker.addSourceToState(targetToken, 'visibility', sourceData, observerToken.id);

      // Update the visibility map for this specific observer->target pair
      // This is unidirectional: only sets visibility from observer's perspective of target
      const { setVisibilityBetween } = await import('../../stores/visibility-map.js');
      await setVisibilityBetween(observerToken, targetToken, state, {
        skipEphemeralUpdate: !applyOffGuard,
        isAutomatic: false,
        direction: 'observer_to_target', // Explicitly unidirectional
      });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set visibility state:', error);
    }
  }

  static async removeVisibilityOverride(operation, subjectToken, ruleElementId = null) {
    console.log(`PF2E Visioner | removeVisibilityOverride called:`, {
      token: subjectToken?.name,
      operationType: operation?.type,
      operationDirection: operation?.direction,
      operationSource: operation?.source,
      ruleElementId,
      hasRuleElementId: !!ruleElementId,
    });

    if (!subjectToken) return;

    let sourceId = operation?.source;
    let direction = operation?.direction;
    let observers = operation?.observers;
    let range = operation?.range;
    let tokenIds = operation?.tokenIds;

    console.log(
      `PF2E Visioner | removeVisibilityOverride: Extracted values - sourceId=${sourceId}, operation?.source=${operation?.source}, operationKeys=${Object.keys(operation || {})}, fullOperation=`,
      operation,
    );

    // Determine what ID to use for cleanup
    // Priority: ruleElementId > sourceId from operation > extracted from existing flags
    // Note: operation.source might be undefined, but the source ID pattern is usually "itemId-effect"
    let idToMatch = ruleElementId || sourceId;

    // If we still don't have an ID, try to extract from existing flags
    if (!idToMatch) {
      try {
        const existingOverride = subjectToken.document.getFlag(
          'pf2e-visioner',
          'ruleElementOverride',
        );
        if (existingOverride?.source) {
          idToMatch = existingOverride.source;
        } else {
          const existingReplacement = subjectToken.document.getFlag(
            'pf2e-visioner',
            'visibilityReplacement',
          );
          if (existingReplacement?.id) {
            idToMatch = existingReplacement.id;
          }
        }
      } catch (_) {}
    }

    console.log(
      `PF2E Visioner | removeVisibilityOverride: ID resolution - ruleElementId=${ruleElementId}, sourceId=${sourceId}, idToMatch=${idToMatch}`,
    );

    if (idToMatch) {
      console.log(
        `PF2E Visioner | removeVisibilityOverride: Starting cleanup with idToMatch=${idToMatch} (ruleElementId=${ruleElementId}, sourceId=${sourceId}) for token ${subjectToken.name}`,
      );
      const allTokens = canvas.tokens?.placeables.filter((t) => t.actor) || [];
      const { setVisibilityBetween, getVisibilityBetween } = await import(
        '../../stores/visibility-map.js'
      );

      // Remove all sources with IDs that match ruleElementId (exact or prefix match)
      // Sources can have IDs like ruleElementId, or ruleElementId + suffixes
      let totalSourcesRemoved = 0;
      const tokenUpdates = [];

      for (const token of allTokens) {
        const stateSource = JSON.parse(
          JSON.stringify(token.document.getFlag('pf2e-visioner', 'stateSource') || {}),
        );
        let modified = false;
        let sourcesRemovedFromToken = 0;

        // Clean up visibilityByObserver entries
        if (stateSource.visibilityByObserver) {
          for (const [observerId, data] of Object.entries(stateSource.visibilityByObserver)) {
            if (Array.isArray(data?.sources)) {
              const originalLength = data.sources.length;
              const beforeFilter = JSON.stringify(data.sources);
              data.sources = data.sources.filter((s) => {
                const sourceId = typeof s === 'string' ? s : s?.id;
                if (!sourceId) return false;
                // Check if this source should be removed - match exact or prefix
                const shouldRemove =
                  sourceId === idToMatch ||
                  sourceId.startsWith(idToMatch + '-') ||
                  idToMatch.startsWith(sourceId + '-');
                if (shouldRemove) {
                  console.log(
                    `PF2E Visioner | Removing source ${sourceId} from token ${token.name} with observerId ${observerId} (matched against ${idToMatch})`,
                  );
                }
                return !shouldRemove;
              });
              const afterFilter = JSON.stringify(data.sources);

              if (data.sources.length !== originalLength) {
                sourcesRemovedFromToken += originalLength - data.sources.length;
                modified = true;
                console.log(
                  `PF2E Visioner | Filtered sources for ${token.name}[${observerId}]: ${originalLength} -> ${data.sources.length} (before=${beforeFilter.substring(0, 100)}, after=${afterFilter.substring(0, 100)})`,
                );
              }

              // Clean up empty entries
              if (data.sources.length === 0) {
                delete stateSource.visibilityByObserver[observerId];
                console.log(
                  `PF2E Visioner | Removed empty observer entry ${observerId} from token ${token.name}`,
                );
              }
            }
          }

          // Clean up empty observer container
          if (Object.keys(stateSource.visibilityByObserver).length === 0) {
            delete stateSource.visibilityByObserver;
            modified = true;
            console.log(
              `PF2E Visioner | Removed empty visibilityByObserver from token ${token.name}`,
            );
          }
        }

        // Also clean up general visibility sources
        if (stateSource.visibility?.sources) {
          const originalLength = stateSource.visibility.sources.length;
          const removedSources = stateSource.visibility.sources.filter((s) => {
            const sourceId = typeof s === 'string' ? s : s?.id;
            if (!sourceId) return false;
            const shouldRemove =
              sourceId === idToMatch ||
              sourceId.startsWith(idToMatch + '-') ||
              idToMatch.startsWith(sourceId + '-');
            if (shouldRemove) {
              console.log(
                `PF2E Visioner | Removing general visibility source ${sourceId} from token ${token.name} (matched against ${idToMatch})`,
              );
            }
            return !shouldRemove;
          });

          if (removedSources.length !== originalLength) {
            sourcesRemovedFromToken += originalLength - removedSources.length;
            stateSource.visibility.sources = removedSources;
            modified = true;
          }
        }

        if (modified) {
          totalSourcesRemoved += sourcesRemovedFromToken;
          // Log the stateSource we're about to save
          console.log(
            `PF2E Visioner | About to save stateSource for ${token.name}:`,
            JSON.stringify(stateSource, null, 2).substring(0, 500),
          );
          // FoundryVTT's setFlag does deep merging, which causes issues when we want to replace the entire object
          // Use update() with explicit path to force replacement instead of merge
          if (Object.keys(stateSource).length === 0) {
            // Empty stateSource - use unsetFlag to remove it, then wait for it to complete
            await token.document.unsetFlag('pf2e-visioner', 'stateSource');
            console.log(
              `PF2E Visioner | Removed stateSource flag for ${token.name} using unsetFlag`,
            );
          } else {
            // Use update() with explicit key path to ensure replacement, not merge
            await token.document.update({
              [`flags.pf2e-visioner.stateSource`]: stateSource,
            });
            console.log(
              `PF2E Visioner | Updated stateSource flag for ${token.name} using update() method`,
            );
          }

          // Wait a moment for the update to propagate
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Read directly from document flags (not via getFlag which might cache)
          const verification = token.document.flags?.['pf2e-visioner']?.stateSource || {};
          let hasSources = false;
          if (verification.visibilityByObserver) {
            for (const [observerId, data] of Object.entries(verification.visibilityByObserver)) {
              if (
                Array.isArray(data?.sources) &&
                data.sources.some((s) => {
                  const sourceId = typeof s === 'string' ? s : s?.id;
                  return sourceId === idToMatch || sourceId?.startsWith(idToMatch + '-');
                })
              ) {
                hasSources = true;
                const observerToken = canvas.tokens?.placeables.find((t) => t.id === observerId);
                const observerName = observerToken?.name || observerId;
                console.error(
                  `PF2E Visioner | VERIFICATION FAILED: Source still exists in flags for ${token.name} with observerId ${observerId} (${observerName}) immediately after update!`,
                );
                break;
              }
            }
          }
          if (!hasSources) {
            console.log(
              `PF2E Visioner | Verification passed: No matching sources found in flags after update for ${token.name}`,
            );
          }
          console.log(
            `PF2E Visioner | Updated stateSource for token ${token.name}, removed ${sourcesRemovedFromToken} sources`,
          );
        }
      }

      console.log(`PF2E Visioner | Total sources removed: ${totalSourcesRemoved}`);

      // Debug: Check what sources remain after cleanup (check ALL tokens for ALL observerIds)
      console.log(
        `PF2E Visioner | Checking remaining sources after cleanup for ${subjectToken.name}:`,
      );
      let totalMatchingSourcesFound = 0;
      for (const token of allTokens) {
        const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
        if (stateSource.visibilityByObserver) {
          for (const [observerId, data] of Object.entries(stateSource.visibilityByObserver)) {
            if (Array.isArray(data?.sources) && data.sources.length > 0) {
              const matchingSources = data.sources.filter((s) => {
                const sourceId = typeof s === 'string' ? s : s?.id;
                return (
                  sourceId === idToMatch ||
                  sourceId?.startsWith(idToMatch + '-') ||
                  idToMatch.startsWith(sourceId + '-')
                );
              });
              if (matchingSources.length > 0) {
                totalMatchingSourcesFound += matchingSources.length;
                const observerToken = canvas.tokens?.placeables.find((t) => t.id === observerId);
                const observerName = observerToken?.name || observerId;
                console.log(
                  `PF2E Visioner | WARNING: Found ${matchingSources.length} matching sources remaining on ${token.name} with observerId ${observerId} (${observerName}):`,
                  matchingSources.map((s) => ({
                    id: typeof s === 'string' ? s : s?.id,
                    direction: typeof s === 'object' ? s?.direction : undefined,
                    state: typeof s === 'object' ? s?.state : undefined,
                  })),
                );
              }
            }
          }
        }
        // Also check general visibility sources
        if (stateSource.visibility?.sources) {
          const matchingSources = stateSource.visibility.sources.filter((s) => {
            const sourceId = typeof s === 'string' ? s : s?.id;
            return (
              sourceId === idToMatch ||
              sourceId?.startsWith(idToMatch + '-') ||
              idToMatch.startsWith(sourceId + '-')
            );
          });
          if (matchingSources.length > 0) {
            totalMatchingSourcesFound += matchingSources.length;
            console.log(
              `PF2E Visioner | WARNING: Found ${matchingSources.length} matching general visibility sources remaining on ${token.name}:`,
              matchingSources.map((s) => ({
                id: typeof s === 'string' ? s : s?.id,
                direction: typeof s === 'object' ? s?.direction : undefined,
                state: typeof s === 'object' ? s?.state : undefined,
              })),
            );
          }
        }
      }
      if (totalMatchingSourcesFound === 0) {
        console.log(`PF2E Visioner | Cleanup verified: No matching sources found after cleanup`);
      } else {
        console.warn(
          `PF2E Visioner | Cleanup incomplete: ${totalMatchingSourcesFound} matching sources still exist!`,
        );
      }

      // Clean up visibility map entries for all pairs involving subjectToken
      const subjectTokenId = subjectToken.id;
      let visibilityMapCleared = 0;
      for (const token of allTokens) {
        if (token.id === subjectTokenId) continue;

        // Check current visibility states before clearing
        const before1 = getVisibilityBetween(token, subjectToken);
        const before2 = getVisibilityBetween(subjectToken, token);

        // Clear both directions
        await setVisibilityBetween(token, subjectToken, 'observed', {
          skipEphemeralUpdate: true,
          isAutomatic: false,
          direction: 'observer_to_target',
        });
        await setVisibilityBetween(subjectToken, token, 'observed', {
          skipEphemeralUpdate: true,
          isAutomatic: false,
          direction: 'observer_to_target',
        });

        const after1 = getVisibilityBetween(token, subjectToken);
        const after2 = getVisibilityBetween(subjectToken, token);

        if (before1 !== 'observed' || before2 !== 'observed') {
          visibilityMapCleared++;
          console.log(
            `PF2E Visioner | Cleared visibility map: ${token.name}->${subjectToken.name} (${before1}->${after1}), ${subjectToken.name}->${token.name} (${before2}->${after2})`,
          );
        }
      }

      console.log(
        `PF2E Visioner | Cleared visibility maps for ${visibilityMapCleared} token pairs`,
      );

      await subjectToken.document.unsetFlag('pf2e-visioner', 'ruleElementOverride');
      await subjectToken.document.unsetFlag('pf2e-visioner', 'visibilityReplacement');

      // Small delay to ensure all flag updates have propagated before returning
      // This prevents race conditions where recalculation might read stale sources
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Re-verify sources are actually gone after delay
      console.log(`PF2E Visioner | Re-verifying cleanup after delay for ${subjectToken.name}:`);
      let postDelaySourcesFound = 0;
      for (const token of allTokens) {
        const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
        if (stateSource.visibilityByObserver) {
          for (const [observerId, data] of Object.entries(stateSource.visibilityByObserver)) {
            if (Array.isArray(data?.sources)) {
              const matching = data.sources.filter((s) => {
                const sourceId = typeof s === 'string' ? s : s?.id;
                return (
                  sourceId === idToMatch ||
                  sourceId?.startsWith(idToMatch + '-') ||
                  idToMatch.startsWith(sourceId + '-')
                );
              });
              if (matching.length > 0) {
                postDelaySourcesFound += matching.length;
                const observerToken = canvas.tokens?.placeables.find((t) => t.id === observerId);
                const observerName = observerToken?.name || observerId;
                console.warn(
                  `PF2E Visioner | ERROR: Source still exists after cleanup on ${token.name} with observerId ${observerId} (${observerName}):`,
                  matching.map((s) => ({
                    id: typeof s === 'string' ? s : s?.id,
                    direction: typeof s === 'object' ? s?.direction : undefined,
                  })),
                );
              }
            }
          }
        }
      }
      if (postDelaySourcesFound > 0) {
        console.error(
          `PF2E Visioner | CRITICAL: ${postDelaySourcesFound} sources still exist after cleanup + delay!`,
        );
      } else {
        console.log(`PF2E Visioner | Re-verification passed: No sources found after delay`);
      }

      console.log(
        `PF2E Visioner | removeVisibilityOverride: Cleanup complete for idToMatch=${idToMatch}`,
      );
      return;
    }

    // Fallback: original logic using sourceId
    try {
      const existingOverride = subjectToken.document.getFlag(
        'pf2e-visioner',
        'ruleElementOverride',
      );
      if (!sourceId && existingOverride?.source) {
        sourceId = existingOverride.source;
      }
      if (!direction && existingOverride?.direction) {
        direction = existingOverride.direction;
      }
      const existingReplacement = subjectToken.document.getFlag(
        'pf2e-visioner',
        'visibilityReplacement',
      );
      if (!sourceId && existingReplacement?.id) {
        sourceId = existingReplacement.id;
      }
      if (!direction && existingReplacement?.direction) {
        direction = existingReplacement.direction;
      }
    } catch (_) {}

    // Remove sources from ALL tokens, regardless of direction
    // This ensures we clean up sources stored with either 'to' or 'from' direction
    // since direction determines WHERE sources are stored (on subject vs observer tokens)
    if (sourceId) {
      const allTokens = canvas.tokens?.placeables.filter((t) => t.actor) || [];
      const { setVisibilityBetween } = await import('../../stores/visibility-map.js');

      // Try to get observer tokens if direction is known (for targeted cleanup)
      let observerTokens = [];
      if (direction) {
        observerTokens = this.getObserverTokens(subjectToken, observers || 'all', range, tokenIds);
      } else {
        // If direction unknown, clean up from all tokens
        observerTokens = allTokens.filter((t) => t.id !== subjectToken.id);
      }

      // Clean up sources from subject token (direction 'from' stores here)
      await SourceTracker.removeSource(subjectToken, sourceId, 'visibility');

      // Clean up sources from all observer tokens (direction 'to' stores here)
      // Also clean up visibility map entries
      for (const observerToken of observerTokens) {
        if (observerToken.id === subjectToken.id) continue;

        // Remove source from observer token (direction 'to' storage)
        await SourceTracker.removeSource(observerToken, sourceId, 'visibility', subjectToken.id);

        // Remove source from subject token with observer ID (direction 'from' storage)
        await SourceTracker.removeSource(subjectToken, sourceId, 'visibility', observerToken.id);

        // Clear visibility map entries for both directions
        await setVisibilityBetween(observerToken, subjectToken, 'observed', {
          skipEphemeralUpdate: true,
          isAutomatic: false,
          direction: 'observer_to_target',
        });
        await setVisibilityBetween(subjectToken, observerToken, 'observed', {
          skipEphemeralUpdate: true,
          isAutomatic: false,
          direction: 'observer_to_target',
        });
      }
    }

    await subjectToken.document.unsetFlag('pf2e-visioner', 'ruleElementOverride');
    await subjectToken.document.unsetFlag('pf2e-visioner', 'visibilityReplacement');
  }

  static getObserverTokens(subjectToken, observers, range, tokenIds = null) {
    const allTokens =
      canvas.tokens?.placeables.filter((t) => t.actor && t.id !== subjectToken.id) || [];

    let filteredTokens = [];

    switch (observers) {
      case 'all':
        filteredTokens = allTokens;
        break;
      case 'allies':
        filteredTokens = allTokens.filter((t) => this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'enemies':
        filteredTokens = allTokens.filter((t) => !this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'selected':
        filteredTokens = canvas.tokens?.controlled.filter((t) => t.id !== subjectToken.id) || [];
        break;
      case 'targeted':
        filteredTokens = Array.from(game.user.targets).filter((t) => t.id !== subjectToken.id);
        break;
      case 'specific':
        if (tokenIds && tokenIds.length > 0) {
          filteredTokens = allTokens.filter((t) => tokenIds.includes(t.document.id));
        }
        break;
      default:
        filteredTokens = allTokens;
    }

    if (range) {
      filteredTokens = filteredTokens.filter((token) => {
        const distance = canvas.grid.measureDistance(subjectToken, token);
        return distance <= range;
      });
    }

    return filteredTokens;
  }

  static areAllies(actor1, actor2) {
    if (!actor1 || !actor2) return false;

    const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
    const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
    const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

    return isPCvsPC || (isNPCvsNPC && sameDisposition);
  }

  static async applyConditionalState(operation, subjectToken) {
    if (!subjectToken?.actor) return;

    const {
      condition,
      thenState,
      elseState,
      stateType = 'visibility',
      source,
      direction,
      observers,
      priority,
    } = operation;

    const conditionMet = this.evaluateCondition(subjectToken.actor, condition);
    const targetState = conditionMet ? thenState : elseState;

    if (!targetState) return;

    if (stateType === 'visibility') {
      await this.applyVisibilityOverride(
        {
          state: targetState,
          source,
          direction,
          observers,
          priority,
        },
        subjectToken,
      );
    }
  }

  static evaluateCondition(actor, condition) {
    if (!actor) return false;

    const conditions = actor.itemTypes?.condition || [];

    switch (condition) {
      case 'invisible':
        return conditions.some((c) => c.slug === 'invisible');
      case 'concealed':
        return conditions.some((c) => c.slug === 'concealed');
      case 'hidden':
        return conditions.some((c) => c.slug === 'hidden');
      case 'undetected':
        return conditions.some((c) => c.slug === 'undetected');
      default:
        return false;
    }
  }
}
