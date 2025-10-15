import { ActionQualifier } from './operations/ActionQualifier.js';
import { SourceTracker } from './SourceTracker.js';

export class ActionQualificationIntegration {
  static checkHideQualifications(token, qualification) {
    if (!token || !qualification) return qualification;

    try {
      const result = ActionQualifier.checkHidePrerequisites(token);
      
      if (!result.canHide) {
        qualification.endQualifies = false;
        qualification.bothQualify = false;
        qualification.reason = result.messages.length > 0 
          ? result.messages.join(', ')
          : game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.MESSAGES.CONCEALMENT_QUALIFICATION_FAILED');
      }

      if (result.messages.length > 0) {
        qualification.ruleElementMessages = result.messages;
      }
    } catch (error) {
      console.warn('PF2E Visioner | Error checking hide qualifications:', error);
    }

    return qualification;
  }

  static checkSneakQualifications(token, qualification, position = 'start') {
    if (!token || !qualification) return qualification;

    try {
      const result = ActionQualifier.checkSneakPrerequisites(token, position);
      
      if (!result.qualifies) {
        if (position === 'start') {
          qualification.startQualifies = false;
        } else {
          qualification.endQualifies = false;
        }
        qualification.bothQualify = qualification.startQualifies && qualification.endQualifies;
        
        if (result.messages.length > 0) {
          qualification.reason = result.messages.join(', ');
        }
      }

      if (result.messages.length > 0) {
        qualification.ruleElementMessages = result.messages;
      }
    } catch (error) {
      console.warn('PF2E Visioner | Error checking sneak qualifications:', error);
    }

    return qualification;
  }

  static checkSourceQualifications(token, action, stateType) {
    if (!token) return { qualifies: true, messages: [] };

    try {
      const sources = stateType === 'visibility'
        ? SourceTracker.getVisibilityStateSources(token)
        : SourceTracker.getCoverStateSources(token);

      const qualifyingSources = SourceTracker.getQualifyingSources(token, action, stateType);
      const hasDisqualifying = SourceTracker.hasDisqualifyingSource(sources, action);
      const messages = SourceTracker.getCustomMessages(sources, action);

      return {
        qualifies: qualifyingSources.length > 0 && !hasDisqualifying,
        messages,
        totalSources: sources.length,
        qualifyingSources: qualifyingSources.length
      };
    } catch (error) {
      console.warn('PF2E Visioner | Error checking source qualifications:', error);
      return { qualifies: true, messages: [] };
    }
  }

  static enhanceQualificationWithMessages(qualification) {
    if (!qualification) return qualification;

    if (qualification.ruleElementMessages && qualification.ruleElementMessages.length > 0) {
      const originalReason = qualification.reason || '';
      const messageText = qualification.ruleElementMessages.join('. ');
      qualification.reason = originalReason 
        ? `${originalReason}. ${messageText}`
        : messageText;
    }

    return qualification;
  }

  static async checkHideWithRuleElements(token, currentQualification) {
    if (!token) return currentQualification;

    const concealmentCheck = this.checkSourceQualifications(token, 'hide', 'visibility');
    const coverCheck = this.checkSourceQualifications(token, 'hide', 'cover');

    const hasQualifyingConcealment = concealmentCheck.qualifies;
    const hasQualifyingCover = coverCheck.qualifies;

    if (!hasQualifyingConcealment && !hasQualifyingCover) {
      currentQualification.endQualifies = false;
      currentQualification.bothQualify = false;
      
      const messages = [...concealmentCheck.messages, ...coverCheck.messages];
      if (messages.length > 0) {
        currentQualification.reason = messages.join('. ');
      }
    }

    return this.enhanceQualificationWithMessages(currentQualification);
  }

  static async checkSneakWithRuleElements(token, currentQualification, position = 'start') {
    if (!token) return currentQualification;

    const result = ActionQualifier.checkSneakPrerequisites(token, position);

    if (!result.qualifies) {
      if (position === 'start') {
        currentQualification.startQualifies = false;
      } else {
        currentQualification.endQualifies = false;
      }
      currentQualification.bothQualify = currentQualification.startQualifies && currentQualification.endQualifies;
      
      if (result.messages.length > 0) {
        currentQualification.reason = result.messages.join('. ');
      }
    }

    return this.enhanceQualificationWithMessages(currentQualification);
  }
}

