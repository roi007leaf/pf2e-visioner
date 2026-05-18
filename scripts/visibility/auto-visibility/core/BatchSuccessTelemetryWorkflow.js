import { buildSuccessTelemetryPayload } from './BatchFinalizationPolicy.js';

export class BatchSuccessTelemetryWorkflow {
  #stopTelemetry;
  #getClientId;
  #getClientName;
  #getViewportFilteringEnabled;
  #hasDarknessSources;
  #getDebugMode;

  constructor({
    stopTelemetry = () => {},
    getClientId = () => undefined,
    getClientName = () => undefined,
    getViewportFilteringEnabled = () => false,
    hasDarknessSources = () => false,
    getDebugMode = () => false,
  } = {}) {
    this.#stopTelemetry = stopTelemetry;
    this.#getClientId = getClientId;
    this.#getClientName = getClientName;
    this.#getViewportFilteringEnabled = getViewportFilteringEnabled;
    this.#hasDarknessSources = hasDarknessSources;
    this.#getDebugMode = getDebugMode;
  }

  report(context = {}) {
    const payload = buildSuccessTelemetryPayload({
      ...context,
      clientId: this.#getClientId(),
      clientName: this.#getClientName(),
      viewportFilteringEnabled: this.#getViewportFilteringEnabled(),
      hasDarknessSources: this.#hasDarknessSources(),
      debugMode: this.#getDebugMode(),
    });
    this.#stopTelemetry(payload);
    return payload;
  }
}
