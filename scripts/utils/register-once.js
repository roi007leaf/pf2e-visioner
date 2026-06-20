const registrations = new Set();

export function registerOnce(key, callback) {
  if (registrations.has(key)) return false;

  const result = callback();
  if (result === false) return false;

  registrations.add(key);
  return true;
}

export async function registerOnceAsync(key, callback) {
  if (registrations.has(key)) return false;

  const result = await callback();
  if (result === false) return false;

  registrations.add(key);
  return true;
}

export function resetRegistrationsForTests() {
  registrations.clear();
}
