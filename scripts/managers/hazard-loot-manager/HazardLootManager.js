/**
 * Hazard/Loot Manager - scene-level controls for hidden loot and hazards.
 */

import { MODULE_ID } from '../../constants.js';
import { loadDialogCSS, loadSharedUICSS } from '../../css-loader.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../stores/visibility-map.js';

// Archives of Nethys, PF2E GM Core "DCs by Level":
// https://2e.aonprd.com/Rules.aspx?ID=2629
export const LEVEL_BASED_DCS = Object.freeze({
  0: 14,
  1: 15,
  2: 16,
  3: 18,
  4: 19,
  5: 20,
  6: 22,
  7: 23,
  8: 24,
  9: 26,
  10: 27,
  11: 28,
  12: 30,
  13: 31,
  14: 32,
  15: 34,
  16: 35,
  17: 36,
  18: 38,
  19: 39,
  20: 40,
  21: 42,
  22: 44,
  23: 46,
  24: 48,
  25: 50,
});

export const PROFICIENCY_RANKS = Object.freeze([
  { rank: 0, label: 'Untrained', shortLabel: 'U' },
  { rank: 1, label: 'Trained', shortLabel: 'T' },
  { rank: 2, label: 'Expert', shortLabel: 'E' },
  { rank: 3, label: 'Master', shortLabel: 'M' },
  { rank: 4, label: 'Legendary', shortLabel: 'L' },
]);

function actorIsType(actor, type) {
  try {
    return actor?.type === type || actor?.isOfType?.(type);
  } catch {
    return false;
  }
}

function getTokenId(token) {
  return token?.document?.id || token?.id || null;
}

function getTokenName(token) {
  return token?.name || token?.document?.name || token?.actor?.name || getTokenId(token) || '';
}

function getTokenImage(token) {
  return (
    token?.document?.texture?.src ||
    token?.texture?.src ||
    token?.actor?.img ||
    token?.document?.img ||
    (actorIsType(token?.actor, 'hazard') ? 'icons/svg/hazard.svg' : 'icons/svg/chest.svg')
  );
}

function getActorLevel(actor) {
  const candidates = [
    actor?.system?.details?.level?.value,
    actor?.system?.level?.value,
    actor?.system?.level,
    actor?.level,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function getActivePartyLevel() {
  const party = game?.actors?.party;
  if (!actorIsType(party, 'party')) return null;

  const partyLevel = getActorLevel(party);
  if (Number.isFinite(partyLevel) && partyLevel > 0) return partyLevel;

  const memberLevels = (Array.isArray(party?.members) ? party.members : [])
    .filter((member) => actorIsType(member, 'character'))
    .map((member) => getActorLevel(member))
    .filter((level) => Number.isFinite(level));

  if (!memberLevels.length) return null;
  return Math.max(0, Math.round(memberLevels.reduce((sum, level) => sum + level, 0) / memberLevels.length));
}

function getHazardStealthDC(actor) {
  const dc = Number(actor?.system?.attributes?.stealth?.dc);
  return Number.isFinite(dc) && dc > 0 ? dc : '';
}

function getPlaceableTokens(tokens = canvas?.tokens?.placeables || []) {
  return Array.isArray(tokens) ? tokens : [];
}

export function getLevelBasedDC(level) {
  const numeric = Math.round(Number(level));
  const clamped = Math.max(0, Math.min(25, Number.isFinite(numeric) ? numeric : 1));
  return LEVEL_BASED_DCS[clamped] ?? LEVEL_BASED_DCS[1];
}

export function getPlayerCharacterTokens(tokens = getPlaceableTokens()) {
  return getPlaceableTokens(tokens).filter(
    (token) =>
      !!getTokenId(token) &&
      actorIsType(token?.actor, 'character'),
  );
}

export function getHazardLootTokens(tokens = getPlaceableTokens()) {
  return getPlaceableTokens(tokens).filter((token) => {
    const actor = token?.actor;
    return !!getTokenId(token) && (actorIsType(actor, 'loot') || actorIsType(actor, 'hazard'));
  });
}

export function getPartyLevel(tokens = getPlaceableTokens()) {
  const activePartyLevel = getActivePartyLevel();
  if (Number.isFinite(activePartyLevel)) return activePartyLevel;

  const levels = getPlayerCharacterTokens(tokens)
    .map((token) => getActorLevel(token.actor))
    .filter((level) => Number.isFinite(level));

  if (!levels.length) return 1;
  return Math.max(0, Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length));
}

function getVisibilityForAllPlayers(target, observers) {
  if (!observers.length) return 'observed';
  const states = observers.map((observer) => getVisibilityBetween(observer, target));
  if (states.every((state) => state === 'hidden')) return 'hidden';
  if (states.every((state) => state === 'observed')) return 'observed';
  return 'mixed';
}

function getMinPerceptionRank(token) {
  const rank = Number(token?.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
  return Number.isFinite(rank) ? Math.max(0, Math.min(4, Math.round(rank))) : 0;
}

function getRankLabel(rank) {
  return PROFICIENCY_RANKS.find((entry) => entry.rank === rank)?.label || 'Untrained';
}

export function getHazardLootManagerRows({
  tokens = getPlaceableTokens(),
  observers = getPlayerCharacterTokens(tokens),
} = {}) {
  const partyLevel = getPartyLevel(tokens);
  const partyDC = getLevelBasedDC(partyLevel);

  return getHazardLootTokens(tokens).map((token) => {
    const type = actorIsType(token.actor, 'hazard') ? 'hazard' : 'loot';
    const lootStealthDC = Number(token?.document?.getFlag?.(MODULE_ID, 'stealthDC'));
    const actorLevel = getActorLevel(token.actor);
    const minPerceptionRank = getMinPerceptionRank(token);
    return {
      id: getTokenId(token),
      name: getTokenName(token),
      type,
      typeLabel: type === 'hazard' ? 'Hazard' : 'Loot',
      img: getTokenImage(token),
      actorLevel: Number.isFinite(actorLevel) ? actorLevel : '',
      visibility: getVisibilityForAllPlayers(token, observers),
      stealthDC:
        type === 'hazard'
          ? getHazardStealthDC(token.actor)
          : Number.isFinite(lootStealthDC) && lootStealthDC > 0
            ? lootStealthDC
            : '',
      minPerceptionRank,
      minPerceptionLabel: getRankLabel(minPerceptionRank),
      proficiencyRanks: PROFICIENCY_RANKS,
      partyLevel,
      partyDC,
    };
  });
}

function resolveToken(tokenId, tokens = getPlaceableTokens()) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    getPlaceableTokens(tokens).find((token) => getTokenId(token) === tokenId) ||
    null
  );
}

