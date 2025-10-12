import { MODULE_ID, VISIBILITY_STATES } from '../../../constants.js';
import { LevelsIntegration } from '../../../services/LevelsIntegration.js';
import { SeekDialogAdapter } from '../../../visibility/auto-visibility/SeekDialogAdapter.js';
import { appliedSeekChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';

export class SeekActionHandler extends ActionHandlerBase {
  constructor() {
    super('seek');
    // Store used sense per seek action (not per subject)
    this._usedSenseType = null;
    this._usedSensePrecision = null;
  }
  getApplyActionName() {
    return 'apply-now-seek';
  }
  getRevertActionName() {
    return 'revert-now-seek';
  }
  getCacheMap() {
    return appliedSeekChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }

  async discoverSubjects(actionData) {
    // Discover targets based on current canvas tokens and encounter settings, plus hidden walls
    const { shouldFilterAlly, hasActiveEncounter, calculateTokenDistance } = await import(
      '../infra/shared-utils.js'
    );
    const { MODULE_ID } = await import('../../../constants.js');

    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;


    let potential = allTokens
      .filter((t) => t && t.actor)
      // Exclude the acting token reliably by id when possible
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Always include hazards and loot in seek results regardless of ally filtering
      .filter((t) => {
        if (t.actor?.type === 'hazard' || t.actor?.type === 'loot') return true;
        // Prefer dialog's ignoreAllies when provided; otherwise do NOT filter here.
        // Let the dialog handle live ally filtering so the checkbox can reveal allies.
        const preferIgnore =
          actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
            ? actionData.ignoreAllies
            : null;
        if (preferIgnore !== true) return true; // keep allies when unchecked or unspecified
        return !shouldFilterAlly(actionData.actor, t, 'enemies', true);
      });


    // Add hidden walls as discoverable subjects (as pseudo-tokens with dc)
    try {
      // Only include hidden walls as valid Seek targets
      const allWalls = canvas?.walls?.placeables || [];
      const hiddenWalls = allWalls.filter((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));

      const wallSubjects = hiddenWalls.map((w) => {
        const d = w.document;
        // Check if this is a hidden wall with custom DC
        const dcOverride = Number(d.getFlag?.(MODULE_ID, 'stealthDC'));
        const isHiddenWall = !!d.getFlag?.(MODULE_ID, 'hiddenWall');

        if (isHiddenWall && Number.isFinite(dcOverride) && dcOverride > 0) {
          // Hidden wall with custom DC
          return { _isWall: true, _isHiddenWall: true, wall: w, dc: dcOverride };
        } else {
          // Hidden wall with default DC
          const defaultDC = Number(game.settings.get(MODULE_ID, 'wallStealthDC')) || 15;
          return { _isWall: true, _isHiddenWall: true, wall: w, dc: defaultDC };
        }
      });

      potential = potential.concat(wallSubjects);
    } catch (error) {
      console.error('Error processing walls in discoverSubjects:', error);
    }

    // Optional distance limitation based on settings (combat vs out-of-combat)
    // Apply to both tokens and walls
    try {
      const inCombat = hasActiveEncounter();
      const limitInCombat = !!game.settings.get('pf2e-visioner', 'limitSeekRangeInCombat');
      const limitOutOfCombat = !!game.settings.get('pf2e-visioner', 'limitSeekRangeOutOfCombat');
      const shouldLimit = (inCombat && limitInCombat) || (!inCombat && limitOutOfCombat);
      if (shouldLimit) {
        const maxFeet = Number(
          inCombat
            ? game.settings.get('pf2e-visioner', 'customSeekDistance')
            : game.settings.get('pf2e-visioner', 'customSeekDistanceOutOfCombat'),
        );

        if (Number.isFinite(maxFeet) && maxFeet > 0) {
          const beforeCount = potential.length;
          potential = potential.filter((subject) => {
            let d;
            if (subject._isWall) {
              // Calculate distance to wall center
              d = this.#calculateDistanceToWall(actionData.actor, subject.wall);
            } else {
              // Calculate distance to token
              d = calculateTokenDistance(actionData.actor, subject);

            }
            const withinRange = !Number.isFinite(d) || d <= maxFeet;
            return withinRange;
          });
        }
      }
    } catch { }

    // Do not pre-filter by encounter; the dialog applies encounter filter as needed
    return potential;
  }

  async analyzeOutcome(actionData, subject) {
    const { MODULE_ID } = await import('../../../constants.js');
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractStealthDC, determineOutcome } = await import('../infra/shared-utils.js');

    let current = 'hidden';
    let dc = 0;

    // Determine anomaly and That's Odd feat early
    let thatsOddAuto = false;
    try {
      const { FeatsHandler } = await import('../FeatsHandler.js');
      const isAnomaly = !!(
        subject?._isWall ||
        subject?.actor?.type === 'hazard' ||
        subject?.actor?.type === 'loot'
      );
      if (isAnomaly && FeatsHandler.hasFeat(actionData.actor, ['thats-odd', "that's-odd"])) {
        thatsOddAuto = true;
      }
    } catch { }

    if (subject && subject._isWall) {
      // Walls: use provided dc and evaluate new state vs current observer wall state
      dc = Number(subject.dc) || 15;
      // visibility state applies to wall map per observer; reuse actor for presentation
      try {
        // Prefer actorToken if available, otherwise fall back to actor
        const observerToken = actionData.actorToken || actionData.actor;
        let map = observerToken?.document?.getFlag?.(MODULE_ID, 'walls') || {};

        // If no wall data on this token, check other tokens of the same actor
        if (Object.keys(map).length === 0 && observerToken?.actor?.id) {
          const actorId = observerToken.actor.id;
          const allTokensOfSameActor = canvas.tokens.placeables.filter(
            t => t.actor?.id === actorId
          );

          for (const token of allTokensOfSameActor) {
            const tokenMap = token.document?.getFlag?.(MODULE_ID, 'walls') || {};
            if (Object.keys(tokenMap).length > 0) {
              map = tokenMap;
              break;
            }
          }
        }

        current = map?.[subject.wall?.id] || 'hidden';
      } catch {
        current = 'hidden';
      }
    } else {
      // Get the observer token from the actor
      const observerToken =
        actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
      current = getVisibilityBetween(observerToken, subject);

      // Proficiency gating for hazards/loot (skip if That's Odd guarantees detection)
      try {
        if (
          !thatsOddAuto &&
          subject?.actor &&
          (subject.actor.type === 'hazard' || subject.actor.type === 'loot')
        ) {
          const minRank = Number(subject.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
          if (Number.isFinite(minRank) && minRank > 0) {
            const stat = actionData.actor?.actor?.getStatistic?.('perception');
            const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
            if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
              const dcBlocked = extractStealthDC(subject) || 0;
              const total = Number(actionData?.roll?.total ?? 0);
              const die = Number(
                actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
              );
              return {
                target: subject,
                dc: dcBlocked,
                roll: total,
                die,
                rollTotal: total,
                dieResult: die,
                margin: total - dcBlocked,
                outcome: 'no-proficiency',
                currentVisibility: current,
                oldVisibility: current,
                newVisibility: current,
                changed: false,
                noProficiency: true,
              };
            }
          }
        }
      } catch { }

      // For loot actors, use the custom Stealth DC flag configured on the token; otherwise use Perception DC
      dc = extractStealthDC(subject);
    }
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(
      actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ??
      0,
    );
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('seek', current, outcome) || current;
    // Feat-based post visibility adjustments (Keen Eyes, That's Odd)
    try {
      const { FeatsHandler } = await import('../FeatsHandler.js');
      newVisibility = FeatsHandler.adjustVisibility(
        'seek',
        actionData.actor,
        current,
        newVisibility,
        {
          subjectType: subject?._isWall ? 'wall' : subject?.actor?.type,
          isHiddenWall: !!subject?._isWall,
          outcome,
        },
      );
    } catch { }

    // Use SeekDialogAdapter to determine which sense is being used
    // Track if we actually rely on imprecise sensing for this specific subject/outcome
    let usedImprecise = false;
    let usedImpreciseSenseType = null;
    let usedImpreciseSenseRange = null;

    // Track failure conditions for reporting in final outcome
    let __impreciseReason = undefined;
    let __impreciseSenseType = undefined;
    let __impreciseSenseRange = undefined;
    let __impreciseUnmet = undefined;

    try {
      if (!subject?._isWall) {
        const { VisionAnalyzer } = await import(
          '../../../visibility/auto-visibility/VisionAnalyzer.js'
        );
        const va = VisionAnalyzer.getInstance();
        const adapter = new SeekDialogAdapter(va);

        // Resolve the observer token for accurate sense detection
        const observerToken =
          actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

        // Use adapter to determine which sense is being used (only once per seek action)
        if (!this._usedSenseType) {
          try {
            const senseResult = await adapter.determineSenseUsed(observerToken, subject);

            if (senseResult.canDetect) {
              this._usedSenseType = senseResult.senseType;
              this._usedSensePrecision = senseResult.precision;

              // Track imprecise sense usage for this specific subject
              if (senseResult.precision === 'imprecise') {
                usedImprecise = true;
                usedImpreciseSenseType = senseResult.senseType;
                usedImpreciseSenseRange = senseResult.range;
              }
            } else {
              // Handle unmet conditions (e.g., lifesense vs construct)
              if (senseResult.unmetCondition) {
                const total = Number(actionData?.roll?.total ?? 0);
                const die = Number(
                  actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
                  actionData?.roll?.dice?.[0]?.total ??
                  actionData?.roll?.terms?.[0]?.total ??
                  0,
                );
                const dcBlocked = extractStealthDC(subject) || 0;
                return {
                  target: subject,
                  dc: dcBlocked,
                  roll: total,
                  die,
                  rollTotal: total,
                  dieResult: die,
                  margin: total - dcBlocked,
                  outcome: 'unmet-conditions',
                  currentVisibility: current,
                  oldVisibility: current,
                  newVisibility: current,
                  changed: false,
                  unmetConditions: true,
                  unmetCondition: senseResult.reason,
                  senseType: senseResult.senseType,
                  senseRange: senseResult.range,
                };
              }

              // Track failure reason for final outcome reporting
              if (senseResult.outOfRange) {
                __impreciseReason = 'out-of-range';
                __impreciseSenseType = senseResult.senseType;
                __impreciseSenseRange = senseResult.range;
              } else if (senseResult.reason) {
                __impreciseReason = 'unmet-conditions';
                __impreciseSenseType = senseResult.senseType;
                __impreciseSenseRange = senseResult.range;
                __impreciseUnmet = senseResult.reason;
              }

              // Set used sense type even if detection failed (for UI indication)
              if (senseResult.senseType) {
                this._usedSenseType = senseResult.senseType;
                this._usedSensePrecision = senseResult.precision;
              }
            }
          } catch (err) {
            console.warn('Error determining sense used for seek:', err);
          }
        }
      }
    } catch { }

    // PF2e RAW correction: You CAN Seek with imprecise senses,
    // but the best you can do is make the target Hidden (never Observed).
    // Echolocation (precise hearing within 40 ft) and other precise senses can allow Observed.
    try {
      if (!subject?._isWall && newVisibility === 'observed') {
        const { VisionAnalyzer } = await import(
          '../../../visibility/auto-visibility/VisionAnalyzer.js'
        );
        const va = VisionAnalyzer.getInstance();
        const observerToken =
          actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
        const visCaps = va.getVisionCapabilities(observerToken);
        // Visual precise is only considered available if the observer both has vision and has LoS,
        // and current visibility (pre-seek) is at least precise quality (observed or concealed)
        const hasLoS = va.hasLineOfSight?.(observerToken, subject, true) ?? true;
        const hasVisualPrecise = !!(visCaps?.hasVision && !visCaps?.isBlinded && hasLoS);
        const hasNonVisualPrecise = va.hasPreciseNonVisualInRange(observerToken, subject);

        // Also check the sensing summary directly as a fallback
        const sensingSummaryForOutcome = va.getVisionCapabilities(observerToken).sensingSummary;
        const hasPreciseNonVisualFromSummaryForOutcome = sensingSummaryForOutcome.precise?.some(
          (s) => {
            const t = String(s.type || '').toLowerCase();
            const isVisual =
              t === 'vision' || t === 'sight' || t.includes('vision') || t.includes('sight');
            return !isVisual && s.range > 0;
          },
        );

        const effectiveHasNonVisualPrecise =
          hasNonVisualPrecise || hasPreciseNonVisualFromSummaryForOutcome;

        if (!hasVisualPrecise && !effectiveHasNonVisualPrecise) {
          newVisibility = 'hidden';
        }
      }
    } catch { }

    // Build display metadata for walls
    let wallMeta = {};
    if (subject?._isWall) {
      try {
        const d = subject.wall?.document;
        const doorType = Number(d?.door) || 0; // 0 wall, 1 door, 2 secret door
        const name =
          d?.getFlag?.(MODULE_ID, 'wallIdentifier') ||
          (doorType === 2 ? 'Hidden Secret Door' : doorType === 1 ? 'Hidden Door' : 'Hidden Wall');
        const { getWallImage } = await import('../../../utils.js');
        const img = getWallImage(doorType);
        wallMeta = {
          _isWall: true,
          wall: subject.wall,
          wallId: subject.wall?.id,
          wallIdentifier: name,
          wallImg: img,
        };
      } catch { }
    }

    const base = {
      target: subject._isWall ? actionData.actor : subject,
      dc,
      // Keep legacy fields while also providing explicit names used by templates
      roll: total,
      die,
      rollTotal: total,
      dieResult: die,
      margin: total - dc,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: VISIBILITY_STATES[current]?.label || current,
      newVisibility,
      changed: newVisibility !== current,
      usedImprecise: !!usedImprecise,
      usedImpreciseSenseType: usedImpreciseSenseType || null,
      usedImpreciseSenseRange: usedImpreciseSenseRange ?? null,
      // Used sense information for UI display (set once per seek action, not per subject)
      usedSenseType: this._usedSenseType,
      usedSensePrecision: this._usedSensePrecision,
      // Informational flags when neither precise nor imprecise could detect
      unmetConditions:
        typeof __impreciseReason !== 'undefined' && __impreciseReason === 'unmet-conditions'
          ? true
          : undefined,
      outOfRange:
        typeof __impreciseReason !== 'undefined' && __impreciseReason === 'out-of-range'
          ? true
          : undefined,
      senseType: typeof __impreciseSenseType !== 'undefined' ? __impreciseSenseType : undefined,
      senseRange: typeof __impreciseSenseRange !== 'undefined' ? __impreciseSenseRange : undefined,
      unmetCondition: typeof __impreciseUnmet !== 'undefined' ? __impreciseUnmet : undefined,
      ...wallMeta,
    };

    // That's Odd: guarantee anomaly detection -> force observed, regardless of roll/DC
    if (thatsOddAuto) {
      const forced = {
        ...base,
        outcome: 'success',
        newVisibility: 'observed',
        changed: current !== 'observed',
        autoDetected: true,
        autoReason: "that's-odd",
      };
      // For walls, also set explicit override state in case UI wishes to preserve it
      if (subject?._isWall) forced.overrideState = 'observed';
      return forced;
    }

    // If a seek template was provided, ensure the target is within it; otherwise mark as unchanged to be filtered out later
    try {
      if (actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet) {
        const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');

        let inside = false;
        if (subject?._isWall) {
          // For walls, check if the wall's center point is within the template
          try {
            const wallCenter = subject.wall?.center;
            if (wallCenter) {
              const distance = Math.sqrt(
                Math.pow(wallCenter.x - actionData.seekTemplateCenter.x, 2) +
                Math.pow(wallCenter.y - actionData.seekTemplateCenter.y, 2),
              );
              const radiusPixels = (actionData.seekTemplateRadiusFeet * canvas.scene.grid.size) / 5;
              inside = distance <= radiusPixels;
            }
          } catch {
            // If wall center calculation fails, assume it's not in template
            inside = false;
          }
        } else {
          // For tokens, use the existing function
          inside = isTokenWithinTemplate(
            actionData.seekTemplateCenter,
            actionData.seekTemplateRadiusFeet,
            subject,
          );
        }

        if (!inside) return { ...base, changed: false };
      }
    } catch { }

    return base;
  }

  buildCacheEntryFromChange(change) {
    // Support both token and wall changes in cache
    if (change?.wallId) {
      return { wallId: change.wallId, oldVisibility: change.oldVisibility };
    }
    const tid = change?.target?.id || change?.targetId || null;
    return { targetId: tid, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, actionData) {
    const changes = [];
    for (const e of entries) {
      if (e?.wallId) {
        // Revert wall state on the seeker back to previous visibility (default hidden)
        const prev = typeof e.oldVisibility === 'string' ? e.oldVisibility : 'hidden';
        changes.push({ observer: actionData.actorToken || actionData.actor, wallId: e.wallId, newWallState: prev });
      } else if (e?.targetId) {
        const tgt = this.getTokenById(e.targetId);
        if (tgt)
          changes.push({ observer: actionData.actorToken || actionData.actor, target: tgt, newVisibility: e.oldVisibility });
      }
    }
    return changes;
  }

  // For walls, return a change describing wallId + desired state instead of token target
  outcomeToChange(actionData, outcome) {
    try {
      if (outcome?._isWall && outcome?.wallId) {
        const effective = outcome?.overrideState || outcome?.newVisibility || null;
        return {
          observer: actionData.actorToken || actionData.actor,
          wallId: outcome.wallId,
          newWallState: effective,
          oldVisibility: outcome?.oldVisibility || outcome?.currentVisibility || null,
        };
      }
    } catch { }
    return super.outcomeToChange(actionData, outcome);
  }

  // Override base to support wall overrides passed from UI
  applyOverrides(actionData, outcomes) {
    try {
      // Standard token overrides
      const base = super.applyOverrides(actionData, outcomes) || outcomes;
      // Wall overrides delivered as { __wall__: { [wallId]: state } }
      const wallMap = actionData?.overrides?.__wall__;
      if (wallMap && typeof wallMap === 'object') {
        for (const outcome of base) {
          if (outcome?._isWall && outcome?.wallId && wallMap[outcome.wallId]) {
            outcome.newVisibility = wallMap[outcome.wallId];
            outcome.changed =
              outcome.newVisibility !== (outcome.oldVisibility || outcome.currentVisibility);
            outcome.overrideState = wallMap[outcome.wallId];
          }
        }
      }
      return base;
    } catch {
      return outcomes;
    }
  }

  // Apply token visibility changes as usual, and also persist wall visibility for the seeker
  async applyChangesInternal(changes) {
    try {
      const tokenChanges = [];
      const wallChangesByObserver = new Map();
      for (const ch of changes) {
        if (ch?.wallId) {
          const obsId = ch?.observer?.id;
          if (!obsId) continue;
          if (!wallChangesByObserver.has(obsId))
            wallChangesByObserver.set(obsId, { observer: ch.observer, walls: new Map() });
          wallChangesByObserver.get(obsId).walls.set(ch.wallId, ch.newWallState);
        } else {
          tokenChanges.push(ch);
        }
      }

      // First apply token visibility changes (if any)
      if (tokenChanges.length > 0) {
        const { applyVisibilityChanges } = await import('../infra/shared-utils.js');
        const groups = this.groupChangesByObserver(tokenChanges);
        for (const group of groups) {
          await applyVisibilityChanges(
            group.observer,
            group.items.map((i) => ({ target: i.target, newVisibility: i.newVisibility })),
            { direction: this.getApplyDirection(), source: 'seek_action' },
          );
        }
      }

      // Then persist wall states for each observer
      if (wallChangesByObserver.size > 0) {
        for (const { observer, walls } of wallChangesByObserver.values()) {
          try {
            const doc = observer?.document;
            if (!doc) continue;
            const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
            const next = { ...current };
            const { expandWallIdWithConnected } = await import(
              '../../../services/connected-walls.js'
            );
            for (const [wallId, state] of walls.entries()) {
              const eff = typeof state === 'string' ? state : 'observed';
              const applied = eff === 'undetected' || eff === 'hidden' ? 'hidden' : 'observed';
              const ids = expandWallIdWithConnected(wallId);
              for (const id of ids) next[id] = applied;
            }
            await doc.setFlag?.(MODULE_ID, 'walls', next);
            try {
              const { updateWallVisuals } = await import('../../../services/visual-effects.js');
              await updateWallVisuals(observer.id);
            } catch { }
          } catch {
            /* ignore per-observer wall errors */
          }
        }
      }
    } catch {
      // Fallback to base implementation if something goes wrong
      return super.applyChangesInternal(changes);
    }
  }

  // Ensure per-row apply with wall overrides is honored (skip base allowedIds filter)
  async apply(actionData, button) {
    try {
      await this.ensurePrerequisites(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) {
        outcomes.push(await this.analyzeOutcome(actionData, subject));
      }
      // Apply overrides (supports __wall__)
      this.applyOverrides(actionData, outcomes);

      // Keep only changed outcomes, but always include walls for display
      let filtered = outcomes.filter((o) => o && (o.changed || o._isWall));

      // If overrides specify a particular token/wall, limit to those only (per-row apply)
      try {
        const ov = actionData?.overrides || {};
        const wallMap =
          ov?.__wall__ && typeof ov.__wall__ === 'object'
            ? new Set(Object.keys(ov.__wall__))
            : new Set();
        const tokenMap = new Set(Object.keys(ov).filter((k) => k !== '__wall__'));
        if (wallMap.size > 0 || tokenMap.size > 0) {
          filtered = filtered.filter((o) => {
            if (o?._isWall && o?.wallId) return wallMap.has(o.wallId);
            const id = this.getOutcomeTokenId(o);
            return id ? tokenMap.has(id) : false;
          });
        }
      } catch { }

      if (filtered.length === 0) {
        (await import('../infra/notifications.js')).notify.info('No changes to apply');
        return 0;
      }

      // Build changes for tokens and walls
      const changes = filtered.map((o) => this.outcomeToChange(actionData, o)).filter(Boolean);
      await this.applyChangesInternal(changes);
      this.cacheAfterApply(actionData, changes);
      this.updateButtonToRevert(button);
      return changes.length;
    } catch (e) {
      (await import('../infra/notifications.js')).log.error(e);
      return 0;
    }
  }

  /**
   * Calculate distance between a token and a wall in feet
   * @param {Token} token - The token
   * @param {Wall} wall - The wall object
   * @returns {number} Distance in feet
   */
  #calculateDistanceToWall(token, wall) {
    try {
      if (!token?.center || !wall?.center) return Infinity;

      const dx = token.center.x - wall.center.x;
      const dy = token.center.y - wall.center.y;
      let distance = Math.hypot(dx, dy);

      const levelsIntegration = LevelsIntegration.getInstance();
      if (levelsIntegration.isActive) {
        const tokenElevation = levelsIntegration.getTokenElevation(token);
        const wallTop = wall.document?.flags?.['wall-height']?.top ?? tokenElevation;
        const wallBottom = wall.document?.flags?.['wall-height']?.bottom ?? tokenElevation;

        const wallMidElevation = (wallTop + wallBottom) / 2;
        const dz = tokenElevation - wallMidElevation;
        distance = Math.sqrt(distance * distance + dz * dz);
      }

      const gridSize = canvas?.grid?.size || 100;
      const unitDist = canvas?.scene?.grid?.distance || 5;
      return (distance / gridSize) * unitDist;
    } catch {
      return Infinity;
    }
  }
}
