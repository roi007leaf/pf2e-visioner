/**
 * Test: Greater Darkvision feat fallback detection
 * 
 * Verifies that VisionAnalyzer detects Greater Darkvision from feats
 * even when PF2e system doesn't populate actor.system.perception.senses
 */

import { VisionAnalyzer } from '../../scripts/visibility/auto-visibility/VisionAnalyzer.js';

describe('Greater Darkvision Feat Fallback Detection', () => {
  beforeEach(() => {
    VisionAnalyzer.getInstance().clearCache();
  });

  test('detects greater darkvision from feat when not in senses', () => {
    const actor = {
      type: 'character',
      system: {
        perception: {
          senses: {}
        }
      },
      itemTypes: {
        feat: [{ type: 'feat', system: { slug: 'greater-darkvision' } }]
      },
      items: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
      flags: {}
    };

    const token = {
      actor,
      document: { id: 'test-token', getFlag: () => undefined },
      center: { x: 0, y: 0 }
    };

    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);

    expect(caps.hasDarkvision).toBe(true);
    expect(caps.hasGreaterDarkvision).toBe(true);
    expect(caps.darkvisionRange).toBe(Infinity);
  });

  test('detects darkvision from feat when not in senses', () => {
    const actor = {
      type: 'character',
      system: {
        perception: {
          senses: {}
        }
      },
      itemTypes: {
        feat: [{ type: 'feat', system: { slug: 'darkvision' } }]
      },
      items: [{ type: 'feat', system: { slug: 'darkvision' } }],
      flags: {}
    };

    const token = {
      actor,
      document: { id: 'test-token', getFlag: () => undefined },
      center: { x: 0, y: 0 }
    };

    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);

    expect(caps.hasDarkvision).toBe(true);
    expect(caps.hasGreaterDarkvision).toBe(false);
    expect(caps.darkvisionRange).toBe(Infinity);
  });

  test('senses take priority over feats', () => {
    const actor = {
      type: 'character',
      system: {
        perception: {
          senses: {
            'greater-darkvision': { range: 60, acuity: 'precise' }
          }
        }
      },
      itemTypes: {
        feat: [{ type: 'feat', system: { slug: 'greater-darkvision' } }]
      },
      items: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
      flags: {}
    };

    const token = {
      actor,
      document: { id: 'test-token', getFlag: () => undefined },
      center: { x: 0, y: 0 }
    };

    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);

    expect(caps.hasDarkvision).toBe(true);
    expect(caps.hasGreaterDarkvision).toBe(true);
    expect(caps.darkvisionRange).toBe(60);
  });

  test('no darkvision when neither senses nor feats have it', () => {
    const actor = {
      type: 'character',
      system: {
        perception: {
          senses: {}
        }
      },
      itemTypes: {
        feat: []
      },
      items: [],
      flags: {}
    };

    const token = {
      actor,
      document: { id: 'test-token', getFlag: () => undefined },
      center: { x: 0, y: 0 }
    };

    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);

    expect(caps.hasDarkvision).toBe(false);
    expect(caps.hasGreaterDarkvision).toBe(false);
  });

  test('handles missing itemTypes gracefully', () => {
    const actor = {
      type: 'character',
      system: {
        perception: {
          senses: {}
        }
      },
      items: [{ type: 'feat', system: { slug: 'greater-darkvision' } }],
      flags: {}
    };

    const token = {
      actor,
      document: { id: 'test-token', getFlag: () => undefined },
      center: { x: 0, y: 0 }
    };

    const va = VisionAnalyzer.getInstance();
    const caps = va.getVisionCapabilities(token);

    expect(caps.hasDarkvision).toBe(true);
    expect(caps.hasGreaterDarkvision).toBe(true);
  });
});
