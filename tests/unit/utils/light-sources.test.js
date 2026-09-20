import { jest } from '@jest/globals';
import {
  extinguishHeldLightSources,
  relightHeldLightSources,
} from '../../../scripts/utils/light-sources.js';

function makeActor({ toggles, items, toggleRollOption, flags = {} }) {
  const flagStore = new Map(Object.entries(flags));
  return {
    synthetics: { toggles },
    items: { get: (id) => items.get(id) },
    toggleRollOption: toggleRollOption ?? jest.fn(),
    setFlag: jest.fn(async (scope, key, value) => flagStore.set(key, value)),
    getFlag: jest.fn((scope, key) => flagStore.get(key)),
    unsetFlag: jest.fn(async (scope, key) => flagStore.delete(key)),
  };
}

describe('extinguishHeldLightSources', () => {
  it('turns off a checked toggle whose item has a TokenLight rule', async () => {
    const toggleRollOption = jest.fn();
    const items = new Map([
      ['torch1', { system: { rules: [{ key: 'TokenLight' }] } }],
    ]);
    const actor = makeActor({
      toggles: {
        'self:effect': {
          'lit-torch': {
            itemId: 'torch1',
            domain: 'self:effect',
            option: 'lit-torch',
            checked: true,
          },
        },
      },
      items,
      toggleRollOption,
    });

    await extinguishHeldLightSources(actor);

    expect(toggleRollOption).toHaveBeenCalledWith('self:effect', 'lit-torch', 'torch1', false);
    expect(actor.setFlag).toHaveBeenCalledWith(
      expect.any(String),
      'autoExtinguishedLights',
      [{ domain: 'self:effect', option: 'lit-torch', itemId: 'torch1' }],
    );
  });

  it('ignores checked toggles whose item has no TokenLight rule', async () => {
    const toggleRollOption = jest.fn();
    const items = new Map([['ration1', { system: { rules: [] } }]]);
    const actor = makeActor({
      toggles: {
        domain: { option: { itemId: 'ration1', domain: 'domain', option: 'option', checked: true } },
      },
      items,
      toggleRollOption,
    });

    await extinguishHeldLightSources(actor);

    expect(toggleRollOption).not.toHaveBeenCalled();
  });

  it('ignores unchecked toggles', async () => {
    const toggleRollOption = jest.fn();
    const items = new Map([['torch1', { system: { rules: [{ key: 'TokenLight' }] } }]]);
    const actor = makeActor({
      toggles: {
        domain: { option: { itemId: 'torch1', domain: 'domain', option: 'option', checked: false } },
      },
      items,
      toggleRollOption,
    });

    await extinguishHeldLightSources(actor);

    expect(toggleRollOption).not.toHaveBeenCalled();
  });

  it('does nothing when actor is null', async () => {
    await expect(extinguishHeldLightSources(null)).resolves.toBeUndefined();
  });
});

describe('relightHeldLightSources', () => {
  it('turns back on every recorded auto-extinguished toggle and clears the flag', async () => {
    const toggleRollOption = jest.fn();
    const items = new Map([['torch1', {}]]);
    const actor = makeActor({
      toggles: {},
      items,
      toggleRollOption,
      flags: {
        autoExtinguishedLights: [{ domain: 'self:effect', option: 'lit-torch', itemId: 'torch1' }],
      },
    });

    await relightHeldLightSources(actor);

    expect(toggleRollOption).toHaveBeenCalledWith('self:effect', 'lit-torch', 'torch1', true);
    expect(actor.unsetFlag).toHaveBeenCalledWith(expect.any(String), 'autoExtinguishedLights');
  });

  it('skips items that no longer exist on the actor', async () => {
    const toggleRollOption = jest.fn();
    const actor = makeActor({
      toggles: {},
      items: new Map(),
      toggleRollOption,
      flags: {
        autoExtinguishedLights: [{ domain: 'self:effect', option: 'lit-torch', itemId: 'gone' }],
      },
    });

    await relightHeldLightSources(actor);

    expect(toggleRollOption).not.toHaveBeenCalled();
    expect(actor.unsetFlag).toHaveBeenCalled();
  });

  it('does nothing when there is no recorded flag', async () => {
    const toggleRollOption = jest.fn();
    const actor = makeActor({ toggles: {}, items: new Map(), toggleRollOption });

    await relightHeldLightSources(actor);

    expect(toggleRollOption).not.toHaveBeenCalled();
    expect(actor.unsetFlag).not.toHaveBeenCalled();
  });

  it('does nothing when actor is null', async () => {
    await expect(relightHeldLightSources(null)).resolves.toBeUndefined();
  });
});
