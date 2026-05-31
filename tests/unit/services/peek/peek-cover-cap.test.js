import '../../../setup.js';
import coverDetector from '../../../../scripts/cover/auto-cover/CoverDetector.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

const attacker = { document: { id: 'peeker' } };

function setCornerPeek() {
  peekRegistry.set('peeker', { origin: { x: 0, y: 0 }, direction: 0, fov: null, range: 0, ignoredWallIds: [] }, 1000);
}

function setDoorPeek() {
  peekRegistry.set('peeker', { origin: { x: 0, y: 0 }, direction: 0, fov: 10, range: 0, ignoredWallIds: ['d'] }, 1000);
}

describe('peek cover cap (corner peek -> attacker cover capped at lesser)', () => {
  afterEach(() => peekRegistry.clearAll());

  test('corner peek downgrades standard to lesser', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(attacker, 'standard')).toBe('lesser');
  });

  test('corner peek downgrades greater to lesser', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(attacker, 'greater')).toBe('lesser');
  });

  test('corner peek leaves lesser and none unchanged', () => {
    setCornerPeek();
    expect(coverDetector._applyPeekCoverCap(attacker, 'lesser')).toBe('lesser');
    expect(coverDetector._applyPeekCoverCap(attacker, 'none')).toBe('none');
  });

  test('door peek (numeric fov) does NOT cap cover', () => {
    setDoorPeek();
    expect(coverDetector._applyPeekCoverCap(attacker, 'standard')).toBe('standard');
  });

  test('no peek leaves cover unchanged', () => {
    expect(coverDetector._applyPeekCoverCap(attacker, 'greater')).toBe('greater');
  });
});
