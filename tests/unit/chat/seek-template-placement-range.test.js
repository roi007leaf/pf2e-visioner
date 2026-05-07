import '../../setup.js';

describe('Seek template placement range', () => {
  beforeEach(() => {
    global.canvas = {
      scene: { grid: { size: 100, distance: 5 } },
      grid: { grid: { size: 100, distance: 5 } },
    };
    game.settings.set('pf2e-visioner', 'seekTemplateMaxPlacementDistance', 0);
  });

  test('clamps the template center to the configured range regardless of burst radius', async () => {
    const { clampSeekTemplatePlacement } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );
    game.settings.set('pf2e-visioner', 'seekTemplateMaxPlacementDistance', 30);

    const result = clampSeekTemplatePlacement(
      { actor: { center: { x: 0, y: 0 } } },
      { x: 700, y: 0 },
      { radiusFeet: 15 },
    );

    expect(result.clamped).toBe(true);
    expect(result.center).toEqual({ x: 600, y: 0 });
    expect(result.distanceFeet).toBe(30);
    expect(result.centerMaxDistanceFeet).toBe(30);
  });

  test('accepts a clamped placement instead of rejecting the original pointer distance', async () => {
    const { clampSeekTemplatePlacement, validateSeekTemplatePlacement } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );
    game.settings.set('pf2e-visioner', 'seekTemplateMaxPlacementDistance', 30);

    const clamped = clampSeekTemplatePlacement(
      { actor: { center: { x: 0, y: 0 } } },
      { x: 700, y: 0 },
      { radiusFeet: 15 },
    );
    const originalValidation = validateSeekTemplatePlacement(
      { actor: { center: { x: 0, y: 0 } } },
      { x: 700, y: 0 },
      { radiusFeet: 15 },
    );
    const clampedValidation = validateSeekTemplatePlacement(
      { actor: { center: { x: 0, y: 0 } } },
      clamped.center,
      { radiusFeet: 15 },
    );

    expect(originalValidation.allowed).toBe(false);
    expect(clampedValidation.allowed).toBe(true);
  });

  test('normalizes a created template state to the range edge before validation', async () => {
    const { normalizeSeekTemplatePlacement } = await import(
      '../../../scripts/chat/services/preview/seek-template.js'
    );
    game.settings.set('pf2e-visioner', 'seekTemplateMaxPlacementDistance', 30);

    const result = normalizeSeekTemplatePlacement(
      { actor: { center: { x: 0, y: 0 } } },
      { center: { x: 700, y: 0 }, radiusFeet: 15, templateType: 'circle', levels: [] },
    );

    expect(result.clamped).toBe(true);
    expect(result.templateState.center).toEqual({ x: 600, y: 0 });
  });
});
