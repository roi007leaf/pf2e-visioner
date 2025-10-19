/**
 * Constants and configuration for PF2E Visioner
 */

export const MODULE_ID = 'pf2e-visioner';
export const MODULE_TITLE = 'PF2E Visioner';

/**
 * Visibility states supported by the module - aligned with PF2E detection conditions
 */
export const VISIBILITY_STATES = {
  avs: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.avs',
    pf2eCondition: null,
    visible: true,
    icon: 'fas fa-bolt-auto',
    color: 'var(--visibility-avs, #9c27b0)', // Purple - AVS control
    cssClass: 'visibility-avs',
  },
  observed: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.observed',
    pf2eCondition: null,
    visible: true,
    icon: 'fas fa-eye',
    color: 'var(--visibility-observed, #4caf50)', // Green - safe/visible
    cssClass: 'visibility-observed',
  },
  concealed: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.concealed',
    pf2eCondition: 'concealed',
    visible: true,
    icon: 'fas fa-cloud',
    color: 'var(--visibility-concealed, #ffc107)', // Yellow - caution
    cssClass: 'visibility-concealed',
  },
  hidden: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.hidden',
    pf2eCondition: 'hidden',
    visible: true,
    icon: 'fas fa-eye-slash',
    color: 'var(--visibility-hidden, #ff6600)', // Bright orange - warning
    cssClass: 'visibility-hidden',
  },
  undetected: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.undetected',
    pf2eCondition: 'undetected',
    visible: false, // Hide completely like invisible used to
    icon: 'fas fa-ghost',
    color: 'var(--visibility-undetected, #f44336)', // Red - danger
    cssClass: 'visibility-undetected',
  },
};

/**
 * Cover states supported by the module - aligned with PF2E cover rules
 */
