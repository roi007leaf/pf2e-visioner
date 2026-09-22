import '../../setup.js';

import { applyNpcVisionOnPreCreate } from '../../../scripts/hooks/token-events.js';

function makeDoc(actorType, sightEnabled) {
  return {
    actor: { type: actorType },
    sight: { enabled: sightEnabled },
    updateSource: jest.fn(),
  };
}

describe('applyNpcVisionOnPreCreate', () => {
  beforeEach(() => {
    game.settings.get = jest.fn((mod, key) => (key === 'enableAllTokensVision' ? true : undefined));
  });

  test('enables sight on NPC token document before creation', () => {
    const doc = makeDoc('npc', false);
    applyNpcVisionOnPreCreate(doc);
    expect(doc.updateSource).toHaveBeenCalledWith({ sight: { enabled: true } });
  });

  test('does not touch non-NPC tokens', () => {
    const doc = makeDoc('character', false);
    applyNpcVisionOnPreCreate(doc);
    expect(doc.updateSource).not.toHaveBeenCalled();
  });

  test('no-op when sight already matches setting', () => {
    const doc = makeDoc('npc', true);
    applyNpcVisionOnPreCreate(doc);
    expect(doc.updateSource).not.toHaveBeenCalled();
  });

  test('disables sight when setting is off', () => {
    game.settings.get = jest.fn(() => false);
    const doc = makeDoc('npc', true);
    applyNpcVisionOnPreCreate(doc);
    expect(doc.updateSource).toHaveBeenCalledWith({ sight: { enabled: false } });
  });
});
