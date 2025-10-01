/**
 * Test for tremorsense + hearing observer vs elevated target behind wall
 * This should return 'undetected' since tremorsense can't detect elevated targets
 * and hearing alone isn't sufficient for ground-based creatures
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('Tremorsense + Hearing vs Elevated Targets', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = VisionAnalyzer.getInstance();

    // Mock canvas
    global.canvas = {
      scene: { grid: { distance: 5 } },
      grid: { size: 100 }
    };
  });

  test('observer with only tremorsense and hearing cannot detect elevated target', () => {
    // Create observer with only tremorsense and hearing (no vision)
    const observer = {
      name: 'Ground-based Observer',
      document: { elevation: 0, id: 'obs1' },
      actor: {
        system: {
          perception: {
            senses: [
              { type: 'tremorsense', range: 30 },
              { type: 'hearing', range: 60 }
            ]
          }
        }
      },
      center: { x: 0, y: 0 },
      distanceTo: (other) => {
        const dx = 0 - other.center.x;
        const dy = 0 - other.center.y;
        const pixelDistance = Math.hypot(dx, dy);
        return pixelDistance / 100; // Convert to grid squares
      }
    };

    // Create elevated target
    const elevatedTarget = {
      name: 'Elevated Target',
      document: { elevation: 10, id: 'target1' }, // 10 feet up
      actor: {
        system: { details: { creatureType: 'humanoid' } }
      },
      center: { x: 150, y: 0 }, // 150 pixels = 1.5 grid squares = 7.5 feet
      distanceTo: (other) => {
        const dx = 150 - other.center.x;
        const dy = 0 - other.center.y;
        const pixelDistance = Math.hypot(dx, dy);
        return pixelDistance / 100; // Convert to grid squares
      }
    };

    // Mock vision capabilities for observer (only tremorsense + hearing, no vision)
    jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
      hasVision: false,
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      detectionModes: {
        feelTremor: { enabled: true, range: 30, source: 'detectionModes' }
      },
      precise: [],
      imprecise: [{ type: 'tremorsense', range: 30 }],
      hearing: { range: 60 },
      echolocationActive: false,
      lifesense: null,
      tremorsense: { range: 30 },
      scent: null
    });

    // Test: canSenseImprecisely should return true because hearing can detect elevated targets
    // Tremorsense cannot detect elevated, but hearing (imprecise, 60ft range) can
    const canSense = visionAnalyzer.canSenseImprecisely(observer, elevatedTarget);

    expect(canSense).toBe(true); // Hearing can detect elevated targets
  });

  test('observer with vision + tremorsense can detect elevated target via hearing', () => {
    // Create observer with vision AND tremorsense
    const observer = {
      name: 'Observer with Vision',
      document: { elevation: 0, id: 'obs2' },
      actor: {
        system: {
          perception: {
            senses: [
              { type: 'tremorsense', range: 30 },
              { type: 'hearing', range: 60 }
            ]
          }
        }
      },
      center: { x: 0, y: 0 },
      distanceTo: (other) => {
        const dx = 0 - other.center.x;
        const dy = 0 - other.center.y;
        const pixelDistance = Math.hypot(dx, dy);
        return pixelDistance / 100;
      }
    };

    const elevatedTarget = {
      name: 'Elevated Target',
      document: { elevation: 10, id: 'target2' },
      actor: {
        system: { details: { creatureType: 'humanoid' } }
      },
      center: { x: 150, y: 0 },
      distanceTo: (other) => {
        const dx = 150 - other.center.x;
        const dy = 0 - other.center.y;
        const pixelDistance = Math.hypot(dx, dy);
        return pixelDistance / 100;
      }
    };

    // Mock vision capabilities for observer (HAS vision + tremorsense + hearing)
    jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
      hasVision: true, // HAS VISION
      hasDarkvision: false,
      hasLowLightVision: false,
      hasGreaterDarkvision: false,
      detectionModes: {
        feelTremor: { enabled: true, range: 30, source: 'detectionModes' }
      },
      precise: [],
      imprecise: [{ type: 'tremorsense', range: 30 }],
      hearing: { range: 60 },
      echolocationActive: false,
      lifesense: null,
      tremorsense: { range: 30 },
      scent: null
    });

    // Test: canSenseImprecisely should return true (hearing works since observer has vision)
    const canSense = visionAnalyzer.canSenseImprecisely(observer, elevatedTarget);

    expect(canSense).toBe(true);
  });
});