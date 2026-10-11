/**
 * @jest-environment jsdom
 */

import '../../setup.js';

import {
  buildStealthBypassEffectData,
  getStealthPrerequisiteItemConfig,
  hasStealthPrerequisiteBypass,
} from '../../../scripts/items/stealth-prerequisite-items.js';
import {
  handleCreateChatMessage,
  injectStealthBypassButton,
} from '../../../scripts/items/stealth-prerequisite-chat.js';
import { FeatsHandler } from '../../../scripts/chat/services/FeatsHandler.js';

function createActor(effects = []) {
  return {
    name: 'Hider',
    isOwner: true,
    items: [],
    itemTypes: { effect: effects, feat: [], action: [] },
    system: { attributes: {} },
    deleteEmbeddedDocuments: jest.fn(async () => []),
    createEmbeddedDocuments: jest.fn(async () => []),
  };
}

function bypassEffect(actions, slug = 'effect-visioner-camouflage-dye-lesser') {
  return {
    id: 'eff1',
    name: 'Effect: X',
    type: 'effect',
    system: { slug },
    flags: { 'pf2e-visioner': { stealthPrerequisiteBypass: actions } },
  };
}

function message(type, content = 'Used item', overrides = {}) {
  return {
    author: { id: game.user.id },
    timestamp: Date.now(),
    content,
    speaker: { actor: 'actor1', token: null },
    flags: { pf2e: { origin: { type, uuid: 'Actor.actor1.Item.x', sourceId: 'Compendium.x' } } },
    ...overrides,
  };
}

const prereq = (token, action) =>
  FeatsHandler.overridePrerequisites(token, { startQualifies: true, endQualifies: false }, { action });

describe('stealth prerequisite items', () => {
  let actor;

  beforeEach(() => {
    actor = createActor();
    game.user.id = 'user1';
    game.user.targets = new Set();
    game.actors = { get: jest.fn(() => actor) };
    global.fromUuidSync = jest.fn(() => ({ name: 'Camouflage Dye (Greater)', img: 'dye.webp' }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('registry resolves known items by name or slug', () => {
    expect(getStealthPrerequisiteItemConfig({ name: 'Camouflage Dye (Lesser)' })).toMatchObject({
      actions: ['hide', 'sneak'],
      duration: { value: 10, unit: 'minutes' },
    });
    expect(getStealthPrerequisiteItemConfig({ system: { slug: 'chameleon-suit-major' } })).toMatchObject({
      actions: ['hide'],
      duration: { value: 1, unit: 'hours' },
    });
    expect(getStealthPrerequisiteItemConfig({ name: 'Elixir of Life' })).toBeNull();
  });

  test('effect data carries bypass actions flag', () => {
    const config = getStealthPrerequisiteItemConfig({ name: 'Chameleon Suit' });
    const data = buildStealthBypassEffectData(config, { name: 'Chameleon Suit' });
    expect(data.flags['pf2e-visioner'].stealthPrerequisiteBypass).toEqual(['hide']);
    expect(data.system.duration).toMatchObject({ value: 1, unit: 'minutes' });
  });

  test('consumed dye applies effect to speaker', async () => {
    await handleCreateChatMessage(message('consumable'));
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ type: 'effect' }),
    ]);
  });

  test('consumed dye applies effect to single target', async () => {
    const target = createActor();
    game.user.targets = new Set([{ actor: target }]);
    await handleCreateChatMessage(message('consumable'));
    expect(target.createEmbeddedDocuments).toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('re-use replaces existing effect', async () => {
    actor = createActor([bypassEffect(['hide', 'sneak'], 'effect-visioner-camouflage-dye-greater')]);
    await handleCreateChatMessage(message('consumable'));
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['eff1']);
  });

  test('ignores other users, item cards and unknown consumables', async () => {
    await handleCreateChatMessage(message('consumable', 'x', { author: { id: 'other' } }));
    await handleCreateChatMessage(message('consumable', '<div class="item-card">'));
    global.fromUuidSync = jest.fn(() => ({ name: 'Healing Potion' }));
    await handleCreateChatMessage(message('consumable'));
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('equipment item card gets apply button that applies effect', async () => {
    global.fromUuidSync = jest.fn(() => ({ name: 'Camouflaging Chromatophores (Lesser)' }));
    const element = document.createElement('div');
    element.innerHTML = '<div class="message-content"></div>';
    injectStealthBypassButton(message('equipment', '<div class="item-card">'), element);
    const button = element.querySelector('.pf2e-visioner-stealth-bypass-btn');
    expect(button).not.toBeNull();
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.createEmbeddedDocuments).toHaveBeenCalled();
  });

  test('no button for unrelated items or consumables', () => {
    const element = document.createElement('div');
    injectStealthBypassButton(message('consumable', '<div class="item-card">'), element);
    global.fromUuidSync = jest.fn(() => ({ name: 'Longsword' }));
    injectStealthBypassButton(message('weapon', '<div class="item-card">'), element);
    expect(element.querySelector('.pf2e-visioner-stealth-bypass-btn')).toBeNull();
  });

  test('hide+sneak effect bypasses both end prerequisites', () => {
    const token = { actor: createActor([bypassEffect(['hide', 'sneak'])]) };
    expect(prereq(token, 'hide').endQualifies).toBe(true);
    expect(prereq(token, 'sneak').endQualifies).toBe(true);
    expect(FeatsHandler.shouldSkipEndCoverRequirement(token, 'sneak')).toBe(true);
  });

  test('hide-only effect does not bypass sneak', () => {
    const token = { actor: createActor([bypassEffect(['hide'])]) };
    expect(hasStealthPrerequisiteBypass(token, 'hide')).toBe(true);
    expect(prereq(token, 'hide').endQualifies).toBe(true);
    expect(prereq(token, 'sneak').endQualifies).toBe(false);
    expect(FeatsHandler.shouldSkipEndCoverRequirement(token, 'sneak')).toBe(false);
  });

  test('no effect keeps prerequisites', () => {
    const token = { actor: createActor() };
    expect(prereq(token, 'hide').endQualifies).toBe(false);
    expect(FeatsHandler.shouldSkipEndCoverRequirement(token, 'hide')).toBe(false);
  });
});
