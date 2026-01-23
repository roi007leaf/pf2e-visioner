import { getLogger } from '../utils/logger.js';
import { ActionQualifier } from './operations/ActionQualifier.js';
import { AuraVisibility } from './operations/AuraVisibility.js';
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

      // Use PF2e's PredicateField for proper predicate support (handles strings and objects like {"or": [...]})
      let PredicateFieldToUse;
      try {
        const rollOptionSchema = game.pf2e.RuleElements.builtin.RollOption.defineSchema();
        const PredicateField = rollOptionSchema.predicate.constructor;
        PredicateFieldToUse = PredicateField;
      } catch (error) {
        // Fallback if PF2e schema not available (e.g., during tests)
        PredicateFieldToUse = new fields.ArrayField(new fields.AnyField());
      }

      // Add predicate support at rule element level
      schema.predicate = new PredicateFieldToUse({ required: false });

      schema.operations = new fields.ArrayField(
        new fields.SchemaField({
          type: new fields.StringField({
            required: true,
            choices: [
              'modifySenses',
              'modifyDetectionModes',
              'overrideVisibility',
              'overrideCover',
              'modifyActionQualification',
              'modifyLighting',
              'conditionalState',
              'distanceBasedVisibility',
              'offGuardSuppression',
              'auraVisibility',
            ],
            initial: 'overrideVisibility',
          }),

          // Predicate at operation level (more granular)
          // Use PF2e's PredicateField for proper predicate support
          predicate: new PredicateFieldToUse({ required: false }),

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

          auraRadius: new fields.NumberField({ required: false, initial: 10 }),

          insideOutsideState: new fields.StringField({
            required: false,
            choices: ['observed', 'concealed', 'hidden', 'undetected'],
            initial: 'concealed',
          }),

          outsideInsideState: new fields.StringField({
            required: false,
            choices: ['observed', 'concealed', 'hidden', 'undetected'],
            initial: 'concealed',
          }),

          sourceExempt: new fields.BooleanField({ required: false, initial: true }),

          includeSourceAsTarget: new fields.BooleanField({ required: false, initial: false }),

          auraTargets: new fields.StringField({
            required: false,
            choices: ['all', 'enemies', 'allies'],
            initial: 'all',
          }),
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
      const log = getLogger('RuleElements/Effect');
      log.debug(() => ({ msg: 'onCreate', item: this.item?.name, actor: this.actor?.name }));
      await this.applyOperations({ triggerRecalculation: true });
    }

    async onUpdate(actorUpdates) {
      const log = getLogger('RuleElements/Effect');
      log.debug(() => ({ msg: 'onUpdate', item: this.item?.name, actor: this.actor?.name }));

      await this.removeAllFlagsForRuleElement();
      await this.applyOperations({ triggerRecalculation: true });
    }

    async onDelete(actorUpdates) {
      const log = getLogger('RuleElements/Effect');
      const tokens = this.actor?.getActiveTokens?.() || [];
      const tokenIds = tokens.map(t => t.id);
      log.debug(() => ({ msg: 'onDelete', item: this.item?.name, actor: this.actor?.name, tokenCount: tokenIds.length }));

      const registryKey = this.ruleElementRegistryKey;

      for (const token of tokens) {
        const updates = {};

        for (const operation of this.operations) {
          try {
            this.collectRemovalUpdates(operation, token, updates);
          } catch (error) {
            console.error(`PF2E Visioner | Error collecting removal updates for ${operation.type}:`, error);
          }
        }

        this.collectStateSourceCleanup(token, updates);

        const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
        if (flagRegistry[registryKey]) {
          updates[`flags.pf2e-visioner.ruleElementRegistry.-=${registryKey}`] = null;
          log.debug(() => ({
            msg: 'onDelete: adding registry removal',
            tokenId: token.id,
            registryKey
          }));
        }

        await SourceTracker.removeSource(token, this.ruleElementId);

        if (Object.keys(updates).length > 0) {
          log.debug(() => ({
            msg: 'onDelete: applying updates',
            tokenId: token.id,
            updateCount: Object.keys(updates).length,
            updateKeys: Object.keys(updates)
          }));
          await token.document.update(updates);
          log.debug(() => ({ msg: 'onDelete: cleanup complete', tokenId: token.id }));
        }
      }

      if (tokenIds.length) {
        if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(tokenIds);
        } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
        } else if (canvas?.perception) {
          canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
        }
      }
    }

    collectStateSourceCleanup(token, updates) {
      const log = getLogger('RuleElements/Effect');
      const stateSource = token.document.getFlag('pf2e-visioner', 'stateSource') || {};
      let stateSourceModified = false;

      log.debug(() => ({
        msg: 'collectStateSourceCleanup: starting',
        tokenId: token.id,
        ruleElementId: this.ruleElementId,
        itemId: this.item?.id,
        hasVisibilityByObserver: !!stateSource.visibilityByObserver,
        hasCoverByObserver: !!stateSource.coverByObserver
      }));

      const cleanupSourcesInCategory = (category) => {
        if (!stateSource[category]) return;

        for (const [key, data] of Object.entries(stateSource[category])) {
          if (Array.isArray(data?.sources)) {
            log.debug(() => ({
              msg: `collectStateSourceCleanup: checking ${category}`,
              observerId: key,
              sources: data.sources,
              ruleElementId: this.ruleElementId
            }));

            const filteredSources = data.sources.filter(s => {
              const sourceId = typeof s === 'string' ? s : s?.id;
              const shouldKeep = sourceId && !sourceId.startsWith(this.ruleElementId);

              if (!shouldKeep) {
                log.debug(() => ({
                  msg: 'collectStateSourceCleanup: removing source',
                  sourceId,
                  ruleElementId: this.ruleElementId,
                  category,
                  observerId: key
                }));
              }

              return shouldKeep;
            });

            if (filteredSources.length !== data.sources.length) {
              if (filteredSources.length === 0) {
                updates[`flags.pf2e-visioner.stateSource.${category}.-=${key}`] = null;
                log.debug(() => ({
                  msg: 'collectStateSourceCleanup: removing entire observer entry',
                  category,
                  observerId: key
                }));
              } else {
                updates[`flags.pf2e-visioner.stateSource.${category}.${key}.sources`] = filteredSources;
                log.debug(() => ({
                  msg: 'collectStateSourceCleanup: updating sources',
                  category,
                  observerId: key,
                  oldCount: data.sources.length,
                  newCount: filteredSources.length
                }));
              }
              stateSourceModified = true;
            }
          }
        }
      };

      cleanupSourcesInCategory('visibilityByObserver');
      cleanupSourcesInCategory('coverByObserver');

      if (stateSourceModified) {
        log.debug(() => ({
          msg: 'collectStateSourceCleanup: modifications made',
          tokenId: token.id,
          updateCount: Object.keys(updates).length
        }));
      } else {
        log.debug(() => ({
          msg: 'collectStateSourceCleanup: no modifications needed',
          tokenId: token.id
        }));
      }
    }

    collectRemovalUpdates(operation, token, updates) {
      const registryKey = this.ruleElementRegistryKey;
      const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
      const registeredFlags = flagRegistry[registryKey] || [];

      switch (operation.type) {
        case 'modifySenses':
          if (registeredFlags.includes('originalSenses')) {
            updates['flags.pf2e-visioner.originalSenses'] = null;
          }
          break;

        case 'modifyDetectionModes':
          if (registeredFlags.includes('originalDetectionModes')) {
            updates['flags.pf2e-visioner.originalDetectionModes'] = null;
          }
          break;

        case 'overrideVisibility':
        case 'conditionalState':
          if (registeredFlags.includes('ruleElementOverride')) {
            updates['flags.pf2e-visioner.ruleElementOverride'] = null;
          }
          if (registeredFlags.includes('visibilityReplacement')) {
            updates['flags.pf2e-visioner.visibilityReplacement'] = null;
          }
          if (registeredFlags.includes('conditionalState')) {
            updates['flags.pf2e-visioner.conditionalState'] = null;
          }
          break;

        case 'overrideCover':
          if (registeredFlags.includes('overrideCover')) {
            updates['flags.pf2e-visioner.overrideCover'] = null;
          }
          break;

        case 'provideCover':
          if (registeredFlags.includes('providesCover')) {
            updates['flags.pf2e-visioner.providesCover'] = null;
          }
          break;

        case 'modifyActionQualification':
          if (registeredFlags.includes('actionQualifications')) {
            updates['flags.pf2e-visioner.actionQualifications'] = null;
          }
          break;

        case 'modifyLighting': {
          const lightingFlag = registeredFlags.find(f => f.startsWith('lightingModification.'));
          if (lightingFlag) {
            updates[`flags.pf2e-visioner.${lightingFlag}`] = null;
          }
          break;
        }

        case 'distanceBasedVisibility':
          if (registeredFlags.includes('distanceBasedVisibility')) {
            updates['flags.pf2e-visioner.distanceBasedVisibility'] = null;
          }
          break;

        case 'offGuardSuppression':
          if (registeredFlags.includes('offGuardSuppression')) {
            updates['flags.pf2e-visioner.offGuardSuppression'] = null;
          }
          break;

        case 'auraVisibility':
          if (registeredFlags.includes('auraVisibility')) {
            updates['flags.pf2e-visioner.auraVisibility'] = null;
          }
          break;

        default:
          break;
      }
    }

    async onUpdateEncounter({ event }) {
      if (event === 'turn-start' || event === 'turn-end') {
        await this.applyOperations({ triggerRecalculation: true });
      }
    }

    async applyOperations(options = {}) {
      const { triggerRecalculation = false } = options;
      const log = getLogger('RuleElements/Effect');
      const token = this.getSubjectToken();

      if (!token) {
        log.debug(() => ({ msg: 'applyOperations: no subject token', item: this.item?.name, actor: this.actor?.name }));
        return;
      }

      // Check rule element level predicate using PF2e's built-in method
      if (this.predicate && this.predicate.length > 0) {
        const rollOptions = token.actor.getRollOptions(['all']);
        const predicateResult = this.test(rollOptions);
        if (!predicateResult) {
          log.debug(() => ({ msg: 'applyOperations: predicate failed', item: this.item?.name, actor: this.actor?.name }));
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
      log.debug(() => ({ msg: 'applyOperations: applying merged operations', count: mergedOperations.length, item: this.item?.name, actor: this.actor?.name }));

      for (const operation of mergedOperations) {
        try {
          await this.applyOperation(operation, token, { triggerRecalculation });
          log.debug(() => ({ msg: 'applyOperations: applied op', type: operation.type, item: this.item?.name }));
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

    async applyOperation(operation, token, options = {}) {
      const { triggerRecalculation = false } = options;
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
          await VisibilityOverride.applyVisibilityOverride({
            ...operation,
            source: operation.source || this.ruleElementId,
            triggerRecalculation
          }, token);
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

        case 'auraVisibility':
          await AuraVisibility.applyAuraVisibility(operation, token);
          await this.registerFlag(token, 'auraVisibility');
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
      const log = getLogger('RuleElements/Effect');
      const tokens = this.actor?.getActiveTokens?.() || [];
      if (!tokens.length) return;

      console.log(`PF2E Visioner | removeAllFlagsForRuleElement called for ${this.item?.name}`, {
        operationCount: this.operations.length,
        tokenCount: tokens.length,
        operations: this.operations.map(op => ({ type: op.type, direction: op.direction })),
      });

      const registryKey = this.ruleElementRegistryKey;

      for (const token of tokens) {
        console.log(`PF2E Visioner | Processing token: ${token.name} (${token.id})`);

        // Derive ruleElementId once for all operations
        const ruleElementId = this.ruleElementId;
        console.log(`PF2E Visioner | removeAllFlagsForRuleElement: ruleElementId=${ruleElementId}, item=${this.item?.id}, slug=${this.slug}`);
        
        // Track visibility override cleanup to avoid duplicate cleanup
        // Visibility override cleanup is direction-agnostic and removes all sources for the rule element ID
        // Both 'overrideVisibility' and 'conditionalState' use the same cleanup function
        let hasCleanedUpVisibilityOverride = false;
        
        for (const operation of this.operations) {
          try {
            // For visibility overrides, only clean up once per rule element (not per operation)
            // The cleanup removes all sources for the rule element ID regardless of direction
            if ((operation.type === 'overrideVisibility' || operation.type === 'conditionalState') 
                && !hasCleanedUpVisibilityOverride) {
              hasCleanedUpVisibilityOverride = true;
              console.log(`PF2E Visioner | Calling removeOperation for operation type: ${operation.type} (once per rule element for direction-agnostic cleanup)`);
              await this.removeOperation(operation, token);
            } else if (operation.type !== 'overrideVisibility' && operation.type !== 'conditionalState') {
              // For other operation types, clean up normally
              console.log(`PF2E Visioner | Calling removeOperation for operation type: ${operation.type}, direction: ${operation.direction}`);
              await this.removeOperation(operation, token);
            }
          } catch (error) {
            console.error(`PF2E Visioner | Error removing operation ${operation.type} in removeAllFlagsForRuleElement:`, error);
          }
        }

        // Clean up any remaining flags that weren't handled by removeOperation
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
            'overrideCover',
            'originalSenses',
            'conditionalState',
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

        await SourceTracker.removeSource(token, this.ruleElementId);

        if (Object.keys(updates).length > 0) {
          await token.document.update(updates);
          log.debug(() => ({ msg: 'removeAllFlagsForRuleElement: updated token flags', tokenId: token.id }));
        }
      }
    }

    async removeOperations() {
      const log = getLogger('RuleElements/Effect');
      const tokens = this.actor?.getActiveTokens?.() || [];
      if (!tokens.length) return;

      const registryKey = this.ruleElementRegistryKey;
      for (const token of tokens) {
        for (const operation of this.operations) {
          try {
            await this.removeOperation(operation, token);
          } catch (error) {
            console.error(`PF2E Visioner | Error removing operation ${operation.type}:`, error);
          }
        }

        const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
        if (flagRegistry[registryKey]) {
          const newRegistry = { ...flagRegistry };
          delete newRegistry[registryKey];
          await token.document.setFlag('pf2e-visioner', 'ruleElementRegistry', newRegistry);
          log.debug(() => ({ msg: 'removeOperations: removed registry key', tokenId: token.id, registryKey }));
        }
      }
    }

    async removeOperation(operation, token) {
      // Try to get ruleElementId from various sources
      let ruleElementId = this.ruleElementId;
      
      // If ruleElementId is still invalid, try to extract from operation source
      if (!ruleElementId || ruleElementId.includes('unknown')) {
        if (operation?.source) {
          // Source format is usually "itemId-effect" or just "itemId"
          ruleElementId = operation.source;
        } else if (this.item?.id) {
          ruleElementId = `${this.item.id}-${this.slug || 'effect'}`;
        }
      }
      
      console.log(`PF2E Visioner | removeOperation: ruleElementId=${ruleElementId}, item=${this.item?.id}, slug=${this.slug}, operationSource=${operation?.source}`);
      switch (operation.type) {
        case 'modifySenses':
          await SenseModifier.restoreSenses(token, ruleElementId);
          break;

        case 'modifyDetectionModes':
          await DetectionModeModifier.restoreDetectionModes(token, ruleElementId);
          break;

        case 'overrideVisibility':
        case 'conditionalState':
          await VisibilityOverride.removeVisibilityOverride(operation, token, ruleElementId);
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
