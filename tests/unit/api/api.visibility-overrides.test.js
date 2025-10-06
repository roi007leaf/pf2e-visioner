/**
 * Tests for manual AVS override creation via API methods:
 *  - bulkSetVisibility (manual vs automatic)
 *  - (Cover no longer creates overrides; tests assert absence)
 */
import { Pf2eVisionerApi as VisionerAPI } from '../../../scripts/api.js';

// Helper: find override object for (observer -> target)
function getOverride(observer, target) {
  const key = `avs-override-from-${observer.id}`;
  return observer === target ? null : (target.document.flags?.['pf2e-visioner']?.[key] || null);
}

describe('API AVS override persistence', () => {
  let observer, target, extra;

  beforeEach(async () => {
    observer = global.createMockToken({ id: 'observer1' });
    target = global.createMockToken({ id: 'target1' });
    extra = global.createMockToken({ id: 'target2' });
    global.canvas.tokens.placeables = [observer, target, extra];
  });

  describe('bulkSetVisibility', () => {
    test('creates overrides for manual bulk updates', async () => {
      await VisionerAPI.bulkSetVisibility([
        { observerId: observer.id, targetId: target.id, state: 'hidden' },
        { observerId: observer.id, targetId: extra.id, state: 'concealed' },
      ], { /* manual by default */ });

      const override1 = getOverride(observer, target);
      const override2 = getOverride(observer, extra);
      expect(override1).toBeTruthy();
      expect(override1.state).toBe('hidden');
      expect(override2).toBeTruthy();
      expect(override2.state).toBe('concealed');
    });

    test('does NOT create overrides for automatic bulk updates', async () => {
      await VisionerAPI.bulkSetVisibility([
        { observerId: observer.id, targetId: target.id, state: 'hidden' },
      ], { isAutomatic: true });

      const override = getOverride(observer, target);
      expect(override).toBeFalsy();
    });
  });

  describe('setCover (should not set overrides)', () => {
    test('manual cover change does NOT create new override when none existed', async () => {
      await VisionerAPI.setCover(observer.id, target.id, 'standard');
      const override = getOverride(observer, target);
      expect(override).toBeFalsy();
    });

    test('manual cover change does NOT modify existing visibility override', async () => {
      await VisionerAPI.setVisibility(observer.id, target.id, 'hidden');
      const before = getOverride(observer, target);
      expect(before).toBeTruthy();
      const beforeTimestamp = before.timestamp;
      await VisionerAPI.setCover(observer.id, target.id, 'standard');
      const after = getOverride(observer, target);
      expect(after).toBeTruthy();
      expect(after.state).toBe('hidden');
      expect(after.hasCover).toBe(false); // unchanged
      expect(after.expectedCover).toBeUndefined();
      // Optionally ensure timestamp unchanged (no re-write)
      expect(after.timestamp).toBe(beforeTimestamp);
    });

    test('automatic cover change also does NOT create override', async () => {
      await VisionerAPI.setCover(observer.id, target.id, 'lesser', { isAutomatic: true });
      const override = getOverride(observer, target);
      expect(override).toBeFalsy();
    });

    test('multiple cover changes still do not create override', async () => {
      await VisionerAPI.setCover(observer.id, target.id, 'greater');
      await VisionerAPI.setCover(observer.id, target.id, 'none');
      const override = getOverride(observer, target);
      expect(override).toBeFalsy();
    });
  });
});
