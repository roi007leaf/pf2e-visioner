/**
 * Decide whether Visioner should leave Core rendering alone, reveal normal art, or reveal hatched
 * art. Mechanical visibility is deliberately an input: this policy never changes detection truth.
 */
export function resolveGmObserverTokenPresentation({
  active = false,
  controlled = false,
  preview = false,
  filteredOut = false,
  culled = false,
  hasObservers = false,
  coreVisible = false,
  visionerHidden = false,
} = {}) {
  if (!active || controlled || preview || filteredOut || culled) return 'unchanged';
  if (!hasObservers) return 'normal';
  if (!coreVisible || visionerHidden) return 'unseen';
  return 'unchanged';
}
