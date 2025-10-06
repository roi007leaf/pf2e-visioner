// Centralized mapping of desired override states per action type

export function getDesiredOverrideStatesForAction(actionType) {
  switch (actionType) {
    case 'seek':
      return ['observed', 'hidden'];
    case 'hide':
    case 'create-a-diversion':
      return ['avs', 'observed', 'hidden'];
    case 'sneak':
      return ['avs', 'observed', 'hidden', 'undetected'];
    case 'point-out':
      return ['hidden'];
    case 'consequences':
      return ['avs', 'observed', 'concealed', 'hidden', 'undetected'];
    default:
      return ['avs', 'observed', 'concealed', 'hidden', 'undetected'];
  }
}

// Default outcome → newVisibility mapping per action.
// Keys are action types; per action, keys are old visibility; per old visibility,
// keys are outcome levels mapped to the default new state.
export function getDefaultOutcomeMapping() {
  const sneakMapping = {
    observed: {
      'critical-success': 'undetected',
      success: 'undetected',
      failure: 'avs',
      'critical-failure': 'avs',
    },
    concealed: {
      'critical-success': 'undetected',
      success: 'undetected',
      failure: 'avs',
      'critical-failure': 'avs',
    },
    hidden: {
      'critical-success': 'undetected',
      success: 'undetected',
      failure: 'avs',
      'critical-failure': 'avs',
    },
    undetected: {
      'critical-success': 'undetected',
      success: 'undetected',
      failure: 'avs',
      'critical-failure': 'avs',
    },
  };

  return {
    seek: {
      observed: {
        'critical-success': 'observed',
        success: 'observed',
        failure: 'observed',
        'critical-failure': 'observed',
      },
      concealed: {
        'critical-success': 'concealed',
        success: 'concealed',
        failure: 'concealed',
        'critical-failure': 'concealed',
      },
      hidden: {
        'critical-success': 'observed',
        success: 'observed',
        failure: 'hidden',
        'critical-failure': 'hidden',
      },
      undetected: {
        'critical-success': 'observed',
        success: 'hidden',
        failure: 'undetected',
        'critical-failure': 'undetected',
      },
    },
    hide: {
      observed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'avs',
        'critical-failure': 'avs',
      },
      concealed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'avs',
        'critical-failure': 'avs',
      },
      hidden: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'avs',
        'critical-failure': 'avs',
      },
      undetected: {
        'critical-success': 'undetected',
        success: 'undetected',
        failure: 'avs',
        'critical-failure': 'avs',
      },
    },
    sneak: sneakMapping,
    'create-a-diversion': {
      observed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'observed',
        'critical-failure': 'observed',
      },
      concealed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'concealed',
        'critical-failure': 'concealed',
      },
      hidden: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'observed',
        'critical-failure': 'observed',
      },
      undetected: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'observed',
        'critical-failure': 'observed',
      },
    },
    // Point Out defines its own observer/target mapping; leave empty for now
    'point-out': {
      observed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'hidden',
        'critical-failure': 'hidden',
      },
      concealed: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'hidden',
        'critical-failure': 'hidden',
      },
      hidden: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'hidden',
        'critical-failure': 'hidden',
      },
      undetected: {
        'critical-success': 'hidden',
        success: 'hidden',
        failure: 'hidden',
        'critical-failure': 'hidden',
      },
    },
    consequences: {
      hidden: {
        'critical-success': 'observed',
        success: 'observed',
        failure: 'observed',
        'critical-failure': 'observed',
      },
      undetected: {
        'critical-success': 'observed',
        success: 'observed',
        failure: 'observed',
        'critical-failure': 'observed',
      },
    },
  };
}

export function getDefaultNewStateFor(actionType, oldState, outcomeLevel) {
  const map = getDefaultOutcomeMapping()[actionType];
  if (!map) {
    return null;
  }

  const old = map[oldState];
  if (!old) {
    return null;
  }

  const result = old[outcomeLevel] || null;
  return result;
}
