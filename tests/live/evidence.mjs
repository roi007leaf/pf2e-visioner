import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { casePassed } from './coverage.mjs';

export async function sourceFingerprint(root = '.') {
  const hash = createHash('sha256');
  async function walk(relative, optional = false) {
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) {
      if (optional && error.code === 'ENOENT') { hash.update(`missing-directory:${relative}`); return; }
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) { hash.update(file); hash.update(await readFile(path.join(root, file))); }
    }
  }
  // Exclude runtime pack databases, reports and credentials. Include the test
  // definitions themselves so changing expected outcomes invalidates evidence.
  for (const directory of ['scripts', 'styles', 'templates', 'lang', 'config', 'tests/live']) await walk(directory, directory === 'config');
  hash.update(await readFile(path.join(root, 'module.json')));
  return hash.digest('hex');
}

export const profiles = [
  { name: 'foundry14-pf2e', core: 14, modules: [] },
];
export function assessMatrix(catalog, reports, fingerprint) {
  const accepted = reports.filter(r => r.sourceFingerprint === fingerprint && r.cleanup === 'complete' && !r.error &&
    Array.isArray(r.startupErrors) && !r.startupErrors.length && !r.environmentWarning && !r.sourceChangedDuringRun);
  const details = profiles.map(profile => {
    const matches = accepted.filter(r => Number(r.environment?.core?.split('.')[0]) === profile.core && profile.modules.every(id => r.environment.modules?.some(m => m.id === id)));
    const latest = new Map();
    for (const report of [...matches].sort((a, b) => String(a.finished).localeCompare(String(b.finished)))) for (const result of report.cases) latest.set(result.name, result);
    const required = catalog.filter(c => (!c.environment?.core || c.environment.core === profile.core) && (c.environment?.modules ?? []).every(id => profile.modules.includes(id)));
    return { profile: profile.name, required: required.length,
      passed: required.filter(c => casePassed(latest.get(c.name))).map(c => c.name),
      unrun: required.filter(c => !latest.has(c.name)).map(c => c.name),
      failed: required.filter(c => latest.has(c.name) && !casePassed(latest.get(c.name))).map(c => c.name) };
  });
  return { complete: details.every(p => !p.unrun.length && !p.failed.length), rejectedReports: reports.length - accepted.length, details };
}
