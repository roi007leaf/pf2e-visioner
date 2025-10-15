import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class ActionQualifier {
  static async applyActionQualifications(operation, subjectToken) {
    if (!subjectToken) return;

    const { qualifications, source, priority = 100, range, predicate } = operation;

    // Check predicate if provided
    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(subjectToken);
      if (!PredicateHelper.evaluate(predicate, rollOptions)) {
        return;
      }
    }

    const qualificationData = {
      id: source || `qualification-${Date.now()}`,
      type: source,
      priority,
      qualifications,
      range
    };

    await subjectToken.document.setFlag(
      'pf2e-visioner', 
      `actionQualifications.${qualificationData.id}`, 
      qualificationData
    );
  }

  static async removeActionQualifications(operation, subjectToken) {
    if (!subjectToken) return;

    const { source } = operation;
    const qualifications = subjectToken.document.getFlag('pf2e-visioner', 'actionQualifications') || {};
    
    if (qualifications[source]) {
      delete qualifications[source];
      await subjectToken.document.setFlag('pf2e-visioner', 'actionQualifications', qualifications);
    }
  }

  static getActionQualifications(token, action) {
    if (!token?.document) return [];

    const qualifications = token.document.getFlag('pf2e-visioner', 'actionQualifications') || {};
    
    return Object.values(qualifications)
      .filter(q => q.qualifications?.[action])
      .map(q => ({
        id: q.id,
        priority: q.priority,
        ...q.qualifications[action]
      }));
  }

  static canUseConcealment(token, action, source = null) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return true;

    if (source) {
      const sourceQual = qualifications.find(q => q.id === source);
      if (sourceQual) {
        return sourceQual.canUseThisConcealment !== false;
      }
    }

    return !qualifications.some(q => q.canUseThisConcealment === false);
  }

  static canUseCover(token, action, source = null) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return true;

    if (source) {
      const sourceQual = qualifications.find(q => q.id === source);
      if (sourceQual) {
        return sourceQual.canUseThisCover !== false;
      }
    }

    return !qualifications.some(q => q.canUseThisCover === false);
  }

  static endPositionQualifies(token, action) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return true;

    return !qualifications.some(q => q.endPositionQualifies === false);
  }

  static startPositionQualifies(token, action) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return true;

    return !qualifications.some(q => q.startPositionQualifies === false);
  }

  static ignoreConcealment(token, action, targetToken = null) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return false;

    if (targetToken) {
      const distance = canvas.grid.measureDistance(token, targetToken);
      return qualifications.some(q => {
        if (q.range && distance > q.range) return false;
        return q.ignoreThisConcealment === true || q.ignoreConcealment === true;
      });
    }

    return qualifications.some(q => 
      q.ignoreThisConcealment === true || q.ignoreConcealment === true
    );
  }

  static ignoreCover(token, action, targetToken = null) {
    const qualifications = this.getActionQualifications(token, action);
    
    if (qualifications.length === 0) return false;

    if (targetToken) {
      const distance = canvas.grid.measureDistance(token, targetToken);
      return qualifications.some(q => {
        if (q.range && distance > q.range) return false;
        return q.ignoreThisCover === true;
      });
    }

    return qualifications.some(q => q.ignoreThisCover === true);
  }

  static getCustomMessages(token, action) {
    const qualifications = this.getActionQualifications(token, action);
    
    return qualifications
      .filter(q => q.customMessage)
      .map(q => q.customMessage);
  }

  static checkHidePrerequisites(token) {
    const visibilitySources = SourceTracker.getVisibilityStateSources(token);
    const coverSources = SourceTracker.getCoverStateSources(token);

    const qualifyingConcealment = visibilitySources.filter(source => {
      return this.canUseConcealment(token, 'hide', source.id);
    });

    const qualifyingCover = coverSources.filter(source => {
      return this.canUseCover(token, 'hide', source.id);
    });

    const hasQualifying = qualifyingConcealment.length > 0 || qualifyingCover.length > 0;
    const messages = this.getCustomMessages(token, 'hide');

    return {
      canHide: hasQualifying,
      qualifyingConcealment: qualifyingConcealment.length,
      qualifyingCover: qualifyingCover.length,
      messages
    };
  }

  static checkSneakPrerequisites(token, position = 'start') {
    const positionCheck = position === 'end' 
      ? this.endPositionQualifies(token, 'sneak')
      : this.startPositionQualifies(token, 'sneak');

    const messages = this.getCustomMessages(token, 'sneak');

    return {
      qualifies: positionCheck,
      messages
    };
  }
}

