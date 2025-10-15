/**
 * PF2E Visioner - Rule Elements Index
 * This file handles the registration of custom rule elements
 */

import { api } from '../api.js';
import { createPF2eVisionerEffectRuleElement } from './PF2eVisionerEffect.js';

// Map to store recent changes to prevent loops
const recentChanges = new Map();

/**
 * Initialize and register custom rule elements
 */
export function initializeRuleElements() {
  Hooks.once('ready', registerRuleElements);
}

/**
 * Register rule elements with PF2e system
 */
function registerRuleElements() {
  if (!game.pf2e?.RuleElement) {
    console.error('PF2E Visioner | PF2e system not ready, rule elements not registered');
    return;
  }

  try {
    // Create the rule element class
    const VisibilityRuleElement = createVisibilityRuleElement(
      game.pf2e.RuleElement,
      foundry.data.fields,
    );

    if (!VisibilityRuleElement) return;

    // Register with PF2e
    game.pf2e.RuleElements.custom.PF2eVisionerVisibility = VisibilityRuleElement;

    // Add to UI dropdown
    if (CONFIG.PF2E?.ruleElementTypes) {
      CONFIG.PF2E.ruleElementTypes.PF2eVisionerVisibility = 'PF2eVisionerVisibility';
    }

    // Add translations
    if (game.i18n) {
      const key = 'PF2E.RuleElement.PF2eVisionerVisibility';
      if (!game.i18n.has(key)) {
        game.i18n.translations.PF2E = game.i18n.translations.PF2E || {};
        game.i18n.translations.PF2E.RuleElement = game.i18n.translations.PF2E.RuleElement || {};
        game.i18n.translations.PF2E.RuleElement.PF2eVisionerVisibility = 'PF2e Visioner Visibility';
      }
    }

    // Create the new PF2eVisionerEffect rule element
    const EffectRuleElement = createPF2eVisionerEffectRuleElement(
      game.pf2e.RuleElement,
      foundry.data.fields,
    );

    if (EffectRuleElement) {
      game.pf2e.RuleElements.custom.PF2eVisionerEffect = EffectRuleElement;

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

    // Add global test function
    if (window.PF2EVisioner) {
      window.PF2EVisioner.createVisibilityRuleElementExample = createVisibilityRuleElementExample;
    }
  } catch (error) {
    console.error('PF2E Visioner | Error registering rule elements:', error);
  }
}

/**
 * Factory function to create the VisibilityRuleElement class
 */
function createVisibilityRuleElement(baseRuleElementClass, fields) {
  if (!baseRuleElementClass || !fields) {
    console.error('PF2E Visioner | Missing dependencies for VisibilityRuleElement creation');
    return null;
  }

  return class VisibilityRuleElement extends baseRuleElementClass {
    // Static properties for documentation
    static get name() {
      return 'PF2eVisionerVisibility';
    }
    static get documentation() {
      return 'https://github.com/roileaf/pf2e-visioner/blob/main/RULE_ELEMENTS.md#pf2evisioner-visibility-rule-element';
    }
    static get description() {
      return game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.DESCRIPTION');
    }
    static get defaultKey() {
      return 'PF2eVisionerVisibility';
    }

    // Define the schema
    static defineSchema() {
      const schema = super.defineSchema();

      schema.subject = new fields.StringField({
        required: true,
        choices: ['self'],
        initial: 'self',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.SUBJECT'),
      });

      schema.observers = new fields.StringField({
        required: true,
        choices: ['all', 'allies', 'enemies', 'selected', 'targeted'],
        initial: 'all',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.OBSERVERS'),
      });

      schema.direction = new fields.StringField({
        required: false,
        choices: ['from', 'to'],
        initial: 'from',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.DIRECTION'),
        hint: "'from': observers see subject as hidden, 'to': subject sees observers as hidden. Effects always on subject.",
      });

      schema.mode = new fields.StringField({
        required: true,
        choices: ['set', 'increase', 'decrease', 'remove'],
        initial: 'set',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.MODE'),
        hint: "'set': directly set visibility state, 'increase'/'decrease': adjust visibility by steps, 'remove': reset to observed and remove effects",
      });

      schema.status = new fields.StringField({
        required: true,
        choices: ['observed', 'concealed', 'hidden', 'undetected'],
        initial: 'hidden',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.STATUS'),
      });

      schema.steps = new fields.NumberField({
        required: false,
        initial: 1,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.STEPS'),
      });

      schema.durationRounds = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.DURATION'),
      });

      schema.requiresInitiative = new fields.BooleanField({
        required: false,
        initial: false,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.REQUIRES_INITIATIVE'),
      });

      schema.range = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.RANGE'),
      });

      return schema;
    }

    // Lifecycle hooks
    onCreate(actorUpdates) {
      this.applyVisibilityChange();
    }
    onDelete(actorUpdates) {
      this.resetVisibility();
    }
    beforeRoll(domains, rollOptions) {
      if (domains.includes('attack-roll')) this.addRollOptions(rollOptions);
    }
    afterRoll({ roll, domains }) {
      if (domains.includes('attack-roll')) this.applyVisibilityChange();
    }
    onUpdateEncounter({ event }) {
      if (event === 'turn-start') this.applyVisibilityChange();
    }

    /**
     * Apply visibility changes based on rule element configuration
     */
    async applyVisibilityChange() {
      if (!api) return;

      // Get the tokens based on direction
      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;

      // Process each token pair
      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          // Skip if same token
          if (sourceToken.id === targetToken.id) continue;

          // Determine observer and subject based on direction
          // Determine who sees whom as hidden/undetected
          // FROM: observers (sourceTokens) see subject (targetToken) as hidden
          // TO: subject (sourceToken) sees observers (targetTokens) as hidden
          const [observerToken, subjectToken] =
            this.direction === 'from'
              ? [sourceToken, targetToken] // sourceToken (observer) sees targetToken (subject) as hidden
              : [sourceToken, targetToken]; // sourceToken (subject) sees targetToken (observer) as hidden

          // Get current visibility
          const currentVisibility =
            api.getVisibility(observerToken.id, subjectToken.id) || 'observed';

          // Calculate new visibility
          const newVisibility = this.calculateNewVisibility(currentVisibility);

          // Skip if no change
          if (currentVisibility === newVisibility) continue;

          // Check for recent changes to prevent loops
          const key = `${observerToken.id}-${subjectToken.id}`;
          const now = game.time.worldTime;
          const lastChange = recentChanges.get(key);

          if (lastChange && now - lastChange < 1) {
            continue;
          }

          // Record this change
          recentChanges.set(key, now);

          // Apply visibility change
          const options = {
            // Specify which token gets the effect based on direction
            // FROM direction: effect on subject (not observer)
            // TO direction: effect on subject
            effectTarget: 'subject',
            direction: this.direction,
          };

          // For remove mode, ensure we remove all effects
          if (this.mode === 'remove') {
            options.removeAllEffects = true;
          }

          await api.setVisibility(observerToken.id, subjectToken.id, newVisibility, options);
        }
      }
    }

    /**
     * Get tokens based on direction setting
     * Returns { sourceTokens, targetTokens } where:
     * - For "from" direction: sourceTokens are observers, targetTokens are subjects
     * - For "to" direction: sourceTokens are subjects, targetTokens are observers
     */
    getDirectionalTokens() {
      let sourceTokens = [];
      let targetTokens = [];

      // Get the primary token (self or target)
      const primaryToken =
        this.subject === 'self' ? this.actor.getActiveTokens()[0] : game.user.targets.first();

      if (!primaryToken) {
        return { sourceTokens: [], targetTokens: [] };
      }

      // Get all potential tokens based on observers setting
      const allTokens =
        canvas.tokens?.placeables.filter((t) => t.actor && t.id !== primaryToken.id) || [];
      let observerTokens = [];

      switch (this.observers) {
        case 'all':
          observerTokens = allTokens;
          break;
        case 'allies':
          observerTokens = allTokens.filter((t) => this.areAllies(primaryToken.actor, t.actor));
          break;
        case 'enemies':
          observerTokens = allTokens.filter((t) => !this.areAllies(primaryToken.actor, t.actor));
          break;
        case 'selected':
          observerTokens = canvas.tokens?.controlled.filter((t) => t.id !== primaryToken.id) || [];
          break;
        case 'targeted':
          observerTokens = Array.from(game.user.targets).filter((t) => t.id !== primaryToken.id);
          break;
      }

      // Filter by range if needed
      if (this.range) {
        observerTokens = observerTokens.filter((token) => {
          const distance = canvas.grid.measureDistance(primaryToken, token);
          return distance <= this.range;
        });
      }

      // Assign tokens based on direction
      if (this.direction === 'from') {
        // "from" means the subject is hidden FROM the observers
        // The effect is placed on the observers (target tokens)
        // Observers see the subject as hidden/undetected
        sourceTokens = observerTokens; // These are the observers
        targetTokens = [primaryToken]; // This is the subject
      } else {
        // "to" means the subject sees the observers as hidden/undetected
        // The effect is placed on the subject (primary token)
        // Subject sees observers as hidden/undetected
        sourceTokens = [primaryToken]; // This is the subject
        targetTokens = observerTokens; // These are the observers
      }

      return { sourceTokens, targetTokens };
    }

    /**
     * Calculate new visibility based on mode
     */
    calculateNewVisibility(currentVisibility) {
      // Visibility progression from most to least visible
      const states = ['observed', 'concealed', 'hidden', 'undetected'];
      const currentIndex = states.indexOf(currentVisibility);
      const steps = Math.min(this.steps || 1, states.length - 1);

      switch (this.mode) {
        case 'set':
          return this.status;

        case 'increase': // Less visible (move right in array)
          return states[Math.min(currentIndex + steps, states.length - 1)];

        case 'decrease': // More visible (move left in array)
          return states[Math.max(currentIndex - steps, 0)];

        case 'remove':
          // Always return observed for remove mode
          return 'observed';

        default:
          return currentVisibility;
      }
    }

    /**
     * Reset visibility to observed
     */
    async resetVisibility() {
      if (!api) return;

      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;

      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          if (sourceToken.id === targetToken.id) continue;

          // Determine who sees whom as hidden/undetected
          // FROM: observers (sourceTokens) see subject (targetToken) as hidden
          // TO: subject (sourceToken) sees observers (targetTokens) as hidden
          const [observerToken, subjectToken] =
            this.direction === 'from'
              ? [sourceToken, targetToken] // sourceToken (observer) sees targetToken (subject) as hidden
              : [sourceToken, targetToken]; // sourceToken (subject) sees targetToken (observer) as hidden

          await api.setVisibility(observerToken.id, subjectToken.id, 'observed', {
            // Specify which token gets the effect based on direction
            // FROM direction: effect on subject (not observer)
            // TO direction: effect on subject
            effectTarget: 'subject',
            direction: this.direction,
          });
        }
      }
    }

    /**
     * Add roll options based on current visibility
     */
    addRollOptions(rollOptions) {
      if (!api) return;

      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;

      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          if (sourceToken.id === targetToken.id) continue;

          // Determine who sees whom as hidden/undetected
          // FROM: observers (sourceTokens) see subject (targetToken) as hidden
          // TO: subject (sourceToken) sees observers (targetTokens) as hidden
          const [observerToken, subjectToken] =
            this.direction === 'from'
              ? [sourceToken, targetToken] // sourceToken (observer) sees targetToken (subject) as hidden
              : [sourceToken, targetToken]; // sourceToken (subject) sees targetToken (observer) as hidden

          const currentVisibility = api.getVisibility(observerToken.id, subjectToken.id);
          if (!currentVisibility) continue;

          rollOptions.add(`visibility:${currentVisibility}`);
          rollOptions.add(`visibility:direction:${this.direction}`);

          if (this.areAllies(subjectToken.actor, observerToken.actor)) {
            rollOptions.add(`visibility:ally:${currentVisibility}`);
          } else {
            rollOptions.add(`visibility:enemy:${currentVisibility}`);
          }
        }
      }
    }

    /**
     * Check if two actors are allies
     */
    areAllies(actor1, actor2) {
      if (!actor1 || !actor2) return false;

      const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
      const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
      const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

      return isPCvsPC || (isNPCvsNPC && sameDisposition);
    }
  };
}

