/**
 * PF2E Visioner - Rule Element Manager
 * Handles the registration and initialization of custom rule elements
 */

// Define a global variable to store our rule elements
let PF2eVisionerVisibilityRuleElement = null;

/**
 * Initializes the rule element manager
 * This should be called from the module's init hook
 */
export function initRuleElementManager() {
  // Register hooks for different stages of initialization
  Hooks.once('setup', setupRuleElements);
  Hooks.once('ready', registerRuleElements);
}

/**
 * Setup rule elements during the setup hook
 * This prepares the rule element classes but doesn't register them yet
 */
function setupRuleElements() {
  // We'll define the rule element class here, but not register it yet
  if (game.pf2e?.RuleElementPF2e) {
    try {
      // Define the PF2eVisionerVisibility rule element class
      PF2eVisionerVisibilityRuleElement = class extends game.pf2e.RuleElementPF2e {
        /**
         * Set the name for the rule element's documentation
         */
        static get name() {
          return 'PF2eVisionerVisibility';
        }

        /**
         * Set the documentation URL for this rule element
         */
        static get documentation() {
          return 'https://github.com/roileaf/pf2e-visioner/blob/main/RULE_ELEMENTS.md#pf2evisioner-visibility-rule-element';
        }

        /**
         * Set the description for this rule element
         */
        static get description() {
          return game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.VISIBILITY.DESCRIPTION');
        }

        /**
         * Set the default key for this rule element
         */
        static get defaultKey() {
          return 'PF2eVisionerVisibility';
        }

        /**
         * Define the schema for the rule element
         */
        static get schema() {
          const fields = foundry.data.fields;

          // Create the schema using the LaxSchemaField from PF2e
          return new game.pf2e.system.schema.fields.LaxSchemaField({
            mode: new fields.StringField({
              required: true,
              choices: ['set', 'increment', 'decrement'],
              initial: 'set',
            }),
            status: new fields.StringField({
              required: true,
              choices: ['observed', 'hidden', 'undetected', 'concealed'],
              initial: 'observed',
            }),
            target: new fields.StringField({
              required: true,
              choices: ['self', 'target', 'allies', 'enemies', 'all'],
              initial: 'target',
            }),
            applyEphemeralEffects: new fields.BooleanField({
              required: false,
              initial: true,
            }),
            durationRounds: new fields.NumberField({
              required: false,
              nullable: true,
              initial: null,
            }),
            requiresInitiative: new fields.BooleanField({
              required: false,
              initial: false,
            }),
            range: new fields.NumberField({
              required: false,
              nullable: true,
              initial: null,
            }),
          });
        }

        /**
         * Get the visibility state based on the mode (set, increment, or decrement)
         */
        getVisibilityState(currentState) {
          // Implementation will be added when we import the API
          return this.status;
        }

        /**
         * Check if two actors are allies
         */
        areAllies(actor1, actor2) {
          if (!actor1 || !actor2) return false;

          // Check if both are PCs or both are NPCs
          const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
          const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;

          // Check if they have the same disposition
          const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

          return isPCvsPC || (isNPCvsNPC && sameDisposition);
        }

        /**
         * Get all target tokens based on the target type
         */
        getTargetTokens(originToken) {
          // Implementation will be added when we need it
          return [];
        }

        /**
         * Run before a check roll is made
         */
        beforeRoll(domains, rollOptions) {
          // Implementation will be added when we import the API
        }

        /**
         * Run after a check roll is made
         */
        async afterRoll({ roll, selectors, domains, rollOptions }) {
          // Implementation will be added when we import the API
        }

        /**
         * Run when an encounter event occurs
         */
        async onUpdateEncounter({ event, actorUpdates }) {
          // Implementation will be added when we import the API
        }

        /**
         * Apply range filtering to target tokens if range is specified
         */
        filterTokensByRange(tokens, originToken) {
          // Implementation will be added when we need it
          return tokens;
        }
      };
    } catch (error) {
      console.error(
        'PF2E Visioner | Error defining PF2eVisionerVisibility rule element class:',
        error,
      );
    }
  } else {
    console.warn(
      'PF2E Visioner | PF2e system not ready during setup, will try again during ready hook',
    );
  }
}

/**
 * Register rule elements during the ready hook
 * This registers the rule elements with the PF2e system
 */
function registerRuleElements() {
  if (!game.pf2e?.RuleElements) {
    console.error('PF2E Visioner | Failed to register rule elements: PF2e system not ready');
    return;
  }

  try {
    // If the rule element class wasn't defined during setup, try again now
    if (!PF2eVisionerVisibilityRuleElement && game.pf2e?.RuleElementPF2e) {
      setupRuleElements();
    }

    if (!PF2eVisionerVisibilityRuleElement) {
      console.error('PF2E Visioner | Failed to create PF2eVisionerVisibilityRuleElement class');
      return;
    }

    // Register with the custom rule elements registry
    game.pf2e.RuleElements.custom.PF2eVisionerVisibility = PF2eVisionerVisibilityRuleElement;

    // Make sure the rule element appears in the UI dropdown
    if (CONFIG.PF2E?.ruleElementTypes) {
      CONFIG.PF2E.ruleElementTypes.PF2eVisionerVisibility = 'PF2e Visioner Visibility';
    } else if (CONFIG.PF2E) {
      CONFIG.PF2E.ruleElementTypes = {
        PF2eVisionerVisibility: 'PF2e Visioner Visibility',
      };
    } else {
      console.error('PF2E Visioner | CONFIG.PF2E is not available');
    }

    // Add the rule element to the PF2e lang object for proper display
    if (game.i18n) {
      const key = 'PF2E.RuleElement.PF2eVisionerVisibility';
      if (!game.i18n.has(key)) {
        game.i18n.translations.PF2E = game.i18n.translations.PF2E || {};
        game.i18n.translations.PF2E.RuleElement = game.i18n.translations.PF2E.RuleElement || {};
        game.i18n.translations.PF2E.RuleElement.PF2eVisionerVisibility = 'PF2e Visioner Visibility';
      }
    }
  } catch (error) {
    console.error('PF2E Visioner | Error registering rule elements:', error);
  }
}
