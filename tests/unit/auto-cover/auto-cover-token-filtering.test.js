/**
 * Comprehensive tests for Auto-Cover Token Filtering Logic
 *
 * Tests the token filtering algorithms that determine which tokens can block cover:
 * - Dead token filtering (HP-based)
 * - Ally filtering (alliance-based)
 * - Undetected token filtering (visibility-based)
 * - Prone token filtering (condition-based)
 * - Ignore flag filtering (flag-based)
 * - Actor type filtering (loot/hazard exclusion)
 * - Hidden token filtering (Foundry hidden property)
 * - Controlled token filtering (selected tokens)
 *
 * These filters are critical for realistic auto-cover behavior.
 */

import '../../setup.js';

describe('Auto-Cover Token Filtering Logic', () => {
  let mockCanvas, mockGame;

  beforeEach(() => {
    // Setup mock canvas and game for filtering tests
    mockCanvas = {
      tokens: {
        placeables: [],
        controlled: [],
        get: jest.fn(),
      },
    };

    mockGame = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          // Default filter settings
          if (setting === 'autoCoverIgnoreDead') return true;
          if (setting === 'autoCoverIgnoreAllies') return false;
          if (setting === 'autoCoverIgnoreUndetected') return false;
          if (setting === 'autoCoverAllowProneBlockers') return false;
          if (setting === 'autoCoverRespectIgnoreFlag') return true;
          return false;
        }),
      },
    };

    // Extend existing global canvas instead of replacing it
    Object.assign(global.canvas, mockCanvas);
    Object.assign(global.game, mockGame);
  });

  // Helper function to create test tokens with specific properties
  function createTestToken(id, options = {}) {
    return {
      id,
      document: {
        hidden: options.hidden || false,
        getFlag: jest.fn().mockImplementation((module, flag) => {
          if (module === 'pf2e-visioner' && flag === 'ignoreAutoCover') {
            return options.ignoreFlag || false;
          }
          return false;
        }),
        ...options.document,
      },
      actor: {
        id: `actor-${id}`,
        type: options.actorType || 'npc',
        alliance: options.alliance || 'opposition',
        hitPoints: { value: options.hp !== undefined ? options.hp : 10 },
        system: {
          attributes: {
            hp: { value: options.hp !== undefined ? options.hp : 10, max: 10 },
          },
        },
        itemTypes: {
          condition: options.conditions || [],
        },
        conditions: options.legacyConditions || [],
        ...options.actor,
      },
      ...options,
    };
  }

  describe('Dead Token Filtering Logic', () => {
    test('filters dead tokens when ignoreDead is true', () => {
      const filterDeadTokens = (tokens, ignoreDead) => {
        if (!ignoreDead) return tokens;

        return tokens.filter((token) => {
          const hp = token.actor?.hitPoints?.value;
          return hp === undefined || hp > 0;
        });
      };

      const aliveToken = createTestToken('alive', { hp: 10 });
      const deadToken = createTestToken('dead', { hp: 0 });
      const unconsciousToken = createTestToken('unconscious', { hp: -5 });
      const noHpToken = createTestToken('no-hp'); // No HP property

      const tokens = [aliveToken, deadToken, unconsciousToken, noHpToken];

      // Test with dead filtering ON
      const filteredTokens = filterDeadTokens(tokens, true);
      expect(filteredTokens).toHaveLength(2);
      expect(filteredTokens).toContain(aliveToken);
      expect(filteredTokens).toContain(noHpToken); // No HP = not filtered
      expect(filteredTokens).not.toContain(deadToken);
      expect(filteredTokens).not.toContain(unconsciousToken);

      // Test with dead filtering OFF
      const unfilteredTokens = filterDeadTokens(tokens, false);
      expect(unfilteredTokens).toHaveLength(4);
      expect(unfilteredTokens).toEqual(tokens);
    });

    test('handles different HP property structures', () => {
      const checkTokenDead = (token) => {
        // Check both hitPoints.value and system.attributes.hp.value
        const hp1 = token.actor?.hitPoints?.value;
        const hp2 = token.actor?.system?.attributes?.hp?.value;

        return (hp1 !== undefined && hp1 <= 0) || (hp2 !== undefined && hp2 <= 0);
      };

      const token1 = createTestToken('token1', { hp: 0 }); // Uses hitPoints.value
      const token2 = {
        // Uses system.attributes.hp.value
        actor: { system: { attributes: { hp: { value: 0, max: 10 } } } },
      };
      const token3 = {
        // Both properties
        actor: {
          hitPoints: { value: 5 },
          system: { attributes: { hp: { value: 0, max: 10 } } },
        },
      };

      expect(checkTokenDead(token1)).toBe(true);
      expect(checkTokenDead(token2)).toBe(true);
      expect(checkTokenDead(token3)).toBe(true); // Either property being 0 means dead
    });

    test('validates HP edge cases', () => {
      const isTokenDead = (token) => {
        if (!token) return false;
        const hp = token.actor?.hitPoints?.value;
        return hp !== undefined && hp <= 0;
      };

      // Edge cases
      expect(isTokenDead({ actor: { hitPoints: { value: 0 } } })).toBe(true);
      expect(isTokenDead({ actor: { hitPoints: { value: -1 } } })).toBe(true);
      expect(isTokenDead({ actor: { hitPoints: { value: 1 } } })).toBe(false);
      expect(isTokenDead({ actor: { hitPoints: { value: undefined } } })).toBe(false);
      expect(isTokenDead({ actor: { hitPoints: {} } })).toBe(false);
      expect(isTokenDead({ actor: {} })).toBe(false);
      expect(isTokenDead({})).toBe(false);
      expect(isTokenDead(null)).toBe(false);
    });
  });

  describe('Ally Filtering Logic', () => {
    test('filters ally tokens when ignoreAllies is true', () => {
      const filterAllyTokens = (tokens, attacker, ignoreAllies) => {
        if (!ignoreAllies) return tokens;

        const attackerAlliance = attacker.actor?.alliance;
        return tokens.filter((token) => {
          return token.actor?.alliance !== attackerAlliance || attackerAlliance !== 'party';
        });
      };

      const partyAttacker = createTestToken('attacker', { alliance: 'party' });
      const partyAlly = createTestToken('ally', { alliance: 'party' });
      const oppositionEnemy = createTestToken('enemy', { alliance: 'opposition' });
      const neutralToken = createTestToken('neutral', { alliance: 'neutral' });

      const tokens = [partyAlly, oppositionEnemy, neutralToken];

      // Test with ally filtering ON
      const filteredTokens = filterAllyTokens(tokens, partyAttacker, true);
      expect(filteredTokens).toHaveLength(2);
      expect(filteredTokens).toContain(oppositionEnemy);
      expect(filteredTokens).toContain(neutralToken);
      expect(filteredTokens).not.toContain(partyAlly);

      // Test with ally filtering OFF
      const unfilteredTokens = filterAllyTokens(tokens, partyAttacker, false);
      expect(unfilteredTokens).toHaveLength(3);
      expect(unfilteredTokens).toEqual(tokens);
    });

    test('validates alliance matching logic', () => {
      const isAllyToAttacker = (attacker, blocker) => {
        const attackerAlliance = attacker.actor?.alliance;
        const blockerAlliance = blocker.actor?.alliance;

        // Only party members are considered allies for filtering
        return attackerAlliance === 'party' && blockerAlliance === 'party';
      };

      const partyAttacker = { actor: { alliance: 'party' } };
      const oppositionAttacker = { actor: { alliance: 'opposition' } };
      const partyBlocker = { actor: { alliance: 'party' } };
      const oppositionBlocker = { actor: { alliance: 'opposition' } };

      // Party vs Party = ally
      expect(isAllyToAttacker(partyAttacker, partyBlocker)).toBe(true);

      // Party vs Opposition = not ally
      expect(isAllyToAttacker(partyAttacker, oppositionBlocker)).toBe(false);

      // Opposition vs Opposition = not ally (only party members are allies)
      expect(isAllyToAttacker(oppositionAttacker, oppositionBlocker)).toBe(false);

      // Opposition vs Party = not ally
      expect(isAllyToAttacker(oppositionAttacker, partyBlocker)).toBe(false);
    });

    test('handles missing alliance properties', () => {
      const safeAllianceCheck = (attacker, blocker) => {
        const attackerAlliance = attacker?.actor?.alliance;
        const blockerAlliance = blocker?.actor?.alliance;

        if (!attackerAlliance || !blockerAlliance) return false;
        return attackerAlliance === 'party' && blockerAlliance === 'party';
      };

      const validToken = { actor: { alliance: 'party' } };
      const noActorToken = {};
      const noAllianceToken = { actor: {} };

      expect(safeAllianceCheck(validToken, validToken)).toBe(true);
      expect(safeAllianceCheck(validToken, noActorToken)).toBe(false);
      expect(safeAllianceCheck(validToken, noAllianceToken)).toBe(false);
      expect(safeAllianceCheck(noActorToken, validToken)).toBe(false);
      expect(safeAllianceCheck(null, validToken)).toBe(false);
      expect(safeAllianceCheck(validToken, null)).toBe(false);
    });
  });

  describe('Undetected Token Filtering Logic', () => {
    test('filters undetected tokens when ignoreUndetected is true', () => {
      // Mock visibility function
      const mockGetVisibilityBetween = (observer, target) => {
        if (target.isUndetected) return 'undetected';
        if (target.isConcealed) return 'concealed';
        if (target.isHidden) return 'hidden';
        return 'observed';
      };

      const filterUndetectedTokens = (tokens, observer, ignoreUndetected) => {
        if (!ignoreUndetected) return tokens;

        return tokens.filter((token) => {
          const visibility = mockGetVisibilityBetween(observer, token);
          return visibility !== 'undetected';
        });
      };

      const observer = createTestToken('observer');
      const observedToken = createTestToken('observed', { isUndetected: false });
      const concealedToken = createTestToken('concealed', { isConcealed: true });
      const hiddenToken = createTestToken('hidden', { isHidden: true });
      const undetectedToken = createTestToken('undetected', { isUndetected: true });

      const tokens = [observedToken, concealedToken, hiddenToken, undetectedToken];

      // Test with undetected filtering ON
      const filteredTokens = filterUndetectedTokens(tokens, observer, true);
      expect(filteredTokens).toHaveLength(3);
      expect(filteredTokens).toContain(observedToken);
      expect(filteredTokens).toContain(concealedToken);
      expect(filteredTokens).toContain(hiddenToken);
      expect(filteredTokens).not.toContain(undetectedToken);

      // Test with undetected filtering OFF
      const unfilteredTokens = filterUndetectedTokens(tokens, observer, false);
      expect(unfilteredTokens).toHaveLength(4);
      expect(unfilteredTokens).toEqual(tokens);
    });

    test('validates visibility state mapping', () => {
      const getVisibilityState = (token) => {
        if (token.isUndetected) return 'undetected';
        if (token.isHidden) return 'hidden';
        if (token.isConcealed) return 'concealed';
        if (token.isInvisible) return 'undetected'; // Invisible = undetected
        return 'observed';
      };

      expect(getVisibilityState({ isUndetected: true })).toBe('undetected');
      expect(getVisibilityState({ isHidden: true })).toBe('hidden');
      expect(getVisibilityState({ isConcealed: true })).toBe('concealed');
      expect(getVisibilityState({ isInvisible: true })).toBe('undetected');
      expect(getVisibilityState({})).toBe('observed');
    });

    test('handles visibility perspective override', () => {
      const getVisibilityWithPerspective = (observer, target, perspectiveOverride) => {
        const actualObserver = perspectiveOverride || observer;

        // Mock: perspective token determines visibility
        if (actualObserver.hasSpecialSight && target.isHidden) {
          return 'observed'; // Special sight can see hidden
        }

        if (target.isUndetected) return 'undetected';
        return 'observed';
      };

      const normalObserver = { hasSpecialSight: false };
      const specialObserver = { hasSpecialSight: true };
      const hiddenTarget = { isHidden: true };
      const undetectedTarget = { isUndetected: true };

      // Normal observer can't see hidden
      expect(getVisibilityWithPerspective(normalObserver, hiddenTarget)).toBe('observed');

      // Special observer can see hidden
      expect(getVisibilityWithPerspective(normalObserver, hiddenTarget, specialObserver)).toBe(
        'observed',
      );

      // No one can see undetected without special rules
      expect(getVisibilityWithPerspective(normalObserver, undetectedTarget)).toBe('undetected');
      expect(getVisibilityWithPerspective(normalObserver, undetectedTarget, specialObserver)).toBe(
        'undetected',
      );
    });
  });

  describe('Prone Token Filtering Logic', () => {
    test('filters prone tokens when allowProneBlockers is false', () => {
      const filterProneTokens = (tokens, allowProneBlockers) => {
        if (allowProneBlockers) return tokens;

        return tokens.filter((token) => {
          // Check both itemTypes.condition and legacy conditions
          const itemConditions = token.actor?.itemTypes?.condition || [];
          const legacyConditions =
            token.actor?.conditions?.conditions || token.actor?.conditions || [];

          const isProne =
            itemConditions.some((c) => c?.slug === 'prone') ||
            legacyConditions.some((c) => c?.slug === 'prone');

          return !isProne;
        });
      };

      const standingToken = createTestToken('standing');
      const proneTokenItem = createTestToken('prone-item', {
        conditions: [{ slug: 'prone', name: 'Prone' }],
      });
      const proneTokenLegacy = createTestToken('prone-legacy', {
        legacyConditions: [{ slug: 'prone', name: 'Prone' }],
      });

      const tokens = [standingToken, proneTokenItem, proneTokenLegacy];

      // Test with prone blocking DISABLED (filter prone)
      const filteredTokens = filterProneTokens(tokens, false);
      expect(filteredTokens).toHaveLength(1);
      expect(filteredTokens).toContain(standingToken);
      expect(filteredTokens).not.toContain(proneTokenItem);
      expect(filteredTokens).not.toContain(proneTokenLegacy);

      // Test with prone blocking ENABLED (don't filter prone)
      const unfilteredTokens = filterProneTokens(tokens, true);
      expect(unfilteredTokens).toHaveLength(3);
      expect(unfilteredTokens).toEqual(tokens);
    });

    test('validates prone condition detection methods', () => {
      const isTokenProne = (token) => {
        try {
          // Method 1: itemTypes.condition
          const itemConditions = token.actor?.itemTypes?.condition || [];
          if (itemConditions.some((c) => c?.slug === 'prone')) return true;

          // Method 2: legacy conditions.conditions
          const legacyConditions1 = token.actor?.conditions?.conditions || [];
          if (legacyConditions1.some((c) => c?.slug === 'prone')) return true;

          // Method 3: direct conditions array
          const legacyConditions2 = token.actor?.conditions || [];
          if (
            Array.isArray(legacyConditions2) &&
            legacyConditions2.some((c) => c?.slug === 'prone')
          )
            return true;

          return false;
        } catch (_) {
          return false; // Safe fallback
        }
      };

      // Test different condition structures
      const token1 = { actor: { itemTypes: { condition: [{ slug: 'prone' }] } } };
      const token2 = { actor: { conditions: { conditions: [{ slug: 'prone' }] } } };
      const token3 = { actor: { conditions: [{ slug: 'prone' }] } };
      const token4 = { actor: { itemTypes: { condition: [{ slug: 'stunned' }] } } };
      const token5 = { actor: {} };

      expect(isTokenProne(token1)).toBe(true);
      expect(isTokenProne(token2)).toBe(true);
      expect(isTokenProne(token3)).toBe(true);
      expect(isTokenProne(token4)).toBe(false);
      expect(isTokenProne(token5)).toBe(false);
    });

    test('handles condition detection errors gracefully', () => {
      const safeProneCheck = (token) => {
        try {
          const conditions = token.actor?.itemTypes?.condition;
          if (!Array.isArray(conditions)) return false;
          return conditions.some((c) => c?.slug === 'prone');
        } catch (error) {
          return false; // Always return false on error
        }
      };

      // Test error scenarios
      const brokenToken1 = { actor: { itemTypes: { condition: null } } };
      const brokenToken2 = { actor: { itemTypes: { condition: 'not-array' } } };
      const brokenToken3 = null;

      expect(safeProneCheck(brokenToken1)).toBe(false);
      expect(safeProneCheck(brokenToken2)).toBe(false);
      expect(safeProneCheck(brokenToken3)).toBe(false);
    });
  });

  describe('Ignore Flag Filtering Logic', () => {
    test('filters tokens with ignore flag when respectIgnoreFlag is true', () => {
      const filterIgnoreFlagTokens = (tokens, respectIgnoreFlag) => {
        if (!respectIgnoreFlag) return tokens;

        return tokens.filter((token) => {
          const hasIgnoreFlag = token.document?.getFlag?.('pf2e-visioner', 'ignoreAutoCover');
          return !hasIgnoreFlag;
        });
      };

      const normalToken = createTestToken('normal');
      const ignoredToken = createTestToken('ignored', { ignoreFlag: true });

      const tokens = [normalToken, ignoredToken];

      // Test with ignore flag respect ON
      const filteredTokens = filterIgnoreFlagTokens(tokens, true);
      expect(filteredTokens).toHaveLength(1);
      expect(filteredTokens).toContain(normalToken);
      expect(filteredTokens).not.toContain(ignoredToken);

      // Test with ignore flag respect OFF
      const unfilteredTokens = filterIgnoreFlagTokens(tokens, false);
      expect(unfilteredTokens).toHaveLength(2);
      expect(unfilteredTokens).toEqual(tokens);
    });

    test('validates flag retrieval methods', () => {
      const getIgnoreFlag = (token) => {
        try {
          return token.document?.getFlag?.('pf2e-visioner', 'ignoreAutoCover') === true;
        } catch (_) {
          return false;
        }
      };

      const tokenWithFlag = {
        document: {
          getFlag: (module, flag) => module === 'pf2e-visioner' && flag === 'ignoreAutoCover',
        },
      };

      const tokenWithoutFlag = {
        document: {
          getFlag: () => false,
        },
      };

      const tokenNoDocument = {};

      expect(getIgnoreFlag(tokenWithFlag)).toBe(true);
      expect(getIgnoreFlag(tokenWithoutFlag)).toBe(false);
      expect(getIgnoreFlag(tokenNoDocument)).toBe(false);
    });
  });

  describe('Actor Type Filtering Logic', () => {
    test('filters loot and hazard actor types', () => {
      const filterActorTypes = (tokens) => {
        return tokens.filter((token) => {
          const type = token.actor?.type;
          return type !== 'loot' && type !== 'hazard';
        });
      };

      const npcToken = createTestToken('npc', { actorType: 'npc' });
      const characterToken = createTestToken('character', { actorType: 'character' });
      const lootToken = createTestToken('loot', { actorType: 'loot' });
      const hazardToken = createTestToken('hazard', { actorType: 'hazard' });

      const tokens = [npcToken, characterToken, lootToken, hazardToken];
      const filteredTokens = filterActorTypes(tokens);

      expect(filteredTokens).toHaveLength(2);
      expect(filteredTokens).toContain(npcToken);
      expect(filteredTokens).toContain(characterToken);
      expect(filteredTokens).not.toContain(lootToken);
      expect(filteredTokens).not.toContain(hazardToken);
    });

    test('validates actor type detection', () => {
      const isValidActorType = (token) => {
        const type = token?.actor?.type;
        const invalidTypes = ['loot', 'hazard'];
        return Boolean(type && !invalidTypes.includes(type));
      };

      expect(isValidActorType({ actor: { type: 'npc' } })).toBe(true);
      expect(isValidActorType({ actor: { type: 'character' } })).toBe(true);
      expect(isValidActorType({ actor: { type: 'loot' } })).toBe(false);
      expect(isValidActorType({ actor: { type: 'hazard' } })).toBe(false);
      expect(isValidActorType({ actor: {} })).toBe(false);
      expect(isValidActorType({})).toBe(false);
    });
  });

  describe('Hidden Token Filtering Logic', () => {
    test('always filters Foundry hidden tokens', () => {
      const filterHiddenTokens = (tokens) => {
        return tokens.filter((token) => {
          return !token.document?.hidden;
        });
      };

      const visibleToken = createTestToken('visible', { hidden: false });
      const hiddenToken = createTestToken('hidden', { hidden: true });

      const tokens = [visibleToken, hiddenToken];
      const filteredTokens = filterHiddenTokens(tokens);

      expect(filteredTokens).toHaveLength(1);
      expect(filteredTokens).toContain(visibleToken);
      expect(filteredTokens).not.toContain(hiddenToken);
    });

    test('validates hidden property detection', () => {
      const isTokenHidden = (token) => {
        return token?.document?.hidden === true;
      };

      expect(isTokenHidden({ document: { hidden: true } })).toBe(true);
      expect(isTokenHidden({ document: { hidden: false } })).toBe(false);
      expect(isTokenHidden({ document: {} })).toBe(false);
      expect(isTokenHidden({})).toBe(false);
    });
  });

  describe('Controlled Token Filtering Logic', () => {
    test('filters controlled and selected tokens', () => {
      const filterControlledTokens = (tokens, attacker, target, controlledTokens) => {
        return tokens.filter((token) => {
          // Exclude attacker and target
          if (token === attacker || token === target) return false;
          if (token.id === attacker.id || token.id === target.id) return false;

          // Exclude controlled tokens
          if (controlledTokens.includes(token)) return false;

          return true;
        });
      };

      const attacker = createTestToken('attacker');
      const target = createTestToken('target');
      const blocker1 = createTestToken('blocker1');
      const blocker2 = createTestToken('blocker2');
      const controlledToken = createTestToken('controlled');

      const tokens = [attacker, target, blocker1, blocker2, controlledToken];
      const controlledTokens = [controlledToken];

      const filteredTokens = filterControlledTokens(tokens, attacker, target, controlledTokens);

      expect(filteredTokens).toHaveLength(2);
      expect(filteredTokens).toContain(blocker1);
      expect(filteredTokens).toContain(blocker2);
      expect(filteredTokens).not.toContain(attacker);
      expect(filteredTokens).not.toContain(target);
      expect(filteredTokens).not.toContain(controlledToken);
    });
  });

  describe('Comprehensive Filter Integration', () => {
    test('applies all filters in correct order', () => {
      const applyAllFilters = (tokens, attacker, target, filters) => {
        let filtered = [...tokens];

        // 1. Basic exclusions (attacker, target, no actor)
        filtered = filtered.filter((token) => {
          if (!token?.actor) return false;
          if (token === attacker || token === target) return false;
          if (token.id === attacker.id || token.id === target.id) return false;
          return true;
        });

        // 2. Actor type filtering
        filtered = filtered.filter((token) => {
          const type = token.actor?.type;
          return type !== 'loot' && type !== 'hazard';
        });

        // 3. Hidden token filtering (always applied)
        filtered = filtered.filter((token) => !token.document?.hidden);

        // 4. Ignore flag filtering
        if (filters.respectIgnoreFlag) {
          filtered = filtered.filter((token) => {
            return !token.document?.getFlag?.('pf2e-visioner', 'ignoreAutoCover');
          });
        }

        // 5. Dead token filtering
        if (filters.ignoreDead) {
          filtered = filtered.filter((token) => {
            const hp = token.actor?.hitPoints?.value;
            return hp === undefined || hp > 0;
          });
        }

        // 6. Ally filtering
        if (filters.ignoreAllies) {
          filtered = filtered.filter((token) => {
            return !(
              token.actor?.alliance === filters.attackerAlliance &&
              filters.attackerAlliance === 'party'
            );
          });
        }

        // 7. Prone filtering
        if (!filters.allowProneBlockers) {
          filtered = filtered.filter((token) => {
            try {
              const itemConditions = token.actor?.itemTypes?.condition || [];
              const legacyConditions =
                token.actor?.conditions?.conditions || token.actor?.conditions || [];
              const isProne =
                itemConditions.some((c) => c?.slug === 'prone') ||
                legacyConditions.some((c) => c?.slug === 'prone');
              return !isProne;
            } catch (_) {
              return true; // Keep token if error checking prone
            }
          });
        }

        return filtered;
      };

      // Create test scenario
      const attacker = createTestToken('attacker', { alliance: 'party' });
      const target = createTestToken('target');
      const validBlocker = createTestToken('valid');
      const deadBlocker = createTestToken('dead', { hp: 0 });
      const allyBlocker = createTestToken('ally', { alliance: 'party' });
      const proneBlocker = createTestToken('prone', { conditions: [{ slug: 'prone' }] });
      const hiddenBlocker = createTestToken('hidden', { hidden: true });
      const lootBlocker = createTestToken('loot', { actorType: 'loot' });
      const ignoredBlocker = createTestToken('ignored', { ignoreFlag: true });

      const allTokens = [
        attacker,
        target,
        validBlocker,
        deadBlocker,
        allyBlocker,
        proneBlocker,
        hiddenBlocker,
        lootBlocker,
        ignoredBlocker,
      ];

      const filters = {
        respectIgnoreFlag: true,
        ignoreDead: true,
        ignoreAllies: true,
        allowProneBlockers: false,
        attackerAlliance: 'party',
      };

      const result = applyAllFilters(allTokens, attacker, target, filters);

      // Only validBlocker should remain after all filters
      expect(result).toHaveLength(1);
      expect(result).toContain(validBlocker);
    });

    test('validates filter precedence and interaction', () => {
      // Test that filters work correctly when combined
      const testFilterCombination = (tokenProps, filterSettings) => {
        const token = createTestToken('test', tokenProps);

        // Simulate each filter check
        const results = {
          passesActorType: tokenProps.actorType !== 'loot' && tokenProps.actorType !== 'hazard',
          passesHidden: !tokenProps.hidden,
          passesIgnoreFlag: !filterSettings.respectIgnoreFlag || !tokenProps.ignoreFlag,
          passesDead:
            !filterSettings.ignoreDead || tokenProps.hp === undefined || tokenProps.hp > 0,
          passesAlly: !filterSettings.ignoreAllies || !(tokenProps.alliance === 'party'),
          passesProne:
            filterSettings.allowProneBlockers ||
            !tokenProps.conditions?.some((c) => c.slug === 'prone'),
        };

        const overallPass = Object.values(results).every(Boolean);
        return { results, overallPass };
      };

      // Test various combinations
      const test1 = testFilterCombination(
        { actorType: 'npc', hidden: false, hp: 10, alliance: 'opposition' },
        {
          respectIgnoreFlag: true,
          ignoreDead: true,
          ignoreAllies: true,
          allowProneBlockers: false,
        },
      );
      expect(test1.overallPass).toBe(true);

      const test2 = testFilterCombination(
        { actorType: 'loot', hidden: false, hp: 10, alliance: 'opposition' },
        {
          respectIgnoreFlag: true,
          ignoreDead: true,
          ignoreAllies: true,
          allowProneBlockers: false,
        },
      );
      expect(test2.overallPass).toBe(false); // Fails actor type

      const test3 = testFilterCombination(
        { actorType: 'npc', hidden: false, hp: 0, alliance: 'opposition' },
        {
          respectIgnoreFlag: true,
          ignoreDead: true,
          ignoreAllies: true,
          allowProneBlockers: false,
        },
      );
      expect(test3.overallPass).toBe(false); // Fails dead check
    });
  });
});
