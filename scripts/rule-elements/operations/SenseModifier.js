import { PredicateHelper } from '../PredicateHelper.js';

export class SenseModifier {
  static async applySenseModifications(token, senseModifications, ruleElementId, predicate = null) {
    if (!token?.actor || !senseModifications) return;





    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(token);
      if (!PredicateHelper.evaluate(predicate, rollOptions)) {

        return;
      }
    }

    const escapedRuleElementId = ruleElementId.replace(/\./g, '___');
    const originalPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

    if (!originalPerception[escapedRuleElementId]) {
      originalPerception[escapedRuleElementId] = {};
    }

    if (!originalPerception[escapedRuleElementId].senses) {
      originalPerception[escapedRuleElementId].senses = structuredClone(token.actor.system?.perception?.senses || []);
    }

    const senses = structuredClone(originalPerception[escapedRuleElementId].senses);

    Object.entries(senseModifications).forEach(([senseName, modifications]) => {

      if (senseName === 'all') {
        this.modifyAllSensesArray(senses, modifications);
      } else {
        this.modifySenseInArray(senses, senseName, modifications);
      }
    });

    await token.document.update({
      [`flags.pf2e-visioner.originalPerception.${ruleElementId.replace(/\./g, '___')}`]: originalPerception[ruleElementId]
    });

    const flagCheckAfterSet = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};


    try {
      await token.actor.update({ 'system.perception.senses': senses });

    } catch (error) {
      console.warn('PF2E Visioner | Failed to update actor senses:', error);
    }
  }

  static modifySenseInArray(senses, senseName, modifications) {
    const senseIndex = senses.findIndex(s =>
      s.type?.toLowerCase() === senseName.toLowerCase()
    );



    if (senseIndex === -1) {

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

  static modifyAllSensesArray(senses, modifications) {



    senses.forEach((sense, index) => {


      if (modifications.maxRange !== undefined) {
        const oldRange = sense.range;
        sense.range = Math.min(sense.range, modifications.maxRange);

      }

      if (modifications.range !== undefined) {
        const oldRange = sense.range;
        sense.range = modifications.range;

      }

      if (modifications.beyondIsImprecise && sense.range > modifications.maxRange) {
        sense.acuity = 'imprecise';

      }

      if (modifications.precision !== undefined) {
        const oldAcuity = sense.acuity;
        sense.acuity = modifications.precision;

      }


    });


  }

  static async restoreSenses(token, ruleElementId) {
    if (!token?.actor) return;



    const escapedRuleElementId = ruleElementId.replace(/\./g, '___');
    const originalPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};



    if (!originalPerception[escapedRuleElementId]?.senses) {

      return;
    }

    const senses = originalPerception[escapedRuleElementId].senses;


    try {
      await token.actor.update({ 'system.perception.senses': senses });

    } catch (error) {
      console.warn('PF2E Visioner | Failed to restore actor senses:', error);
    }

    const currentPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

    if (currentPerception[escapedRuleElementId]?.detectionModes === undefined) {
      await token.document.update({
        [`flags.pf2e-visioner.originalPerception.-=${escapedRuleElementId}`]: null
      });
    } else {
      delete currentPerception[escapedRuleElementId].senses;
      await token.document.update({
        [`flags.pf2e-visioner.originalPerception.${escapedRuleElementId}`]: currentPerception[escapedRuleElementId]
      });
    }
  }

  static getSenseCapabilities(token) {
    if (!token?.actor?.system?.perception) return {};

    const senses = token.actor.system.perception.senses || [];

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
