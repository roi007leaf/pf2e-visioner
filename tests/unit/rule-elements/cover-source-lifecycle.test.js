import '../../setup.js';
import { CoverOverride } from '../../../scripts/rule-elements/operations/CoverOverride.js';
import { SourceTracker } from '../../../scripts/rule-elements/SourceTracker.js';
import { getCoverBetween, setCoverBetween } from '../../../scripts/stores/cover-map.js';

jest.mock('../../../scripts/utils.js', () => ({
  setCoverBetween: (...args) => require('../../../scripts/stores/cover-map.js').setCoverBetween(...args),
}));
jest.mock('../../../scripts/cover/ephemeral.js', () => ({ batchUpdateCoverEffects: jest.fn() }));

const clone = value => JSON.parse(JSON.stringify(value));
function merge(target, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('-=')) delete target[key.slice(2)];
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {};
      merge(target[key], value);
    } else target[key] = clone(value);
  }
}
function token(id) {
  const flags = {};
  return { id, actor: {}, document: {
    id,
    getFlag: (_scope, key) => flags[key] === undefined ? undefined : clone(flags[key]),
    setFlag: async (_scope, key, value) => { flags[key] ??= {}; merge(flags[key], value); },
    unsetFlag: async (_scope, key) => { delete flags[key]; },
    update: async update => {
      for (const [key, value] of Object.entries(update)) {
        const name = key.replace('flags.pf2e-visioner.', '');
        flags[name] ??= {};
        merge(flags[name], value);
      }
    },
  } };
}

describe('Rule cover through real cover store and source tracker', () => {
  let observer, target;
  beforeEach(() => {
    observer = token('observer'); target = token('target');
    game.user.isGM = true;
    canvas.tokens.placeables = [observer, target];
    canvas.tokens.get = id => canvas.tokens.placeables.find(t => t.id === id);
  });
  const operation = { state: 'greater', source: 'effect', direction: 'from', targets: 'all' };
  const rule = { item: { slug: 'cover-effect' } };

  it('does not manufacture a manual source, and removes cover with the effect', async () => {
    await CoverOverride.applyCoverOverride(operation, target, rule);
    expect(SourceTracker.getCoverStateSources(target, observer.id).map(s => s.type)).toEqual(['rule-element']);
    await CoverOverride.removeCoverOverride(operation, target, rule);
    expect(SourceTracker.getCoverStateSources(target, observer.id)).toEqual([]);
    expect(getCoverBetween(observer, target)).toBe('none');
  });

  it('keeps a later independent manual cover choice when the effect is removed', async () => {
    await CoverOverride.applyCoverOverride(operation, target, rule);
    await setCoverBetween(observer, target, 'lesser', { skipTakeCoverTrackingSync: true });
    await CoverOverride.removeCoverOverride(operation, target, rule);
    expect(getCoverBetween(observer, target)).toBe('lesser');
  });
});
