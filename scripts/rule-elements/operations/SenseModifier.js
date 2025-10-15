import { PredicateHelper } from '../PredicateHelper.js';

export class SenseModifier {
  static applySenseModifications(token, senseModifications, ruleElementId, predicate = null) {
    if (!token?.actor || !senseModifications) return;

    // Check predicate if provided
    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(token);
      if (!PredicateHelper.evaluate(predicate, rollOptions)) {
        return;
      }
    }

    const originalSenses = token.document.getFlag('pf2e-visioner', 'originalSenses') || {};
    
    if (!originalSenses[ruleElementId]) {
      originalSenses[ruleElementId] = this.captureOriginalSenses(token.actor);
    }

    const senses = token.actor.system?.perception?.senses || [];
    
    Object.entries(senseModifications).forEach(([senseName, modifications]) => {
      if (senseName === 'all') {
        this.modifyAllSenses(token, modifications);
      } else {
        this.modifySense(token, senseName, modifications);
      }
    });

    token.document.setFlag('pf2e-visioner', 'originalSenses', originalSenses);
  }

  static captureOriginalSenses(actor) {
    const senses = actor.system?.perception?.senses || [];
    return senses.map(sense => ({
      type: sense.type,
      acuity: sense.acuity,
      range: sense.range,
      source: sense.source
    }));
  }

  static modifySense(token, senseName, modifications) {
    if (!token?.actor?.system?.perception?.senses) return;

    const senses = token.actor.system.perception.senses;
    const senseIndex = senses.findIndex(s => 
      s.type?.toLowerCase() === senseName.toLowerCase()
    );

    if (senseIndex === -1) {
      if (modifications.precision) {
        senses.push({
          type: senseName,
          acuity: modifications.precision,
          range: modifications.range || Infinity,
          source: 'PF2e Visioner Rule Element'
        });
      }
      return;
    }

    const sense = senses[senseIndex];

    if (modifications.range !== undefined) {
      sense.range = modifications.range;
    }

    if (modifications.precision !== undefined) {
      sense.acuity = modifications.precision;
    }

    if (modifications.maxRange !== undefined) {
      sense.range = Math.min(sense.range, modifications.maxRange);
    }
  }

  static modifyAllSenses(token, modifications) {
    if (!token?.actor?.system?.perception?.senses) return;

    const senses = token.actor.system.perception.senses;

    senses.forEach(sense => {
      if (modifications.maxRange !== undefined) {
        sense.range = Math.min(sense.range, modifications.maxRange);
      }

      if (modifications.beyondIsImprecise && sense.range > modifications.maxRange) {
        sense.acuity = 'imprecise';
      }
    });
  }

  static async restoreSenses(token, ruleElementId) {
    if (!token?.actor) return;

    const originalSenses = token.document.getFlag('pf2e-visioner', 'originalSenses') || {};
    
    if (!originalSenses[ruleElementId]) return;

    const stored = originalSenses[ruleElementId];
    if (token.actor.system?.perception?.senses) {
      token.actor.system.perception.senses = stored;
    }

    delete originalSenses[ruleElementId];
    await token.document.setFlag('pf2e-visioner', 'originalSenses', originalSenses);
  }

  static getSenseCapabilities(token) {
    if (!token?.actor?.system?.perception?.senses) return {};

    const senses = token.actor.system.perception.senses;
    const capabilities = {
      precise: {},
      imprecise: {}
    };

    senses.forEach(sense => {
      const category = sense.acuity === 'precise' ? 'precise' : 'imprecise';
      capabilities[category][sense.type] = {
        range: sense.range,
        acuity: sense.acuity
      };
    });

    return capabilities;
  }
}

