import '../../setup.js';

import { ExclusionManager } from '../../../scripts/visibility/auto-visibility/core/ExclusionManager.js';

function npcToken({ id = 't', hidden = false, hp = 10, type = 'npc' } = {}) {
  return {
    document: { id, hidden },
    actor: { type, hitPoints: { value: hp } },
  };
}

describe('ExclusionManager observer/target role split', () => {
  const mgr = new ExclusionManager();

  test('defeated NPC: excluded as observer, NOT excluded as target', () => {
    const corpse = npcToken({ id: 'corpse', hp: 0 });
    expect(mgr.isDefeatedToken(corpse)).toBe(true);
    expect(mgr.isExcludedToken(corpse)).toBe(true);
    expect(mgr.isExcludedAsTarget(corpse)).toBe(false);
  });

  test('living NPC: excluded in neither role', () => {
    const living = npcToken({ id: 'living', hp: 12 });
    expect(mgr.isExcludedToken(living)).toBe(false);
    expect(mgr.isExcludedAsTarget(living)).toBe(false);
  });

  test('defeated PC is exempt: not defeated, not excluded in either role', () => {
    const downedPc = npcToken({ id: 'pc', hp: 0, type: 'character' });
    expect(mgr.isDefeatedToken(downedPc)).toBe(false);
    expect(mgr.isExcludedToken(downedPc)).toBe(false);
    expect(mgr.isExcludedAsTarget(downedPc)).toBe(false);
  });

  test('GM-hidden token stays excluded in both roles', () => {
    const hidden = npcToken({ id: 'hidden', hidden: true, hp: 10 });
    expect(mgr.isExcludedToken(hidden)).toBe(true);
    expect(mgr.isExcludedAsTarget(hidden)).toBe(true);
  });

  test('loot token stays excluded in both roles', () => {
    const loot = { document: { id: 'loot', hidden: false }, actor: { type: 'loot' } };
    expect(mgr.isExcludedToken(loot)).toBe(true);
    expect(mgr.isExcludedAsTarget(loot)).toBe(true);
  });

  test('token without a document is excluded in both roles', () => {
    expect(mgr.isExcludedToken({})).toBe(true);
    expect(mgr.isExcludedAsTarget({})).toBe(true);
  });
});
