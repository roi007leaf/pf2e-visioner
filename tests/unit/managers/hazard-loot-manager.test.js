import '../../setup.js';

describe('Hazard/Loot manager helpers', () => {
  beforeEach(() => {
    game.user.isGM = true;
    canvas.tokens.placeables = [];
  });

  test('builds rows for scene loot and hazards with party-level DC', async () => {
    const { getHazardLootManagerRows, getLevelBasedDC, getPartyLevel } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const pc1 = createMockToken({
      id: 'pc-1',
      name: 'PC 1',
      actor: createMockActor({
        type: 'character',
        hasPlayerOwner: true,
        system: { details: { level: { value: 4 } } },
      }),
      flags: { 'pf2e-visioner': { visibility: { loot1: 'hidden' } } },
    });
    const pc2 = createMockToken({
      id: 'pc-2',
      name: 'PC 2',
      actor: createMockActor({
        type: 'character',
        hasPlayerOwner: true,
        system: { details: { level: { value: 5 } } },
      }),
    });
    const loot = createMockToken({
      id: 'loot1',
      name: 'Hidden Chest',
      actor: createMockActor({ type: 'loot' }),
      flags: { 'pf2e-visioner': { stealthDC: 18 } },
    });
    const hazard = createMockToken({
      id: 'hazard1',
      name: 'Spear Trap',
      actor: createMockActor({
        type: 'hazard',
        system: { attributes: { stealth: { dc: 21 } } },
      }),
      flags: { 'pf2e-visioner': { minPerceptionRank: 2 } },
    });
    const npc = createMockToken({
      id: 'npc1',
      name: 'Not Listed',
      actor: createMockActor({ type: 'npc' }),
    });

    const rows = getHazardLootManagerRows({ tokens: [pc1, pc2, loot, hazard, npc] });

    expect(getPartyLevel([pc1, pc2, loot])).toBe(5);
    expect(getLevelBasedDC(5)).toBe(20);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(['loot1', 'hazard1']);
    expect(rows[0]).toMatchObject({
      id: 'loot1',
      name: 'Hidden Chest',
      type: 'loot',
      visibility: 'mixed',
      stealthDC: 18,
      partyDC: 20,
    });
    expect(rows[1]).toMatchObject({
      id: 'hazard1',
      type: 'hazard',
      visibility: 'observed',
      stealthDC: 21,
      minPerceptionRank: 2,
      minPerceptionLabel: 'Expert',
      partyDC: 20,
    });
  });

  test('uses the active PF2E party actor level for party DC when scene ownership is incomplete', async () => {
    const { getHazardLootManagerRows, getPartyLevel } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const previousActors = game.actors;
    const activeParty = createMockActor({
      type: 'party',
      system: { details: { level: { value: 4 }, members: [] } },
    });
    game.actors = { party: activeParty };

    const unownedSceneCharacter = createMockToken({
      id: 'npc-looking-pc',
      name: 'Scene Character Without Player Owner',
      actor: createMockActor({
        type: 'character',
        hasPlayerOwner: false,
        system: { details: { level: { value: 1 } } },
      }),
    });
    const loot = createMockToken({
      id: 'loot1',
      name: 'Hidden Cache',
      actor: createMockActor({ type: 'loot' }),
    });

    try {
      const rows = getHazardLootManagerRows({ tokens: [unownedSceneCharacter, loot] });

      expect(getPartyLevel([unownedSceneCharacter, loot])).toBe(4);
      expect(rows[0]).toMatchObject({
        id: 'loot1',
        partyLevel: 4,
        partyDC: 19,
      });
    } finally {
      game.actors = previousActors;
    }
  });

  test('uses prep default visibility when no player character tokens are on the scene', async () => {
    const { getHazardLootManagerRows } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const loot = createMockToken({
      id: 'loot1',
      name: 'Prepped Cache',
      actor: createMockActor({ type: 'loot' }),
      flags: { 'pf2e-visioner': { defaultPlayerVisibility: 'hidden' } },
    });
    const hazard = createMockToken({
      id: 'hazard1',
      name: 'Unprepped Trap',
      actor: createMockActor({ type: 'hazard' }),
    });

    const rows = getHazardLootManagerRows({ tokens: [loot, hazard] });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === 'loot1')).toMatchObject({ visibility: 'hidden' });
    expect(rows.find((row) => row.id === 'hazard1')).toMatchObject({
      visibility: 'observed',
    });
  });

  test('stores prep visibility defaults when applying with no player character observers', async () => {
    const { applyHazardLootManagerUpdates } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const loot = createMockToken({
      id: 'loot1',
      actor: createMockActor({ type: 'loot' }),
    });
    const hazard = createMockToken({
      id: 'hazard1',
      actor: createMockActor({ type: 'hazard' }),
      flags: { 'pf2e-visioner': { defaultPlayerVisibility: 'hidden' } },
    });

    const result = await applyHazardLootManagerUpdates(
      [
        { tokenId: 'loot1', visibility: 'hidden' },
        { tokenId: 'hazard1', visibility: 'observed' },
      ],
      { tokens: [loot, hazard] },
    );

    expect(result).toEqual({ targets: 2, visibilityPairs: 0, dcUpdates: 0, rankUpdates: 0 });
    expect(loot.document.getFlag('pf2e-visioner', 'defaultPlayerVisibility')).toBe('hidden');
    expect(hazard.document.getFlag('pf2e-visioner', 'defaultPlayerVisibility')).toBeNull();
  });

  test('applies loot stealth DC and hazard proficiency requirement without writing hazard stealth DC', async () => {
    const { applyHazardLootManagerUpdates } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const pc1 = createMockToken({
      id: 'pc-1',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      flags: { 'pf2e-visioner': { visibility: { hazard1: 'hidden' } } },
    });
    const pc2 = createMockToken({
      id: 'pc-2',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      flags: { 'pf2e-visioner': { visibility: { hazard1: 'hidden' } } },
    });
    const loot = createMockToken({
      id: 'loot1',
      actor: createMockActor({ type: 'loot' }),
    });
    const hazard = createMockToken({
      id: 'hazard1',
      actor: createMockActor({ type: 'hazard' }),
      flags: { 'pf2e-visioner': { stealthDC: 22 } },
    });

    const result = await applyHazardLootManagerUpdates(
      [
        { tokenId: 'loot1', visibility: 'hidden', stealthDC: 20 },
        { tokenId: 'hazard1', visibility: 'observed', stealthDC: 30, minPerceptionRank: 3 },
      ],
      { tokens: [pc1, pc2, loot, hazard] },
    );

    expect(result).toEqual({ targets: 2, visibilityPairs: 4, dcUpdates: 1, rankUpdates: 1 });
    expect(pc1.document.getFlag('pf2e-visioner', 'visibility')).toEqual({ loot1: 'hidden' });
    expect(pc2.document.getFlag('pf2e-visioner', 'visibility')).toEqual({ loot1: 'hidden' });
    expect(loot.document.getFlag('pf2e-visioner', 'stealthDC')).toBe(20);
    expect(hazard.document.getFlag('pf2e-visioner', 'stealthDC')).toBe(22);
    expect(hazard.document.getFlag('pf2e-visioner', 'minPerceptionRank')).toBe(3);
  });

  test('row visibility buttons update hidden form state and filtering', async () => {
    const { VisionerHazardLootManager } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const app = Object.create(VisionerHazardLootManager.prototype);
    const root = document.createElement('div');
    root.innerHTML = `
      <form class="pf2e-visioner-hazard-loot-manager">
        <input id="hazard-loot-search" />
        <select id="hazard-loot-type-filter"><option value=""></option></select>
        <select id="hazard-loot-visibility-filter">
          <option value=""></option>
          <option value="observed">Observed</option>
          <option value="hidden">Hidden</option>
        </select>
        <button type="button" id="hazard-loot-clear-filters"></button>
        <span id="hazard-loot-count-visible">1</span>
        <table>
          <tbody>
            <tr data-token-id="loot1" data-token-name="hidden chest" data-token-type="loot" data-visibility="hidden">
              <td>
                <div class="hazard-loot-state-buttons">
                  <input type="hidden" name="token.loot1.visibility" value="hidden" />
                  <button type="button" class="hazard-loot-state-btn" data-state="observed"></button>
                  <button type="button" class="hazard-loot-state-btn active" data-state="hidden"></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    `;

    app._bindSearchAndFilter(root);

    const row = root.querySelector('tr[data-token-id="loot1"]');
    const input = root.querySelector('input[name="token.loot1.visibility"]');
    const observedButton = root.querySelector('.hazard-loot-state-btn[data-state="observed"]');
    const hiddenButton = root.querySelector('.hazard-loot-state-btn[data-state="hidden"]');
    const visibilityFilter = root.querySelector('#hazard-loot-visibility-filter');
    const visibleCount = root.querySelector('#hazard-loot-count-visible');

    observedButton.click();

    expect(input.value).toBe('observed');
    expect(row.dataset.visibility).toBe('observed');
    expect(observedButton.classList.contains('active')).toBe(true);
    expect(hiddenButton.classList.contains('active')).toBe(false);

    visibilityFilter.value = 'hidden';
    visibilityFilter.dispatchEvent(new Event('change'));

    expect(row.style.display).toBe('none');
    expect(visibleCount.textContent).toBe('0');

    visibilityFilter.value = 'observed';
    visibilityFilter.dispatchEvent(new Event('change'));

    expect(row.style.display).toBe('');
    expect(visibleCount.textContent).toBe('1');
  });

  test('bulk action buttons only affect rows in their table section', async () => {
    const { VisionerHazardLootManager } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const app = Object.create(VisionerHazardLootManager.prototype);
    const root = document.createElement('div');
    root.innerHTML = `
      <form class="pf2e-visioner-hazard-loot-manager">
        <section class="hazard-loot-section hazard-loot-section-loot">
          <button type="button" class="loot-hidden" data-action="bulkHidden"></button>
          <button type="button" class="loot-party-dc" data-action="setPartyDC" data-party-dc="18"></button>
          <table><tbody>
            <tr data-token-id="loot1" data-token-name="loot" data-token-type="loot" data-visibility="observed">
              <td>
                <input type="hidden" name="token.loot1.visibility" value="observed" />
                <input type="number" name="token.loot1.dc" value="12" />
                <button type="button" class="hazard-loot-state-btn active" data-state="observed"></button>
                <button type="button" class="hazard-loot-state-btn" data-state="hidden"></button>
              </td>
            </tr>
          </tbody></table>
        </section>
        <section class="hazard-loot-section hazard-loot-section-hazards">
          <button type="button" class="hazard-hidden" data-action="bulkHidden"></button>
          <table><tbody>
            <tr data-token-id="hazard1" data-token-name="hazard" data-token-type="hazard" data-visibility="observed">
              <td>
                <input type="hidden" name="token.hazard1.visibility" value="observed" />
                <button type="button" class="hazard-loot-state-btn active" data-state="observed"></button>
                <button type="button" class="hazard-loot-state-btn" data-state="hidden"></button>
              </td>
            </tr>
          </tbody></table>
        </section>
      </form>
    `;
    app.element = root;

    await VisionerHazardLootManager._onBulkHidden.call(
      app,
      null,
      root.querySelector('.loot-hidden'),
    );
    await VisionerHazardLootManager._onSetPartyDC.call(
      app,
      null,
      root.querySelector('.loot-party-dc'),
    );

    expect(root.querySelector('input[name="token.loot1.visibility"]').value).toBe('hidden');
    expect(root.querySelector('input[name="token.loot1.dc"]').value).toBe('18');
    expect(root.querySelector('input[name="token.hazard1.visibility"]').value).toBe('observed');

    await VisionerHazardLootManager._onBulkHidden.call(
      app,
      null,
      root.querySelector('.hazard-hidden'),
    );

    expect(root.querySelector('input[name="token.hazard1.visibility"]').value).toBe('hidden');
    expect(root.querySelector('input[name="token.loot1.dc"]').value).toBe('18');
  });

  test('rank buttons update hidden proficiency rank state', async () => {
    const { VisionerHazardLootManager } = await import(
      '../../../scripts/managers/hazard-loot-manager/HazardLootManager.js'
    );

    const app = Object.create(VisionerHazardLootManager.prototype);
    const root = document.createElement('div');
    root.innerHTML = `
      <form class="pf2e-visioner-hazard-loot-manager">
        <input id="hazard-loot-search" />
        <select id="hazard-loot-type-filter"><option value=""></option></select>
        <select id="hazard-loot-visibility-filter"><option value=""></option></select>
        <button type="button" id="hazard-loot-clear-filters"></button>
        <span id="hazard-loot-count-visible">1</span>
        <table>
          <tbody>
            <tr data-token-id="hazard1" data-token-name="hazard" data-token-type="hazard" data-visibility="observed">
              <td>
                <input type="hidden" name="token.hazard1.visibility" value="observed" />
                <div class="hazard-loot-rank-buttons">
                  <input type="hidden" name="token.hazard1.minPerceptionRank" value="1" />
                  <button type="button" class="hazard-loot-rank-btn active" data-rank="1"></button>
                  <button type="button" class="hazard-loot-rank-btn" data-rank="3"></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    `;

    app._bindSearchAndFilter(root);

    const input = root.querySelector('input[name="token.hazard1.minPerceptionRank"]');
    const trainedButton = root.querySelector('.hazard-loot-rank-btn[data-rank="1"]');
    const masterButton = root.querySelector('.hazard-loot-rank-btn[data-rank="3"]');

    masterButton.click();

    expect(input.value).toBe('3');
    expect(masterButton.classList.contains('active')).toBe(true);
    expect(trainedButton.classList.contains('active')).toBe(false);
  });
});
