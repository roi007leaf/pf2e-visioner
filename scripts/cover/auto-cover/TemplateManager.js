/**
 * TemplateManager.js
 * Manages template-related cover data for area effects
 */

import autoCoverSystem from './AutoCoverSystem.js';
export class TemplateManager {
  /**
   * Flag scope for template data
   * @type {string}
   * @readonly
   */
  static FLAG_SCOPE = 'pf2e-visioner';
  /**
   * Map of template data
   * @type {Map<string, Object>}
   * @private
   */
  _templatesData = null;

  /**
   * Map of active reflex saves
   * @type {Map<string, Object>}
   * @private
   */
  _activeReflexSaves = null;

  /**
   * Map of template origins by token ID
   * @type {Map<string, Object>}
   * @private
   */
  _templatesOrigins = null;
  _templateTargetIndex = null;

  constructor() {
    // Initialize or reference global maps for template data
    this._templatesData = new Map();
    this._activeReflexSaves = new Map();
    this._templatesOrigins = new Map();
    this._templateTargetIndex = new Map();
    this.autoCoverSystem = autoCoverSystem;
    // Start cleanup timer
    this._startCleanupTimer();
  }

  getTemplatesData() {
    return this._templatesData;
  }

  async onCreateMeasuredTemplate(document, options, userId) {
    try {
      await this.registerTemplate(document, userId);
    } catch (e) {
      console.error('PF2E Visioner | Error in createMeasuredTemplate hook:', e);
    }
  }

  getSpellCreator(document) {
    let creator = null,
      creatorId = null,
      creatorType = 'unknown';
    // First, check if this is a spell template with a source actor
    // Get actor from document ID
    try {
      if (document?.flags?.pf2e?.origin?.type !== 'spell') {
        return { creator, creatorId, creatorType };
      }
      const originActorId = document.flags.pf2e.origin.actorId;
      const actor = game?.actors?.get?.(originActorId);

      if (actor) {
        // Find a token for this actor on the current scene
        const tokens = canvas?.tokens?.placeables?.filter?.((t) => t.actor?.id === actor.id) || [];
        if (tokens.length > 0) {
          creator = tokens[0];
          creatorId = creator.id;
          creatorType = 'spell-origin';
        } else {
          // Use actor ID if no token is found
          creatorId = `actor:${actor.id}`;
          creatorType = 'actor-only';
        }
      }
    } catch (e) {
      console.error('PF2E Visioner | Error getting spell origin actor:', e);
    }
    return { creator, creatorId, creatorType };
  }

  async getCoverBonusForTokensInsideTemplate(tokensInside, center) {
    // Calculate cover for each token inside and store in our template data map
    const targetData = {};
    const tokenIds = [];
    for (const token of tokensInside) {
      try {
        // Calculate cover from template center to token
        const state = this.autoCoverSystem.detectCoverFromPoint(center, token);
        const { getCoverBonusByState } = await import('../../helpers/cover-helpers.js');
        const bonus = getCoverBonusByState(state) || 0;

        targetData[token.id] = {
          tokenId: token.id,
          tokenName: token.name,
          actorId: token.actor?.id,
          actorName: token.actor?.name,
          state,
          bonus,
          saveProcessed: false,
        };

        tokenIds.push(token.id);
      } catch (e) {
        console.error('PF2E Visioner | Error calculating cover for token:', e);
      }
    }
    return { targetData, tokenIds };
  }

  async onUpdateDocument(document, changes) {
    try {
      if (document?.documentName !== 'MeasuredTemplate') return;

      // If position or shape changed, we might need to recalculate cover
      if (
        changes.x !== undefined ||
        changes.y !== undefined ||
        changes.distance !== undefined ||
        changes.direction !== undefined ||
        changes.angle !== undefined ||
        changes.t !== undefined
      ) {
      }
    } catch (e) {
      console.error('PF2E Visioner | Error in updateDocument hook:', e);
    }
  }

  async onDeleteDocument(document) {
    try {
      if (document?.documentName !== 'MeasuredTemplate') return;
      // Check if this is a MeasuredTemplate document

      if (this._templatesData.has(document?.id) && document?.id) {
        const isTemplateActiveForReflexSaves = this._activeReflexSaves?.has?.(document.id);

        if (isTemplateActiveForReflexSaves) {
          // Schedule cleanup after 10 seconds to allow reflex saves to be processed
          setTimeout(() => {
            try {
              if (this._templatesData?.has?.(document.id)) {
                // Remove from our maps
                this._removeTemplateFromTargetIndex(document.id);
                this._templatesData.delete(document.id);

                // Also clean up from active reflex saves tracking
                if (this._activeReflexSaves) {
                  this._activeReflexSaves.delete(document.id);
                }
              }
            } catch (e) {
              console.error('PF2E Visioner | Error in delayed template cleanup:', e);
            }
          }, 10000); // 10 seconds delay
        } else {
          // Only remove from our maps, don't delete the actual template from canvas
          this._removeTemplateFromTargetIndex(document.id);
          this._templatesData.delete(document.id);

          // Also clean up from active reflex saves tracking
          if (this._activeReflexSaves) {
            this._activeReflexSaves.delete(document.id);
          }
        }
      }
    } catch (e) {
      console.error('PF2E Visioner | Error in deleteDocument hook:', e);
    }
  }

