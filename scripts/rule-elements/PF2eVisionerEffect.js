import { ActionQualifier } from './operations/ActionQualifier.js';
import { CoverOverride } from './operations/CoverOverride.js';
import { DetectionModeModifier } from './operations/DetectionModeModifier.js';
import { DistanceBasedVisibility } from './operations/DistanceBasedVisibility.js';
import { LightingModifier } from './operations/LightingModifier.js';
import { OffGuardSuppression } from './operations/OffGuardSuppression.js';
import { SenseModifier } from './operations/SenseModifier.js';
import { VisibilityOverride } from './operations/VisibilityOverride.js';
import { SourceTracker } from './SourceTracker.js';

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
      schema.predicate = new fields.ArrayField(new fields.StringField(), { required: false });

      schema.operations = new fields.ArrayField(
        new fields.SchemaField({
          type: new fields.StringField({
            required: true,
            choices: [
              'modifySenses',
              'modifyDetectionModes',
              'overrideVisibility',
              'overrideCover',
              'provideCover',
              'modifyActionQualification',
              'modifyLighting',
              'conditionalState',
              'distanceBasedVisibility',
              'offGuardSuppression',
            ],
            initial: 'overrideVisibility',
          }),

          // Predicate at operation level (more granular)
          predicate: new fields.ArrayField(new fields.StringField(), { required: false }),

          senseModifications: new fields.ObjectField({ required: false }),

          modeModifications: new fields.ObjectField({ required: false }),

          state: new fields.StringField({
            required: false,
            choices: [
              'observed',
              'concealed',
              'hidden',
              'undetected',
              'none',
              'lesser',
              'standard',
              'greater',
            ],
          }),

          direction: new fields.StringField({
            required: false,
            choices: ['from', 'to'],
            initial: 'from',
          }),

          observers: new fields.StringField({
            required: false,
            choices: ['all', 'allies', 'enemies', 'selected', 'targeted', 'specific'],
            initial: 'all',
          }),

          targets: new fields.StringField({
            required: false,
            choices: ['all', 'allies', 'enemies', 'selected', 'targeted', 'specific'],
            initial: 'all',
          }),

          tokenIds: new fields.ArrayField(new fields.StringField(), { required: false }),

          source: new fields.StringField({ required: false }),

          fromStates: new fields.ArrayField(
            new fields.StringField({
              choices: ['observed', 'concealed', 'hidden', 'undetected'],
            }),
            { required: false },
          ),

          toState: new fields.StringField({
            required: false,
            choices: ['observed', 'concealed', 'hidden', 'undetected'],
          }),

          levelComparison: new fields.StringField({
            required: false,
            choices: ['lte', 'gte', 'lt', 'gt', 'eq'],
          }),

          blockedEdges: new fields.ArrayField(
            new fields.StringField({ choices: ['north', 'south', 'east', 'west'] }),
            { required: false },
          ),

          requiresTakeCover: new fields.BooleanField({ required: false, initial: false }),

          autoCoverBehavior: new fields.StringField({
            required: false,
            choices: ['add', 'replace', 'minimum'],
            initial: 'replace',
          }),

          preventAutoCover: new fields.BooleanField({ required: false, initial: false }),

          qualifications: new fields.ObjectField({ required: false }),

          condition: new fields.StringField({
            required: false,
            choices: ['invisible', 'concealed', 'hidden', 'undetected'],
          }),

          thenState: new fields.StringField({ required: false }),

          elseState: new fields.StringField({ required: false }),

          stateType: new fields.StringField({
            required: false,
            choices: ['visibility', 'cover'],
            initial: 'visibility',
          }),

          lightingLevel: new fields.StringField({
            required: false,
            choices: ['darkness', 'dim', 'bright', 'magicalDarkness', 'greaterMagicalDarkness'],
          }),

          range: new fields.NumberField({ required: false, nullable: true }),

          distanceBands: new fields.ArrayField(
            new fields.SchemaField({
              minDistance: new fields.NumberField({ required: false, nullable: true }),
              maxDistance: new fields.NumberField({ required: false, nullable: true }),
              state: new fields.StringField({
                required: true,
                choices: ['observed', 'concealed', 'hidden', 'undetected'],
              }),
            }),
            { required: false },
          ),

          suppressedStates: new fields.ArrayField(
            new fields.StringField({
              choices: ['observed', 'concealed', 'hidden', 'undetected'],
            }),
            { required: false },
          ),
        }),
        { required: true },
      );

      schema.priority = new fields.NumberField({
        required: false,
        initial: 100,
      });

      schema.cancelOffGuardFromVisibility = new fields.SchemaField(
        {
          states: new fields.ArrayField(
            new fields.StringField({
              choices: ['hidden', 'undetected'],
            }),
            { required: true },
          ),
          label: new fields.StringField({ required: false }),
        },
        { required: false },
      );

      return schema;
    }

    get ruleElementId() {
      return `${this.item?.id || 'unknown'}-${this.slug || 'effect'}`;
    }

    get ruleElementRegistryKey() {
      if (this.item?.id) {
        return `item-${this.item.id}`;
      }
      return this.ruleElementId;
    }

    async onCreate(actorUpdates) {
      await this.applyOperations();
    }

    async onUpdate(actorUpdates) {
      await this.removeAllFlagsForRuleElement();
      await this.applyOperations();
    }

    async onDelete(actorUpdates) {
      await this.removeOperations();
      await this.removeAllFlagsForRuleElement();
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
        const predicateResult = this.test(rollOptions);
        if (!predicateResult) {
          return;
        }
      }

      if (!this.operations || this.operations.length === 0) {
        console.warn(`PF2E Visioner | No operations defined for rule element`);
        return;
      }

      // Check for operation compatibility issues
      this.checkOperationCompatibility();

      // Smart merge operations before applying
      const mergedOperations = this.smartMergeOperations();

      for (const operation of mergedOperations) {
        try {
          await this.applyOperation(operation, token);
        } catch (error) {
          console.error(`PF2E Visioner | Error applying operation ${operation.type}:`, error);
        }
      }
    }

    smartMergeOperations() {
      const operations = [...this.operations];
      const merged = [];
      const processed = new Set();

      for (let i = 0; i < operations.length; i++) {
        if (processed.has(i)) continue;

        const currentOp = operations[i];
        let mergedOp = { ...currentOp };
        let mergeCount = 1;

        // Try to merge with subsequent operations
        for (let j = i + 1; j < operations.length; j++) {
          if (processed.has(j)) continue;

          const nextOp = operations[j];
          const mergeResult = this.tryMergeOperations(mergedOp, nextOp);

          if (mergeResult.success) {
            mergedOp = mergeResult.operation;
            processed.add(j);
            mergeCount++;
          }
        }

        merged.push(mergedOp);
        processed.add(i);
      }
      return merged;
    }

    tryMergeOperations(op1, op2) {
      // Merge sense modifications
      if (op1.type === 'modifySenses' && op2.type === 'modifySenses') {
        return {
          success: true,
          operation: {
            ...op1,
            senseModifications: {
              ...op1.senseModifications,
              ...op2.senseModifications,
            },
          },
        };
      }

      // Merge action qualifications
      if (op1.type === 'modifyActionQualification' && op2.type === 'modifyActionQualification') {
        return {
          success: true,
          operation: {
            ...op1,
            qualifications: {
              ...op1.qualifications,
              ...op2.qualifications,
            },
          },
        };
      }

      // Merge visibility overrides with priority
      if (op1.type === 'overrideVisibility' && op2.type === 'overrideVisibility') {
        const priority1 = op1.priority || 100;
        const priority2 = op2.priority || 100;

        return {
          success: true,
          operation: priority1 >= priority2 ? op1 : op2,
        };
      }

      // Merge distance-based visibility with conditional state
      if (op1.type === 'distanceBasedVisibility' && op2.type === 'conditionalState') {
        return {
          success: true,
          operation: {
            ...op1,
            conditionalState: op2,
            // Distance-based takes precedence, but we store the conditional for reference
          },
        };
      }

      // Merge lighting modifications
      if (op1.type === 'modifyLighting' && op2.type === 'modifyLighting') {
        const priority1 = op1.priority || 100;
        const priority2 = op2.priority || 100;

        return {
          success: true,
          operation: priority1 >= priority2 ? op1 : op2,
        };
      }

      // Merge cover operations with priority
      if (op1.type === 'overrideCover' && op2.type === 'overrideCover') {
        const priority1 = op1.priority || 100;
        const priority2 = op2.priority || 100;

        return {
          success: true,
          operation: priority1 >= priority2 ? op1 : op2,
        };
      }

      // No merge possible
      return { success: false };
    }

    checkOperationCompatibility() {
      const operationTypes = this.operations.map((op) => op.type);
      const warnings = [];

      // Check for visibility override conflicts
      const visibilityOps = operationTypes.filter((type) =>
        ['overrideVisibility', 'conditionalState', 'distanceBasedVisibility'].includes(type),
      );
      if (visibilityOps.length > 1) {
        warnings.push(
          `Multiple visibility operations detected: ${visibilityOps.join(', ')}. Smart merging will attempt to resolve conflicts.`,
        );
      }

      // Check for cover conflicts
      const coverOps = operationTypes.filter((type) =>
        ['overrideCover', 'provideCover'].includes(type),
      );
      if (coverOps.length > 1) {
        warnings.push(
          `Multiple cover operations detected: ${coverOps.join(', ')}. Smart merging will attempt to resolve conflicts.`,
        );
      }

      // Check for sense modification conflicts
      const senseOps = operationTypes.filter((type) => type === 'modifySenses');
      if (senseOps.length > 1) {
        warnings.push(
          `Multiple sense modification operations detected. Smart merging will combine them.`,
        );
      }

      // Check for action qualification conflicts
      const actionOps = operationTypes.filter((type) => type === 'modifyActionQualification');
      if (actionOps.length > 1) {
        warnings.push(
          `Multiple action qualification operations detected. Smart merging will combine them.`,
        );
      }

      // Log warnings
      if (warnings.length > 0) {
        console.warn(
          `PF2E Visioner | Operation compatibility warnings for ${this.item?.name || 'effect'}:`,
        );
        warnings.forEach((warning) => console.warn(`  - ${warning}`));
      }
    }

    async applyOperation(operation, token) {
      switch (operation.type) {
        case 'modifySenses':
          await SenseModifier.applySenseModifications(
            token,
            operation.senseModifications,
            this.ruleElementId,
            operation.predicate,
          );
          await this.registerFlag(token, 'originalSenses');
          break;

        case 'modifyDetectionModes':
          await DetectionModeModifier.applyDetectionModeModifications(
            token,
            operation.modeModifications,
            this.ruleElementId,
            operation.predicate,
          );
          await this.registerFlag(token, 'originalDetectionModes');
          break;

        case 'overrideVisibility':
          await VisibilityOverride.applyVisibilityOverride(operation, token);
          await this.registerFlag(token, 'ruleElementOverride');
          await this.registerFlag(token, 'visibilityReplacement');
          break;

        case 'overrideCover':
          await CoverOverride.applyCoverOverride(operation, token, this);
          break;

        case 'provideCover':
          await CoverOverride.applyProvideCover(operation, token, this);
          await this.registerFlag(token, 'providesCover');
          break;

        case 'modifyActionQualification':
          await ActionQualifier.applyActionQualifications(operation, token);
          await this.registerFlag(token, 'actionQualifications');
          break;

        case 'modifyLighting':
          await LightingModifier.applyLightingModification(operation, token);
          await this.registerFlag(token, `lightingModification.${operation.source || 'lighting'}`);
          break;

        case 'conditionalState':
          await VisibilityOverride.applyConditionalState(operation, token);
          await this.registerFlag(token, 'conditionalState');
          break;

        case 'distanceBasedVisibility':
          await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, token);
          await this.registerFlag(token, 'distanceBasedVisibility');
          break;

        case 'offGuardSuppression':
          await OffGuardSuppression.applyOffGuardSuppression(operation, token);
          await this.registerFlag(token, 'offGuardSuppression');
          break;

        default:
          console.warn(`PF2E Visioner | Unknown operation type: ${operation.type}`);
      }
    }

    async registerFlag(token, flagPath) {
      const registryKey = this.ruleElementRegistryKey;
      const registry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
      if (!registry[registryKey]) {
        registry[registryKey] = [];
      }
      if (!registry[registryKey].includes(flagPath)) {
        registry[registryKey].push(flagPath);
        await token.document.setFlag('pf2e-visioner', 'ruleElementRegistry', registry);
      }
    }

    async removeAllFlagsForRuleElement() {
      const token = this.getSubjectToken();
      if (!token) return;

      const registryKey = this.ruleElementRegistryKey;
      const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
      const flagsToRemove = flagRegistry[registryKey] || [];

      const updates = {};

      if (flagsToRemove.length > 0) {
        for (const flagPath of flagsToRemove) {
          updates[`flags.pf2e-visioner.${flagPath}`] = null;
        }
      } else {
        const allPf2eVisionerFlags = token.document.getFlag('pf2e-visioner') || {};
        const simpleFlags = [
          'distanceBasedVisibility',
          'ruleElementOverride',
          'visibilityReplacement',
          'actionQualifications',
          'providesCover',
          'originalSenses',
        ];

        for (const flagName of simpleFlags) {
          if (allPf2eVisionerFlags[flagName]) {
            updates[`flags.pf2e-visioner.${flagName}`] = null;
          }
        }

        const lightingModifications = allPf2eVisionerFlags.lightingModification || {};
        for (const modId of Object.keys(lightingModifications)) {
          updates[`flags.pf2e-visioner.lightingModification.${modId}`] = null;
        }
      }

      if (flagRegistry[registryKey]) {
        const newRegistry = { ...flagRegistry };
        delete newRegistry[registryKey];
        updates['flags.pf2e-visioner.ruleElementRegistry'] = newRegistry;
      }

      await SourceTracker.removeSource(this.ruleElementId);

      if (Object.keys(updates).length > 0) {
        await token.document.update(updates);
      }

      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([token.id]);
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
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

        case 'modifyDetectionModes':
          await DetectionModeModifier.restoreDetectionModes(token, this.ruleElementId);
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

        case 'distanceBasedVisibility':
          await DistanceBasedVisibility.removeDistanceBasedVisibility(operation, token);
          break;

        case 'offGuardSuppression':
          await OffGuardSuppression.removeOffGuardSuppression(operation, token);
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
