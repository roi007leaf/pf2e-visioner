import { SourceTracker } from '../../../scripts/rule-elements/SourceTracker.js';

const clone = value => JSON.parse(JSON.stringify(value));

// Foundry flag updates merge objects; omitting a key does not delete stored data.
function mergeStored(target, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('-=')) delete target[key.slice(2)];
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {};
      mergeStored(target[key], value);
    } else target[key] = clone(value);
  }
}

function tokenWithSources(sources) {
  const stored = clone(sources);
  return { document: {
    getFlag: () => clone(stored),
    setFlag: async (_scope, _key, update) => mergeStored(stored, update),
  } };
}

describe('SourceTracker persisted source removal', () => {
  it('removes the final observer cover source from merging flag storage', async () => {
    const token = tokenWithSources({ coverByObserver: { observer: {
      state: 'greater', sources: [{ id: 'effect', state: 'greater' }],
    } } });
    await SourceTracker.removeSource(token, 'effect', 'cover', 'observer');
    expect(SourceTracker.getCoverStateSources(token, 'observer')).toEqual([]);
  });

  it('removes only the requested state type when source IDs overlap', async () => {
    const token = tokenWithSources({
      coverByObserver: { observer: { sources: [{ id: 'effect', state: 'greater' }] } },
      visibilityByObserver: { observer: { sources: [{ id: 'effect', state: 'hidden' }] } },
    });
    await SourceTracker.removeSource(token, 'effect', 'cover', 'observer');
    expect(SourceTracker.getCoverStateSources(token, 'observer')).toEqual([]);
    expect(SourceTracker.getVisibilityStateSources(token, 'observer')).toEqual([{ id: 'effect', state: 'hidden' }]);
  });

  it('keeps other sources and observers during an unscoped removal', async () => {
    const token = tokenWithSources({ coverByObserver: {
      first: { sources: [{ id: 'effect', state: 'greater' }, { id: 'other', state: 'lesser' }] },
      second: { sources: [{ id: 'effect', state: 'greater' }] },
      third: { sources: [{ id: 'other', state: 'standard' }] },
    } });
    await SourceTracker.removeSource(token, 'effect', 'cover');
    expect(SourceTracker.getCoverStateSources(token, 'first')).toEqual([{ id: 'other', state: 'lesser' }]);
    expect(SourceTracker.getCoverStateSources(token, 'second')).toEqual([]);
    expect(SourceTracker.getCoverStateSources(token, 'third')).toEqual([{ id: 'other', state: 'standard' }]);
  });
});
