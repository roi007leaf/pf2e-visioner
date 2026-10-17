import { MODULE_ID } from '../../constants.js';
import { LEDGE_WALL_COLOR } from './ledge-wall-color.js';
import { resolveLedgeElevation, isLedgeWall, LEDGE_ELEVATION_FLAG, LEDGE_FLAG } from './ledge-walls.js';

export function ledgeBadgeText(wallDoc) {
  if (!isLedgeWall(wallDoc)) return null;
  const elevation = resolveLedgeElevation(wallDoc);
  if (elevation === null) return game.i18n.localize('PF2E_VISIONER.UI.WALL_LEDGE_BADGE_AUTO');
  return game.i18n.format('PF2E_VISIONER.UI.WALL_LEDGE_BADGE', { elevation });
}

function drawBadgeBackground(background, text, scale) {
  const padX = 6 * scale;
  const padY = 3 * scale;
  background.clear();
  background.beginFill(0x000000, 0.8);
  background.lineStyle(2 * scale, LEDGE_WALL_COLOR, 1);
  background.drawRoundedRect(
    -text.width / 2 - padX,
    -text.height / 2 - padY,
    text.width + padX * 2,
    text.height + padY * 2,
    4 * scale,
  );
  background.endFill();
}

export function createLedgeBadge() {
  const scale = canvas?.dimensions?.uiScale ?? 1;
  const container = new PIXI.Container();
  container.eventMode = 'none';
  const background = new PIXI.Graphics();
  const text = new PIXI.Text('', {
    fontFamily: 'Arial, sans-serif',
    fontSize: Math.round(24 * scale),
    fontWeight: 'bold',
    fill: LEDGE_WALL_COLOR,
  });
  text.anchor.set(0.5, 0.5);
  container.addChild(background, text);
  container.setText = (value) => {
    if (text.text === value) return;
    text.text = value;
    drawBadgeBackground(background, text, scale);
  };
  return container;
}

function removeBadge(wall) {
  const badge = wall._pvLedgeBadge;
  if (!badge) return;
  wall.removeChild?.(badge);
  badge.destroy?.({ children: true });
  delete wall._pvLedgeBadge;
}

function pointKey(x, y) {
  return `${Math.round(x)},${Math.round(y)}`;
}

function wallLength(c) {
  return Math.hypot(c[2] - c[0], c[3] - c[1]);
}

function ledgeChainKey(doc, c, endpoint) {
  const point = endpoint === 0 ? pointKey(c[0], c[1]) : pointKey(c[2], c[3]);
  return `${resolveLedgeElevation(doc) ?? 'auto'}|${point}`;
}

function createUnionFind() {
  const parent = new Map();
  const find = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(key, root);
    return root;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  return { find, union };
}

export function selectBadgeWallIds(walls) {
  const sets = createUnionFind();
  const ledges = [];
  for (const wall of walls ?? []) {
    const doc = wall?.document;
    const c = doc?.c;
    if (!isLedgeWall(doc) || !Array.isArray(c) || c.length < 4) continue;
    const start = ledgeChainKey(doc, c, 0);
    sets.union(start, ledgeChainKey(doc, c, 1));
    ledges.push({ id: wall.id ?? doc.id, start, length: wallLength(c) });
  }
  const longestByChain = new Map();
  for (const ledge of ledges) {
    const chain = sets.find(ledge.start);
    const current = longestByChain.get(chain);
    if (!current || ledge.length > current.length) longestByChain.set(chain, ledge);
  }
  return new Set([...longestByChain.values()].map((ledge) => ledge.id));
}

let badgeWallIds = null;

function currentBadgeWallIds() {
  if (!badgeWallIds) badgeWallIds = selectBadgeWallIds(canvas?.walls?.placeables ?? []);
  return badgeWallIds;
}

export function refreshAllLedgeBadges() {
  badgeWallIds = null;
  const ids = currentBadgeWallIds();
  for (const wall of canvas?.walls?.placeables ?? []) {
    syncLedgeWallBadge(wall, { show: ids.has(wall.id) });
  }
}

export function syncLedgeWallBadge(wall, { show = true, createBadge = createLedgeBadge } = {}) {
  const doc = wall?.document;
  const text = show ? ledgeBadgeText(doc) : null;
  if (!text) return removeBadge(wall);
  const c = doc?.c;
  if (!Array.isArray(c) || c.length < 4) return removeBadge(wall);
  if (!wall._pvLedgeBadge) {
    wall._pvLedgeBadge = createBadge();
    wall.addChild?.(wall._pvLedgeBadge);
  }
  wall._pvLedgeBadge.setText(text);
  wall._pvLedgeBadge.position.set((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
}

export function refreshLedgeWallOnFlagChange(wallDoc, changes) {
  const flagChanges = changes?.flags?.[MODULE_ID];
  if (!flagChanges) return;
  if (!(LEDGE_FLAG in flagChanges) && !(LEDGE_ELEVATION_FLAG in flagChanges)) return;
  wallDoc?.object?.renderFlags?.set?.({ refreshLine: true });
}

function safeRefreshAllLedgeBadges() {
  try {
    refreshAllLedgeBadges();
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to refresh ledge wall badges:', error);
  }
}

export function registerLedgeWallBadgeHooks() {
  Hooks.on('refreshWall', (wall) => {
    try {
      syncLedgeWallBadge(wall, { show: currentBadgeWallIds().has(wall.id) });
    } catch (error) {
      console.warn('[PF2E-Visioner] Failed to sync ledge wall badge:', error);
    }
  });
  Hooks.on('updateWall', (wallDoc, changes) => {
    refreshLedgeWallOnFlagChange(wallDoc, changes);
    if (changes?.c || changes?.levels || changes?.flags?.[MODULE_ID] || changes?.flags?.['wall-height']) {
      safeRefreshAllLedgeBadges();
    }
  });
  Hooks.on('canvasReady', safeRefreshAllLedgeBadges);
  Hooks.on('createWall', safeRefreshAllLedgeBadges);
  Hooks.on('deleteWall', safeRefreshAllLedgeBadges);
}