async function setStealthDC(token, stealthDC) {
  const doc = token?.document;
  if (!doc) return false;

  const numeric = Number(stealthDC);
  if (Number.isFinite(numeric) && numeric > 0) {
    await doc.setFlag?.(MODULE_ID, 'stealthDC', Math.round(numeric));
    return true;
  }

  if (stealthDC === null || stealthDC === '') {
    await doc.unsetFlag?.(MODULE_ID, 'stealthDC');
    return true;
  }

  return false;
}

async function setMinPerceptionRank(token, minPerceptionRank) {
  const doc = token?.document;
  if (!doc) return false;

  const numeric = Number(minPerceptionRank);
  if (Number.isFinite(numeric) && numeric > 0) {
    await doc.setFlag?.(MODULE_ID, 'minPerceptionRank', Math.max(1, Math.min(4, Math.round(numeric))));
    return true;
  }

  await doc.unsetFlag?.(MODULE_ID, 'minPerceptionRank');
  return true;
}

export async function applyHazardLootManagerUpdates(
  updates,
  { tokens = getPlaceableTokens(), observers = getPlayerCharacterTokens(tokens) } = {},
) {
  if (!game?.user?.isGM || !Array.isArray(updates)) {
    return { targets: 0, visibilityPairs: 0, dcUpdates: 0, rankUpdates: 0 };
  }

  let targets = 0;
  let visibilityPairs = 0;
  let dcUpdates = 0;
  let rankUpdates = 0;

  for (const update of updates) {
    const target = resolveToken(update?.tokenId, tokens);
    if (!target || !getHazardLootTokens([target]).length) continue;

    targets += 1;

    if (update.visibility === 'hidden' || update.visibility === 'observed') {
      for (const observer of observers) {
        if (!getTokenId(observer) || getTokenId(observer) === getTokenId(target)) continue;
        await setVisibilityBetween(observer, target, update.visibility, {
          direction: 'observer_to_target',
          skipEphemeralUpdate: true,
        });
        visibilityPairs += 1;
      }
    }

    if (actorIsType(target.actor, 'loot') && 'stealthDC' in update) {
      const changed = await setStealthDC(target, update.stealthDC);
      if (changed) dcUpdates += 1;
    }

    if (actorIsType(target.actor, 'hazard') && 'minPerceptionRank' in update) {
      const changed = await setMinPerceptionRank(target, update.minPerceptionRank);
      if (changed) rankUpdates += 1;
    }
  }

  try {
    const { updateTokenVisuals } = await import('../../services/visual-effects.js');
    await updateTokenVisuals();
  } catch {
    /* visual refresh is best effort */
  }

  return { targets, visibilityPairs, dcUpdates, rankUpdates };
}

