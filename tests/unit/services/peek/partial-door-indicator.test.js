import '../../../setup.js';
import { refreshPartialDoorIndicator } from '../../../../scripts/services/Peek/partial-door-indicator.js';

describe('partial door control indication', () => {
  let previousPixi, previousUser;
  class Container {
    constructor() { this.children = []; }
    addChild(child) { this.children.push(child); return child; }
    destroy() { this.destroyed = true; }
  }
  class Graphics extends Container {
    clear() { return this; }
    lineStyle() { return this; }
    drawRoundedRect() { return this; }
    beginFill() { return this; }
    endFill() { return this; }
  }
  class Text extends Container {
    constructor() { super(); this.anchor = this.scale = this.position = { set: jest.fn() }; }
  }
  beforeEach(() => {
    previousPixi = global.PIXI;
    previousUser = game.user;
    global.PIXI = { Container, Graphics, Text };
  });
  afterEach(() => { global.PIXI = previousPixi; game.user = previousUser; });
  function control(angle = 35) {
    const result = new Container();
    result.wall = { document: { door: 1, ds: 0, getFlag: () => ({ angle }) } };
    return result;
  }
  test('adds and updates badge without duplicating or changing visibility', () => {
    const door = control();
    door.visible = false;
    refreshPartialDoorIndicator(door);
    const badge = door._visionerPartialDoor;
    expect(badge.label.text).toBe('35°');
    expect(badge.eventMode).toBe('none');
    expect(door.visible).toBe(false);
    door.wall.document.getFlag = () => ({ angle: 60 });
    refreshPartialDoorIndicator(door);
    expect(door._visionerPartialDoor).toBe(badge);
    expect(badge.label.text).toBe('60°');
    expect(door.children).toHaveLength(1);
  });
  test.each([0, 90, NaN, '35', undefined])('clears badge at endpoint or invalid angle %s', (angle) => {
    const door = control();
    refreshPartialDoorIndicator(door);
    const badge = door._visionerPartialDoor;
    door.wall.document.getFlag = () => ({ angle });
    refreshPartialDoorIndicator(door);
    expect(badge.destroyed).toBe(true);
    expect(door._visionerPartialDoor).toBeUndefined();
  });
  test('secret door badge is GM-only; locked/open/non-door states clear it', () => {
    const door = control();
    door.wall.document.door = 2;
    game.user = { isGM: false };
    refreshPartialDoorIndicator(door);
    expect(door._visionerPartialDoor).toBeUndefined();
    game.user = { isGM: true };
    refreshPartialDoorIndicator(door);
    expect(door._visionerPartialDoor).toBeDefined();
    game.user = { isGM: false };
    refreshPartialDoorIndicator(door);
    expect(door._visionerPartialDoor).toBeUndefined();
    for (const props of [{ door: 1, ds: 2 }, { door: 1, ds: 1 }, { door: 0, ds: 0 }]) {
      Object.assign(door.wall.document, props);
      refreshPartialDoorIndicator(door);
      expect(door._visionerPartialDoor).toBeUndefined();
    }
  });
});
