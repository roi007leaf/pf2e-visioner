import '../../../setup.js';
import coverDetector from '../../../../scripts/cover/auto-cover/CoverDetector.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

const defender = { document: { id: 'peeker' } };
const defenderTakingCover = {
  document: { id: 'peeker' },
  actor: { itemTypes: { effect: [{ flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } } }] } },
};

function setCornerPeek() {
  peekRegistry.set('peeker', { origin: { x: 0, y: 0 }, direction: 0, fov: null, range: 0, ignoredWallIds: [] }, 1000);
}

function setDoorPeek() {
  peekRegistry.set('peeker', { origin: { x: 0, y: 0 }, direction: 0, fov: 10, range: 0, ignoredWallIds: ['d'] }, 1000);
}

describe('peek cover cap (corner-peeking defender capped at lesser)', () => {
  afterEach(() => peekRegistry.clearAll());

  test('corner-peeking defender: standard downgrades to lesser', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(defender, 'standard')).toBe('lesser');
  });

  test('corner-peeking defender: greater downgrades to lesser', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(defender, 'greater')).toBe('lesser');
  });

  test('corner-peeking defender: lesser and none unchanged', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(defender, 'lesser')).toBe('lesser');
    expect(coverDetector._applyPeekCoverCap(defender, 'none')).toBe('none');
  });

  test('corner-peeking defender who has Taken Cover keeps full cover', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(defenderTakingCover, 'standard')).toBe('standard');
    expect(coverDetector._applyPeekCoverCap(defenderTakingCover, 'greater')).toBe('greater');
  });

  test('door peek (numeric fov) does NOT cap cover', () => {
    setDoorPeek();
    expect(coverDetector._applyPeekCoverCap(defender, 'standard')).toBe('standard');
  });

  test('no peek leaves cover unchanged', () => {
    expect(coverDetector._applyPeekCoverCap(defender, 'greater')).toBe('greater');
  });
});
