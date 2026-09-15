import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finishCleanup, readJournal, validateCredentials, writeJournal } from './lifecycle.mjs';
import { cleanup, validateRunId, installMessageTagger, mutate, restore } from './world.js';
import { artworkPattern, matchesArtwork } from './artwork.mjs';
import { coverageFor, validateCases, casePassed } from './coverage.mjs';
import { fullCases } from './cases.mjs';
import { assessRequirements } from './requirements.mjs';
import { captureSettings, changeSetting, restoreSettings } from './settings-support.js';
import { assessMatrix, sourceFingerprint } from './evidence.mjs';
const RUN = '12345678-1234-4123-8123-123456789abc';
const passedResult = name => ({ name, mode: 'automated', status: 'passed', steps: [{ status: 'passed' }] });

test('fingerprint handles the real checkout, including an absent optional config directory', async () => {
  assert.match(await sourceFingerprint(), /^[a-f0-9]{64}$/);
});

test('later successful steps cannot erase an earlier failed visual assertion', () => {
  const result = { ...passedResult('transition'), steps: [{ status: 'failed' }, { status: 'passed' }] };
  assert.equal(casePassed(result), false);
  assert.deepEqual(coverageFor([{ name: result.name }], [result]).failed, [result.name]);
  assert.equal(casePassed({ ...passedResult('manual'), steps: [{ status: 'passed', review: { verdict: 'blocked' } }] }), false);
});

test('passing every implemented scenario cannot hide missing functional contracts', () => {
  const catalog = fullCases.filter(c => c.name !== 'rule-roll-context');
  const assessment = assessRequirements(catalog, catalog.map(c => passedResult(c.name)));
  assert.equal(assessment.complete, false);
  assert.ok(assessment.details.some(r => r.missing.length > 0));
  assert.ok(assessment.details.every(r => r.failed.length === 0 && r.unrun.length === 0));
});

test('every required functional contract now has a scenario, without counting it as executed', () => {
  const assessment = assessRequirements(fullCases, []);
  assert.equal(assessment.complete, false);
  assert.ok(assessment.details.every(r => r.missing.length === 0));
  assert.ok(assessment.details.some(r => r.unrun.length > 0));
});

test('Foundry 14 evidence rejects missing, stale, errored or incomplete runs', () => {
  const catalog = [{ name: 'core' }, { name: 'levels', environment: { core: 14 } }];
  const report = { sourceFingerprint: 'current', startupErrors: [], cleanup: 'complete', environment: { core: '14.1', modules: [] }, cases: catalog.map(c => passedResult(c.name)) };
  assert.equal(assessMatrix(catalog, [], 'current').complete, false);
  assert.equal(assessMatrix(catalog, [report], 'current').complete, true);
  assert.equal(assessMatrix(catalog, [report], 'different-code').complete, false);
  report.startupErrors = ['Module initialization failed'];
  assert.equal(assessMatrix(catalog, [report], 'current').complete, false);
  report.startupErrors = []; report.cleanup = 'failed';
  assert.equal(assessMatrix(catalog, [report], 'current').complete, false);
});

test('world settings writes require matching disposable world, allowed scope and owned scene; recovery restores absent entries', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  const entries = [];
  let current = true, writes = 0;
  try {
    globalThis.game = { user: { isGM: true }, world: { id: 'qa-world' }, settings: {
      settings: new Map([['pf2e-visioner.enableHoverTooltips', { scope: 'world' }]]),
      storage: new Map([['world', entries]]), get: () => current,
      set: async (_module, key, value) => { writes++; current = value; if (!entries.length) entries.push({ key: `pf2e-visioner.${key}`, delete: async () => entries.splice(0) }); },
    } };
    globalThis.canvas = { scene: { getFlag: () => RUN } };
    assert.throws(() => captureSettings({ worldId: 'campaign', keys: ['enableHoverTooltips'] }), /Disposable-world/);
    assert.throws(() => captureSettings({ worldId: 'qa-world', keys: ['autoVisibilityEnabled'] }), /not allowed/);
    assert.equal(writes, 0);
    const backup = captureSettings({ worldId: 'qa-world', keys: ['enableHoverTooltips'] });
    await changeSetting({ worldId: 'qa-world', runId: RUN, key: 'enableHoverTooltips', value: false });
    assert.equal(current, false);
    await restoreSettings(backup);
    assert.equal(current, true); assert.equal(entries.length, 0);
    await restoreSettings(backup); // Recovery is idempotent.
    globalThis.canvas.scene.getFlag = () => null;
    await assert.rejects(changeSetting({ worldId: 'qa-world', runId: RUN, key: 'enableHoverTooltips', value: false }), /Test scene/);
  } finally { Object.assign(globalThis, original); }
});

