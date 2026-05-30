import '../../../setup.js';
import { radiansToFoundryRotation } from '../../../../scripts/services/Peek/peek-vision-wrapper.js';

function coneCenterRadians(rotationDegrees) {
  return (((rotationDegrees + 90) % 360) + 360) % 360;
}

describe('radiansToFoundryRotation', () => {
  test('east (0 rad) yields a cone centered east', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(0))).toBeCloseTo(0, 5);
  });

  test('south (PI/2 rad, canvas y-down) yields a cone centered at 90 deg', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(Math.PI / 2))).toBeCloseTo(90, 5);
  });

  test('west (PI rad) yields a cone centered at 180 deg', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(Math.PI))).toBeCloseTo(180, 5);
  });

  test('result is normalized to [0, 360)', () => {
    const r = radiansToFoundryRotation(-Math.PI);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(360);
  });
});
