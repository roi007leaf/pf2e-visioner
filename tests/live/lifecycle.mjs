import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// Never put credentials, cookies, browser storage, or console dumps in this file.
export async function writeJournal(file, record) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}

export async function readJournal(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function finishCleanup({ cleanup, restore, verify, journal }) {
  const failures = [];
  // A failed deletion must not prevent restoring the users' scenes.
  for (const operation of [cleanup, restore, verify]) {
    try { await operation(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Cleanup incomplete; recovery journal retained');
  await unlink(journal);
}

export function validateCredentials(gm, player) {
  for (const [role, credentials] of Object.entries({ gm, player })) {
    if (!credentials?.username?.trim() || (!credentials?.password && !(role === 'player' && credentials?.allowBlankPassword === true))) {
      throw new Error(`${role} username and password are required`);
    }
  }
  if (gm.username.trim().toLowerCase() === player.username.trim().toLowerCase()) throw new Error('GM and player must be separate accounts');
}
