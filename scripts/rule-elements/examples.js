export const RULE_ELEMENT_EXAMPLES = {
  blur: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BLUR.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BLUR.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'overrideVisibility',
            state: 'concealed',
            direction: 'from',
            observers: 'all',
            source: 'blur-spell'
          },
          {
            type: 'modifyActionQualification',
            qualifications: {
              hide: {
                canUseThisConcealment: false,
                customMessage: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.MESSAGES.BLUR_HIDE_BLOCKED')
              },
              sneak: {
                endPositionQualifies: false,
                customMessage: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.MESSAGES.BLUR_SNEAK_BLOCKED')
              }
            },
            source: 'blur-spell'
          }
        ],
        priority: 100
      }
    ]
  },

  faerieFire: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.FAERIE_FIRE.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.FAERIE_FIRE.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'conditionalState',
            condition: 'invisible',
            thenState: 'concealed',
            elseState: 'observed',
            stateType: 'visibility',
            direction: 'from',
            observers: 'all',
            source: 'faerie-fire'
          },
          {
            type: 'overrideVisibility',
            preventConcealment: true,
            direction: 'from',
            observers: 'all',
            source: 'faerie-fire'
          }
        ],
        priority: 110
      }
    ]
  },

  revealingLight: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.REVEALING_LIGHT.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.REVEALING_LIGHT.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'conditionalState',
            condition: 'invisible',
            thenState: 'concealed',
            stateType: 'visibility',
            direction: 'from',
            observers: 'all',
            source: 'revealing-light'
          },
          {
            type: 'overrideVisibility',
            preventConcealment: true,
            direction: 'from',
            observers: 'all',
            source: 'revealing-light'
          }
        ],
        priority: 110
      }
    ]
  },

  cloudedFocus: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.CLOUDED_FOCUS.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.CLOUDED_FOCUS.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'modifySenses',
            senseModifications: {
              hearing: {
                precision: 'precise',
                range: 20
              },
              tremorsense: {
                precision: 'precise',
                range: 20
              },
              scent: {
                precision: 'precise',
                range: 20
              },
              all: {
                maxRange: 20
              }
            },
            source: 'clouded-focus'
          }
        ],
        priority: 100
      }
    ]
  },

  thousandVisions: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.THOUSAND_VISIONS.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.THOUSAND_VISIONS.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'modifyActionQualification',
            qualifications: {
              seek: {
                ignoreConcealment: true
              }
            },
            range: 30,
            source: 'thousand-visions'
          },
          {
            type: 'modifySenses',
            senseModifications: {
              all: {
                maxRange: 30,
                beyondIsImprecise: true
              }
            },
            source: 'thousand-visions'
          }
        ],
        priority: 100
      }
    ]
  },

  deepDarkness: {
    name: 'Deep Darkness',
    description: 'The creature is surrounded by supernatural darkness. The lighting level at its position is always treated as magical darkness (rank 4), blocking darkvision.',
    rules: [
      {
        "key": "PF2eVisionerEffect",
        "operations": [
          {
            "type": "modifyLighting",
            "lightingLevel": "greaterMagicalDarkness",
            "source": "deep-darkness",
            "priority": 200
          }
        ],
        "priority": 100
      }
    ]
  },

  towerShield: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.TOWER_SHIELD.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.TOWER_SHIELD.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'overrideCover',
            state: 'standard',
            direction: 'to',
            targets: 'allies',
            range: 5,
            source: 'tower-shield',
            requiresTakeCover: true
          }
        ],
        priority: 100
      }
    ]
  },

  deployableCover: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.DEPLOYABLE_COVER.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.DEPLOYABLE_COVER.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'provideCover',
            state: 'standard',
            blockedEdges: ['north'],
            requiresTakeCover: true,
            autoCoverBehavior: 'replace',
            source: 'deployable-cover'
          }
        ],
        priority: 100
      }
    ]
  },

  ballisticCover: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BALLISTIC_COVER.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BALLISTIC_COVER.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'provideCover',
            state: 'standard',
            blockedEdges: ['north'],
            requiresTakeCover: true,
            autoCoverBehavior: 'replace',
            source: 'ballistic-cover'
          }
        ],
        priority: 100
      }
    ]
  },

  seeInvisibility: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.SEE_INVISIBILITY.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.SEE_INVISIBILITY.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'overrideVisibility',
            state: 'concealed',
            direction: 'to',
            observers: 'all',
            predicate: ['target:condition:invisible'],
            source: 'see-invisibility'
          }
        ],
        priority: 100
      }
    ]
  },

  blindFight: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BLIND_FIGHT.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.BLIND_FIGHT.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'modifyActionQualification',
            qualifications: {
              seek: {
                ignoreThisConcealment: true,
                customMessage: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.MESSAGES.BLIND_FIGHT_ACTIVE')
              }
            },
            predicate: ['target:condition:hidden', 'target:condition:concealed'],
            source: 'blind-fight'
          }
        ],
        priority: 100
      }
    ]
  },

  consecrate: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.CONSECRATE.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.CONSECRATE.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        operations: [
          {
            type: 'overrideVisibility',
            state: 'concealed',
            direction: 'from',
            observers: 'all',
            predicate: ['self:trait:undead'],
            source: 'consecrate'
          }
        ],
        priority: 100
      }
    ]
  },

  darkvisionConditional: {
    name: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.DARKVISION_CONDITIONAL.NAME'),
    description: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.EFFECT.EXAMPLES.DARKVISION_CONDITIONAL.DESCRIPTION'),
    rules: [
      {
        key: 'PF2eVisionerEffect',
        predicate: ['lighting:dim', 'lighting:darkness'],
        operations: [
          {
            type: 'modifySenses',
            senseModifications: {
              darkvision: {
                range: 60,
                precision: 'precise'
              }
            },
            source: 'darkvision-conditional'
          }
        ],
        priority: 100
      }
    ]
  }
};

export async function createRuleElementExample(exampleKey) {
  const example = RULE_ELEMENT_EXAMPLES[exampleKey];
  if (!example) {
    console.error(`PF2E Visioner | Unknown example: ${exampleKey}`);
    return null;
  }

  try {
    const itemData = {
      name: example.name,
      type: 'effect',
      img: 'icons/svg/aura.svg',
      system: {
        description: { value: `<p>${example.description}</p>` },
        duration: { value: 1, unit: 'minutes' },
        rules: example.rules,
        traits: { value: [], rarity: 'common' },
      },
    };

    const item = await Item.create(itemData);
    ui.notifications.info(`Created ${example.name} effect item`);
    return item;
  } catch (error) {
    console.error(`PF2E Visioner | Error creating ${example.name}:`, error);
    return null;
  }
}

export async function createAllExamples() {
  const items = [];
  for (const key of Object.keys(RULE_ELEMENT_EXAMPLES)) {
    const item = await createRuleElementExample(key);
    if (item) items.push(item);
  }
  return items;
}

if (window.PF2EVisioner) {
  window.PF2EVisioner.createRuleElementExample = createRuleElementExample;
  window.PF2EVisioner.createAllRuleElementExamples = createAllExamples;
}

