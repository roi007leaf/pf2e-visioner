/**
 * Tests for 3D Sampling cover mode integration via detectCoverStateForAttack()
 */

import '../../setup.js';

// Import the function under test
import autoCoverSystem from '../../../scripts/cover/auto-cover/AutoCoverSystem.js';
/**
 * Helpers to set a module setting in the mocked test environment.
 */
function setSetting(setting, value) {
  game.settings.set('pf2e-visioner', setting, value);
}

/**
 * Create a 1x1 token at grid coordinates (gx, gy) with optional elevation and heightFt flag.
 * Grid size is 50px in test setup; token 1 square = 50x50 px.
 */
function makeToken({ id, gx, gy, elevationFt = 0, heightFt = null, sizeSquares = 1 } = {}) {
  const x = gx * canvas.grid.size;
  const y = gy * canvas.grid.size;
  const width = sizeSquares; // in grid squares
  const height = sizeSquares; // in grid squares

  const flags = {};
  if (heightFt != null) {
    flags['pf2e-visioner'] = { heightFt };
  }

  return createMockToken({
    id,
    x,
    y,
    width,
    height,
    elevation: elevationFt,
    flags,
    // Useful size info for tactical corners
    actor: {
      type: 'character',
      system: { traits: { size: { value: sizeSquares >= 2 ? 'lg' : 'med' } } },
    },
    getCenterPoint: jest.fn(() => ({
      x: x + (width * canvas.grid.size) / 2,
      y: y + (height * canvas.grid.size) / 2,
    })),
    center: { x: x + (width * canvas.grid.size) / 2, y: y + (height * canvas.grid.size) / 2 },
  });
}

/**
 * Places attacker at (0,0), target at (4,0) squares. Returns {attacker, target}.
 */
function placeAttackerAndTarget() {
  const attacker = makeToken({
    id: 'attacker',
    gx: 0,
    gy: 0,
    elevationFt: 0,
    heightFt: 5,
    sizeSquares: 1,
  });
  const target = makeToken({
    id: 'target',
    gx: 4,
    gy: 0,
    elevationFt: 0,
    heightFt: 5,
    sizeSquares: 1,
  });
  canvas.tokens.placeables.push(attacker, target);
  canvas.tokens.get.mockImplementation((id) => ({ attacker, target })[id]);
  return { attacker, target };
}

describe('3D Sampling Mode - Integration', () => {
  beforeEach(() => {
    // Ensure intersection mode is 3D sampling
    setSetting('autoCoverTokenIntersectionMode', 'sampling3d');

    // Default filters
    setSetting('autoCoverIgnoreUndetected', false);
    setSetting('autoCoverIgnoreDead', false);
    setSetting('autoCoverIgnoreAllies', false);
    setSetting('autoCoverRespectIgnoreFlag', false);
    setSetting('autoCoverAllowProneBlockers', true);

    // Enable elevation filter globally to verify 3D path disables it internally
    setSetting('autoCoverUseElevationFilter', true);
  });

  test('includes blockers that overlap the vertical band (yields some cover)', () => {
    const { attacker, target } = placeAttackerAndTarget();

    // Blocker between them at 2–7 ft overlaps attacker/target band (0–5)
    const midBlocker = makeToken({
      id: 'blk-mid',
      gx: 2,
      gy: 0,
      elevationFt: 2,
      heightFt: 5,
      sizeSquares: 1,
    });
    canvas.tokens.placeables.push(midBlocker);

    const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);

    // Expect some token cover from tactical-per-slice aggregation
    expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    expect(result).not.toBe('none');
  });

  test('returns a valid cover state when 3D sampling mode is selected', () => {
    const { attacker, target } = placeAttackerAndTarget();

    const result = autoCoverSystem.detectCoverBetweenTokens(attacker, target);
    expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
  });
});