test('scrolling text uses the core namespace and restores its journaled value', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  let current = true;
  const entry = { key: 'core.scrollingStatusText' };
  try {
    globalThis.game = { user: { isGM: true }, world: { id: 'qa-world' }, settings: {
      settings: new Map([['core.scrollingStatusText', { scope: 'world' }]]),
      storage: new Map([['world', [entry]]]),
      get: (namespace, key) => { assert.equal(namespace, 'core'); assert.equal(key, 'scrollingStatusText'); return current; },
      set: async (namespace, key, value) => { assert.equal(namespace, 'core'); assert.equal(key, 'scrollingStatusText'); current = value; },
    } };
    globalThis.canvas = { scene: { getFlag: () => RUN } };
    const backup = captureSettings({ worldId: 'qa-world', keys: ['core.scrollingStatusText'] });
    await changeSetting({ worldId: 'qa-world', runId: RUN, key: 'core.scrollingStatusText', value: false });
    assert.equal(current, false);
    await restoreSettings(backup);
    await restoreSettings(backup);
    assert.equal(current, true);
    assert.throws(() => captureSettings({ worldId: 'qa-world', keys: ['core.otherSetting'] }), /not allowed/);
  } finally { Object.assign(globalThis, original); }
});

test('client settings restore before leaving the fixture, and never write world settings', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  const calls = [];
  let scope = 'client';
  try {
    globalThis.game = { settings: {
      settings: { get: () => ({ scope }) }, get: () => true,
      set: async () => calls.push('setting'),
    }, scenes: { has: () => true, get: () => ({ view: async () => calls.push('scene') }) } };
    globalThis.canvas = { scene: { id: 'original' }, tokens: { releaseAll: () => calls.push('selection') } };
    const saved = { scene: 'original', clientSettings: { gmObserverView: false } };
    await restore(saved);
    assert.deepEqual(calls, ['setting', 'scene', 'selection']);
    calls.length = 0; scope = 'world';
    await assert.rejects(restore(saved), /non-client setting/);
    assert.deepEqual(calls, []);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('numeric and choice settings restore exactly and reject invalid value types', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  const defaults = { peekRange: 30, autoCoverTokenIntersectionMode: 'any' };
  const values = { ...defaults };
  const entries = [];
  try {
    globalThis.game = { user: { isGM: true }, world: { id: 'qa-world' }, settings: {
      settings: new Map(Object.keys(values).map(key => [`pf2e-visioner.${key}`, { scope: 'world' }])),
      storage: new Map([['world', entries]]), get: (_module, key) => values[key],
      set: async (_module, key, value) => {
        values[key] = value;
        if (!entries.some(e => e.key === `pf2e-visioner.${key}`)) entries.push({ key: `pf2e-visioner.${key}`,
          delete: async () => { entries.splice(entries.findIndex(e => e.key === `pf2e-visioner.${key}`), 1); values[key] = defaults[key]; } });
      },
    } };
    globalThis.canvas = { scene: { getFlag: () => RUN } };
    const backup = captureSettings({ worldId: 'qa-world', keys: Object.keys(values) });
    const change = (key, value) => changeSetting({ worldId: 'qa-world', runId: RUN, key, value });
    for (const value of [NaN, Infinity, '30', null, {}]) await assert.rejects(change('peekRange', value), /invalid type/);
    await change('peekRange', 60); await change('autoCoverTokenIntersectionMode', 'center');
    await restoreSettings(backup); await restoreSettings(backup);
    assert.deepEqual(values, defaults); assert.deepEqual(entries, []);
    game.user.isGM = false;
    await assert.rejects(change('peekRange', 10), /GM required/);
  } finally { Object.assign(globalThis, original); }
});

test('restoring a native multi-level scene includes the original viewed level', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  let options;
  try {
    globalThis.game = { scenes: { has: () => true, get: () => ({ view: async value => { options = value; } }) } };
    globalThis.canvas = { scene: { id: 'original' }, level: { id: 'upper-floor' }, tokens: { releaseAll: () => {} } };
    await restore({ scene: 'original', level: 'upper-floor' });
    assert.deepEqual(options, { level: 'upper-floor' });
  } finally { Object.assign(globalThis, original); }
});

