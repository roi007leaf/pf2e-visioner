/**
 * PF2E Visioner - Rule Elements Index
 * This file handles the registration of custom rule elements
 */

import { createCoverRuleElement } from './CoverRuleElement.js';
import { createDetectionRuleElement } from './DetectionRuleElement.js';
import { createVisibilityRuleElement } from './VisibilityRuleElement.js';

/**
 * Initialize and register custom rule elements
 */
export function initializeRuleElements() {
  Hooks.once('ready', registerRuleElements);
}

/**
 * Register rule elements with PF2e system
 */
function registerRuleElements() {
  if (!game.pf2e?.RuleElement) {
    console.error('PF2E Visioner | PF2e system not ready, rule elements not registered');
    return;
  }

  try {
    const baseRuleElement = game.pf2e.RuleElement;
    const fields = foundry.data.fields;

    const ruleElements = [
      {
        factory: createVisibilityRuleElement,
        key: 'PF2eVisionerVisibility',
        name: 'PF2e Visioner Visibility',
      },
      {
        factory: createCoverRuleElement,
        key: 'PF2eVisionerCover',
        name: 'PF2e Visioner Cover',
      },
      {
        factory: createDetectionRuleElement,
        key: 'PF2eVisionerDetection',
        name: 'PF2e Visioner Detection',
      },
    ];

    for (const { factory, key, name } of ruleElements) {
      const RuleElementClass = factory(baseRuleElement, fields);
      if (!RuleElementClass) {
        console.warn(`PF2E Visioner | Failed to create ${key} rule element`);
        continue;
      }

      game.pf2e.RuleElements.custom[key] = RuleElementClass;

      if (CONFIG.PF2E?.ruleElementTypes) {
        CONFIG.PF2E.ruleElementTypes[key] = key;
      }

      if (game.i18n) {
        const i18nKey = `PF2E.RuleElement.${key}`;
        if (!game.i18n.has(i18nKey)) {
          game.i18n.translations.PF2E = game.i18n.translations.PF2E || {};
          game.i18n.translations.PF2E.RuleElement = game.i18n.translations.PF2E.RuleElement || {};
          game.i18n.translations.PF2E.RuleElement[key] = name;
        }
      }
    }

    if (window.PF2EVisioner) {
      window.PF2EVisioner.createRuleElementExamples = createRuleElementExamples;
    }

    console.log('PF2E Visioner | Rule elements registered successfully');
  } catch (error) {
    console.error('PF2E Visioner | Error registering rule elements:', error);
  }
}

/**
 * Create example items with various rule elements
 */
