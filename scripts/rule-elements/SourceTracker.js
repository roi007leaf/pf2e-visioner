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

    const currentStateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
    let modified = false;

    if (observerId) {
      ['visibilityByObserver', 'coverByObserver'].forEach(observerKey => {
        if (currentStateSource[observerKey]?.[observerId]?.sources) {
          const sources = currentStateSource[observerKey][observerId].sources;
          const newSources = sources.filter(s => s.id !== sourceId);
          if (newSources.length !== sources.length) {
            currentStateSource[observerKey][observerId].sources = newSources;
            modified = true;
          }
        }
      });
    } else {
      const types = stateType ? [stateType] : ['visibility', 'cover'];

      types.forEach(type => {
        if (currentStateSource[type]?.sources) {
          const sources = currentStateSource[type].sources;
          const newSources = sources.filter(s => s.id !== sourceId);
          if (newSources.length !== sources.length) {
            currentStateSource[type].sources = newSources;
            modified = true;
          }
        }
      });

      // Also remove from all observer-scoped entries when no specific observer is provided
      ['visibilityByObserver', 'coverByObserver'].forEach(observerKey => {
        const byObserver = currentStateSource[observerKey];
        if (!byObserver) return;
        for (const [obsId, data] of Object.entries(byObserver)) {
          const srcs = Array.isArray(data?.sources) ? data.sources : [];
          const filtered = srcs.filter(s => s.id !== sourceId);
          if (filtered.length !== srcs.length) {
            byObserver[obsId].sources = filtered;
            modified = true;
          }
          if (Array.isArray(byObserver[obsId].sources) && byObserver[obsId].sources.length === 0) {
            delete byObserver[obsId];
            modified = true;
          }
        }
        if (Object.keys(byObserver).length === 0) {
          delete currentStateSource[observerKey];
          modified = true;
        }
      });
    }

    if (modified) {
      await token.document.setFlag('pf2e-visioner', 'stateSource', currentStateSource);
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

