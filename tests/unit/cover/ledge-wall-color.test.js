import '../../setup.js';
import {
  LEDGE_WALL_COLOR,
  ledgeWallColorWrapper,
} from '../../../scripts/cover/ledge/ledge-wall-color.js';

describe('ledge wall color', () => {
  test('ledge walls use the ledge color', () => {
    const wall = { document: { flags: { 'pf2e-visioner': { ledge: true } } } };
    const wrapped = jest.fn(() => 0xffffbb);
    expect(ledgeWallColorWrapper.call(wall, wrapped)).toBe(LEDGE_WALL_COLOR);
    expect(wrapped).not.toHaveBeenCalled();
  });

  test('other walls keep their native color', () => {
    const wall = { document: { flags: {} } };
    const wrapped = jest.fn(() => 0xffffbb);
    expect(ledgeWallColorWrapper.call(wall, wrapped)).toBe(0xffffbb);
  });
});