test('cleanup restores original targeting and rejects a refused scene restoration', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  try {
    const tokens = new Map();
    const targets = new Set();
    for (const id of ['original-target', 'test-target']) tokens.set(id, { id, setTarget: enabled => enabled ? targets.add(tokens.get(id)) : targets.delete(tokens.get(id)) });
    targets.add(tokens.get('test-target'));
    globalThis.game = { user: { targets }, scenes: { has: () => true, get: () => ({ view: async () => {} }) } };
    globalThis.canvas = { scene: { id: 'original' }, tokens: { get: id => tokens.get(id), releaseAll: () => {} } };
    await restore({ scene: 'original', targeted: ['original-target'] });
    assert.deepEqual([...targets].map(t => t.id), ['original-target']);
    canvas.scene.id = 'wrong-scene';
    await assert.rejects(restore({ scene: 'original' }), /not restored/);
  } finally { Object.assign(globalThis, original); }
});

test('an unowned actor inside a marked scene is never mutated', async () => {
  const original = { game: globalThis.game, canvas: globalThis.canvas };
  let changed = false;
  try {
    globalThis.game = { user: { isGM: true } };
    globalThis.canvas = {
      scene: { id: 'scene', getFlag: () => RUN },
      tokens: { get: () => ({ document: { getFlag: () => RUN }, actor: {
        getFlag: () => null, toggleCondition: () => { changed = true; },
      } }) },
    };
    await assert.rejects(mutate({ runId: RUN, fixture: { scene: 'scene', observer: 'observer', target: 'target' }, operation: 'condition', value: 'blinded' }), /outside the fixture/);
    assert.equal(changed, false);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('fixture actor tagging only owns creations in the marked GM test scene', () => {
  const original = Object.fromEntries(['game', 'canvas', 'Hooks'].map(key => [key, globalThis[key]]));
  const hooks = new Map();
  const updates = [];
  try {
    globalThis.game = { user: { isGM: true } };
    globalThis.Hooks = { on: (name, handler) => hooks.set(name, handler) };
    globalThis.canvas = { scene: { getFlag: () => null } };
    installMessageTagger(RUN);
    hooks.get('preCreateActor')({ updateSource: data => updates.push(data) });
    assert.equal(updates.length, 0);
    globalThis.canvas.scene.getFlag = () => RUN;
    hooks.get('preCreateActor')({ updateSource: data => updates.push(data) });
    assert.deepEqual(updates, [{ 'flags.pf2e-visioner.liveTestRun': RUN }]);
    globalThis.game.user.isGM = false;
    assert.throws(() => installMessageTagger(RUN), /GM required/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('a filtered or blocked run cannot count as complete coverage', () => {
  const cases = [{ name: 'automated' }, { name: 'blocked' }, { name: 'missing' }];
  assert.deepEqual(coverageFor(cases, [passedResult('automated'), { name: 'blocked', status: 'blocked' }]), {
    required: 3, passed: ['automated'], failed: ['blocked'], unrun: ['missing'],
  });
});

test('scenario catalog has unique safe artifact names and observable outcomes', () => {
  validateCases(fullCases);
  assert.throws(() => validateCases([{ name: '../escape', steps: [{ art: true }] }]));
  assert.throws(() => validateCases([{ name: 'empty', steps: [{ operation: 'move' }] }]));
  assert.throws(() => validateCases([fullCases[0], fullCases[0]]));
  assert.throws(() => validateCases([{ name: 'wrong-role', steps: [{ session: 'GM', expect: { visible: true } }] }]), /Unknown test session/);
});

test('pixel check distinguishes solid grayscale artwork from faint detection patterns', () => {
  for (const [bars, expected] of [[[190, 113, 58], true], [[75, 55, 47], false], [[76, 52, 44], false], [[0, 0, 0], false], [[85, 85, 85], false]]) {
    const png = { width: 100, height: 100, data: Buffer.alloc(40000) };
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      const value = bars[x < 40 ? 0 : x < 60 ? 1 : 2];
      png.data.fill(value, (y * 100 + x) * 4, (y * 100 + x) * 4 + 3);
    }
    assert.equal(artworkPattern(png, { x: 0, y: 0, width: 100, height: 100 }).artwork, expected);
  }
});

test('dim full-color artwork is visible art, while gray detection patterns are not', () => {
  const png = { width: 100, height: 100, data: Buffer.alloc(40000) };
  for (const [bars, dim] of [
    [[[0, 84, 0], [100, 0, 0], [0, 0, 100]], true],
    [[[65, 80, 65], [65, 49, 49], [43, 43, 59]], true],
    [[[76, 76, 76], [52, 52, 52], [44, 44, 44]], false],
    [[[60, 10, 60], [60, 10, 60], [60, 10, 60]], false],
  ]) {
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      const color = bars[x < 40 ? 0 : x < 60 ? 1 : 2];
      for (let channel = 0; channel < 3; channel++) png.data[(y * 100 + x) * 4 + channel] = color[channel];
    }
    const pattern = artworkPattern(png, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(matchesArtwork(pattern, 'dim'), dim);
    assert.equal(matchesArtwork(pattern, false), !dim);
    assert.equal(matchesArtwork(pattern, true), false);
  }
});

test('missing or malformed run IDs never match untagged world documents', async () => {
  for (const value of [undefined, null, '', 'ours', {}, '*']) {
    assert.throws(() => validateRunId(value));
    await assert.rejects(cleanup(value), /Invalid live-test run ID/);
  }
  assert.doesNotThrow(() => validateRunId(RUN));
});

test('credentials require separate roles and explicit blank-player confirmation', () => {
  const gm = { username: 'GM', password: 'secret' };
  assert.throws(() => validateCredentials(gm, { username: 'Player', password: '' }));
  assert.doesNotThrow(() => validateCredentials(gm, { username: 'Player', password: '', allowBlankPassword: true }));
  assert.throws(() => validateCredentials(gm, gm));
  assert.throws(() => validateCredentials({ username: 'GM', password: '' }, { username: 'Player', password: 'secret' }));
});

for (const failAt of [null, 'cleanup', 'restore', 'verify']) {
  test(`cleanup attempts all stages and retains recovery on ${failAt ?? 'success'}`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'visioner-cleanup-test-'));
    const journal = path.join(directory, 'recovery.json');
    const calls = [];
    try {
      await writeJournal(journal, { runId: 'test-run', world: 'test-world' });
      assert.equal((await readJournal(journal)).runId, 'test-run');
      const options = Object.fromEntries(['cleanup', 'restore', 'verify'].map(stage => [stage, async () => {
        calls.push(stage); if (stage === failAt) throw Error(stage);
      }]));
      const work = finishCleanup({ ...options, journal });
      if (failAt) { await assert.rejects(work); await access(journal); }
      else { await work; assert.equal(await readJournal(journal), null); }
      assert.deepEqual(calls, ['cleanup', 'restore', 'verify']);
    } finally {
      assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('world cleanup deletes only tagged documents and their action messages, even after one deletion fails', async () => {
  const original = Object.fromEntries(['game', 'Actor', 'Scene', 'Combat', 'ChatMessage'].map(k => [k, globalThis[k]]));
  const document = (id, runId, speaker) => ({ id, speaker, getFlag: () => runId });
  const calls = [];
  globalThis.game = { user: { isGM: true },
    scenes: [document('test-scene', RUN), document('real-scene', null)],
    actors: [document('test-actor', RUN), document('other-run-actor', 'another-run')],
    combats: [document('test-combat', RUN), document('real-combat', null)],
    messages: [document('action-message', null, { scene: 'test-scene' }), document('normal-message', null, { scene: 'real-scene' })],
  };
  for (const name of ['ChatMessage', 'Combat', 'Scene', 'Actor']) globalThis[name] = { deleteDocuments: async ids => {
    calls.push([name, ids]); if (name === 'Combat') throw Error('Simulated combat deletion failure');
  } };
  try {
    await assert.rejects(cleanup(RUN), /Simulated combat deletion failure/);
    assert.deepEqual(calls, [['ChatMessage', ['action-message']], ['Combat', ['test-combat']], ['Scene', ['test-scene']], ['Actor', ['test-actor']]]);
  } finally { for (const [key, value] of Object.entries(original)) globalThis[key] = value; }
});

test('failed message deletion retains reference documents for the next recovery attempt', async () => {
  const original = Object.fromEntries(['game', 'Actor', 'Scene', 'Combat', 'ChatMessage'].map(k => [k, globalThis[k]]));
  const calls = [];
  globalThis.game = { user: { isGM: true },
    scenes: [{ id: 'scene', getFlag: () => RUN }],
    actors: [{ id: 'actor', getFlag: () => RUN }], combats: [],
    messages: [{ id: 'message', getFlag: () => null, speaker: { scene: 'scene' } }],
  };
  for (const name of ['ChatMessage', 'Combat', 'Scene', 'Actor']) globalThis[name] = { deleteDocuments: async () => {
    calls.push(name); if (name === 'ChatMessage') throw Error('Message locked');
  } };
  try {
    await assert.rejects(cleanup(RUN), /Message locked/);
    assert.deepEqual(calls, ['ChatMessage']);
  } finally { for (const [key, value] of Object.entries(original)) globalThis[key] = value; }
});
