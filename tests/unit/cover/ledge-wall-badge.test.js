import '../../setup.js';
import {
  ledgeBadgeText,
  refreshLedgeWallOnFlagChange,
  syncLedgeWallBadge,
} from '../../../scripts/cover/ledge/ledge-wall-badge.js';

function ledgeDoc(flags, c = [0, 0, 100, 200]) {
  return { c, flags: { 'pf2e-visioner': flags } };
}

function fakeBadge() {
  return {
    text: '',
    position: { set: jest.fn() },
    destroy: jest.fn(),
    setText(value) {
      this.text = value;
    },
  };
}

describe('ledge wall badge', () => {
  beforeEach(() => {
    game.i18n.format = jest.fn((key, data) => `${key}|${JSON.stringify(data ?? {})}`);
    game.i18n.localize = jest.fn((key) => key);
  });

  test('badge text shows the ledge elevation', () => {
    expect(ledgeBadgeText(ledgeDoc({ ledge: true, ledgeElevation: 10 }))).toBe(
      'PF2E_VISIONER.UI.WALL_LEDGE_BADGE|{"elevation":10}',
    );
  });

  test('badge text falls back to automatic elevation', () => {
    expect(ledgeBadgeText(ledgeDoc({ ledge: true }))).toBe('PF2E_VISIONER.UI.WALL_LEDGE_BADGE_AUTO');
  });

  test('non-ledge walls have no badge text', () => {
    expect(ledgeBadgeText(ledgeDoc({}))).toBeNull();
  });

  test('sync creates a badge at the wall midpoint for ledge walls', () => {
    const badge = fakeBadge();
    const wall = { document: ledgeDoc({ ledge: true, ledgeElevation: 10 }), addChild: jest.fn() };
    syncLedgeWallBadge(wall, { createBadge: () => badge });
    expect(wall.addChild).toHaveBeenCalledWith(badge);
    expect(badge.text).toContain('WALL_LEDGE_BADGE');
    expect(badge.position.set).toHaveBeenCalledWith(50, 100);
  });

  test('sync removes the badge when the wall stops being a ledge', () => {
    const badge = fakeBadge();
    const wall = { document: ledgeDoc({ ledge: false }), _pvLedgeBadge: badge, removeChild: jest.fn() };
    syncLedgeWallBadge(wall, { createBadge: () => fakeBadge() });
    expect(wall.removeChild).toHaveBeenCalledWith(badge);
    expect(badge.destroy).toHaveBeenCalled();
    expect(wall._pvLedgeBadge).toBeUndefined();
  });

  test('ledge flag changes redraw the wall line', () => {
    const set = jest.fn();
    const doc = { object: { renderFlags: { set } } };
    refreshLedgeWallOnFlagChange(doc, { flags: { 'pf2e-visioner': { ledgeElevation: 5 } } });
    expect(set).toHaveBeenCalledWith({ refreshLine: true });
  });

  test('unrelated changes do not redraw the wall line', () => {
    const set = jest.fn();
    const doc = { object: { renderFlags: { set } } };
    refreshLedgeWallOnFlagChange(doc, { flags: { 'pf2e-visioner': { blocksScent: true } } });
    refreshLedgeWallOnFlagChange(doc, { ds: 1 });
    expect(set).not.toHaveBeenCalled();
  });
});
