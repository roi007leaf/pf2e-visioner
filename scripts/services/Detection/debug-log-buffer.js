const MAX_ENTRIES = 500;

export function pushDebugLogEntry(entry) {
  const buffer = (globalThis.__pvHiddenTokenDebugLog = globalThis.__pvHiddenTokenDebugLog || []);
  buffer.push({ t: Date.now(), ...entry });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}
