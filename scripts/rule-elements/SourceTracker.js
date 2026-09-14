export class SourceTracker {
  static getVisibilityStateSources(token, observerId = null) {
    if (!token?.document) return [];

    const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};

    if (observerId) {
      const observerVisibility = stateSource.visibilityByObserver?.[observerId];
      return observerVisibility?.sources || [];
    }

    return stateSource.visibility?.sources || [];
  }

  static getCoverStateSources(token, observerId = null) {
    if (!token?.document) return [];

    const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};

    if (observerId) {
      const observerCover = stateSource.coverByObserver?.[observerId];
      return observerCover?.sources || [];
    }

    return stateSource.cover?.sources || [];
  }

  static getQualifyingSources(token, action, stateType, observerId = null) {
    const sources = stateType === 'visibility'
      ? this.getVisibilityStateSources(token, observerId)
      : this.getCoverStateSources(token, observerId);

    return sources.filter(source => {
      const qualifications = source.qualifications?.[action];
      if (!qualifications) return true;

      if (stateType === 'visibility') {
        return qualifications.canUseThisConcealment !== false;
      } else {
        return qualifications.canUseThisCover !== false;
      }
    });
  }

  static async addSourceToState(token, stateType, source, observerId = null) {
    if (!token?.document) return;

    const currentStateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};

    if (observerId) {
      const observerKey = stateType === 'visibility' ? 'visibilityByObserver' : 'coverByObserver';
      if (!currentStateSource[observerKey]) {
        currentStateSource[observerKey] = {};
      }
      if (!currentStateSource[observerKey][observerId]) {
        currentStateSource[observerKey][observerId] = { sources: [] };
      }

      const existingIndex = currentStateSource[observerKey][observerId].sources.findIndex(
        s => s.id === source.id
      );

      if (existingIndex >= 0) {
        currentStateSource[observerKey][observerId].sources[existingIndex] = source;
      } else {
        currentStateSource[observerKey][observerId].sources.push(source);
      }

      if (source.state) {
        currentStateSource[observerKey][observerId].state = source.state;
      }
    } else {
      if (!currentStateSource[stateType]) {
        currentStateSource[stateType] = { sources: [] };
      }

      const existingIndex = currentStateSource[stateType].sources.findIndex(
        s => s.id === source.id
      );

      if (existingIndex >= 0) {
        currentStateSource[stateType].sources[existingIndex] = source;
      } else {
        currentStateSource[stateType].sources.push(source);
      }

      if (source.state) {
        currentStateSource[stateType].state = source.state;
      }
    }

    await token.document.setFlag('pf2e-visioner', 'stateSource', currentStateSource);
  }

  static async removeSource(token, sourceId, stateType = null, observerId = null) {
    if (!token?.document) return;

    const stored = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
    const update = {};
    for (const type of stateType ? [stateType] : ['visibility', 'cover']) {
      if (!observerId && Array.isArray(stored[type]?.sources)) {
        const sources = stored[type].sources.filter(source => source.id !== sourceId);
        if (sources.length !== stored[type].sources.length) {
          update[type] = { ...stored[type], sources, state: this.getEffectiveState(sources, type) };
        }
      }
      const key = type + 'ByObserver';
      for (const [id, data] of Object.entries(stored[key] || {})) {
        if (observerId && id !== observerId) continue;
        if (!Array.isArray(data?.sources)) continue;
        const sources = data.sources.filter(source => source.id !== sourceId);
        if (sources.length === data.sources.length) continue;
        update[key] ??= {};
        // Foundry merges flags. Explicit deletion prevents removed sources from
        // surviving on the server or other clients; never mutate getFlag data.
        if (!sources.length) update[key]['-=' + id] = null;
        else update[key][id] = { ...data, sources, state: this.getEffectiveState(sources, type) };
      }
    }
    if (Object.keys(update).length) {
      await token.document.setFlag('pf2e-visioner', 'stateSource', update);
    }
  }

  static async clearAllSources(token) {
    if (!token?.document) return;
    await token.document.unsetFlag('pf2e-visioner', 'stateSource');
  }

  static getHighestPrioritySource(sources) {
    if (!sources || sources.length === 0) return null;

    return sources.reduce((highest, current) => {
      const highestPriority = highest?.priority || 0;
      const currentPriority = current?.priority || 0;
      return currentPriority > highestPriority ? current : highest;
    }, sources[0]);
  }

  static getEffectiveState(sources, stateType) {
    if (!sources || sources.length === 0) return null;

    const prioritySource = this.getHighestPrioritySource(sources);
    return prioritySource?.state || null;
  }

  static hasDisqualifyingSource(sources, action) {
    if (!sources || sources.length === 0) return false;

    return sources.some(source => {
      const qualifications = source.qualifications?.[action];
      if (!qualifications) return false;

      return qualifications.canUseThisConcealment === false ||
        qualifications.canUseThisCover === false;
    });
  }

  static getCustomMessages(sources, action) {
    if (!sources || sources.length === 0) return [];

    return sources
      .filter(source => source.qualifications?.[action]?.customMessage)
      .map(source => source.qualifications[action].customMessage);
  }
}

