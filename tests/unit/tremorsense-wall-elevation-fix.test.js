/**
 * @fileoverview Test cases for tremorsense + wall + elevation interaction
 * This tests the specific bug where tremorsense observers behind walls
 * were showing elevated targets as "hidden" instead of "undetected"
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

// Mock canvas and global objects
global.canvas = {
  scene: { grid: { distance: 5 } },
  walls: {
    checkCollision: jest.fn(() => true) // Wall blocks line of sight
  }
};

global.CONFIG = {
  Canvas: {
    detectionModes: {
      feelTremor: { id: 'feelTremor' },
      hearing: { id: 'hearing' }
    },
    polygonBackends: {
      sight: {
        testCollision: jest.fn(() => true) // Wall blocks sight
      }
    }
  }
};

describe('VisionAnalyzer - Tremorsense Wall + Elevation Bug Fix', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = VisionAnalyzer.getInstance();
    jest.clearAllMocks();
  });

  describe('canDetectElevatedTarget - Behind Wall Scenarios', () => {
    test('tremorsense observer behind wall cannot detect elevated target', () => {
      // Observer with tremorsense + hearing but no clear vision (behind wall)
      const observer = {
        name: 'Animated Broom',
        document: { elevation: 0 },
        center: { x: 100, y: 100 },
        distanceTo: jest.fn(() => 4), // 20 feet (4 grid squares)
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'tremorsense', range: 60 },
                { type: 'hearing', range: Infinity }
              ]
            }
          }
        }
      };

      // Elevated target
      const target = {
        name: 'Ezren',
        document: { elevation: 5 },
        center: { x: 120, y: 120 },
        actor: { system: {} }
      };

      // Mock that observer has basic vision capabilities but is blocked by wall
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: true, // Has basic vision
        hasDarkvision: false,
        hasLowLightVision: false,
        tremorsense: { range: 60 },
        hearing: { range: Infinity, acuity: 'imprecise' },
        echolocationActive: false,
        scent: null
      });

      // Mock that line of sight is blocked by wall
      jest.spyOn(visionAnalyzer, 'hasLineOfSight').mockReturnValue(false);

      const result = visionAnalyzer.canDetectElevatedTarget(observer, target);

      expect(result).toBe(false); // Should NOT be able to detect elevated target behind wall
    });

    test('observer with clear line of sight CAN detect elevated target', () => {
      // Observer with vision and clear line of sight
      const observer = {
        name: 'Ranger',
        document: { elevation: 0 },
        center: { x: 100, y: 100 },
        distanceTo: jest.fn(() => 4),
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'hearing', range: Infinity }
              ]
            }
          }
        }
      };

      // Elevated target
      const target = {
        name: 'Flying Demon',
        document: { elevation: 10 },
        center: { x: 120, y: 120 },
        actor: { system: {} }
      };

      // Mock that observer has vision and clear line of sight
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: true,
        hasDarkvision: false,
        hasLowLightVision: false,
        hearing: { range: Infinity, acuity: 'imprecise' },
        echolocationActive: false,
        scent: null
      });

      // Mock that line of sight is clear
      jest.spyOn(visionAnalyzer, 'hasLineOfSight').mockReturnValue(true);

      const result = visionAnalyzer.canDetectElevatedTarget(observer, target);

      expect(result).toBe(true); // Should be able to detect with clear line of sight
    });

    test('echolocation can detect elevated targets even behind walls', () => {
      // Observer with echolocation (which works through walls)
      const observer = {
        name: 'Bat',
        document: { elevation: 0 },
        center: { x: 100, y: 100 },
        distanceTo: jest.fn(() => 4),
        actor: {
          system: {
            perception: {
              senses: [
                { type: 'echolocation', range: 40 },
                { type: 'hearing', range: Infinity }
              ]
            }
          }
        }
      };

      // Elevated target
      const target = {
        name: 'Flying Target',
        document: { elevation: 8 },
        center: { x: 120, y: 120 },
        actor: { system: {} }
      };

      // Mock echolocation capabilities
      jest.spyOn(visionAnalyzer, 'getVisionCapabilities').mockReturnValue({
        hasVision: false,
        hasDarkvision: false,
        hasLowLightVision: false,
        hearing: { range: Infinity, acuity: 'precise' }, // Precise due to echolocation
        echolocationActive: true,
        echolocationRange: 40,
        scent: null
      });

      // Mock that line of sight is blocked (doesn't matter for echolocation)
      jest.spyOn(visionAnalyzer, 'hasLineOfSight').mockReturnValue(false);

      const result = visionAnalyzer.canDetectElevatedTarget(observer, target);

      expect(result).toBe(true); // Echolocation should work regardless of walls
    });
  });

  // Note: The main fix is in canDetectElevatedTarget, which affects the visibility calculation flow
  // The VisibilityCalculator will now properly detect that tremorsense observers cannot detect
  // elevated targets and will call canSenseImprecisely appropriately, leading to "undetected" 
  // instead of "hidden" for elevated targets behind walls.
});