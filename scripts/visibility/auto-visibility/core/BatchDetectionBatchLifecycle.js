export class BatchDetectionBatchLifecycle {
  #start;
  #flush;
  #discard;
  #open = false;

  constructor({ start = () => {}, flush = async () => {}, discard = () => {} } = {}) {
    this.#start = start;
    this.#flush = flush;
    this.#discard = discard;
  }

  start() {
    if (this.#open) return;
    this.#start();
    this.#open = true;
  }

  async flush() {
    if (!this.#open) return;
    await this.#flush();
    this.#open = false;
  }

  discard() {
    if (!this.#open) return;
    this.#discard();
    this.#open = false;
  }

  discardIfOpen() {
    this.discard();
  }
}
