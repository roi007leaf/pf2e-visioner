/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VisionAnalyzer } from '../../../scripts/visibility/auto-visibility/VisionAnalyzer.js';
import '../../setup.js';

describe('VisionAnalyzer - Hybrid Vision Consensus Simple', () => {
  let visionAnalyzer;

  beforeEach(() => {
    visionAnalyzer = new VisionAnalyzer();

    global.game = {
      modules: new Map(),
      settings: {
        get: jest.fn((module, key) => {
          if (key === 'disableLineOfSightCalculation') return false;
          return null;
        }),
      },
    };

    global.canvas = {
      walls: {
        placeables: [],
      },
      effects: {
        darknessSources: [],
      },
      grid: {
        size: 100,
      },
      visibility: {
        testVisibility: jest.fn(() => true),
      },
    };

    global.CONST = {
      WALL_SENSE_TYPES: {
        NONE: 0,
        NORMAL: 1,
        LIMITED: 2,
      },
    };

    global.foundry = {
      canvas: {
        geometry: {
          Ray: class Ray {
            constructor(A, B) {
              this.A = A;
              this.B = B;
            }
          },
        },
      },
      utils: {
        lineLineIntersection: jest.fn(() => null),
      },
    };

    global.PIXI = {
      Circle: jest.fn().mockImplementation((x, y, radius) => ({
        x,
        y,
        radius,
      })),
    };
  });

  test('should return true when no walls block line of sight', () => {
    const observer = {
      center: { x: 0, y: 0 },
      vision: null,
      document: { id: 'observer-1', elevation: 0, x: -50, y: -50, width: 1, height: 1 },
      actor: {
        system: {
          perception: { vision: true },
          traits: { size: { value: 'med' } },
        },
      },
    };

    const target = {
      center: { x: 100, y: 0 },
      shape: null,
      document: { elevation: 0, x: 50, y: -50, width: 1, height: 1 },
      actor: {
        system: {
          traits: { size: { value: 'med' } },
        },
      },
    };

    // No walls blocking
    global.canvas.walls.placeables = [];

    const result = visionAnalyzer.hasLineOfSight(observer, target);
    expect(result).toBe(true);
  });
});
