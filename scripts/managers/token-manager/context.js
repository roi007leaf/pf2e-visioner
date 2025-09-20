/**
 * Context builder for VisionerTokenManager template
 */

import { extractPerceptionDC, extractStealthDC } from '../../chat/services/infra/shared-utils.js';
import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from '../../constants.js';
import {
  getCoverMap,
  getLastRollTotalForActor,
  getSceneTargets,
  getVisibilityMap,
  hasActiveEncounter,
} from '../../utils.js';

function getTokenImage(token) {
  if (token.actor?.img) return token.actor.img;
  return 'icons/svg/book.svg';
}

function svgDataUri(svg) {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

function getWallImage(doorType = 0) {
  // doorType: 0 wall, 1 standard door, 2 secret door (Foundry uses 1/2 for door types)
  if (Number(doorType) === 1) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#e6e6e6'/>
    </svg>`;
    return svgDataUri(svg);
  }
  if (Number(doorType) === 2) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
      <rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#d4af37' stroke-width='2'/>
      <circle cx='19' cy='14' r='1.5' fill='#d4af37'/>
      <path d='M7 7l14 14' stroke='#d4af37' stroke-width='1.5' opacity='0.7'/>
    </svg>`;
    return svgDataUri(svg);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>
    <rect x='4' y='4' width='20' height='20' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/>
    <path d='M8 6v16M14 6v16M20 6v16' stroke='#888888' stroke-width='2'/>
  </svg>`;
  return svgDataUri(svg);
}

export async function buildContext(app, options) {
  // IMPORTANT: Call the base ApplicationV2 implementation, not our own override,
  // otherwise we recurse forever and nothing renders.
  const BaseApp = foundry?.applications?.api?.ApplicationV2;
  const context = BaseApp ? await BaseApp.prototype._prepareContext.call(app, options) : {};

  if (!app.observer) {
    context.error = game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED');
    return context;
  }

  try {
    app.visibilityData = getVisibilityMap(app.observer) || {};
    app.coverData = getCoverMap(app.observer) || {};
  } catch { }

  const isLootObserver = app.observer?.actor?.type === 'loot';
  if (isLootObserver) {
    app.mode = 'target';
    if (app.activeTab === 'cover') app.activeTab = 'visibility';
  }
  context.mode = app.mode;
  context.activeTab = app.activeTab;
  context.isObserverMode = app.mode === 'observer';
  context.isTargetMode = app.mode === 'target';
  context.isVisibilityTab = app.activeTab === 'visibility';
  context.isCoverTab = app.activeTab === 'cover';
  context.lootObserver = !!isLootObserver;
  context.hideCoverTab = !!isLootObserver;

  context.showEncounterFilter = hasActiveEncounter();
  context.encounterOnly = app.encounterOnly;
  context.ignoreAllies = !!app.ignoreAllies;
  context.ignoreWalls = !!app.ignoreWalls;
  // Visual filter flag: hide Foundry-hidden tokens (per-user)
  try {
    context.hideFoundryHidden = !!app.hideFoundryHidden;
  } catch (_) {
    context.hideFoundryHidden = false;
  }

  const sceneTokens = getSceneTargets(app.observer, app.encounterOnly, app.ignoreAllies);

  context.observer = {
    id: app.observer.document.id,
    name: app.observer.document.name,
    img: getTokenImage(app.observer),
  };

  let allTargets;
  if (app.mode === 'observer') {
    allTargets = sceneTokens.map((token) => {
      const currentVisibilityState = app.visibilityData[token.document.id] || 'observed';
      const currentCoverState = app.coverData[token.document.id] || 'none';

      const disposition = token.document.disposition || 0;
      // Foundry hidden means the TokenDocument.hidden property is strictly true
      const isFoundryHidden = token?.document?.hidden === true;

      const perceptionDC = extractPerceptionDC(token);
      const stealthDC = extractStealthDC(token);
      const showOutcomeSetting = game.settings.get(MODULE_ID, 'integrateRollOutcome');
      let showOutcome = false;
      let outcomeLabel = '';
      let outcomeClass = '';
      if (showOutcomeSetting) {
        const lastRoll = getLastRollTotalForActor(app.observer?.actor, null);
        if (typeof lastRoll === 'number' && typeof stealthDC === 'number') {
          const diff = lastRoll - stealthDC;
          if (diff >= 10) {
            outcomeLabel = 'Critical Success';
            outcomeClass = 'critical-success';
          } else if (diff >= 0) {
            outcomeLabel = 'Success';
            outcomeClass = 'success';
          } else if (diff <= -10) {
            outcomeLabel = 'Critical Failure';
            outcomeClass = 'critical-failure';
          } else {
            outcomeLabel = 'Failure';
            outcomeClass = 'failure';
          }
          showOutcome = true;
        }
      }
      const isRowLoot = token.actor?.type === 'loot';
      const allowedVisKeys =
        isLootObserver || isRowLoot ? ['observed', 'hidden'] : Object.keys(VISIBILITY_STATES);
      const visibilityStates = allowedVisKeys.map((key) => ({
        value: key,
        label: game.i18n.localize(VISIBILITY_STATES[key].label),
        selected: currentVisibilityState === key,
        icon: VISIBILITY_STATES[key].icon,
        color: VISIBILITY_STATES[key].color,
        cssClass: VISIBILITY_STATES[key].cssClass,
      }));

        // Determine if an AVS override exists for this pair (observer -> target) in observer mode
        let hasAvsOverride = false;
        try {
          hasAvsOverride = !!token.document.getFlag(
            MODULE_ID,
            `avs-override-from-${app.observer.document.id}`,
          );
        } catch { /* ignore */ }

      return {
        id: token.document.id,
        name: token.document.name,
        img: getTokenImage(token),
        isFoundryHidden,
        isLoot: !!isRowLoot,
        currentVisibilityState: allowedVisKeys.includes(currentVisibilityState)
          ? currentVisibilityState
          : 'observed',
        currentCoverState,
        isPC: token.actor?.hasPlayerOwner || token.actor?.type === 'character',
        disposition: disposition,
        dispositionClass:
          disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
        visibilityStates,
        coverStates: Object.entries(COVER_STATES).map(([key, config]) => ({
          value: key,
          label: game.i18n.localize(config.label),
          selected: currentCoverState === key,
          icon: config.icon,
          color: config.color,
          cssClass: config.cssClass,
          bonusAC: config.bonusAC,
          bonusReflex: config.bonusReflex,
          bonusStealth: config.bonusStealth,
          canHide: config.canHide,
        })),
        perceptionDC,
        stealthDC,
        showOutcome,
        outcomeLabel,
        outcomeClass,
        hasAvsOverride,
      };
    });
  } else {
    allTargets = sceneTokens.map((observerToken) => {
      const observerVisibilityData = getVisibilityMap(observerToken);
      const observerCoverData = getCoverMap(observerToken);
      let currentVisibilityState = observerVisibilityData[app.observer.document.id] || 'observed';
      const currentCoverState = observerCoverData[app.observer.document.id] || 'none';
      // Foundry hidden means the TokenDocument.hidden property is strictly true
      const isFoundryHidden = observerToken?.document?.hidden === true;

      // For sneaking tokens, show the AVS internal state instead of the detection wrapper state
      if (app.observer.document.getFlag(MODULE_ID, 'sneak-active')) {
        // Read from the observer token's visibility map to see how it sees the sneaking token
        const avsInternalState = observerVisibilityData?.[app.observer.document.id];
        if (avsInternalState) {
          currentVisibilityState = avsInternalState;
        }
      }

      const disposition = observerToken.document.disposition || 0;

      const perceptionDC = extractPerceptionDC(observerToken);
      const stealthDC = extractPerceptionDC(observerToken);
      const showOutcomeSetting = game.settings.get(MODULE_ID, 'integrateRollOutcome');
      let showOutcome = false;
      let outcomeLabel = '';
      let outcomeClass = '';
      if (showOutcomeSetting) {
        const lastRoll = getLastRollTotalForActor(app.observer?.actor, null);
        if (typeof lastRoll === 'number' && typeof perceptionDC === 'number') {
          const diff = lastRoll - perceptionDC;
          if (diff >= 10) {
            outcomeLabel = 'Critical Success';
            outcomeClass = 'critical-success';
          } else if (diff >= 0) {
            outcomeLabel = 'Success';
            outcomeClass = 'success';
          } else if (diff <= -10) {
            outcomeLabel = 'Critical Failure';
            outcomeClass = 'critical-failure';
          } else {
            outcomeLabel = 'Failure';
            outcomeClass = 'failure';
          }
          showOutcome = true;
        }
      }
      const isRowLoot = observerToken.actor?.type === 'loot' || isLootObserver;
      const allowedVisKeys = isRowLoot ? ['observed', 'hidden'] : Object.keys(VISIBILITY_STATES);
      const visibilityStates = allowedVisKeys.map((key) => ({
        value: key,
        label: game.i18n.localize(VISIBILITY_STATES[key].label),
        selected: currentVisibilityState === key,
        icon: VISIBILITY_STATES[key].icon,
        color: VISIBILITY_STATES[key].color,
        cssClass: VISIBILITY_STATES[key].cssClass,
      }));

      // In target mode, overrides are stored on the target (app.observer) with key from row observer id
      let hasAvsOverride = false;
      try {
        hasAvsOverride = !!app.observer.document.getFlag(
          MODULE_ID,
          `avs-override-from-${observerToken.document.id}`,
        );
      } catch { /* ignore */ }

      return {
        id: observerToken.document.id,
        name: observerToken.document.name,
        img: getTokenImage(observerToken),
        isFoundryHidden,
        isLoot: !!(observerToken.actor?.type === 'loot'),
        currentVisibilityState: allowedVisKeys.includes(currentVisibilityState)
          ? currentVisibilityState
          : 'observed',
        currentCoverState,
        isPC: observerToken.actor?.hasPlayerOwner || observerToken.actor?.type === 'character',
        disposition: disposition,
        dispositionClass:
          disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
        visibilityStates,
        coverStates: Object.entries(COVER_STATES).map(([key, config]) => ({
          value: key,
          label: game.i18n.localize(config.label),
          selected: currentCoverState === key,
          icon: config.icon,
          color: config.color,
          cssClass: config.cssClass,
          bonusAC: config.bonusAC,
          bonusReflex: config.bonusReflex,
          bonusStealth: config.bonusStealth,
          canHide: config.canHide,
        })),
        perceptionDC,
        stealthDC,
        showOutcome,
        outcomeLabel,
        outcomeClass,
        hasAvsOverride,
      };
    });
  }

  const visibilityPrecedence = { observed: 0, concealed: 1, hidden: 2, undetected: 3 };
  const coverPrecedence = { none: 0, lesser: 1, standard: 2, greater: 4 };

  const sortByStatusAndName = (a, b) => {
    if (app.activeTab === 'visibility') {
      const statusA = visibilityPrecedence[a.currentVisibilityState] ?? 999;
      const statusB = visibilityPrecedence[b.currentVisibilityState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    } else {
      const statusA = coverPrecedence[a.currentCoverState] ?? 999;
      const statusB = coverPrecedence[b.currentCoverState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    }
    return a.name.localeCompare(b.name);
  };

  context.pcTargets = allTargets.filter((t) => t.isPC && !t.isLoot).sort(sortByStatusAndName);
  context.npcTargets = allTargets.filter((t) => !t.isPC && !t.isLoot).sort(sortByStatusAndName);
  context.lootTargets =
    app.mode === 'observer' ? allTargets.filter((t) => t.isLoot).sort(sortByStatusAndName) : [];
  context.targets = allTargets;

  // Hidden Walls (Observer Mode): list identifiers of walls marked as hidden with observed/hidden states
  context.wallTargets = [];
  context.includeWalls = false;
  try {
    if (context.isObserverMode && game.settings.get(MODULE_ID, 'hiddenWallsEnabled')) {
      const walls = canvas?.walls?.placeables || [];
      // Respect UI filter: Ignore walls (visibility tab only)
      const ignoreWalls = !!app.ignoreWalls && context.isVisibilityTab === true;
      const hiddenWalls = ignoreWalls
        ? []
        : walls.filter((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
      let autoIndex = 0;
      const wallMap = app.observer?.document?.getFlag?.(MODULE_ID, 'walls') || {};
      context.wallTargets = hiddenWalls.map((w) => {
        const d = w.document;
        const idf = d?.getFlag?.(MODULE_ID, 'wallIdentifier');
        const doorType = Number(d?.door) || 0;
        const fallback = `${game.i18n?.localize?.('PF2E_VISIONER.WALL.VISIBLE_TO_YOU') || isDoor ? 'Hidden Door' : 'Hidden Wall'} ${++autoIndex}`;
        const currentState = wallMap?.[d.id] || 'hidden';
        const states = ['hidden', 'observed'].map((key) => ({
          value: key,
          label: game.i18n.localize(VISIBILITY_STATES[key].label),
          selected: currentState === key,
          icon: VISIBILITY_STATES[key].icon,
          color: VISIBILITY_STATES[key].color,
          cssClass: VISIBILITY_STATES[key].cssClass,
        }));
        const img = getWallImage(doorType);
        // DC: per-wall override else global default
        const overrideDC = Number(d?.getFlag?.(MODULE_ID, 'stealthDC'));
        const defaultWallDC = Number(game.settings.get(MODULE_ID, 'wallStealthDC')) || 15;
        const dc = Number.isFinite(overrideDC) && overrideDC > 0 ? overrideDC : defaultWallDC;
        // Outcome (optional): compare last Perception roll of observer vs dc
        let showOutcome = false;
        let outcomeLabel = '';
        let outcomeClass = '';
        try {
          if (game.settings.get(MODULE_ID, 'integrateRollOutcome')) {
            const lastRoll = getLastRollTotalForActor(app.observer?.actor, 'perception');
            if (typeof lastRoll === 'number') {
              const diff = lastRoll - dc;
              if (diff >= 10) {
                outcomeLabel = 'Critical Success';
                outcomeClass = 'critical-success';
              } else if (diff >= 0) {
                outcomeLabel = 'Success';
                outcomeClass = 'success';
              } else if (diff <= -10) {
                outcomeLabel = 'Critical Failure';
                outcomeClass = 'critical-failure';
              } else {
                outcomeLabel = 'Failure';
                outcomeClass = 'failure';
              }
              showOutcome = true;
            }
          }
        } catch { }
        return {
          id: d.id,
          identifier: idf && String(idf).trim() ? String(idf) : fallback,
          currentVisibilityState: currentState,
          visibilityStates: states,
          doorType,
          img,
          dc,
          showOutcome,
          outcomeLabel,
          outcomeClass,
        };
      });
      context.includeWalls = context.wallTargets.length > 0;
    }
  } catch { }

  context.visibilityStates = Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
    key,
    value: key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    color: config.color,
    cssClass: config.cssClass,
  }));

  context.coverStates = Object.entries(COVER_STATES).map(([key, config]) => ({
    key,
    value: key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    color: config.color,
    cssClass: config.cssClass,
    bonusAC: config.bonusAC,
    bonusReflex: config.bonusReflex,
    bonusStealth: config.bonusStealth,
    canHide: config.canHide,
  }));

  context.hasTargets = allTargets.length > 0;
  context.hasPCs = context.pcTargets.length > 0;
  context.hasNPCs = context.npcTargets.length > 0;
  context.hasLoots = app.mode === 'observer' && context.lootTargets.length > 0;
  context.includeWalls = context.includeWalls || false;
  try {
    context.showOutcomeColumn = game.settings.get(MODULE_ID, 'integrateRollOutcome');
  } catch {
    context.showOutcomeColumn = false;
  }

  const targetedTokens = Array.from(game.user.targets).filter(
    (token) => token.document.id !== app.observer?.document.id,
  );
  context.showingTargetedTokens = targetedTokens.length > 0;
  context.targetedTokensCount = targetedTokens.length;

  return context;
}
