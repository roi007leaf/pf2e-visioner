import '../../../setup.js';
import { readPeekDC, rollPeekCheck } from '../../../../scripts/services/Peek/peek-door-dc.js';

describe('peek door DC', () => {
  test('readPeekDC returns numeric flag', () => {
    const door = { getFlag: (m, k) => (m === 'pf2e-visioner' && k === 'peekDC' ? 18 : undefined) };
    expect(readPeekDC(door)).toBe(18);
  });

  test('readPeekDC returns null when unset', () => {
    const door = { getFlag: () => undefined };
    expect(readPeekDC(door)).toBeNull();
  });

  test('rollPeekCheck success when degree >= 2', async () => {
    const roll = jest.fn(async () => ({ degreeOfSuccess: 2 }));
    const out = await rollPeekCheck({ token: createMockToken({ id: 't' }), dc: 15, roll });
    expect(out.success).toBe(true);
  });

  test('rollPeekCheck failure when degree < 2', async () => {
    const roll = jest.fn(async () => ({ degreeOfSuccess: 1 }));
    const out = await rollPeekCheck({ token: createMockToken({ id: 't' }), dc: 15, roll });
    expect(out.success).toBe(false);
  });
});
