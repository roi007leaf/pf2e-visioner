export function yieldToBrowser() {
  // Keep background GMs processing without relying on throttled timers.
  if (globalThis.document?.visibilityState === 'hidden' && globalThis.scheduler?.yield) {
    return globalThis.scheduler.yield();
  }
  // Foreground scheduler.yield() chains boost continuation priority. A live
  // Chromium trace showed 22 short continuations postponing a frame by 107 ms.
  // Use the ordinary task queue so rendering gets opportunities between chunks.
  return new Promise((resolve) => setTimeout(resolve, 0));
}
