/**
 * LightingEventHandler - Handles lighting-related events that affect visibility
 * Manages ambient light source events that impact token visibility calculations
 *
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 */
import { AvsInvalidationCoordinator } from './AvsInvalidationCoordinator.js';
import {
  ambientLightCreated,
  ambientLightDeleted,
  ambientLightUpdated,
  lightingRefresh,
} from './InvalidationIntents.js';

export class LightingEventHandler {
  constructor(
    systemStateProvider,
    visibilityStateManager,
    cacheManager = null,
    invalidationCoordinator = null,
  ) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.cacheManager = cacheManager;
    this.invalidation =
      invalidationCoordinator ??
      new AvsInvalidationCoordinator({
        systemStateProvider,
        visibilityStateManager,
        cacheManager,
      });
  }

  /**
   * Initialize lighting event handlers
   */
  initialize() {
    Hooks.on('updateAmbientLight', this.handleLightUpdate.bind(this));
    Hooks.on('createAmbientLight', this.handleLightCreate.bind(this));
    Hooks.on('deleteAmbientLight', this.handleLightDelete.bind(this));
    // Also respond when Foundry refreshes lighting due to token-based light changes (e.g., Torch toggles)
    Hooks.on('lightingRefresh', this.handleLightingRefresh.bind(this));
  }

  /**
   * Handle ambient light update - affects visibility for all tokens
   */
  async handleLightUpdate(document, changeData, options, userId) {
    return this.invalidation.invalidate(
      ambientLightUpdated(document, changeData, { options, userId }),
    );
  }

  /**
   * Handle ambient light creation - affects visibility for all tokens
   */
  async handleLightCreate(document, options, userId) {
    return this.invalidation.invalidate(ambientLightCreated(document, { options, userId }));
  }

  /**
   * Handle ambient light deletion - affects visibility for all tokens
   */
  async handleLightDelete(document, options, userId) {
    return this.invalidation.invalidate(ambientLightDeleted(document, { options, userId }));
  }

  /**
   * Handle Foundry lighting refreshes. This fires for ambient and token-emitted light changes.
   * We use a throttled recalculation to avoid over-processing during continuous refreshes.
   */
  handleLightingRefresh() {
    return this.invalidation.invalidate(lightingRefresh());
  }

  /**
   * Track when controlToken events occur
   */
  static trackControlTokenEvent() {
    AvsInvalidationCoordinator.trackControlTokenEvent();
  }
}