  /**
   * Starts a timer to clean up old template data
   * @private
   */
  _startCleanupTimer() {
    // Clean up old templates every minute
    setInterval(() => {
      try {
        this.cleanupOldTemplates();
      } catch (error) {
        console.error('PF2E Visioner | Error in template cleanup:', error);
      }
    }, 60000);
  }

  /**
   * Removes templates older than 10 minutes
   */
  cleanupOldTemplates() {
    const now = Date.now();
    const oldTemplates = [];

    for (const [id, data] of this._templatesData.entries()) {
      // Keep templates with active reflex saves regardless of age
      if (this._activeReflexSaves.has(id)) continue;

      // Remove templates older than 10 minutes
      if (now - data.timestamp > 600000) {
        // 10 minutes
        oldTemplates.push(id);
      }
    }

    // Only remove template data from our maps, don't delete templates from canvas
    for (const id of oldTemplates) {
      this._removeTemplateFromTargetIndex(id);
      this._templatesData.delete(id);
    }
  }

  /**
   * Registers a new template with all tokens inside it
   * @param {Object} document - Template document
   * @param {string} creatorId - ID of the token that created the template
   * @returns {Object} Template data
   */
  async registerTemplate(document, userId) {
    // Guard against null/undefined documents
    if (!document) {
      return null;
    }

    // Only process templates created by this user
    if (userId !== game?.userId) {
      return null;
    }

    // Get template details
    const x = Number(document?.x ?? 0);
    const y = Number(document?.y ?? 0);
    const center = { x, y };
    const tType = String(document.t || document.type || 'circle');
    const radiusFeet = Number(document.distance) || 0;
    const dirDeg = Number(document.direction ?? 0);
    const halfAngle = Number(document.angle ?? 90) / 2;

    // Try to determine the caster/creator of the template
    let creator = null;
    let creatorId = null;
    let creatorType = 'unknown';

    const {
      creator: spellCreator,
      creatorId: spellCreatorId,
      creatorType: spellCreatorType,
    } = this.getSpellCreator(document);

    if (spellCreator) {
      creator = spellCreator;
      creatorId = spellCreatorId;
      creatorType = spellCreatorType;
    }

    // If not found via spell origin, check for controlled token
    if (!creatorId) {
      creator = canvas?.tokens?.controlled?.[0] ?? game?.user?.character?.getActiveTokens?.()?.[0];
      if (creator) {
        creatorId = creator.id;
        creatorType = 'controlled';
      }
    }

    // Find all tokens inside the template
    const gridSize = canvas?.grid?.size || 100;
    const feetPerSquare = canvas?.dimensions?.distance || 5;
    const radiusSquares = radiusFeet / feetPerSquare;
    const radiusWorld = radiusSquares * gridSize;

    const candidates = canvas?.tokens?.placeables?.filter?.((t) => t?.actor) || [];
    const tokensInside = this._findTokensInsideTemplate(
      candidates,
      center,
      radiusWorld,
      tType,
      dirDeg,
      halfAngle,
    );

    const { targetData, tokenIds } = await this.getCoverBonusForTokensInsideTemplate(
      tokensInside,
      center,
    );

    // Store template data with all targets inside it
    const templateData = {
      id: document.id,
      type: tType,
      center,
      radiusFeet,
      dirDeg,
      halfAngle,
      creatorId,
      creatorType,
      tokenIds,
      targets: targetData,
      timestamp: Date.now(),
    };

    this._templatesData.set(document.id, templateData);
    this._indexTemplateData(document.id, templateData);

    this.setTemplateOrigin(creatorId, center);
    if (document.flags?.pf2e?.origin?.rollOptions?.includes('origin:item:defense:reflex')) {
      this._activeReflexSaves.set(document.id, { ts: Date.now() });
    }

    return templateData;
  }

