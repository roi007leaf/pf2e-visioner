import { MODULE_ID } from '../../constants.js';

export function refreshPartialDoorIndicator(control) {
  if (!control || control.destroyed) return;
  const doc = control.wall?.document;
  const angle = doc?.getFlag?.(MODULE_ID, 'slowDoor')?.angle;
  const secret = doc?.door === (globalThis.CONST?.WALL_DOOR_TYPES?.SECRET ?? 2);
  const partial = doc?.door && doc.ds === (globalThis.CONST?.WALL_DOOR_STATES?.CLOSED ?? 0) &&
    typeof angle === 'number' && Number.isFinite(angle) && angle > 0 && angle < 90 &&
    (!secret || globalThis.game?.user?.isGM);
  if (!partial) {
    control._visionerPartialDoor?.destroy({ children: true });
    delete control._visionerPartialDoor;
    return;
  }
  const pixi = globalThis.PIXI;
  if (!pixi?.Container || !pixi.Graphics || !pixi.Text || typeof control.addChild !== 'function') return;
  let badge = control._visionerPartialDoor;
  if (!badge || badge.destroyed) {
    badge = new pixi.Container();
    badge.eventMode = 'none';
    badge.interactiveChildren = false;
    badge.outline = badge.addChild(new pixi.Graphics());
    badge.label = badge.addChild(new pixi.Text('', {
      fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: 'bold', fill: 0xffcc80,
      align: 'center', stroke: 0x151018, strokeThickness: 2,
    }));
    badge.label.anchor.set(0.5);
    control.addChild(badge);
    control._visionerPartialDoor = badge;
  }
  const scale = globalThis.canvas?.dimensions?.uiScale ?? 1;
  badge.label.text = `${Math.round(angle)}°`;
  badge.label.scale.set(scale);
  badge.label.position.set(20 * scale, 48 * scale);
  badge.outline.clear().lineStyle(1.5 * scale, 0xffb74d, 0.95)
    .drawRoundedRect(-2 * scale, -2 * scale, 44 * scale, 44 * scale, 5 * scale)
    .beginFill(0x19131d, 0.95).drawRoundedRect(2 * scale, 40 * scale, 36 * scale, 17 * scale, 4 * scale).endFill();
  // Added to the native control, so Foundry's visibility and zoom rules apply.
}

export function registerPartialDoorIndicator(adapter) {
  const target = globalThis.foundry?.canvas?.containers?.DoorControl?.prototype
    ? 'foundry.canvas.containers.DoorControl.prototype.draw'
    : typeof globalThis.DoorControl === 'function' ? 'DoorControl.prototype.draw' : null;
  if (target && adapter?.register) {
    adapter.register(MODULE_ID, target, async function (wrapped, ...args) {
      const result = await wrapped(...args);
      refreshPartialDoorIndicator(this);
      return result;
    }, 'WRAPPER');
  }
  const refresh = () => {
    for (const control of globalThis.canvas?.controls?.doors?.children ?? []) refreshPartialDoorIndicator(control);
  };
  globalThis.Hooks?.on?.('canvasReady', refresh);
  refresh();
}
