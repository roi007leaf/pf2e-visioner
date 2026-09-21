import { noRenderUpdateOptions } from '../../../scripts/stores/token-flag-map-persistence.js';

describe('flag write options never carry animate:false', () => {
  test('noRenderUpdateOptions omits animate so Foundry does not stop a running movement tween', () => {
    const options = noRenderUpdateOptions();
    expect(options).toEqual({ diff: false, render: false });
    expect('animate' in options).toBe(false);
  });
});
