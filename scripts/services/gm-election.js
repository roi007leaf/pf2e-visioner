export function isPrimaryGM() {
  if (!globalThis.game?.user?.isGM) return false;
  const activeGM = globalThis.game?.users?.activeGM;
  if (!activeGM) return true;
  return activeGM.id === globalThis.game.user.id;
}
