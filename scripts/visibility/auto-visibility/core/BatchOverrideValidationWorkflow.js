export class BatchOverrideValidationWorkflow {
  #getLastMovedTokenId;
  #overrideValidationManager;
  #warn;

  constructor({
    getLastMovedTokenId = () => null,
    overrideValidationManager = null,
    warn = () => {},
  } = {}) {
    this.#getLastMovedTokenId = getLastMovedTokenId;
    this.#overrideValidationManager = overrideValidationManager;
    this.#warn = warn;
  }

  async runBeforeResultApplication() {
    const tokenId = this.#getLastMovedTokenId();
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
