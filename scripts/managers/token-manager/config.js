/**
 * Configuration for VisionerTokenManager UI
 */

export const TOKEN_MANAGER_DEFAULT_OPTIONS = {
  tag: 'form',
  classes: ['pf2e-visioner', 'token-visibility-manager'],
  form: {
    handler: null, // to be assigned by the class
    submitOnChange: false,
    closeOnSubmit: false,
  },
  window: {
    title: 'PF2E_VISIONER.TOKEN_MANAGER.TITLE',
    icon: 'fas fa-user-pen',
    resizable: true,
  },
  position: {
    width: 650,
    height: 650,
  },
  actions: {
    applyCurrent: null,
    applyBoth: null,
    reset: null,
    toggleMode: null,
    toggleEncounterFilter: null,
    toggleIgnoreAllies: null,
    toggleIgnoreWalls: null,
    toggleTab: null,
    toggleStateSelector: null,
    // PC-specific bulk actions for visibility
    bulkPCHidden: null,
    bulkPCUndetected: null,
    bulkPCConcealed: null,
    bulkPCObserved: null,
    // NPC-specific bulk actions for visibility
    bulkNPCHidden: null,
    bulkNPCUndetected: null,
    bulkNPCConcealed: null,
    bulkNPCObserved: null,
    // Loot-specific bulk actions for visibility (loot table only)
    bulkLootObserved: null,
    bulkLootHidden: null,
    // PC-specific bulk actions for cover
    bulkPCNoCover: null,
    bulkPCLesserCover: null,
    bulkPCStandardCover: null,
    bulkPCGreaterCover: null,
    // NPC-specific bulk actions for cover
    bulkNPCNoCover: null,
    bulkNPCLesserCover: null,
    bulkNPCStandardCover: null,
    bulkNPCGreaterCover: null,
  },
};

export const TOKEN_MANAGER_PARTS = {
  form: {
    template: 'modules/pf2e-visioner/templates/token-manager-new.hbs',
  },
};
