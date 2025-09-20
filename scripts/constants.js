/**
 * Constants and configuration for PF2E Visioner
 */

export const MODULE_ID = 'pf2e-visioner';
export const MODULE_TITLE = 'PF2E Visioner';

/**
 * Visibility states supported by the module - aligned with PF2E detection conditions
 */
export const VISIBILITY_STATES = {
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

  // Override indicator floating button size
  overrideIndicatorSize: {
    name: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.name',
    hint: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.hint',
    scope: 'client',
    config: true,
    restricted: false, // players can choose their preferred size
    type: String,
    choices: {
      small: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.CHOICES.small',
      medium: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.CHOICES.medium',
      large: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.CHOICES.large',
      xlarge: 'PF2E_VISIONER.SETTINGS.OVERRIDE_INDICATOR_SIZE.CHOICES.xlarge',
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
};
