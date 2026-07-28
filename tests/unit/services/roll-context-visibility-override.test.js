import { describe, expect, it } from '@jest/globals';

describe('roll-context visibility override', () => {
  it('temporarily exposes the target visibility state only for the matching attack', async () => {
    const { getActiveRollContextVisibilityOverride, withRollContextVisibilityOverride } =
      await import('../../../scripts/services/roll-context-visibility-override.js');
    const { Pf2eVisionerApi } = await import('../../../scripts/api.js');
    const attacker = global.createMockToken({ id: 'attacker' });
    const defender = global.createMockToken({ id: 'defender' });
    global.canvas.tokens.get = (id) => ({ attacker, defender })[id] ?? null;
    const context = {
      type: 'attack-roll',
      options: new Set(['attack-roll', 'target:condition:concealed']),
      origin: { token: attacker },
      target: { token: defender },
    };

    expect(getActiveRollContextVisibilityOverride('attacker', 'defender')).toBeNull();

    await withRollContextVisibilityOverride(context, async () => {
      expect(getActiveRollContextVisibilityOverride('attacker', 'defender')).toEqual({
        state: 'concealed',
        source: 'roll-context',
      });
      expect(getActiveRollContextVisibilityOverride('other', 'defender')).toBeNull();
      expect(Pf2eVisionerApi.getVisibility('attacker', 'defender')).toBe('concealed');
      await expect(Pf2eVisionerApi.getVisibilityFactors('attacker', 'defender')).resolves.toEqual({
        state: 'concealed',
        lighting: null,
        reasons: [],
        slugs: ['concealed'],
      });
    });

    expect(getActiveRollContextVisibilityOverride('attacker', 'defender')).toBeNull();
  });

  it('uses the most restrictive contextual target state and clears after errors', async () => {
    const { getActiveRollContextVisibilityOverride, withRollContextVisibilityOverride } =
      await import('../../../scripts/services/roll-context-visibility-override.js');
    const context = {
      type: 'attack-roll',
      options: ['target:condition:concealed', 'target:condition:hidden'],
      origin: { token: { document: { id: 'attacker' } } },
      target: { token: { document: { id: 'defender' } } },
    };

    await expect(
      withRollContextVisibilityOverride(context, async () => {
        expect(getActiveRollContextVisibilityOverride('attacker', 'defender')?.state).toBe(
          'hidden',
        );
        throw new Error('cancelled roll');
      }),
    ).rejects.toThrow('cancelled roll');

    expect(getActiveRollContextVisibilityOverride('attacker', 'defender')).toBeNull();
  });
});