/**
 * Create example items with the Visibility rule element
 */
async function createVisibilityRuleElementExample() {
  if (!game.pf2e?.RuleElements?.custom?.PF2eVisionerVisibility) {
    console.error('PF2eVisionerVisibility rule element is not registered yet!');
    return null;
  }

  // Example item data
  const examples = [
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.HIDE.NAME'),
      img: 'systems/pf2e/icons/spells/cloak-of-shadow.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.HIDE.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'all',
          direction: 'from',
          mode: 'set',
          status: 'hidden',
          durationRounds: 10,
        },
      ],
      traits: ['visual'],
    },
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.CONCEAL_TARGET.NAME'),
      img: 'systems/pf2e/icons/spells/obscuring-mist.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.CONCEAL_TARGET.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'target',
          observers: 'all',
          direction: 'from',
          mode: 'set',
          status: 'concealed',
          durationRounds: 10,
        },
      ],
      traits: ['illusion', 'magical'],
    },
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.OBSCURING_MIST.NAME'),
      img: 'systems/pf2e/icons/spells/obscuring-mist.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.OBSCURING_MIST.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'all',
          direction: 'from',
          mode: 'increase',
          steps: 1,
          durationRounds: 10,
        },
      ],
      traits: ['conjuration', 'water'],
    },
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.REVEAL.NAME'),
      img: 'systems/pf2e/icons/spells/true-seeing.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.REVEAL.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'target',
          observers: 'all',
          direction: 'from',
          mode: 'decrease',
          steps: 1,
          durationRounds: 10,
        },
      ],
      traits: ['divination', 'revelation'],
    },
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.ENHANCED_VISION.NAME'),
      img: 'systems/pf2e/icons/spells/see-invisibility.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.ENHANCED_VISION.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'all',
          direction: 'to',
          mode: 'decrease',
          steps: 1,
          durationRounds: 10,
        },
      ],
      traits: ['divination', 'detection'],
    },
    {
      name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.BLUR_VISION.NAME'),
      img: 'systems/pf2e/icons/spells/blur.webp',
      description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.EXAMPLES.BLUR_VISION.DESCRIPTION'),
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'target',
          observers: 'all',
          direction: 'to',
          mode: 'increase',
          steps: 1,
          durationRounds: 10,
        },
      ],
      traits: ['transmutation', 'visual'],
    },
  ];

  try {
    const createdItems = [];

    // Create each example item
    for (const example of examples) {
      const itemData = {
        name: example.name,
        type: 'effect',
        img: example.img,
        system: {
          description: { value: example.description },
          duration: { value: 1, unit: 'minutes' },
          rules: example.rules,
          traits: { value: example.traits, rarity: 'common' },
        },
      };

      const item = await Item.create(itemData);
      item.sheet.render(true);
      createdItems.push(item);
    }
    return createdItems;
  } catch (error) {
    console.error('Error creating example items:', error);
    return null;
  }
}
