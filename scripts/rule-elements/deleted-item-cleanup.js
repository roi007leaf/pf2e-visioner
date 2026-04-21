export async function cleanupDeletedVisionerRuleElements(item, tokens, log = null) {
  if (!item || !Array.isArray(tokens) || tokens.length === 0) return;

  const rules = item.system?.rules || [];
  const visionerRules = rules.filter((rule) => rule?.key === 'PF2eVisionerEffect');
  if (visionerRules.length === 0) return;

  const registryKey = `item-${item.id}`;

  for (const token of tokens) {
    for (const rule of visionerRules) {
      const operations = rule.operations || [];
      const ruleElementId = `${item.id}-${rule.slug || 'effect'}`;
      const ruleElementContext = {
        item,
        slug: rule.slug || 'effect',
        ruleElementId,
        ruleElementRegistryKey: registryKey,
      };

      let cleanedVisibility = false;

      for (const operation of operations) {
        const operationWithSource = {
          ...operation,
          source: operation.source || ruleElementId,
        };

        try {
          switch (operationWithSource.type) {
            case 'overrideVisibility':
            case 'conditionalState':
              if (cleanedVisibility) break;
              cleanedVisibility = true;
              {
                const { VisibilityOverride } = await import('./operations/VisibilityOverride.js');
                await VisibilityOverride.removeVisibilityOverride(
                  operationWithSource,
                  token,
                  ruleElementId,
                );
              }
              break;
            case 'overrideCover':
              {
                const { CoverOverride } = await import('./operations/CoverOverride.js');
                await CoverOverride.removeCoverOverride(
                  operationWithSource,
                  token,
                  ruleElementContext,
                );
              }
              break;
            case 'provideCover':
              {
                const { CoverOverride } = await import('./operations/CoverOverride.js');
                await CoverOverride.removeProvideCover(token);
              }
              break;
            case 'modifySenses':
              {
                const { SenseModifier } = await import('./operations/SenseModifier.js');
                await SenseModifier.restoreSenses(token, ruleElementId);
              }
              break;
            case 'modifyDetectionModes':
              {
                const { DetectionModeModifier } = await import(
                  './operations/DetectionModeModifier.js'
                );
                await DetectionModeModifier.restoreDetectionModes(token, ruleElementId);
              }
              break;
            case 'modifyActionQualification':
              {
                const { ActionQualifier } = await import('./operations/ActionQualifier.js');
                await ActionQualifier.removeActionQualifications(operationWithSource, token);
              }
              break;
            case 'modifyLighting':
              {
                const { LightingModifier } = await import('./operations/LightingModifier.js');
                await LightingModifier.removeLightingModification(operationWithSource, token);
              }
              break;
            case 'distanceBasedVisibility':
              {
                const { DistanceBasedVisibility } = await import(
                  './operations/DistanceBasedVisibility.js'
                );
                await DistanceBasedVisibility.removeDistanceBasedVisibility(
                  operationWithSource,
                  token,
                );
              }
              break;
            case 'offGuardSuppression':
              {
                const { OffGuardSuppression } = await import(
                  './operations/OffGuardSuppression.js'
                );
                await OffGuardSuppression.removeOffGuardSuppression(operationWithSource, token);
              }
              break;
            case 'auraVisibility':
              {
                const { AuraVisibility } = await import('./operations/AuraVisibility.js');
                await AuraVisibility.removeAuraVisibility(operationWithSource, token);
              }
              break;
            case 'shareVision':
              {
                const { ShareVision } = await import('./operations/ShareVision.js');
                await ShareVision.removeShareVision(operationWithSource, token);
              }
              break;
            default:
              break;
          }
        } catch (error) {
          if (log?.warn) {
            log.warn(() => ({
              msg: 'Failed to clean deleted rule-element operation',
              itemId: item.id,
              tokenId: token?.id,
              operationType: operationWithSource.type,
              error: error.message,
            }));
          } else {
            console.warn(
              `PF2E Visioner | Failed to clean deleted rule-element operation ${operationWithSource.type}:`,
              error,
            );
          }
        }
      }
    }

    const flagRegistry = token.document.getFlag('pf2e-visioner', 'ruleElementRegistry') || {};
    const flagsToRemove = flagRegistry[registryKey] || [];
    const updates = {};

    for (const flagPath of flagsToRemove) {
      updates[`flags.pf2e-visioner.${flagPath}`] = null;
    }

    if (flagRegistry[registryKey]) {
      updates[`flags.pf2e-visioner.ruleElementRegistry.-=${registryKey}`] = null;
    }

    if (Object.keys(updates).length > 0) {
      await token.document.update(updates);
    }
  }
}