export const COVER_STATES = {
  none: {
    label: 'PF2E_VISIONER.COVER_STATES.none',
    pf2eCondition: null,
    icon: 'fas fa-shield-slash',
    color: 'var(--cover-none, #4caf50)', // Green - no cover
    cssClass: 'cover-none',
    bonusAC: 0,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  lesser: {
    label: 'PF2E_VISIONER.COVER_STATES.lesser',
    pf2eCondition: 'lesser-cover',
    icon: 'fa-regular fa-shield',
    color: 'var(--cover-lesser, #ffc107)', // Yellow - minor cover
    cssClass: 'cover-lesser',
    bonusAC: 1,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  standard: {
    label: 'PF2E_VISIONER.COVER_STATES.standard',
    pf2eCondition: 'cover',
    icon: 'fas fa-shield-alt',
    color: 'var(--cover-standard, #ff6600)', // Orange - significant cover
    cssClass: 'cover-standard',
    bonusAC: 2,
    bonusReflex: 2,
    bonusStealth: 2,
    canHide: true,
  },
  greater: {
    label: 'PF2E_VISIONER.COVER_STATES.greater',
    pf2eCondition: 'greater-cover',
    icon: 'fas fa-shield',
    color: 'var(--cover-greater, #f44336)', // Red - major cover
    cssClass: 'cover-greater',
    bonusAC: 4,
    bonusReflex: 4,
    bonusStealth: 4,
    canHide: true,
  },
};

/**
 * Special senses supported by the module
 */
export const SPECIAL_SENSES = {
  vision: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.vision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.vision_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-eye',
    hasRangeLimit: true,
  },
  // Vision senses commonly used in PF2e
  darkvision: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.darkvision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.darkvision_description',
    type: 'precise',
    defaultRange: Infinity, // No range limit by default
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fa-regular fa-moon',
    hasRangeLimit: true,
  },
  'greater-darkvision': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.greater_darkvision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.greater_darkvision_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-moon',
    hasRangeLimit: true,
  },
  'low-light-vision': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.low_light_vision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.low_light_vision_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-moon-over-sun',
    hasRangeLimit: true,
  },
  'lowlightvision': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.low_light_vision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.low_light_vision_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-moon-over-sun',
    hasRangeLimit: true,
  },
  'infrared-vision': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.infrared_vision',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.infrared_vision_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-thermometer-half',
    hasRangeLimit: true,
  },
  lifesense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.lifesense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.lifesense_description',
    type: 'imprecise',
    defaultRange: 10,
    detectsLiving: true, // Vitality energy - most creature types
    detectsUndead: true, // Void energy - undead creatures
    detectsConstructs: false, // No life force or void energy
    canDistinguish: true, // Can tell the difference between living and undead
    icon: 'fas fa-heartbeat',
    hasRangeLimit: true,
  },
  echolocation: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.echolocation',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.echolocation_description',
    type: 'precise', // Precise hearing
    defaultRange: 40,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true, // Sound-based, detects all solid objects
    canDistinguish: false,
    icon: 'fas fa-volume-high',
    hasRangeLimit: true,
  },
  truesight: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.truesight',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.truesight_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: true,
    icon: 'fas fa-search',
    hasRangeLimit: true,
  },
  'see-invisibility': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.see_the_unseen',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.see_the_unseen_description',
    type: 'precise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: true,
    icon: 'fas fa-low-vision',
    hasRangeLimit: true,
  },
  tremorsense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.tremorsense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.tremorsense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true, // Vibration-based, detects all moving/grounded creatures
    canDistinguish: false,
    icon: 'fas fa-wave-square',
    hasRangeLimit: true,
  },
  scent: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.scent',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.scent_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: false, // Most undead don't have scent
    detectsConstructs: false, // No biological scent
    canDistinguish: true, // Can distinguish different scents
    icon: 'fas fa-nose',
    hasRangeLimit: true,
  },
  bloodsense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.bloodsense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.bloodsense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: false,
    detectsConstructs: false,
    canDistinguish: true,
    icon: 'fas fa-tint',
    hasRangeLimit: true,
  },
  magicsense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.magicsense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.magicsense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-hat-wizard',
    hasRangeLimit: true,
  },
  'motion-sense': {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.motion_sense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.motion_sense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-running',
    hasRangeLimit: true,
  },
  spiritsense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.spiritsense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.spiritsense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: false,
    canDistinguish: true,
    icon: 'fas fa-ghost',
    hasRangeLimit: true,
  },
  thoughtsense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.thoughtsense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.thoughtsense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: false,
    detectsConstructs: false,
    canDistinguish: true,
    icon: 'fas fa-brain',
    hasRangeLimit: true,
  },
  wavesense: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.wavesense',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.wavesense_description',
    type: 'imprecise',
    defaultRange: 30,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-water',
    hasRangeLimit: true,
  },
  // Generic hearing (distinct from echolocation)
  hearing: {
    label: 'PF2E_VISIONER.SPECIAL_SENSES.hearing',
    description: 'PF2E_VISIONER.SPECIAL_SENSES.hearing_description',
    type: 'imprecise',
    defaultRange: Infinity,
    detectsLiving: true,
    detectsUndead: true,
    detectsConstructs: true,
    canDistinguish: false,
    icon: 'fas fa-volume-up',
    hasRangeLimit: true,
  },
};

/**
 * Available reactions that can be used during seek actions
 */
