import { getVisibilityStateConfig } from './data/visibility-states.js';

// Register Handlebars helpers once when this module is imported
try {
  // Render a visibility state icon with color and title
  // Usage: {{{visibilityIcon state}}}
  Handlebars.registerHelper('visibilityIcon', function (state) {
    const cfg = getVisibilityStateConfig(state);
    if (!cfg) return '';
    const html = `<i class="${cfg.icon} ${cfg.cssClass}" data-tooltip="${cfg.label}"></i>`;
    return new Handlebars.SafeString(html);
  });

  // Render position transition indicator with appropriate styling
  // Usage: {{{positionTransitionIcon transition}}}
  Handlebars.registerHelper('positionTransitionIcon', function (transition) {
    if (!transition || !transition.hasChanged) {
      return new Handlebars.SafeString('<i class="fas fa-equals position-unchanged" data-tooltip="No position change"></i>');
    }

    let icon, cssClass, tooltip;
    
    switch (transition.transitionType) {
      case 'improved':
        icon = 'fas fa-arrow-up';
        cssClass = 'position-improved';
        tooltip = 'Position improved for stealth';
        break;
      case 'worsened':
        icon = 'fas fa-arrow-down';
        cssClass = 'position-worsened';
        tooltip = 'Position worsened for stealth';
        break;
      default:
        icon = 'fas fa-exchange-alt';
        cssClass = 'position-changed';
        tooltip = 'Position changed';
    }

    const html = `<i class="${icon} ${cssClass}" data-tooltip="${tooltip}"></i>`;
    return new Handlebars.SafeString(html);
  });

  // Render visibility state indicator with enhanced styling
  // Usage: {{{visibilityStateIndicator state size}}}
  Handlebars.registerHelper('visibilityStateIndicator', function (state, size = 'normal') {
    const cfg = getVisibilityStateConfig(state);
    if (!cfg) return '';
    
    const sizeClass = size === 'small' ? 'indicator-small' : size === 'large' ? 'indicator-large' : '';
    const html = `<span class="visibility-indicator ${cfg.cssClass} ${sizeClass}" data-tooltip="${cfg.label}">
      <i class="${cfg.icon}"></i>
    </span>`;
    return new Handlebars.SafeString(html);
  });

  // Render cover state indicator with enhanced styling
  // Usage: {{{coverStateIndicator coverState size}}}
  Handlebars.registerHelper('coverStateIndicator', function (coverState, size = 'normal') {
    const coverConfigs = {
      'none': { icon: 'fas fa-shield-slash', cssClass: 'cover-none', label: 'No Cover' },
      'lesser': { icon: 'fas fa-shield-alt', cssClass: 'cover-lesser', label: 'Lesser Cover' },
      'standard': { icon: 'fas fa-shield', cssClass: 'cover-standard', label: 'Standard Cover' },
      'greater': { icon: 'fas fa-shield', cssClass: 'cover-greater', label: 'Greater Cover' }
    };

    const cfg = coverConfigs[coverState];
    if (!cfg) return '';
    
    const sizeClass = size === 'small' ? 'indicator-small' : size === 'large' ? 'indicator-large' : '';
    const html = `<span class="cover-indicator ${cfg.cssClass} ${sizeClass}" data-tooltip="${cfg.label}">
      <i class="${cfg.icon}"></i>
    </span>`;
    return new Handlebars.SafeString(html);
  });

  // Render stealth bonus change indicator
  // Usage: {{{stealthBonusChange bonus}}}
  Handlebars.registerHelper('stealthBonusChange', function (bonus) {
    if (!bonus || bonus === 0) return '';
    
    const isPositive = bonus > 0;
    const cssClass = isPositive ? 'stealth-bonus-positive' : 'stealth-bonus-negative';
    const sign = isPositive ? '+' : '';
    const tooltip = `Stealth bonus change: ${sign}${bonus}`;
    
    const html = `<span class="stealth-bonus-change ${cssClass}" data-tooltip="${tooltip}">
      ${sign}${bonus}
    </span>`;
    return new Handlebars.SafeString(html);
  });

  // Render position quality indicator
  // Usage: {{{positionQualityIndicator quality}}}
  Handlebars.registerHelper('positionQualityIndicator', function (quality) {
    const qualityConfigs = {
      'excellent': { icon: 'fas fa-star', cssClass: 'quality-excellent', label: 'Excellent position data' },
      'good': { icon: 'fas fa-check-circle', cssClass: 'quality-good', label: 'Good position data' },
      'fair': { icon: 'fas fa-exclamation-triangle', cssClass: 'quality-fair', label: 'Fair position data' },
      'poor': { icon: 'fas fa-question-circle', cssClass: 'quality-poor', label: 'Poor position data' },
      'terrible': { icon: 'fas fa-times-circle', cssClass: 'quality-terrible', label: 'Unreliable position data' }
    };

    const cfg = qualityConfigs[quality];
    if (!cfg) return '';
    
    const html = `<span class="position-quality-indicator ${cfg.cssClass}" data-tooltip="${cfg.label}">
      <i class="${cfg.icon}"></i>
    </span>`;
    return new Handlebars.SafeString(html);
  });

  // Helper to check if two values are equal (for template conditionals)
  // Usage: {{#if (eq value1 value2)}}
  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  // Helper to check if value is greater than another
  // Usage: {{#if (gt value 0)}}
  Handlebars.registerHelper('gt', function (a, b) {
    return a > b;
  });

  // Helper to check if value is less than another
  // Usage: {{#if (lt value 0)}}
  Handlebars.registerHelper('lt', function (a, b) {
    return a < b;
  });

  // Helper to format position transition summary text
  // Usage: {{positionTransitionSummary transition}}
  Handlebars.registerHelper('positionTransitionSummary', function (transition) {
    if (!transition || !transition.hasChanged) {
      return 'No significant position change';
    }

    const parts = [];
    
    if (transition.avsVisibilityChanged) {
      parts.push(`Visibility: ${transition.avsTransition.from} → ${transition.avsTransition.to}`);
    }
    
    if (transition.coverStateChanged) {
      parts.push(`Cover: ${transition.coverTransition.from} → ${transition.coverTransition.to}`);
    }
    
    if (transition.stealthBonusChange !== 0) {
      const sign = transition.stealthBonusChange > 0 ? '+' : '';
      parts.push(`Stealth: ${sign}${transition.stealthBonusChange}`);
    }

    return parts.join(', ') || 'Position changed';
  });

} catch (_) {
  // In non-Foundry environments Handlebars may be unavailable; ignore
}
