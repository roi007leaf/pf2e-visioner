import { MODULE_ID, VISIBILITY_STATES } from '../../../constants.js';
import { appliedSeekChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './base-action.js';

export class SeekActionHandler extends ActionHandlerBase {
  constructor() {
    super('seek');
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
          potential = potential.filter((t) => {
            const d = calculateTokenDistance(actionData.actor, t);
            return !Number.isFinite(d) || d <= maxFeet;
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
      const { FeatsHandler } = await import('../feats-handler.js');
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
        const map = actionData.actor?.document?.getFlag?.(MODULE_ID, 'walls') || {};
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
      const { FeatsHandler } = await import('../feats-handler.js');
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

    // Check special sense limitations only if NO precise sense is available to the seeker,
    // or if the seeker is blinded we also consider imprecise fallback senses (hearing, lifesense, etc.).
    // We only block if neither a precise sense nor any imprecise sense can detect the target.
    // Track if we actually rely on imprecise sensing for this specific subject/outcome
    let usedImprecise = false;
    let usedImpreciseSenseType = null;
    let usedImpreciseSenseRange = null;

    try {
      if (!subject?._isWall) {
        const { VisionAnalyzer } = await import(
          '../../../visibility/auto-visibility/VisionAnalyzer.js'
        );
        const { SPECIAL_SENSES } = await import('../../../constants.js');
        const va = VisionAnalyzer.getInstance();

        // Determine if the seeker has any precise sense to use (visual or non-visual)
        // Resolve the observer token for accurate LoS and range tests
        const observerToken = actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
        const visCaps = va.getVisionCapabilities(observerToken);
        const hasLoS = va.hasLineOfSight?.(observerToken, subject, true) ?? true;
        const hasVisualPrecise = !!(
          visCaps?.hasVision && !visCaps?.isBlinded && hasLoS
        );
        const hasNonVisualPrecise = va.hasPreciseNonVisualInRange(observerToken, subject);
        const hasAnyPrecise = hasVisualPrecise || hasNonVisualPrecise;

        // Evaluate imprecise senses if we lack any precise sense, OR we are blinded AND do not have a non-visual precise sense
        const shouldEvaluateImprecise = !hasAnyPrecise || (visCaps?.isBlinded && !hasNonVisualPrecise);
        if (shouldEvaluateImprecise) {
          const sensingSummary = va.getSensingSummary(observerToken);
          const dist = this.#calculateDistance(observerToken, subject);

          let anyImprecisePresent = false;
          let anyImpreciseViable = false;
          let lastBlock = null; // { type, senseType, senseRange, unmetCondition }

          // Consider generic hearing (imprecise)
          try {
            const h = sensingSummary?.hearing;
            if (h) {
              anyImprecisePresent = true;
              let hr = Number(h.range);
              if (!Number.isFinite(hr)) hr = 0;
              if (hr >= dist) {
                anyImpreciseViable = true;
                usedImprecise = true;
                usedImpreciseSenseType = 'hearing';
                usedImpreciseSenseRange = hr;
              } else {
                lastBlock = { type: 'out-of-range', senseType: 'hearing', senseRange: hr };
              }
            }
          } catch { }

          // Consider imprecise special senses and other imprecise entries (e.g., lifesense)
          try {
            for (const ent of sensingSummary?.imprecise || []) {
              if (!ent) continue;
              anyImprecisePresent = true;
              const senseType = String(ent.type || '').toLowerCase();
              // Normalize range: prefer entry range, fall back to summary[senseType].range; if unknown, treat as 0 (not infinite)
              let r = Number(ent.range);
              if (!Number.isFinite(r)) {
                const sr = sensingSummary?.[senseType]?.range;
                r = Number(sr);
              }
              if (!Number.isFinite(r)) r = 0;
              const cfg = SPECIAL_SENSES[senseType];

              if (cfg) {
                const canDetectType = await va.canDetectWithSpecialSense(subject, senseType);
                if (!canDetectType) {
                  const unmetCondition = this.#getUnmetConditionExplanation(subject, senseType, cfg);
                  lastBlock = { type: 'unmet-conditions', senseType, senseRange: r, unmetCondition };
                  continue;
                }
              }

              if (r >= dist) {
                anyImpreciseViable = true;
                usedImprecise = true;
                usedImpreciseSenseType = senseType;
                usedImpreciseSenseRange = r;
                break;
              } else {
                lastBlock = { type: 'out-of-range', senseType, senseRange: r };
              }
            }
          } catch { }

          // If there is no precise sense available and no imprecise can detect
          // If the last block indicates unmet-conditions, tests expect the overall outcome to be 'unmet-conditions'.
          // Otherwise, keep dice outcome but annotate out-of-range and related metadata; final visibility will be clamped below.
          if (!hasAnyPrecise && (!anyImprecisePresent || !anyImpreciseViable)) {
            const reason = lastBlock?.type || 'out-of-range';
            usedImprecise = false;
            var __impreciseReason = reason;
            var __impreciseSenseType = lastBlock?.senseType;
            var __impreciseSenseRange = lastBlock?.senseRange;
            var __impreciseUnmet = lastBlock?.unmetCondition;

            // If the reason is unmet-conditions, short-circuit with a specific outcome the UI/tests can use
            if (reason === 'unmet-conditions') {
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
                unmetCondition: __impreciseUnmet,
                senseType: __impreciseSenseType,
                senseRange: __impreciseSenseRange,
              };
            }
          }
          // If a precise sense exists, we don't block even if imprecise can't detect; proceed normally
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
        const observerToken = actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
        const visCaps = va.getVisionCapabilities(observerToken);
        // Visual precise is only considered available if the observer both has vision and has LoS,
        // and current visibility (pre-seek) is at least precise quality (observed or concealed)
        const hasLoS = va.hasLineOfSight?.(observerToken, subject, true) ?? true;
        const hasVisualPrecise = !!(
          visCaps?.hasVision && !visCaps?.isBlinded && hasLoS
        );
        const hasNonVisualPrecise = va.hasPreciseNonVisualInRange(observerToken, subject);
        if (!hasVisualPrecise && !hasNonVisualPrecise) {
          newVisibility = 'hidden';
        }
      }
    } catch { }

    // Sneaky feat check: Prevents becoming observed if the target has Sneaky feat effect active against this observer
    let sneakyFeatApplied = false;
    try {
      // Get the observer token from the actor
      const observerToken =
        actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

      if (
        !subject?._isWall &&
        newVisibility === 'observed' &&
        this.#hasSneakyFeatEffect(subject, observerToken)
      ) {
        newVisibility = 'hidden';
        sneakyFeatApplied = true;
      }
    } catch (error) {
      // Silently handle errors in sneaky feat check
    }

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
      sneakyFeatApplied,
      usedImprecise: !!usedImprecise,
      usedImpreciseSenseType: usedImpreciseSenseType || null,
      usedImpreciseSenseRange: usedImpreciseSenseRange ?? null,
      // Informational flags when neither precise nor imprecise could detect
      unmetConditions: typeof __impreciseReason !== 'undefined' && __impreciseReason === 'unmet-conditions' ? true : undefined,
      outOfRange: typeof __impreciseReason !== 'undefined' && __impreciseReason === 'out-of-range' ? true : undefined,
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
        changes.push({ observer: actionData.actor, wallId: e.wallId, newWallState: prev });
      } else if (e?.targetId) {
        const tgt = this.getTokenById(e.targetId);
        if (tgt)
          changes.push({ observer: actionData.actor, target: tgt, newVisibility: e.oldVisibility });
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
          observer: actionData.actor,
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
   * Calculate distance between two tokens in feet
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {number} Distance in feet
   */
  #calculateDistance(token1, token2) {
    try {
      const dx = token1.center.x - token2.center.x;
      const dy = token1.center.y - token2.center.y;
      const px = Math.hypot(dx, dy);
      const gridSize = canvas?.grid?.size || 100;
      const unitDist = canvas?.scene?.grid?.distance || 5;
      return (px / gridSize) * unitDist;
    } catch {
      return Infinity;
    }
  }

  /**
   * Check if a token has the Sneaky feat effect active against a specific observer
   * @param {Token} target - The target token to check
   * @param {Token} observer - The observer token (the one seeking)
   * @returns {boolean} True if the target has Sneaky feat effect protecting against this observer
   */
  #hasSneakyFeatEffect(target, observer) {
    if (!target?.actor || !observer) return false;

    try {
      // Use PF2E's roll option system to check for observer-specific protection
      const observerSignature = `${observer.id}`;
      const rollOptionKey = `sneaky-feat-vs-${observerSignature}`;

      // Check if the target actor has the roll option active for this specific observer
      // This uses PF2E's built-in roll option system with predicates
      const rollOptions = target.actor.getRollOptions?.(['all']) || [];
      const hasObserverSpecificProtection = rollOptions.includes(rollOptionKey);

      // If we don't have the specific roll option, check if there's a specific rule for this observer
      if (!hasObserverSpecificProtection) {
        const effects =
          target.actor.itemTypes?.effect ??
          target.actor.items?.filter?.((i) => i?.type === 'effect') ??
          [];

        const sneakyEffect = effects.find((effect) => {
          const effectSlug = effect?.system?.slug?.toLowerCase?.() || '';
          return effectSlug === 'sneaky-feat-effect';
        });

        if (sneakyEffect) {
          // Check if there's a specific rule for this observer
          const hasRuleForObserver = sneakyEffect.system.rules?.some((rule) => {
            return rule.option === `sneaky-feat-vs-${observerSignature}`;
          });

          if (hasRuleForObserver) {
            return true; // Rule exists, so protection should be active
          }

          // No specific rule found - protection is not active
          return false;
        }
      }

      return hasObserverSpecificProtection;
    } catch (error) {
      // Fallback to flag-based checking
      const effects =
        target.actor.itemTypes?.effect ??
        target.actor.items?.filter?.((i) => i?.type === 'effect') ??
        [];

      const sneakyEffect = effects.find((effect) => {
        const effectSlug = effect?.system?.slug?.toLowerCase?.() || '';
        return effectSlug === 'sneaky-feat-effect';
      });

      if (!sneakyEffect) return false;

      const protectedObservers =
        sneakyEffect.flags?.['pf2e-visioner']?.sneakyFeat?.protectedFromObservers || [];
      return protectedObservers.some((obs) => obs.id === observer.id);
    }
  }

  /**
   * Generate explanation for why a special sense cannot detect a target
   * @param {Token} target - The target token
   * @param {string} senseType - The type of special sense
   * @param {Object} senseConfig - The sense configuration from SPECIAL_SENSES
   * @returns {string} Human-readable explanation
   */
  #getUnmetConditionExplanation(target, senseType, senseConfig) {
    try {
      const actor = target?.actor;
      if (!actor) return 'Target has no actor data';

      const creatureType = actor.system?.details?.creatureType || actor.type;
      const traits = actor.system?.traits?.value || actor.system?.details?.traits?.value || [];

      // Check what the sense can't detect and why
      const isConstruct =
        creatureType === 'construct' ||
        (Array.isArray(traits) &&
          traits.some((trait) =>
            typeof trait === 'string'
              ? trait.toLowerCase() === 'construct'
              : trait?.value?.toLowerCase() === 'construct',
          ));

      const isUndead =
        creatureType === 'undead' ||
        (Array.isArray(traits) &&
          traits.some((trait) =>
            typeof trait === 'string'
              ? trait.toLowerCase() === 'undead'
              : trait?.value?.toLowerCase() === 'undead',
          ));

      // Generate specific explanations based on sense type and target type
      if (senseType === 'lifesense') {
        if (isConstruct) {
          return 'Constructs have no life force or void energy to detect';
        }
      } else if (senseType === 'scent') {
        if (isUndead) {
          return 'Undead creatures typically have no biological scent';
        }
        if (isConstruct) {
          return 'Constructs have no biological scent to detect';
        }
      } else if (senseType === 'echolocation') {
        // Echolocation should detect everything, so this shouldn't happen
        return 'Target cannot be detected by sound reflection';
      } else if (senseType === 'tremorsense') {
        // Tremorsense should detect most things, rare cases might be flying/incorporeal
        return 'Target produces no detectable vibrations';
      }

      // Generic fallback
      return `${creatureType.charAt(0).toUpperCase() + creatureType.slice(1)} creatures cannot be detected by ${senseType}`;
    } catch {
      return 'Target cannot be detected by this sense';
    }
  }
}
