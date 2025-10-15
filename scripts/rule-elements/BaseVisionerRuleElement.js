export function createBaseVisionerRuleElement(baseRuleElementClass, fields) {
  if (!baseRuleElementClass || !fields) {
    console.error('PF2E Visioner | Missing dependencies for BaseVisionerRuleElement creation');
    return null;
  }

  return class BaseVisionerRuleElement extends baseRuleElementClass {
    static SUBJECT_TYPES = {
      SELF: 'self',
      TARGET: 'target',
      CONTROLLED: 'controlled',
      ALL: 'all',
    };

    static OBSERVER_TYPES = {
      ALL: 'all',
      ALLIES: 'allies',
      ENEMIES: 'enemies',
      SELECTED: 'selected',
      TARGETED: 'targeted',
      NONE: 'none',
    };

    static DIRECTION_TYPES = {
      FROM: 'from',
      TO: 'to',
      BIDIRECTIONAL: 'bidirectional',
    };

    static MODE_TYPES = {
      SET: 'set',
      INCREASE: 'increase',
      DECREASE: 'decrease',
      REMOVE: 'remove',
      TOGGLE: 'toggle',
    };

    static EFFECT_TARGET_TYPES = {
      SUBJECT: 'subject',
      OBSERVER: 'observer',
      BOTH: 'both',
      NONE: 'none',
    };

    static DISPOSITION_TYPES = {
      FRIENDLY: 'friendly',
      NEUTRAL: 'neutral',
      HOSTILE: 'hostile',
      SECRET: 'secret',
    };

    static ACTOR_TYPES = {
      CHARACTER: 'character',
      NPC: 'npc',
      HAZARD: 'hazard',
      VEHICLE: 'vehicle',
    };

    static defineSchema() {
      const schema = super.defineSchema();

      if (fields.PredicateField) {
        schema.predicate = new fields.PredicateField({
          required: false,
          nullable: false,
          initial: [],
          label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.PREDICATE'),
          hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.PREDICATE'),
        });
      }

      schema.subject = new fields.StringField({
        required: true,
        choices: Object.values(BaseVisionerRuleElement.SUBJECT_TYPES),
        initial: 'self',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.SUBJECT'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.SUBJECT'),
      });

      schema.observers = new fields.StringField({
        required: true,
        choices: Object.values(BaseVisionerRuleElement.OBSERVER_TYPES),
        initial: 'all',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.OBSERVERS'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.OBSERVERS'),
      });

      schema.direction = new fields.StringField({
        required: false,
        choices: Object.values(BaseVisionerRuleElement.DIRECTION_TYPES),
        initial: 'from',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.DIRECTION'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.DIRECTION'),
      });

      schema.mode = new fields.StringField({
        required: true,
        choices: Object.values(BaseVisionerRuleElement.MODE_TYPES),
        initial: 'set',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.MODE'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.MODE'),
      });

      schema.effectTarget = new fields.StringField({
        required: false,
        choices: Object.values(BaseVisionerRuleElement.EFFECT_TARGET_TYPES),
        initial: 'subject',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.EFFECT_TARGET'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.EFFECT_TARGET'),
      });

      schema.range = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.RANGE'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.RANGE'),
      });

      schema.durationRounds = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.DURATION'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.DURATION'),
      });

      schema.requiresInitiative = new fields.BooleanField({
        required: false,
        initial: false,
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.REQUIRES_INITIATIVE'),
        hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.REQUIRES_INITIATIVE'),
      });

      schema.targetFilter = new fields.SchemaField({
        disposition: new fields.StringField({
          required: false,
          nullable: true,
          choices: Object.values(BaseVisionerRuleElement.DISPOSITION_TYPES),
          initial: null,
          label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.FILTER_DISPOSITION'),
        }),
        hasCondition: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
          label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.FILTER_HAS_CONDITION'),
        }),
        lackCondition: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
          label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.FILTER_LACK_CONDITION'),
        }),
        actorType: new fields.StringField({
          required: false,
          nullable: true,
          choices: Object.values(BaseVisionerRuleElement.ACTOR_TYPES),
          initial: null,
          label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.FILTER_ACTOR_TYPE'),
        }),
      });

      return schema;
    }

    getTokensForSubject() {
      const tokens = [];

      switch (this.subject) {
        case BaseVisionerRuleElement.SUBJECT_TYPES.SELF: {
          const activeTokens = this.actor.getActiveTokens();
          if (activeTokens.length > 0) {
            tokens.push(activeTokens[0]);
          }
          break;
        }

        case BaseVisionerRuleElement.SUBJECT_TYPES.TARGET: {
          const targeted = Array.from(game.user.targets);
          if (targeted.length > 0) {
            tokens.push(targeted[0]);
          }
          break;
        }

        case BaseVisionerRuleElement.SUBJECT_TYPES.CONTROLLED:
          tokens.push(...canvas.tokens.controlled);
          break;

        case BaseVisionerRuleElement.SUBJECT_TYPES.ALL:
          tokens.push(...(canvas.tokens?.placeables || []));
          break;
      }

      return tokens.filter((t) => t && t.actor);
    }

    getTokensForObservers(primaryToken) {
      if (!primaryToken) return [];

      let tokens = [];
      const allTokens = canvas.tokens?.placeables.filter((t) => t.actor && t.id !== primaryToken.id) || [];

      switch (this.observers) {
        case BaseVisionerRuleElement.OBSERVER_TYPES.ALL:
          tokens = allTokens;
          break;

        case BaseVisionerRuleElement.OBSERVER_TYPES.ALLIES:
          tokens = allTokens.filter((t) => this.areAllies(primaryToken.actor, t.actor));
          break;

        case BaseVisionerRuleElement.OBSERVER_TYPES.ENEMIES:
          tokens = allTokens.filter((t) => !this.areAllies(primaryToken.actor, t.actor));
          break;

        case BaseVisionerRuleElement.OBSERVER_TYPES.SELECTED:
          tokens = canvas.tokens?.controlled.filter((t) => t.id !== primaryToken.id) || [];
          break;

        case BaseVisionerRuleElement.OBSERVER_TYPES.TARGETED:
          tokens = Array.from(game.user.targets).filter((t) => t.id !== primaryToken.id);
          break;

        case BaseVisionerRuleElement.OBSERVER_TYPES.NONE:
          tokens = [];
          break;
      }

      return this.applyTargetFilters(tokens, primaryToken);
    }

    applyTargetFilters(tokens, originToken) {
      let filtered = tokens;

      if (this.range !== null && this.range !== undefined) {
        filtered = this.filterByRange(filtered, originToken);
      }

      if (this.targetFilter) {
        if (this.targetFilter.disposition) {
          filtered = this.filterByDisposition(filtered, this.targetFilter.disposition);
        }

        if (this.targetFilter.hasCondition) {
          filtered = this.filterByHasCondition(filtered, this.targetFilter.hasCondition);
        }

        if (this.targetFilter.lackCondition) {
          filtered = this.filterByLackCondition(filtered, this.targetFilter.lackCondition);
        }

        if (this.targetFilter.actorType) {
          filtered = this.filterByActorType(filtered, this.targetFilter.actorType);
        }
      }

      return filtered;
    }

    filterByRange(tokens, originToken) {
      if (!originToken || this.range === null) return tokens;

      return tokens.filter((token) => {
        const distance = canvas.grid.measureDistance(originToken, token);
        return distance <= this.range;
      });
    }

    filterByDisposition(tokens, disposition) {
      const dispositionMap = {
        friendly: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        neutral: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        hostile: CONST.TOKEN_DISPOSITIONS.HOSTILE,
        secret: CONST.TOKEN_DISPOSITIONS.SECRET,
      };

      const targetDisposition = dispositionMap[disposition];
      if (targetDisposition === undefined) return tokens;

      return tokens.filter((token) => token.document.disposition === targetDisposition);
    }

    filterByHasCondition(tokens, conditionSlug) {
      return tokens.filter((token) => {
        const actor = token.actor;
        if (!actor) return false;
        return actor.itemTypes?.condition?.some((c) => c.slug === conditionSlug) || false;
      });
    }

    filterByLackCondition(tokens, conditionSlug) {
      return tokens.filter((token) => {
        const actor = token.actor;
        if (!actor) return true;
        return !actor.itemTypes?.condition?.some((c) => c.slug === conditionSlug);
      });
    }

    filterByActorType(tokens, actorType) {
      return tokens.filter((token) => {
        const actor = token.actor;
        if (!actor) return false;
        return actor.type === actorType;
      });
    }

    getDirectionalTokens() {
      const subjectTokens = this.getTokensForSubject();
      if (subjectTokens.length === 0) {
        return { sourceTokens: [], targetTokens: [] };
      }

      const primaryToken = subjectTokens[0];
      const observerTokens = this.getTokensForObservers(primaryToken);

      let sourceTokens = [];
      let targetTokens = [];

      switch (this.direction) {
        case BaseVisionerRuleElement.DIRECTION_TYPES.FROM:
          sourceTokens = observerTokens;
          targetTokens = [primaryToken];
          break;

        case BaseVisionerRuleElement.DIRECTION_TYPES.TO:
          sourceTokens = [primaryToken];
          targetTokens = observerTokens;
          break;

        case BaseVisionerRuleElement.DIRECTION_TYPES.BIDIRECTIONAL:
          sourceTokens = [primaryToken, ...observerTokens];
          targetTokens = [primaryToken, ...observerTokens];
          break;
      }

      return { sourceTokens, targetTokens };
    }

    areAllies(actor1, actor2) {
      if (!actor1 || !actor2) return false;

      const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
      const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
      const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

      return isPCvsPC || (isNPCvsNPC && sameDisposition);
    }

    shouldApply() {
      if (this.requiresInitiative && !game.combat?.started) {
        return false;
      }

      return true;
    }

    testPredicate(rollOptions = new Set()) {
      if (!this.predicate || this.predicate.length === 0) {
        return true;
      }

      if (this.actor?.getRollOptions) {
        const actorOptions = this.actor.getRollOptions(['all']);
        actorOptions.forEach((opt) => rollOptions.add(opt));
      }

      if (game.pf2e?.Predicate?.test) {
        return game.pf2e.Predicate.test(this.predicate, rollOptions);
      }

      return this.testPredicateFallback(this.predicate, rollOptions);
    }

    testPredicateFallback(predicate, rollOptions) {
      if (!Array.isArray(predicate) || predicate.length === 0) {
        return true;
      }

      for (const statement of predicate) {
        if (typeof statement === 'string') {
          const isNegated = statement.startsWith('not:');
          const option = isNegated ? statement.slice(4) : statement;
          const hasOption = rollOptions.has(option);

          if (isNegated && hasOption) return false;
          if (!isNegated && !hasOption) return false;
        } else if (typeof statement === 'object') {
          if (statement.not && rollOptions.has(statement.not)) return false;
          if (statement.or && !statement.or.some((opt) => rollOptions.has(opt))) return false;
          if (statement.and && !statement.and.every((opt) => rollOptions.has(opt))) return false;
        }
      }

      return true;
    }

    getRollOptions() {
      const options = new Set();

      if (this.actor?.getRollOptions) {
        const actorOptions = this.actor.getRollOptions(['all']);
        actorOptions.forEach((opt) => options.add(opt));
      }

      options.add('rule-element:pf2e-visioner');
      options.add(`rule-element:${this.constructor.name}`);
      options.add(`mode:${this.mode}`);
      options.add(`direction:${this.direction}`);
      options.add(`subject:${this.subject}`);
      options.add(`observers:${this.observers}`);

      if (this.requiresInitiative && game.combat?.started) {
        options.add('in-combat');
      }

      this.addVisionerRollOptions(options);

      return options;
    }

    addVisionerRollOptions(options) {
      const api = window.PF2EVisioner?.api;
      if (!api) return;

      const tokens = this.getTokensForSubject();
      if (tokens.length === 0) return;

      const primaryToken = tokens[0];
      if (!primaryToken) return;

      this.addVisibilityRollOptions(options, primaryToken, api);
      this.addCoverRollOptions(options, primaryToken, api);
      this.addSenseRollOptions(options, primaryToken);
      this.addAVSRollOptions(options, primaryToken);
      this.addLightingRollOptions(options, primaryToken);
    }

    addVisibilityRollOptions(options, token, api) {
      if (!api.getVisibility) return;

      const observerTokens = this.getTokensForObservers(token);
      
      for (const observer of observerTokens) {
        const visibility = api.getVisibility(observer.id, token.id);
        if (visibility) {
          options.add(`visioner:visibility:as-target:${visibility}`);
          options.add(`visioner:visibility:target:${token.id}:${visibility}`);
        }

        const reverseVisibility = api.getVisibility(token.id, observer.id);
        if (reverseVisibility) {
          options.add(`visioner:visibility:as-observer:${reverseVisibility}`);
          options.add(`visioner:visibility:observer:${observer.id}:${reverseVisibility}`);
        }
      }

      const hasAnyHidden = observerTokens.some(obs => {
        const vis = api.getVisibility(obs.id, token.id);
        return vis === 'hidden' || vis === 'undetected';
      });
      if (hasAnyHidden) {
        options.add('visioner:visibility:hidden-to-any');
      }

      const hasAnyConcealed = observerTokens.some(obs => {
        const vis = api.getVisibility(obs.id, token.id);
        return vis === 'concealed' || vis === 'hidden' || vis === 'undetected';
      });
      if (hasAnyConcealed) {
        options.add('visioner:visibility:concealed-to-any');
      }
    }

    addCoverRollOptions(options, token, api) {
      if (!api.getCover) return;

      const observerTokens = this.getTokensForObservers(token);
      
      for (const observer of observerTokens) {
        const cover = api.getCover(observer.id, token.id);
        if (cover && cover !== 'none') {
          options.add(`visioner:cover:as-target:${cover}`);
          options.add(`visioner:cover:target:${token.id}:${cover}`);
        }

        const reverseCover = api.getCover(token.id, observer.id);
        if (reverseCover && reverseCover !== 'none') {
          options.add(`visioner:cover:as-observer:${reverseCover}`);
          options.add(`visioner:cover:observer:${observer.id}:${reverseCover}`);
        }
      }

      const hasAnyCover = observerTokens.some(obs => {
        const cov = api.getCover(obs.id, token.id);
        return cov && cov !== 'none';
      });
      if (hasAnyCover) {
        options.add('visioner:cover:has-any');
      }

      const hasStandardOrBetter = observerTokens.some(obs => {
        const cov = api.getCover(obs.id, token.id);
        return cov === 'standard' || cov === 'greater';
      });
      if (hasStandardOrBetter) {
        options.add('visioner:cover:standard-or-better');
      }
    }

    addSenseRollOptions(options, token) {
      const actor = token.actor;
      if (!actor?.system?.perception?.senses) return;

      const senses = actor.system.perception.senses;
      
      for (const sense of senses) {
        const senseType = sense.type || sense.slug || sense.name?.toLowerCase();
        if (!senseType) continue;

        options.add(`visioner:sense:${senseType}`);
        
        if (sense.acuity) {
          options.add(`visioner:sense:${senseType}:${sense.acuity}`);
        }

        if (sense.range) {
          options.add(`visioner:sense:${senseType}:range:${sense.range}`);
        }
      }

      const hasDarkvision = senses.some(s => {
        const type = s.type || s.slug || s.name?.toLowerCase();
        return type === 'darkvision' || type === 'greater-darkvision';
      });
      if (hasDarkvision) {
        options.add('visioner:sense:darkvision-any');
      }

      const hasLowLight = senses.some(s => {
        const type = s.type || s.slug || s.name?.toLowerCase();
        return type === 'low-light-vision' || type === 'lowlightvision';
      });
      if (hasLowLight) {
        options.add('visioner:sense:low-light');
      }
    }

    addAVSRollOptions(options, token) {
      const avs = window.PF2EVisioner?.autoVisibilitySystem;
      if (!avs) return;

      if (avs.isEnabled?.()) {
        options.add('visioner:avs:enabled');
      } else {
        options.add('visioner:avs:disabled');
      }

      const settings = game.settings?.get('pf2e-visioner', 'autoVisibilityMode');
      if (settings) {
        options.add(`visioner:avs:mode:${settings}`);
      }
    }

    addLightingRollOptions(options, token) {
      if (!canvas.scene) return;

      const lightLevel = canvas.scene.globalLight ? 'bright' : 'varies';
      options.add(`visioner:lighting:global:${lightLevel}`);

      if (token.document) {
        const tokenLight = token.document.light?.dim || 0;
        if (tokenLight > 0) {
          options.add('visioner:lighting:token:has-light');
          options.add(`visioner:lighting:token:range:${tokenLight}`);
        }
      }

      const darknessLevel = canvas.scene.darkness || 0;
      if (darknessLevel >= 0.75) {
        options.add('visioner:lighting:darkness:complete');
      } else if (darknessLevel >= 0.25) {
        options.add('visioner:lighting:darkness:partial');
      } else {
        options.add('visioner:lighting:darkness:none');
      }
    }

    generateTokenPairs() {
      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      const pairs = [];

      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          if (sourceToken.id === targetToken.id) continue;

          pairs.push({
            observer: sourceToken,
            subject: targetToken,
            direction: this.direction,
          });
        }
      }

      return pairs;
    }

    onCreate(actorUpdates) {}

    onDelete(actorUpdates) {}

    beforeRoll(domains, rollOptions) {}

    afterRoll({ roll, domains }) {}

    onUpdateEncounter({ event }) {}
  };
}
