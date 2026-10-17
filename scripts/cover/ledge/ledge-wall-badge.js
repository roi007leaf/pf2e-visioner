import { MODULE_ID } from '../../constants.js';
import { LEDGE_WALL_COLOR } from './ledge-wall-color.js';
import { getLedgeElevation, isLedgeWall, LEDGE_ELEVATION_FLAG, LEDGE_FLAG } from './ledge-walls.js';

export function ledgeBadgeText(wallDoc) {
  if (!isLedgeWall(wallDoc)) return null;
  const elevation = getLedgeElevation(wallDoc);
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

export function syncLedgeWallBadge(wall, { createBadge = createLedgeBadge } = {}) {
  const doc = wall?.document;
  const text = ledgeBadgeText(doc);
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

export function registerLedgeWallBadgeHooks() {
  Hooks.on('refreshWall', (wall) => {
    try {
      syncLedgeWallBadge(wall);
    } catch (error) {
      console.warn('[PF2E-Visioner] Failed to sync ledge wall badge:', error);
    }
  });
  Hooks.on('updateWall', refreshLedgeWallOnFlagChange);
}