function parseManagerForm(form) {
  const visibleRows = Array.from(form.querySelectorAll('tbody tr[data-token-id]')).filter(
    (row) => row.style.display !== 'none',
  );
  const updates = [];

  for (const row of visibleRows) {
    const tokenId = row.getAttribute('data-token-id');
    const visibility = row.querySelector(
      `input[name="token.${tokenId}.visibility"], select[name="token.${tokenId}.visibility"]`,
    )?.value;
    const update = { tokenId, visibility };

    const dcInput = row.querySelector(`input[name="token.${tokenId}.dc"]`);
    if (dcInput) {
      const dcValue = dcInput.value ?? '';
      const numericDC = Number(dcValue);
      update.stealthDC = dcValue === '' ? null : Number.isFinite(numericDC) ? numericDC : undefined;
    }

    const rankInput = row.querySelector(
      `input[name="token.${tokenId}.minPerceptionRank"], select[name="token.${tokenId}.minPerceptionRank"]`,
    );
    if (rankInput) {
      const numericRank = Number(rankInput.value);
      update.minPerceptionRank = Number.isFinite(numericRank) ? numericRank : 0;
    }

    updates.push(update);
  }

  return updates;
}

export class VisionerHazardLootManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-hazard-loot-manager',
    tag: 'div',
    classes: ['pf2e-visioner'],
    window: {
      title: 'Hazard/Loot Manager',
      icon: 'fas fa-box-open',
      resizable: true,
    },
    position: { width: 760, height: 600 },
    actions: {
      apply: VisionerHazardLootManager._onApply,
      close: VisionerHazardLootManager._onClose,
      bulkHidden: VisionerHazardLootManager._onBulkHidden,
      bulkObserved: VisionerHazardLootManager._onBulkObserved,
      setPartyDC: VisionerHazardLootManager._onSetPartyDC,
      openSheet: VisionerHazardLootManager._onOpenSheet,
      selectToken: VisionerHazardLootManager._onSelectToken,
    },
  };

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/hazard-loot-manager.hbs' },
  };

  constructor(options = {}) {
    loadDialogCSS();
    loadSharedUICSS();
    super(options);
  }

  async _prepareContext() {
    const tokens = getPlaceableTokens();
    const partyLevel = getPartyLevel(tokens);
    const rows = getHazardLootManagerRows({ tokens });
    return {
      rows,
      lootRows: rows.filter((row) => row.type === 'loot'),
      hazardRows: rows.filter((row) => row.type === 'hazard'),
      proficiencyRanks: PROFICIENCY_RANKS,
      partyLevel,
      partyDC: getLevelBasedDC(partyLevel),
    };
  }

  async _renderHTML(context, _options) {
    return foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    this._bindSearchAndFilter(content);
    return content;
  }

  static async _onApply(_event, _button) {
    const app = this;
    const form = app.element?.querySelector?.('form.pf2e-visioner-hazard-loot-manager');
    if (!form) return app.close();

    try {
      const updates = parseManagerForm(form);
      await app.close();
      const result = await applyHazardLootManagerUpdates(updates);
      if (result.targets > 0) {
        ui.notifications?.info?.(
          `PF2E Visioner: Updated ${result.targets} hazard/loot token(s).`,
        );
      } else {
        ui.notifications?.info?.('PF2E Visioner: No hazard/loot changes to apply.');
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Hazard/Loot Manager apply failed`, error);
      ui.notifications?.error?.('PF2E Visioner: Failed to apply hazard/loot changes.');
    }
  }

  static async _onClose(_event, _button) {
    await this.close();
  }

  static _getRowsForAction(form, button = null) {
    const row = button?.closest?.('tr[data-token-id]');
    if (row) return row.style.display !== 'none' ? [row] : [];

    const scope = button?.closest?.('.hazard-loot-section') || form;
    return Array.from(scope?.querySelectorAll?.('tbody tr[data-token-id]') || []).filter(
      (row) => row.style.display !== 'none',
    );
  }

  static _setVisibleRows(form, callback, button = null) {
    const rows = this._getRowsForAction(form, button);
    rows.forEach(callback);
  }

  static _setRowVisibility(row, state) {
    if (!row || !['observed', 'hidden'].includes(state)) return;

    const input = row.querySelector('input[name$=".visibility"], select[name$=".visibility"]');
    if (input) input.value = state;
    row.dataset.visibility = state;

    row.querySelectorAll('.hazard-loot-state-btn[data-state]').forEach((button) => {
      button.classList.toggle('active', button.dataset.state === state);
    });
    row.querySelectorAll('.hazard-loot-mixed-indicator').forEach((indicator) => {
      indicator.classList.add('is-hidden');
    });
  }

  static _setRowMinPerceptionRank(row, rank) {
    const numericRank = Number(rank);
    if (!row || !Number.isFinite(numericRank)) return;

    const clamped = Math.max(0, Math.min(4, Math.round(numericRank)));
    const input = row.querySelector(
      'input[name$=".minPerceptionRank"], select[name$=".minPerceptionRank"]',
    );
    if (input) input.value = String(clamped);

    row.querySelectorAll('.hazard-loot-rank-btn[data-rank]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.rank) === clamped);
    });
  }

  static async _onBulkHidden(_event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-hazard-loot-manager');
    this.constructor._setVisibleRows(form, (row) => {
      this.constructor._setRowVisibility(row, 'hidden');
    }, _button);
  }

  static async _onBulkObserved(_event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-hazard-loot-manager');
    this.constructor._setVisibleRows(form, (row) => {
      this.constructor._setRowVisibility(row, 'observed');
    }, _button);
  }

  static async _onSetPartyDC(_event, button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-hazard-loot-manager');
    const partyDC = Number(button?.dataset?.partyDc);
    if (!form || !Number.isFinite(partyDC)) return;

    this.constructor._setVisibleRows(form, (row) => {
      const input = row.querySelector('input[name$=".dc"]');
      if (input) input.value = String(partyDC);
    }, button);
  }

  static async _onOpenSheet(_event, button) {
    const token = resolveToken(button?.dataset?.tokenId);
    const sheet = token?.actor?.sheet || token?.document?.sheet;
    if (sheet?.render) sheet.render(true);
  }

  static async _onSelectToken(_event, button) {
    const token = resolveToken(button?.dataset?.tokenId);
    if (!token) return;
    try {
      token.control?.({ releaseOthers: true });
    } catch {
      token.control?.();
    }
    const center = token.center || token.getCenterPoint?.();
    if (center) canvas?.animatePan?.({ x: center.x, y: center.y, duration: 350 });
  }

  _bindSearchAndFilter(root) {
    const searchInput = root?.querySelector?.('#hazard-loot-search');
    const typeFilter = root?.querySelector?.('#hazard-loot-type-filter');
    const visibilityFilter = root?.querySelector?.('#hazard-loot-visibility-filter');
    const clearButton = root?.querySelector?.('#hazard-loot-clear-filters');
    const rows = Array.from(root?.querySelectorAll?.('tbody tr[data-token-id]') || []);
    const visibleCount = root?.querySelector?.('#hazard-loot-count-visible');

    const applyFilters = () => {
      const search = String(searchInput?.value || '').trim().toLowerCase();
      const type = typeFilter?.value || '';
      const visibility = visibilityFilter?.value || '';
      let count = 0;

      for (const row of rows) {
        const name = row.getAttribute('data-token-name') || '';
        const id = row.getAttribute('data-token-id') || '';
        const rowType = row.getAttribute('data-token-type') || '';
        const visibilityInput = row.querySelector(
          'input[name$=".visibility"], select[name$=".visibility"]',
        );
        const rowVisibility = visibilityInput?.value || row.getAttribute('data-visibility') || '';
        const matchesSearch = !search || name.includes(search) || id.toLowerCase().includes(search);
        const matchesType = !type || rowType === type;
        const matchesVisibility = !visibility || rowVisibility === visibility;
        const show = matchesSearch && matchesType && matchesVisibility;
        row.style.display = show ? '' : 'none';
        if (show) count += 1;
      }

      if (visibleCount) visibleCount.textContent = String(count);
    };

    searchInput?.addEventListener?.('input', applyFilters);
    typeFilter?.addEventListener?.('change', applyFilters);
    visibilityFilter?.addEventListener?.('change', applyFilters);
    clearButton?.addEventListener?.('click', () => {
      if (searchInput) searchInput.value = '';
      if (typeFilter) typeFilter.value = '';
      if (visibilityFilter) visibilityFilter.value = '';
      applyFilters();
    });

    root?.querySelectorAll?.('.hazard-loot-state-btn[data-state]')?.forEach?.((button) => {
      button.addEventListener?.('click', (event) => {
        event.preventDefault();
        const row = button.closest?.('tr[data-token-id]');
        this.constructor._setRowVisibility(row, button.dataset.state);
        applyFilters();
      });
    });

    root?.querySelectorAll?.('.hazard-loot-rank-btn[data-rank]')?.forEach?.((button) => {
      button.addEventListener?.('click', (event) => {
        event.preventDefault();
        const row = button.closest?.('tr[data-token-id]');
        this.constructor._setRowMinPerceptionRank(row, button.dataset.rank);
      });
    });

    applyFilters();
  }
}
