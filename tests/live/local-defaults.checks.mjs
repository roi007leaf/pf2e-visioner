import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { accountDefaults, loadLocalDefaults, needsSecondGmSession, promptAccount } from './local-defaults.mjs';

const saved = { gm: { username: 'QA GM', password: 'saved-secret' },
  player: { username: 'QA Player', password: '', allowBlankPassword: true } };

test('second GM login is required only by selected second-GM cases', () => {
  assert.equal(needsSecondGmSession([{ name: 'performance' }]), false);
  assert.equal(needsSecondGmSession([{ name: 'performance' }, { name: 'handover', secondGm: true }]), true);
  assert.equal(needsSecondGmSession([]), false);
});

test('saved credentials still prompt and Enter accepts defaults without displaying secrets', async () => {
  const calls = [];
  const prompts = {
    input: async config => { calls.push(config); return config.default; },
    password: async config => { calls.push(config); return ''; },
    confirm: async config => { calls.push(config); return config.default; },
  };
  assert.deepEqual(await promptAccount('gm', saved, {}, prompts), { ...saved.gm, allowBlankPassword: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].default, 'QA GM');
  assert.equal(calls[1].mask, '*');
  assert.ok(!JSON.stringify(calls).includes('saved-secret'));
  calls.length = 0;
  assert.deepEqual(await promptAccount('player', saved, {}, prompts), saved.player);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].default, true);
});

test('edited prompts override defaults and changing account drops saved password', async () => {
  const prompts = { input: async () => 'Other GM', password: async () => '', confirm: async () => false };
  assert.equal((await promptAccount('gm', saved, {}, prompts)).password, '');
  prompts.password = async () => 'typed-secret';
  assert.deepEqual(await promptAccount('gm', saved, {}, prompts), {
    username: 'Other GM', password: 'typed-secret', allowBlankPassword: false,
  });
});

test('explicit environment credentials retain unattended operation', async () => {
  const unexpected = async () => { throw Error('Unexpected prompt'); };
  const prompts = { input: unexpected, password: unexpected, confirm: unexpected };
  assert.equal((await promptAccount('gm', saved, { VISIONER_GM_USER: 'Env GM', VISIONER_GM_PASSWORD: 'env-secret' }, prompts)).password, 'env-secret');
  assert.deepEqual(await promptAccount('player', saved, { VISIONER_PLAYER_USER: 'Env Player', VISIONER_PLAYER_ALLOW_BLANK: '1' }, prompts), {
    username: 'Env Player', password: '', allowBlankPassword: true,
  });
});

test('saved accounts preserve passwords and explicit blank-player confirmation', () => {
  assert.deepEqual(accountDefaults('gm', saved, {}), { ...saved.gm, allowBlankPassword: false });
  assert.deepEqual(accountDefaults('player', saved, {}), saved.player);
  assert.equal(accountDefaults('player', { player: { username: 'QA Player', password: '' } }, {}).allowBlankPassword, false);
});

test('environment overrides defaults without reusing another account password', () => {
  assert.equal(accountDefaults('gm', saved, { VISIONER_GM_PASSWORD: 'new-secret' }).password, 'new-secret');
  assert.equal(accountDefaults('gm', saved, { VISIONER_GM_USER: 'Other GM' }).password, undefined);
  assert.equal(accountDefaults('player', saved, { VISIONER_PLAYER_USER: 'Other Player' }).allowBlankPassword, false);
  assert.equal(accountDefaults('player', saved, { VISIONER_PLAYER_ALLOW_BLANK: '0' }).allowBlankPassword, false);
});

test('missing defaults still prompt; malformed defaults never expose their contents', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'visioner-defaults-'));
  const file = path.join(dir, 'live.json');
  try {
    assert.deepEqual(await loadLocalDefaults(file), {});
    await writeFile(file, JSON.stringify(saved));
    assert.deepEqual(await loadLocalDefaults(file), saved);
    await writeFile(file, '{"password":"private-secret');
    await assert.rejects(loadLocalDefaults(file), error => /Invalid local/.test(error.message) && !error.message.includes('private-secret'));
    await writeFile(file, '{"gm":{"password":123}}');
    await assert.rejects(loadLocalDefaults(file), /Invalid local/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(tmpdir()), 'visioner-defaults-')));
    await rm(dir, { recursive: true, force: true });
  }
});
