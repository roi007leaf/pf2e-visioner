export class BatchOverrideValidationWorkflow {
  #getLastMovedTokenId;
  #isTokenMovementActive;
  #overrideValidationManager;
  #warn;

  constructor({
    getLastMovedTokenId = () => null,
    isTokenMovementActive = () => false,
    overrideValidationManager = null,
    warn = () => {},
  } = {}) {
    this.#getLastMovedTokenId = getLastMovedTokenId;
    this.#isTokenMovementActive = isTokenMovementActive;
    this.#overrideValidationManager = overrideValidationManager;
    this.#warn = warn;
  }

  async runBeforeResultApplication({ isMovementBatch = false } = {}) {
    const tokenId = this.#getLastMovedTokenId();
    if (isMovementBatch) {
      return { queued: false, tokenId, skipped: 'movement-batch' };
    }

    if (this.#isTokenMovementActive()) {
      return { queued: false, tokenId, skipped: 'active-movement' };
    }

    if (!tokenId || !this.#overrideValidationManager) {
      return { queued: false, tokenId };
    }

    try {
      this.#overrideValidationManager.queueOverrideValidation(tokenId);
      await this.#overrideValidationManager.processQueuedValidations();
      return { queued: true, tokenId };
    } catch (error) {
      this.#warn('PF2E Visioner | Error processing override validation in batch:', error);
      return { queued: false, tokenId, error };
    }
  }
}