  /**
   * Find tokens inside a template area
   * @param {Object} center - Template center point
   * @param {number} radiusFeet - Template radius in feet
   * @param {string} tType - Template type ('circle', 'cone', etc.)
   * @param {number} dirDeg - Direction in degrees
   * @param {number} halfAngle - Half angle in degrees (for cones)
   * @returns {Array} Tokens inside the template
   * @private
   */
  _findTokensInsideTemplate(candidates, center, radiusWorld, tType, dirDeg, halfAngle) {
    const norm = (a) => ((a % 360) + 360) % 360;
    const angDist = (a, b) => {
      const d = Math.abs(norm(a) - norm(b));
      return d > 180 ? 360 - d : d;
    };

    return candidates.filter((t) => {
      try {
        const cx = t.center?.x ?? t.x;
        const cy = t.center?.y ?? t.y;
        const dx = cx - center.x;
        const dy = cy - center.y;
        const dist = Math.hypot(dx, dy);

        if (dist > radiusWorld + 1) return false;
        if (tType === 'cone') {
          const theta = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
          const delta = angDist(theta, dirDeg);
          return delta <= halfAngle + 0.5; // small tolerance
        }
        // Default: circle-like
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  /**
   * Get template data by ID
   * @param {string} templateId
   * @returns {Object|null}
   */
  getTemplateData(templateId) {
    return this._templatesData.get(templateId) || null;
  }

  _removeTemplateFromTargetIndex(templateId) {
    if (!templateId || !this._templateTargetIndex) return;

    for (const [targetId, entries] of this._templateTargetIndex.entries()) {
      const filtered = entries.filter((entry) => entry.id !== templateId);
      if (filtered.length > 0) this._templateTargetIndex.set(targetId, filtered);
      else this._templateTargetIndex.delete(targetId);
    }
  }

  _indexTemplateData(templateId, templateData) {
    if (!templateId || !templateData?.targets || !this._templateTargetIndex) return;

    this._removeTemplateFromTargetIndex(templateId);
    const timestamp = Number(templateData.timestamp || 0);
    for (const targetId of Object.keys(templateData.targets)) {
      const entries = this._templateTargetIndex.get(targetId) || [];
      entries.push({ id: templateId, data: templateData, timestamp });
      entries.sort((a, b) => b.timestamp - a.timestamp);
      this._templateTargetIndex.set(targetId, entries);
    }
  }

  _findLatestTemplateForTargetByScan(targetId) {
    if (!targetId) return null;

    let latest = null;
    let latestTs = 0;
    for (const [id, data] of this._templatesData.entries()) {
      if (!data?.targets?.[targetId]) continue;
      const timestamp = Number(data.timestamp || 0);
      if (timestamp > latestTs) {
        latest = { id, data };
        latestTs = timestamp;
      }
    }

    return latest;
  }

  getLatestTemplateForTarget(targetId) {
    if (!targetId) return null;

    const entries = this._templateTargetIndex?.get?.(targetId) || [];
    while (entries.length > 0) {
      const entry = entries[0];
      if (this._templatesData.get(entry.id) === entry.data) {
        return { id: entry.id, data: entry.data };
      }
      entries.shift();
    }

    if (entries.length === 0) this._templateTargetIndex?.delete?.(targetId);

    const latest = this._findLatestTemplateForTargetByScan(targetId);
    if (latest) this._indexTemplateData(latest.id, latest.data);
    return latest;
  }

  /**
   * Check if a template is being used for reflex saves
   * @param {string} templateId
   * @returns {boolean}
   */
  getActiveReflexSaveTemplate(templateId) {
    return this._activeReflexSaves.get(templateId);
  }

  /**
   * Mark a template as being used for reflex saves
   * @param {string} templateId
   */
  addActiveReflexSaveTemplate(templateId) {
    if (!templateId) return;
    this._activeReflexSaves.set(templateId, { ts: Date.now() });
  }

  /**
   * Unmark a template as being used for reflex saves
   * @param {string} templateId
   */
  removeActiveReflexSaveTemplate(templateId) {
    if (!templateId) return;
    this._activeReflexSaves.delete(templateId);
  }

  /**
   * Get template origin for a token
   * @param {string} tokenId
   * @returns {Object|null}
   */
  getTemplateOrigin(tokenId) {
    return this._templatesOrigins.get(tokenId) || null;
  }

  /**
   * Set template origin for a token
   * @param {string} tokenId
   * @param {Object} origin
   */
  setTemplateOrigin(tokenId, origin) {
    if (!tokenId || !origin) return;
    this._templatesOrigins.set(tokenId, {
      ...origin,
      ts: Date.now(),
    });
  }

  /**
   * Remove template data
   * @param {string} templateId
   */
  removeTemplateData(templateId) {
    if (!templateId) return;
    this._removeTemplateFromTargetIndex(templateId);
    this._templatesData.delete(templateId);
    this._activeReflexSaves.delete(templateId);
  }
}

const templateManager = new TemplateManager();
export default templateManager;