export const REACTIONS = {
  senseTheUnseen: {
    id: 'sense-the-unseen',
    name: 'PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.name',
    applied: 'PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.applied',
    description: 'PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.description',
    icon: 'fas fa-eye',
    type: 'reaction',
    trigger: 'PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.trigger',
    effect: 'PF2E_VISIONER.REACTIONS.SENSE_THE_UNSEEN.effect',
    // Condition check function - determines if this reaction is available
    isAvailable: (context) => {
      const { actor, outcomes } = context;
      if (!actor) return false;

      // Check for Sense the Unseen feat
      const feats = actor.itemTypes?.feat ?? actor.items?.filter?.((i) => i?.type === 'feat') ?? [];
      const hasFeat = feats.some((feat) => {
        const name = feat?.name?.toLowerCase?.() || '';
        const slug = feat?.system?.slug?.toLowerCase?.() || '';
        return name.includes('sense the unseen') || slug.includes('sense-the-unseen');
      });

      if (!hasFeat) return false;

      // Check for failed outcomes with undetected targets (regular or critical failures)
      const hasFailedUndetected = outcomes.some(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      return hasFailedUndetected;
    },
    // Apply function - executes the reaction effect
    apply: async (context) => {
      const { outcomes, dialog } = context;

      // Find all failed outcomes where the target is currently undetected (regular or critical failures)
      const failedUndetectedOutcomes = outcomes.filter(
        (outcome) =>
          (outcome.outcome === 'failure' || outcome.outcome === 'critical-failure') &&
          outcome.currentVisibility === 'undetected',
      );

      if (failedUndetectedOutcomes.length === 0) {
        return { success: false, message: 'No failed outcomes with undetected targets found.' };
      }

      // Apply Sense the Unseen: upgrade undetected to hidden
      const targetIds = failedUndetectedOutcomes.map((o) => o.target?.id).filter(Boolean);

      for (const outcome of failedUndetectedOutcomes) {
        outcome.newVisibility = 'hidden';
        outcome.changed = true;
        outcome.senseUnseenApplied = true;
        outcome.hasActionableChange = true;
        outcome.overrideState = 'hidden';
      }

      // Also update original outcomes for persistence
      if (Array.isArray(dialog._originalOutcomes)) {
        for (const originalOutcome of dialog._originalOutcomes) {
          if (targetIds.includes(originalOutcome.target?.id)) {
            originalOutcome.newVisibility = 'hidden';
            originalOutcome.changed = true;
            originalOutcome.senseUnseenApplied = true;
            originalOutcome.hasActionableChange = true;
            originalOutcome.overrideState = 'hidden';
          }
        }
      }

      return {
        success: true,
        message: `Applied Sense the Unseen to ${failedUndetectedOutcomes.length} failed outcome(s). Undetected targets are now Hidden.`,
        affectedOutcomes: failedUndetectedOutcomes,
      };
    },
  },
};

/**
 * Sneak action flags
 */
export const SNEAK_FLAGS = {
  SNEAK_ACTIVE: 'sneak-active', // Flag indicating token is currently sneaking
};

/**
 * Default module settings
 */
export const DEFAULT_SETTINGS = {
  // Visibility Indicators
  hiddenWallsEnabled: {
    name: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.name',
    hint: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  enableHoverTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.hint',
    scope: 'client',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  allowPlayerTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.hint',
    scope: 'client',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  tooltipFontSize: {
    name: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.name',
    hint: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.hint',
    scope: 'client',
    config: true,
    restricted: false,
    type: String,
    choices: {
      tiny: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.tiny',
      small: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.small',
      medium: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.medium',
      large: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.large',
      xlarge: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.xlarge',
    },
    default: 'medium',
  },

  // AVS changes indicator floating button size
  avsChangesIndicatorSize: {
    name: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.name',
    hint: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.hint',
    scope: 'client',
    config: true,
    restricted: false, // players can choose their preferred size
    type: String,
    choices: {
      small: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.CHOICES.small',
      medium: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.CHOICES.medium',
      large: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.CHOICES.large',
      xlarge: 'PF2E_VISIONER.SETTINGS.AVS_CHANGES_INDICATOR_SIZE.CHOICES.xlarge',
    },
    default: 'medium',
  },

  blockPlayerTargetTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.REMOVE_PLAYER_TARGET_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.REMOVE_PLAYER_TARGET_TOOLTIPS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Auto-Visibility System
  autoVisibilityEnabled: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_ENABLED.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_ENABLED.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoVisibilityDebugMode: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_DEBUG_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_DEBUG_MODE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  disableLineOfSightCalculation: {
    name: 'PF2E_VISIONER.SETTINGS.DISABLE_LINE_OF_SIGHT.name',
    hint: 'PF2E_VISIONER.SETTINGS.DISABLE_LINE_OF_SIGHT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  colorblindMode: {
    name: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.hint',
    scope: 'client',
    config: true,
    restricted: false, // Allow players to see and change this setting
    type: String,
    choices: {
      none: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.none',
      protanopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.protanopia',
      deuteranopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.deuteranopia',
      tritanopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.tritanopia',
      achromatopsia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.achromatopsia',
    },
    default: 'none',
  },

  // Camera Vision Aggregation
  enableCameraVisionAggregation: {
    name: 'PF2E_VISIONER.SETTINGS.ENABLE_CAMERA_VISION_AGGREGATION.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENABLE_CAMERA_VISION_AGGREGATION.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Token Filtering
  ignoreAllies: {
    name: 'PF2E_VISIONER.SETTINGS.IGNORE_ALLIES_DEFAULT.name',
    hint: 'PF2E_VISIONER.SETTINGS.IGNORE_ALLIES_DEFAULT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  // Visual filter: hide Foundry-hidden tokens in UIs
  hideFoundryHiddenTokens: {
    name: 'PF2E_VISIONER.SETTINGS.HIDE_FOUNDRY_HIDDEN_TOKENS.name',
    hint: 'PF2E_VISIONER.SETTINGS.HIDE_FOUNDRY_HIDDEN_TOKENS.hint',
    scope: 'client',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  // Sneak End Position Qualification
  sneakAllowHiddenUndetectedEndPosition: {
    name: 'PF2E_VISIONER.SETTINGS.SNEAK_ALLOW_HIDDEN_UNDETECTED_END_POSITION.name',
    hint: 'PF2E_VISIONER.SETTINGS.SNEAK_ALLOW_HIDDEN_UNDETECTED_END_POSITION.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
  // Token Filtering
  enableAllTokensVision: {
    name: 'PF2E_VISIONER.SETTINGS.ENABLE_ALL_TOKENS_VISION.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENABLE_ALL_TOKENS_VISION.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Loot DCs
  lootStealthDC: {
    name: 'PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.name',
    hint: 'PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 15,
  },

  // Walls DCs
  wallStealthDC: {
    name: 'PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.name',
    hint: 'PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 15,
  },

  // Include additional object types in managers
  includeLootActors: {
    name: 'PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.name',
    hint: 'PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  defaultEncounterFilter: {
    name: 'PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.name',
    hint: 'PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Seek Action Settings
  seekUseTemplate: {
    name: 'PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.name',
    hint: 'PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  limitSeekRangeInCombat: {
    name: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.name',
    hint: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Seek range limitation outside of combat
  limitSeekRangeOutOfCombat: {
    name: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.name',
    hint: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  customSeekDistance: {
    name: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.name',
    hint: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 30,
  },

  // Separate distance for out-of-combat seeks
  customSeekDistanceOutOfCombat: {
    name: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.name',
    hint: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 30,
  },

  // Interface Settings
  useHudButton: {
    name: 'PF2E_VISIONER.SETTINGS.TOKEN_HUD_BUTTON.name',
    hint: 'PF2E_VISIONER.SETTINGS.TOKEN_HUD_BUTTON.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Show Visioner tools in Tokens and Walls scene controls
  showVisionerSceneTools: {
    name: 'PF2E_VISIONER.SETTINGS.VISIONER_SCENE_CONTROLS.name',
    hint: 'PF2E_VISIONER.SETTINGS.VISIONER_SCENE_CONTROLS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Hidden Wall Indicator Width (half width in pixels)
  hiddenWallIndicatorWidth: {
    name: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALL_INDICATOR_WIDTH.name',
    hint: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALL_INDICATOR_WIDTH.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 1,
      max: 30,
      step: 1,
    },
    default: 10,
  },

  // Dim Lighting Threshold
  dimLightingThreshold: {
    name: 'PF2E_VISIONER.SETTINGS.DIM_LIGHTING_THRESHOLD.name',
    hint: 'PF2E_VISIONER.SETTINGS.DIM_LIGHTING_THRESHOLD.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    range: {
      min: 0,
      max: 1,
      step: 0.05,
    },
    default: 0.25,
  },

  // Token Manager
  integrateRollOutcome: {
    name: 'PF2E_VISIONER.SETTINGS.MANAGER_ROLL_COMPARISON.name',
    hint: 'PF2E_VISIONER.SETTINGS.MANAGER_ROLL_COMPARISON.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoCover: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Auto-Cover behavior tuning
  autoCoverTokenIntersectionMode: {
    name: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    choices: {
      any: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.CHOICES.any',
      length10: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.CHOICES.length10',
      coverage: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.CHOICES.coverage',
      tactical: 'PF2E_VISIONER.SETTINGS.TOKEN_INTERSECTION_MODE.CHOICES.tactical',
    },
    default: 'length10',
  },
  autoCoverIgnoreUndetected: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_UNDETECTED.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_UNDETECTED.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoCoverVisualizationOnlyInEncounter: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_VISUALIZATION_COMBAT_ONLY.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_VISUALIZATION_COMBAT_ONLY.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverVisualizationRespectFogForGM: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_GM_RESPECT_FOG.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_GM_RESPECT_FOG.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
  autoCoverIgnoreDead: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_DEAD.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_DEAD.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverIgnoreAllies: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_ALLIES.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER_IGNORE_ALLIES.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Wall cover thresholds (percentage of the target token blocked by walls)
  wallCoverStandardThreshold: {
    name: 'PF2E_VISIONER.SETTINGS.WALL_STANDARD_THRESHOLD.name',
    hint: 'PF2E_VISIONER.SETTINGS.WALL_STANDARD_THRESHOLD.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 50,
  },
  wallCoverGreaterThreshold: {
    name: 'PF2E_VISIONER.SETTINGS.WALL_GREATER_THRESHOLD.name',
    hint: 'PF2E_VISIONER.SETTINGS.WALL_GREATER_THRESHOLD.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 70,
  },
  wallCoverAllowGreater: {
    name: 'PF2E_VISIONER.SETTINGS.WALLS_ALLOW_GREATER.name',
    hint: 'PF2E_VISIONER.SETTINGS.WALLS_ALLOW_GREATER.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverAllowProneBlockers: {
    name: 'PF2E_VISIONER.SETTINGS.IGNORE_PRONE_TOKENS.name',
    hint: 'PF2E_VISIONER.SETTINGS.IGNORE_PRONE_TOKENS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  keybindingOpensTMInTargetMode: {
    name: 'PF2E_VISIONER.SETTINGS.KEYBIND_OPEN_MANAGER_TARGET_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.KEYBIND_OPEN_MANAGER_TARGET_MODE.hint',
    scope: 'world',
    // Deprecated per redesign mockup (removed from UI). Keep for backward compatibility.
    config: false,
    restricted: false,
    type: Boolean,
    default: false,
  },

  debug: {
    name: 'PF2E_VISIONER.SETTINGS.DEBUG.name',
    hint: 'PF2E_VISIONER.SETTINGS.DEBUG.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
  // Show Quick Edit tool in token controls
  showQuickEditTool: {
    name: 'PF2E_VISIONER.SETTINGS.VISIONER_QUICK_EDIT_TOOL.name',
    hint: 'PF2E_VISIONER.SETTINGS.VISIONER_QUICK_EDIT_TOOL.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
};

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  ENCOUNTER_FILTER_TEXT: 'PF2E_VISIONER.UI.ENCOUNTER_FILTER_TEXT',
};

/**
 * Keybinding configurations
 */
export const KEYBINDINGS = {
  openTokenManager: {
    name: 'PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.hint',
    editable: [{ key: 'KeyV', modifiers: ['Control', 'Shift'] }],
    restricted: true,
  },
  openQuickPanel: {
    name: 'PF2E_VISIONER.KEYBINDINGS.OPEN_QUICK_PANEL.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.OPEN_QUICK_PANEL.hint',
    editable: [],
    restricted: true,
  },
  toggleObserverMode: {
    name: 'PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.hint',
    editable: [{ key: 'KeyO', modifiers: [] }],
    restricted: false,
  },
  holdCoverOverride: {
    name: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.hint',
    // No default binding; user can configure
    editable: [],
    restricted: false,
  },
  showAutoCoverOverlay: {
    name: 'PF2E_VISIONER.KEYBINDINGS.SHOW_AUTO_COVER_OVERLAY.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.SHOW_AUTO_COVER_OVERLAY.hint',
    editable: [{ key: 'KeyG', modifiers: [] }],
    restricted: false,
  },
  holdCoverVisualization: {
    name: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_VISUALIZATION.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_VISUALIZATION.hint',
    editable: [{ key: 'KeyY', modifiers: [] }],
    restricted: false,
  },
  openWallManager: {
    name: 'PF2E_VISIONER.KEYBINDINGS.OPEN_WALL_MANAGER.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.OPEN_WALL_MANAGER.hint',
    editable: [],
    restricted: true,
  },
  showVisibilityFactors: {
    name: 'PF2E_VISIONER.KEYBINDINGS.SHOW_VISIBILITY_FACTORS.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.SHOW_VISIBILITY_FACTORS.hint',
    editable: [],
    restricted: true,
  },
};
