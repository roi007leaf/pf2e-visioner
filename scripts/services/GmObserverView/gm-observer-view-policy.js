/**
 * Decide whether Visioner should leave Core rendering alone, reveal normal art, or reveal
 * state-styled art. Mechanical visibility is deliberately an input: this policy never changes
 * detection truth.
 */
export function resolveGmObserverTokenPresentation({
  active = false,
  controlled = false,
  preview = false,
  filteredOut = false,
  culled = false,
  hasObservers = false,
  coreVisible = false,
  visionerState = null,
} = {}) {
  if (!active || controlled || preview || filteredOut || culled) return 'unchanged';
  if (!hasObservers) return 'normal';
  if (visionerState === 'hidden') return 'hidden';
  if (visionerState === 'unnoticed') return 'unnoticed';
  if (!coreVisible || visionerState === 'undetected') return 'undetected';
  return 'unchanged';
}
