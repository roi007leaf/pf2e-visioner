import test from 'node:test';
import assert from 'node:assert/strict';
import { setPause } from './world.js';

test('QA pause changes broadcast and restore the original paused state', async () => {
  const original = globalThis.game;
  const calls = [];
  globalThis.game = { world: { id: 'visioner-qa' }, user: { isGM: true }, paused: true,
    togglePause: (paused, options) => { calls.push({ paused, options }); game.paused = paused; } };
  try {
    await setPause({ world: 'visioner-qa', paused: false });
    assert.equal(game.paused, false);
    await setPause({ world: 'visioner-qa', paused: false });
    assert.equal(calls.length, 1);
    await setPause({ world: 'visioner-qa', paused: true });
    assert.equal(game.paused, true);
    assert.deepEqual(calls, [false, true].map(paused => ({ paused, options: { broadcast: true } })));
  } finally { globalThis.game = original; }
});

test('pause changes reject wrong worlds, player accounts and invalid values without writes', async () => {
  const original = globalThis.game;
  let writes = 0;
  globalThis.game = { world: { id: 'kingmaker' }, user: { isGM: true }, paused: true,
    togglePause: () => writes++ };
  try {
    await assert.rejects(setPause({ world: 'visioner-qa', paused: false }), /Wrong Foundry world/);
    game.world.id = 'visioner-qa'; game.user.isGM = false;
    await assert.rejects(setPause({ world: 'visioner-qa', paused: false }), /GM required/);
    game.user.isGM = true;
    await assert.rejects(setPause({ world: 'visioner-qa', paused: 'false' }), /must be boolean/);
    assert.equal(writes, 0);
    await assert.rejects(setPause({ world: 'visioner-qa', paused: false }), /did not update/);
  } finally { globalThis.game = original; }
});
