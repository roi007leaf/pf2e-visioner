/**
 * Effect Perception Hooks
 * Handles automatic perception refresh when active effects are created, updated, or deleted.
 * 
 * This handler works independently of the Auto-Visibility System and provides basic
 * perception refresh functionality for visibility-affecting effects like:
 * - Invisibility and similar conditions
 * - Vision/sense modifications
 * - Light emission changes
 * 
 * Unlike the AVS EffectEventHandler, this works regardless of AVS settings.
 */


/**
 * Effect names that affect visibility and require perception refresh
 */
const VISIBILITY_AFFECTING_EFFECTS = [
  // Condition effects
  'invisible',
  'invisibility',
  'hidden',
  'concealed',
  'undetected',
  'blinded',
  'dazzled',
  'deafened',

  // Light effects
  'darkness',
  'light',
  'bright light',
  'dim light',

  // Vision and senses
  'darkvision',
  'lowlightvision',
  'low-light vision',
  'tremorsense',
  'blindsight',
  'blindsense',
  'scent',
  'thoughtsense',
  'lifesense',
  'echolocation',

  // PF2e specific effects
  'greater darkvision',
  'see invisibility',
  'true seeing',
  'detect magic',

  // Common spell effects
  'faerie fire',
  'glitterdust',
  'blur',
  'displacement',
  'mirror image'
];

/**
 * Check if an effect affects visibility
 * @param {ActiveEffect} effect - The active effect to check
 * @returns {boolean} True if the effect affects visibility
 */
function effectAffectsVisibility(effect) {
  if (!effect?.name) return false;

  const effectName = effect.name.toLowerCase();

  // Check if effect name matches known visibility-affecting effects
  const nameMatch = VISIBILITY_AFFECTING_EFFECTS.some(visibilityEffect =>
    effectName.includes(visibilityEffect)
  );

  if (nameMatch) return true;

  // Check for PF2e system-specific slugs
  const slug = effect.slug || effect.system?.slug;
  if (slug) {
    const slugLower = slug.toLowerCase();
    const slugMatches = [
      'invisible', 'hidden', 'concealed', 'undetected', 'blinded', 'dazzled', 'deafened',
      'darkvision', 'low-light-vision', 'tremorsense', 'blindsight', 'scent'
    ];
    if (slugMatches.some(s => slugLower.includes(s))) return true;
  }

  // Check if the effect modifies vision-related attributes
  if (effect.changes && Array.isArray(effect.changes)) {
    for (const change of effect.changes) {
      const key = change.key?.toLowerCase() || '';
      if (key.includes('sight') || key.includes('vision') || key.includes('darkvision') ||
        key.includes('blindsight') || key.includes('tremorsense') || key.includes('scent') ||
        key.includes('light') || key.includes('dim') || key.includes('bright')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the token that owns an effect
 * @param {ActiveEffect} effect - The active effect
 * @returns {TokenDocument|null} The token document or null
 */
function getTokenFromEffect(effect) {
  // Effects can be on actors or tokens
  if (effect.parent) {
    // If the parent is an actor, find their tokens on the current scene
    if (effect.parent.documentName === 'Actor') {
      const actor = effect.parent;
      const tokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === actor.id) || [];
      return tokens.length > 0 ? tokens[0].document : null;
    }

    // If the parent is a token, return it directly
    if (effect.parent.documentName === 'Token') {
      return effect.parent;
    }
  }

  return null;
}

/**
 * Trigger perception refresh for affected tokens
 * @param {TokenDocument|TokenDocument[]} tokens - Token(s) to refresh perception for
 */
async function refreshPerceptionForTokens(tokens) {
  if (!tokens) return;

  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenArray.filter(token => token?.id);

  if (validTokens.length === 0) return;

  try {
    // Check if AVS is enabled - if so, the EffectEventHandler/ItemEventHandler will handle it
    const avsEnabled = game.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled');

    if (avsEnabled) {
      // AVS is enabled - EffectEventHandler and ItemEventHandler will handle the recalculation
      // We still update lifesense indicators for immediate visual feedback
      try {
        const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
        const controlledTokens = canvas?.tokens?.controlled || [];
        for (const controlledToken of controlledTokens) {
          await updateSystemHiddenTokenHighlights(controlledToken.document.id);
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to update lifesense indicators:', error);
      }
      return; // EffectEventHandler will handle the rest
    }

    // AVS is disabled - manually refresh Foundry's perception system
    await canvas.perception.update({
      initializeVision: true,
      initializeLighting: false,
      refreshVision: true,
      refreshLighting: false,
      refreshOcclusion: true
    });

    // Update lifesense indicators
    try {
      const { updateSystemHiddenTokenHighlights } = await import('../services/visual-effects.js');
      const controlledTokens = canvas?.tokens?.controlled || [];
      for (const controlledToken of controlledTokens) {
        await updateSystemHiddenTokenHighlights(controlledToken.document.id);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update lifesense indicators:', error);
    }

  } catch (error) {
    console.warn(`PF2E Visioner | Failed to refresh perception for effect changes:`, error);
  }
}

/**
 * Handle active effect creation
 * @param {ActiveEffect} effect - The created effect
 * @param {Object} options - Creation options
 * @param {string} userId - User ID who created the effect
 */
export async function onCreateActiveEffect(effect, options, userId) {

  // Only process on GM client to avoid duplicate refreshes
  if (!game.user?.isGM) return;

  // Check if effect affects visibility
  const affectsVisibility = effectAffectsVisibility(effect);

  if (!affectsVisibility) return;

  const token = getTokenFromEffect(effect);

  if (!token) return;

  // Small delay to allow effect to be fully processed
  setTimeout(() => refreshPerceptionForTokens(token), 100);
}

/**
 * Handle active effect updates
 * @param {ActiveEffect} effect - The updated effect
 * @param {Object} changes - The changes made
 * @param {Object} options - Update options
 * @param {string} userId - User ID who updated the effect
 */
export async function onUpdateActiveEffect(effect, changes, options, userId) {
  // Only process on GM client to avoid duplicate refreshes
  if (!game.user?.isGM) return;

  // Only process effects that affect visibility
  if (!effectAffectsVisibility(effect)) return;

  // Check if the changes might affect visibility (disabled state, duration, etc.)
  const relevantChanges = ['disabled', 'duration', 'changes', 'flags'];
  const hasRelevantChange = relevantChanges.some(key => Object.prototype.hasOwnProperty.call(changes, key));

  if (!hasRelevantChange) return;

  const token = getTokenFromEffect(effect);
  if (!token) return;


  // Small delay to allow effect to be fully processed
  setTimeout(() => refreshPerceptionForTokens(token), 100);
}

/**
 * Handle active effect deletion
 * @param {ActiveEffect} effect - The deleted effect
 * @param {Object} options - Deletion options
 * @param {string} userId - User ID who deleted the effect
 */
export async function onDeleteActiveEffect(effect, options, userId) {

  // Only process on GM client to avoid duplicate refreshes
  if (!game.user?.isGM) return;

  // Check if effect affects visibility
  const affectsVisibility = effectAffectsVisibility(effect);

  if (!affectsVisibility) return;

  const token = getTokenFromEffect(effect);

  if (!token) return;

  // Small delay to allow effect to be fully processed
  setTimeout(() => refreshPerceptionForTokens(token), 100);
}