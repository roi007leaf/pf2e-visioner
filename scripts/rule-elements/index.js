/**
 * PF2E Visioner - Rule Elements Index
 * This file handles the registration of custom rule elements
 */

import { api } from '../api.js';
import { getLogger } from '../utils/logger.js';
import { createPF2eVisionerEffectRuleElement } from './PF2eVisionerEffect.js';
export { RuleElementCoverService } from './RuleElementCoverService.js';

// Map to store recent changes to prevent loops
const recentChanges = new Map();

/**
 * Initialize and register custom rule elements
 */
export function initializeRuleElements() {
  try {
    registerRuleElements();
  } catch (_) { }
  Hooks.once('setup', registerRuleElements);
}

/**
 * Register rule elements with PF2e system
 */
let _reRegistered = false;
function registerRuleElements() {
  const log = getLogger('RuleElements/Registration');
  if (_reRegistered) {
    log.debug('registerRuleElements: already registered, skipping');
    return;
  }
  const BaseRuleElement = game.pf2e?.RuleElement ?? game.pf2e?.RuleElementPF2e;
  if (!BaseRuleElement) {
    console.error('PF2E Visioner | PF2e system not ready, rule elements not registered');
    log.debug(() => ({ msg: 'PF2e RuleElement missing', hasPF2e: !!game.pf2e, keys: Object.keys(game.pf2e || {}) }));
    return;
  }

  try {
    // Create the new PF2eVisionerEffect rule element
    log.debug('Creating PF2eVisionerEffect');
    const EffectRuleElement = createPF2eVisionerEffectRuleElement(
      BaseRuleElement,
      foundry.data.fields,
    );

    if (EffectRuleElement) {
      game.pf2e.RuleElements.custom.PF2eVisionerEffect = EffectRuleElement;
      log.debug('Registered PF2eVisionerEffect');

      if (CONFIG.PF2E?.ruleElementTypes) {
        CONFIG.PF2E.ruleElementTypes.PF2eVisionerEffect = 'PF2eVisionerEffect';
      }

      if (game.i18n) {
        const effectKey = 'PF2E.RuleElement.PF2eVisionerEffect';
        if (!game.i18n.has(effectKey)) {
          game.i18n.translations.PF2E = game.i18n.translations.PF2E || {};
          game.i18n.translations.PF2E.RuleElement = game.i18n.translations.PF2E.RuleElement || {};
          game.i18n.translations.PF2E.RuleElement.PF2eVisionerEffect = 'PF2e Visioner Effect';
        }
      }
    }

    _reRegistered = true;
    log.debug('registerRuleElements: completed');
  } catch (error) {
    console.error('PF2E Visioner | Error registering rule elements:', error);
  }
}