async function createRuleElementExamples() {
  if (!game.pf2e?.RuleElements?.custom) {
    console.error('PF2E Visioner | Rule elements not registered yet!');
    return null;
  }

  const examples = [
    {
      name: 'Hide (Visibility)',
      img: 'systems/pf2e/icons/spells/cloak-of-shadow.webp',
      description: '<p>You become hidden to all enemies.</p>',
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'enemies',
          direction: 'from',
          mode: 'set',
          status: 'hidden',
          effectTarget: 'subject',
          durationRounds: 10,
        },
      ],
      traits: ['visual'],
    },
    {
      name: 'Obscuring Mist (Visibility)',
      img: 'systems/pf2e/icons/spells/obscuring-mist.webp',
      description: '<p>You surround yourself with mist, increasing concealment.</p>',
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'all',
          direction: 'from',
          mode: 'increase',
          steps: 1,
          effectTarget: 'subject',
          durationRounds: 10,
        },
      ],
      traits: ['conjuration', 'water'],
    },
    {
      name: 'See Invisibility (Visibility)',
      img: 'systems/pf2e/icons/spells/see-invisibility.webp',
      description: '<p>You can see hidden creatures better.</p>',
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'all',
          direction: 'to',
          mode: 'decrease',
          steps: 2,
          effectTarget: 'subject',
          durationRounds: 60,
          targetFilter: {
            hasCondition: 'invisible',
          },
        },
      ],
      traits: ['divination', 'detection'],
    },
    {
      name: 'Wall of Stone (Cover)',
      img: 'systems/pf2e/icons/spells/wall-of-stone.webp',
      description: '<p>You create a wall that provides greater cover.</p>',
      rules: [
        {
          key: 'PF2eVisionerCover',
          subject: 'self',
          observers: 'all',
          direction: 'bidirectional',
          mode: 'set',
          coverLevel: 'greater',
          applyBonuses: true,
          allowHide: true,
        },
      ],
      traits: ['conjuration', 'earth'],
    },
    {
      name: 'Take Cover (Cover)',
      img: 'icons/svg/shield.svg',
      description: '<p>You gain standard cover against attacks.</p>',
      rules: [
        {
          key: 'PF2eVisionerCover',
          subject: 'self',
          observers: 'enemies',
          direction: 'from',
          mode: 'set',
          coverLevel: 'standard',
          applyBonuses: true,
          allowHide: true,
          requiresInitiative: true,
        },
      ],
      traits: ['action'],
    },
    {
      name: 'Darkvision Spell (Detection)',
      img: 'systems/pf2e/icons/spells/darkvision.webp',
      description: '<p>Target gains darkvision.</p>',
      rules: [
        {
          key: 'PF2eVisionerDetection',
          subject: 'target',
          mode: 'set',
          sense: 'darkvision',
          senseRange: 60,
          acuity: 'precise',
          modifyExisting: false,
        },
      ],
      traits: ['divination'],
    },
    {
      name: 'Echolocation (Detection)',
      img: 'systems/pf2e/icons/spells/guidance.webp',
      description: '<p>You gain precise hearing for one round.</p>',
      rules: [
        {
          key: 'PF2eVisionerDetection',
          subject: 'self',
          mode: 'set',
          sense: 'echolocation',
          senseRange: 30,
          acuity: 'precise',
          modifyExisting: false,
          requiresInitiative: true,
          durationRounds: 1,
        },
      ],
      traits: ['sonic'],
    },
    {
      name: 'Prone Stealth (Visibility + Predicate)',
      img: 'systems/pf2e/icons/actions/TakeCover.webp',
      description: '<p>When prone, you become hidden to enemies.</p>',
      rules: [
        {
          key: 'PF2eVisionerVisibility',
          subject: 'self',
          observers: 'enemies',
          direction: 'from',
          mode: 'set',
          status: 'hidden',
          effectTarget: 'subject',
          predicate: ['self:condition:prone'],
        },
      ],
      traits: ['stance'],
    },
    {
      name: 'Darkvision in Darkness Only (Detection + Predicate)',
      img: 'systems/pf2e/icons/spells/darkvision.webp',
      description: '<p>Target gains darkvision, but only in dim light or darkness.</p>',
      rules: [
        {
          key: 'PF2eVisionerDetection',
          subject: 'target',
          mode: 'set',
          sense: 'darkvision',
          senseRange: 60,
          acuity: 'precise',
          modifyExisting: false,
          predicate: [{ or: ['lighting:dim', 'lighting:darkness'] }],
        },
      ],
      traits: ['divination'],
    },
    {
      name: 'Cover vs Ranged Only (Cover + Predicate)',
      img: 'icons/svg/shield.svg',
      description: '<p>You gain cover, but only against ranged attacks.</p>',
      rules: [
        {
          key: 'PF2eVisionerCover',
          subject: 'self',
          observers: 'enemies',
          direction: 'from',
          mode: 'set',
          coverLevel: 'standard',
          applyBonuses: true,
          allowHide: true,
          predicate: ['attack:ranged'],
        },
      ],
      traits: ['defensive'],
    },
    {
      name: 'Shadow Striker (Custom Roll Options)',
      img: 'icons/magic/death/weapon-scythe-rune-green.webp',
      description:
        '<p>While hidden from any observer, gain +2 circumstance bonus to Stealth and +1 to attack rolls.</p>',
      rules: [
        {
          key: 'FlatModifier',
          selector: 'stealth',
          value: 2,
          type: 'circumstance',
          predicate: ['visioner:visibility:hidden-to-any'],
        },
        {
          key: 'FlatModifier',
          selector: 'attack-roll',
          value: 1,
          type: 'circumstance',
          predicate: ['visioner:visibility:hidden-to-any'],
        },
      ],
      traits: ['shadow'],
    },
    {
      name: 'Defensive Cover Tactics (Custom Roll Options)',
      img: 'icons/equipment/shield/heater-steel-boss-brown.webp',
      description: '<p>When you have standard or better cover, gain +2 circumstance bonus to AC and Reflex saves.</p>',
      rules: [
        {
          key: 'FlatModifier',
          selector: 'ac',
          value: 2,
          type: 'circumstance',
          predicate: ['visioner:cover:standard-or-better'],
        },
        {
          key: 'FlatModifier',
          selector: 'reflex',
          value: 2,
          type: 'circumstance',
          predicate: ['visioner:cover:standard-or-better'],
        },
      ],
      traits: ['defensive'],
    },
    {
      name: 'Adaptive Darkvision (Custom Roll Options)',
      img: 'icons/magic/perception/eye-ringed-glow-angry-red.webp',
      description: '<p>In complete darkness, gain darkvision 60 feet if you don\'t already have it.</p>',
      rules: [
        {
          key: 'PF2eVisionerDetection',
          sense: 'darkvision',
          senseRange: 60,
          acuity: 'precise',
          modifyExisting: false,
          predicate: ['visioner:lighting:darkness:complete', 'not:visioner:sense:darkvision-any'],
        },
      ],
      traits: ['divination'],
    },
    {
      name: 'Tremorsense Advantage (Custom Roll Options)',
      img: 'icons/magic/earth/projectiles-magma-stone-orange.webp',
      description: '<p>When you have tremorsense, ignore cover from targets on the ground.</p>',
      rules: [
        {
          key: 'PF2eVisionerCover',
          mode: 'remove',
          targetFilter: { actorType: 'npc' },
          predicate: ['visioner:sense:tremorsense', 'target:condition:on-ground'],
        },
      ],
      traits: ['divination'],
    },
    {
      name: 'Vulnerable Position (Custom Roll Options)',
      img: 'icons/skills/wounds/injury-pain-body-orange.webp',
      description:
        '<p>When you have no cover and are not hidden from any enemy, take -1 circumstance penalty to AC.</p>',
      rules: [
        {
          key: 'FlatModifier',
          selector: 'ac',
          value: -1,
          type: 'circumstance',
          predicate: ['not:visioner:cover:has-any', 'not:visioner:visibility:hidden-to-any'],
        },
      ],
      traits: ['penalty'],
    },
    {
      name: 'AVS Combat Adaptation (Custom Roll Options)',
      img: 'icons/magic/perception/eye-glow-yellow-teal.webp',
      description:
        '<p>When AVS is enabled, gain +1 circumstance bonus to Perception. In dim or darker lighting with concealment, auto-hide.</p>',
      rules: [
        {
          key: 'FlatModifier',
          selector: 'perception',
          value: 1,
          type: 'circumstance',
          predicate: ['visioner:avs:enabled'],
        },
        {
          key: 'PF2eVisionerVisibility',
          mode: 'set',
          status: 'hidden',
          predicate: [
            'visioner:avs:enabled',
            'visioner:visibility:concealed-to-any',
            { or: ['visioner:lighting:darkness:partial', 'visioner:lighting:darkness:complete'] },
          ],
        },
      ],
      traits: ['divination'],
    },
    {
      name: 'Light Bearer Tactics (Custom Roll Options)',
      img: 'icons/sundries/lights/torch-brown-lit.webp',
      description: '<p>When carrying a light source, gain +1 Perception and become observed by anyone who can see you.</p>',
      rules: [
        {
          key: 'FlatModifier',
          selector: 'perception',
          value: 1,
          type: 'circumstance',
          predicate: ['visioner:lighting:token:has-light'],
        },
        {
          key: 'PF2eVisionerVisibility',
          direction: 'to',
          mode: 'set',
          status: 'observed',
          predicate: ['visioner:lighting:token:has-light'],
        },
      ],
      traits: ['detection'],
    },
  ];

  try {
    const createdItems = [];

    for (const example of examples) {
      const itemData = {
        name: example.name,
        type: 'effect',
        img: example.img,
        system: {
          description: { value: example.description },
          duration: { value: 1, unit: 'minutes' },
          rules: example.rules,
          traits: { value: example.traits, rarity: 'common' },
        },
      };

      const item = await Item.create(itemData);
      if (item) {
        item.sheet.render(true);
        createdItems.push(item);
      }
    }

    ui.notifications.info(`Created ${createdItems.length} rule element example items`);
    return createdItems;
  } catch (error) {
    console.error('Error creating example items:', error);
    ui.notifications.error('Failed to create rule element examples. Check console for details.');
    return null;
  }
}
