import { getLightConfig, isDarknessSource } from '../../../scripts/utils/darkness-source.js';

describe('darkness-source utils', () => {
  test('reads config from light document wrapper', () => {
    const light = { document: { config: { negative: true, dim: 20 } } };

    expect(getLightConfig(light)).toEqual({ negative: true, dim: 20 });
    expect(isDarknessSource(light)).toBe(true);
  });

  test('reads direct config for v14 darkness shape', () => {
    const light = { config: { darkness: { negative: true } } };

    expect(isDarknessSource(light)).toBe(true);
  });

  test('prefers explicit darkness source flag on placeable', () => {
    const light = { isDarknessSource: true, config: { negative: false } };

    expect(isDarknessSource(light)).toBe(true);
  });

  test('returns false for normal light', () => {
    const light = { document: { config: { negative: false } } };

    expect(isDarknessSource(light)).toBe(false);
  });
});
