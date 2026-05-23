export class DetectionFrameCache {
  constructor({
    moduleId,
    getVisibilityMap,
    getPerceptionProfileBetween,
    getControlledObserverTokens,
    getBestVisibilityState,
    getSetting,
    getTokens,
    getInvalidationRevision = () => 0,
    scheduleClear = (task) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(task);
      else Promise.resolve().then(task);
    },
  } = {}) {
    this.moduleId = moduleId;
    this.getVisibilityMap = getVisibilityMap;
    this.getPerceptionProfileBetween = getPerceptionProfileBetween;
    this.getControlledObserverTokens = getControlledObserverTokens;
    this.getBestVisibilityState = getBestVisibilityState;
    this.getSetting = getSetting;
    this.getTokens = getTokens;
    this.getInvalidationRevision = getInvalidationRevision;
    this.scheduleClear = scheduleClear;
    this.clear();
  }

  clear() {
    this.visibilityMaps = new Map();
    this.perceptionProfiles = new Map();
    this.aggregationEnabled = undefined;
    this.controlledObserverTokens = undefined;
    this.visionSharingIndex = null;
    this.clearScheduled = false;
    this.invalidationRevision = this.getInvalidationRevision?.() ?? 0;
  }

  #touch() {
    const revision = this.getInvalidationRevision?.() ?? 0;
    if (revision !== this.invalidationRevision) {
      this.clear();
    }
    if (this.clearScheduled) return;
    this.clearScheduled = true;
    this.scheduleClear(() => this.clear());
  }

  #tokenId(tokenOrDocument) {
    return tokenOrDocument?.document?.id || tokenOrDocument?.id || null;
  }

  #tokenSource(tokenOrDocument) {
    return tokenOrDocument?.document || tokenOrDocument || null;
  }

  #getVisibilityMap(token) {
    const tokenId = this.#tokenId(token);
    const source = this.#tokenSource(token);
    if (!tokenId) return {};
    this.#touch();
    const cached = this.visibilityMaps.get(tokenId);
    if (!cached || cached.source !== source) {
      this.visibilityMaps.set(tokenId, {
        source,
        map: this.getVisibilityMap?.(token) || {},
      });
    }
    return this.visibilityMaps.get(tokenId).map;
  }

  isAggregationEnabled() {
    this.#touch();
    if (this.aggregationEnabled === undefined) {
      try {
        this.aggregationEnabled = !!this.getSetting?.('enableCameraVisionAggregation');
      } catch {
        this.aggregationEnabled = false;
      }
    }
    return this.aggregationEnabled;
  }

  getControlledObservers() {
    this.#touch();
    return this.getControlledObserverTokens?.() || [];
  }

  getVisibility(observer, target) {
    const targetId = this.#tokenId(target);
    if (!observer || !targetId) return 'observed';

    if (!this.isAggregationEnabled()) {
      return this.#getVisibilityMap(observer)[targetId] || 'observed';
    }

    const observers = this.getControlledObservers();
    if (observers.length <= 1) {
      return this.#getVisibilityMap(observers[0] || observer)[targetId] || 'observed';
    }

    const states = observers
      .map((observerToken) => this.#getVisibilityMap(observerToken)[targetId] || 'observed')
      .filter((state) => state !== undefined && state !== null);

    return states.length ? this.getBestVisibilityState?.(states) || 'observed' : 'observed';
  }

  getPerceptionProfile(observer, target) {
    const observerId = this.#tokenId(observer);
    const targetId = this.#tokenId(target);
    if (!observerId || !targetId) return null;
    const key = `${observerId}->${targetId}`;
    const observerSource = this.#tokenSource(observer);
    const targetSource = this.#tokenSource(target);
    this.#touch();
    const cached = this.perceptionProfiles.get(key);
    if (
      !cached ||
      cached.observerSource !== observerSource ||
      cached.targetSource !== targetSource
    ) {
      this.perceptionProfiles.set(key, {
        observerSource,
        targetSource,
        profile: this.getPerceptionProfileBetween?.(observer, target) || null,
      });
    }
    return this.perceptionProfiles.get(key).profile;
  }

  #buildVisionSharingIndex() {
    const byMaster = new Map();
    const byToken = new Map();

    for (const token of this.getTokens?.() || []) {
      const document = token?.document;
      const tokenId = this.#tokenId(document);
      if (!document || !tokenId) continue;

      const masterId = document.getFlag?.(this.moduleId, 'visionMasterTokenId') || null;
      const mode = document.getFlag?.(this.moduleId, 'visionSharingMode') || 'one-way';
      const entry = { token, document, tokenId, masterId, mode };
      byToken.set(tokenId, entry);

      if (!masterId) continue;
      if (!byMaster.has(masterId)) byMaster.set(masterId, []);
      byMaster.get(masterId).push(entry);
    }

    return { byMaster, byToken };
  }

  getVisionSharingIndex() {
    this.#touch();
    if (!this.visionSharingIndex) {
      this.visionSharingIndex = this.#buildVisionSharingIndex();
    }
    return this.visionSharingIndex;
  }

  getVisionSharingMode(tokenOrDocument) {
    const tokenId = this.#tokenId(tokenOrDocument);
    const document = tokenOrDocument?.document || tokenOrDocument;
    if (!tokenId) return document?.getFlag?.(this.moduleId, 'visionSharingMode') || 'one-way';
    return (
      this.getVisionSharingIndex().byToken.get(tokenId)?.mode ||
      document?.getFlag?.(this.moduleId, 'visionSharingMode') ||
      'one-way'
    );
  }

  getVisionMasterTokenId(tokenOrDocument) {
    const tokenId = this.#tokenId(tokenOrDocument);
    const document = tokenOrDocument?.document || tokenOrDocument;
    if (!tokenId) return document?.getFlag?.(this.moduleId, 'visionMasterTokenId') || null;
    return (
      this.getVisionSharingIndex().byToken.get(tokenId)?.masterId ||
      document?.getFlag?.(this.moduleId, 'visionMasterTokenId') ||
      null
    );
  }

  getMinionsForMaster(masterId, mode = null) {
    if (!masterId) return [];
    const entries = this.getVisionSharingIndex().byMaster.get(masterId) || [];
    return mode ? entries.filter((entry) => entry.mode === mode) : entries;
  }

  hasMinionWithMode(masterId, mode) {
    return this.getMinionsForMaster(masterId, mode).length > 0;
  }
}
