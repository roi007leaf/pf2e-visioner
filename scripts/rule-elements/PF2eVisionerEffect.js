import { ActionQualifier } from './operations/ActionQualifier.js';
import { CoverOverride } from './operations/CoverOverride.js';
import { LightingModifier } from './operations/LightingModifier.js';
import { SenseModifier } from './operations/SenseModifier.js';
import { VisibilityOverride } from './operations/VisibilityOverride.js';

export function createPF2eVisionerEffectRuleElement(baseRuleElementClass, fields) {
  if (!baseRuleElementClass || !fields) {
    console.error('PF2E Visioner | Missing dependencies for PF2eVisionerEffect creation');
    return null;
  }

  return class PF2eVisionerEffect extends baseRuleElementClass {
    static get name() {
      return 'PF2eVisionerEffect';
    }

    static get documentation() {
      return 'https://github.com/roileaf/pf2e-visioner/blob/main/RULE_ELEMENTS.md#pf2evisioner-effect-rule-element';
    }

    static get description() {
      return game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.DESCRIPTION');
    }

    static get defaultKey() {
      return 'PF2eVisionerEffect';
    }

    static defineSchema() {
      const schema = super.defineSchema();

      // Add predicate support at rule element level
      schema.predicate = new fields.ArrayField(
        new fields.StringField(),
        { required: false }
      );

      schema.operations = new fields.ArrayField(
        new fields.SchemaField({
          type: new fields.StringField({
            required: true,
            choices: [
              'modifySenses',
              'overrideVisibility',
              'overrideCover',
              'provideCover',
              'modifyActionQualification',
              'modifyLighting',
              'conditionalState'
            ],
            initial: 'overrideVisibility'
          }),
          
          // Predicate at operation level (more granular)
          predicate: new fields.ArrayField(
            new fields.StringField(),
            { required: false }
          ),
          
          senseModifications: new fields.ObjectField({ required: false }),
          
          state: new fields.StringField({
            required: false,
            choices: ['observed', 'concealed', 'hidden', 'undetected', 'none', 'lesser', 'standard', 'greater']
          }),
          
          direction: new fields.StringField({
            required: false,
            choices: ['from', 'to'],
            initial: 'from'
          }),
          
          observers: new fields.StringField({
            required: false,
            choices: ['all', 'allies', 'enemies', 'selected', 'targeted', 'specific'],
            initial: 'all'
          }),
          
          targets: new fields.StringField({
            required: false,
            choices: ['all', 'allies', 'enemies', 'selected', 'targeted', 'specific'],
            initial: 'all'
          }),
          
          tokenIds: new fields.ArrayField(
            new fields.StringField(),
            { required: false }
          ),
          
          source: new fields.StringField({ required: false }),
          
          preventConcealment: new fields.BooleanField({ required: false, initial: false }),
          
          blockedEdges: new fields.ArrayField(
            new fields.StringField({ choices: ['north', 'south', 'east', 'west'] }),
            { required: false }
          ),
          
          requiresTakeCover: new fields.BooleanField({ required: false, initial: false }),
          
          autoCoverBehavior: new fields.StringField({
            required: false,
            choices: ['add', 'replace', 'minimum'],
            initial: 'replace'
          }),
          
          preventAutoCover: new fields.BooleanField({ required: false, initial: false }),
          
          qualifications: new fields.ObjectField({ required: false }),
          
          condition: new fields.StringField({
            required: false,
            choices: ['invisible', 'concealed', 'hidden', 'undetected']
          }),
          
          thenState: new fields.StringField({ required: false }),
          
          elseState: new fields.StringField({ required: false }),
          
          stateType: new fields.StringField({
            required: false,
            choices: ['visibility', 'cover'],
            initial: 'visibility'
          }),
          
          lightingLevel: new fields.StringField({
            required: false,
            choices: ['darkness', 'dim', 'bright', 'magicalDarkness', 'greaterMagicalDarkness']
          }),
          
          range: new fields.NumberField({ required: false, nullable: true })
        }),
        { required: true }
      );

      schema.priority = new fields.NumberField({
        required: false,
        initial: 100
      });

      return schema;
    }

    get ruleElementId() {
      return `${this.item?.uuid || 'unknown'}-${this.slug || 'effect'}`;
    }

    async onCreate(actorUpdates) {
      await this.applyOperations();
    }

    async onDelete(actorUpdates) {
      await this.removeOperations();
    }

    async onUpdateEncounter({ event }) {
      if (event === 'turn-start' || event === 'turn-end') {
        await this.applyOperations();
      }
    }

    async applyOperations() {
      const token = this.getSubjectToken();
      
      if (!token) {
        return;
      }

      // Check rule element level predicate using PF2e's built-in method
      if (this.predicate && this.predicate.length > 0) {
        const rollOptions = token.actor.getRollOptions(['all']);
        if (!this.test(rollOptions)) {
          return;
        }
      }

      if (!this.operations || this.operations.length === 0) {
        console.warn(`PF2E Visioner | No operations defined for rule element`);
        return;
      }

      for (const operation of this.operations) {
        try {
          await this.applyOperation(operation, token);
        } catch (error) {
          console.error(`PF2E Visioner | Error applying operation ${operation.type}:`, error);
        }
      }
    }

    async applyOperation(operation, token) {
      switch (operation.type) {
        case 'modifySenses':
          SenseModifier.applySenseModifications(token, operation.senseModifications, this.ruleElementId, operation.predicate);
          break;

        case 'overrideVisibility':
          await VisibilityOverride.applyVisibilityOverride(operation, token);
          break;

        case 'overrideCover':
          await CoverOverride.applyCoverOverride(operation, token, this);
          break;

        case 'provideCover':
          await CoverOverride.applyProvideCover(operation, token, this);
          break;

        case 'modifyActionQualification':
          await ActionQualifier.applyActionQualifications(operation, token);
          break;

        case 'modifyLighting':
          await LightingModifier.applyLightingModification(operation, token);
          break;

        case 'conditionalState':
          await VisibilityOverride.applyConditionalState(operation, token);
          break;

        default:
          console.warn(`PF2E Visioner | Unknown operation type: ${operation.type}`);
      }
    }

    async removeOperations() {
      const token = this.getSubjectToken();
      if (!token) return;

      for (const operation of this.operations) {
        try {
          await this.removeOperation(operation, token);
        } catch (error) {
          console.error(`PF2E Visioner | Error removing operation ${operation.type}:`, error);
        }
      }
    }

    async removeOperation(operation, token) {
      switch (operation.type) {
        case 'modifySenses':
          await SenseModifier.restoreSenses(token, this.ruleElementId);
          break;

        case 'overrideVisibility':
          await VisibilityOverride.removeVisibilityOverride(operation, token);
          break;

        case 'overrideCover':
          await CoverOverride.removeCoverOverride(operation, token, this);
          break;

        case 'provideCover':
          await CoverOverride.removeProvideCover(token);
          break;

        case 'modifyActionQualification':
          await ActionQualifier.removeActionQualifications(operation, token);
          break;

        case 'modifyLighting':
          await LightingModifier.removeLightingModification(operation, token);
          break;

        default:
          break;
      }
    }

    getSubjectToken() {
      const tokens = this.actor.getActiveTokens();
      return tokens[0] || null;
    }
  };
}

