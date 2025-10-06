/**
 * Position State Data Models and Validation
 * Provides data structures and validation functions for position tracking
 * in the enhanced sneak AVS integration system.
 */

/**
 * Position state data structure combining AVS and Auto-Cover information
 * @typedef {Object} PositionState
 * @property {string} avsVisibility - AVS visibility state ('hidden', 'concealed', 'observed', 'undetected')
 * @property {boolean} avsCalculated - Whether AVS calculation was successful
 * @property {string|null} avsOverride - Any AVS override applied
 * @property {string} coverState - Auto-Cover state ('none', 'lesser', 'standard', 'greater')
 * @property {boolean} coverCalculated - Whether cover calculation was successful
 * @property {string|null} coverOverride - Any cover override applied
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {string} effectiveVisibility - Final visibility considering both systems
 * @property {number} distance - Distance between tokens
 * @property {boolean} hasLineOfSight - Whether there's line of sight
 * @property {string} lightingConditions - Current lighting conditions
 * @property {number} timestamp - When this state was captured
 * @property {boolean} avsEnabled - Whether AVS system is enabled
 * @property {boolean} autoCoverEnabled - Whether Auto-Cover system is enabled
 * @property {Array<string>} systemErrors - Any errors encountered during calculation
 */

/**
 * Position transition data structure
 * @typedef {Object} PositionTransition
 * @property {string} targetId - ID of the target token
 * @property {PositionState} startPosition - Position state at start
 * @property {PositionState} endPosition - Position state at end
 * @property {boolean} hasChanged - Whether any position data changed
 * @property {boolean} avsVisibilityChanged - Whether AVS visibility changed
 * @property {boolean} coverStateChanged - Whether cover state changed
 * @property {number} impactOnDC - Impact on DC calculations
 * @property {number} stealthBonusChange - Change in stealth bonus
 * @property {string} transitionType - 'improved', 'worsened', or 'unchanged'
 * @property {Object} avsTransition - AVS-specific transition data
 * @property {string} avsTransition.from - Starting AVS visibility state
 * @property {string} avsTransition.to - Ending AVS visibility state
 * @property {boolean} avsTransition.changed - Whether AVS visibility changed
 * @property {Object} coverTransition - Cover-specific transition data
 * @property {string} coverTransition.from - Starting cover state
 * @property {string} coverTransition.to - Ending cover state
 * @property {number} coverTransition.bonusChange - Change in stealth bonus
 * @property {boolean} coverTransition.changed - Whether cover state changed
 */

/**
 * Valid AVS visibility states
 */
export const AVS_VISIBILITY_STATES = [
  'hidden',
  'concealed', 
  'observed',
  'undetected'
];

/**
 * Valid Auto-Cover states
 */
export const AUTO_COVER_STATES = [
  'none',
  'lesser',
  'standard',
  'greater'
];

/**
 * Valid lighting conditions
 */
export const LIGHTING_CONDITIONS = [
  'bright',
  'dim',
  'darkness',
  'unknown'
];

/**
 * Valid transition types
 */
export const TRANSITION_TYPES = [
  'improved',
  'worsened',
  'unchanged'
];

/**
 * Creates a default PositionState object with all required fields
 * @param {Object} overrides - Optional field overrides
 * @returns {PositionState} Default position state
 */
export function createDefaultPositionState(overrides = {}) {
  return {
    // AVS System Data
    avsVisibility: 'observed',
    avsCalculated: false,
    
    // Auto-Cover System Data
    coverState: 'none',
    coverCalculated: false,
    coverOverride: null,
    stealthBonus: 0,
    
    // Combined/Derived Data
    effectiveVisibility: 'observed',
    distance: 0,
    hasLineOfSight: true,
    lightingConditions: 'unknown',
    timestamp: Date.now(),
    
    // System Status
    avsEnabled: true,
    autoCoverEnabled: true,
    systemErrors: [],
    
    // Apply any overrides
    ...overrides
  };
}

/**
 * Creates a default PositionTransition object with all required fields
 * @param {string} targetId - Target token ID
 * @param {PositionState} startPosition - Starting position state
 * @param {PositionState} endPosition - Ending position state
 * @param {Object} overrides - Optional field overrides
 * @returns {PositionTransition} Default position transition
 */
export function createDefaultPositionTransition(targetId, startPosition, endPosition, overrides = {}) {
  const defaultStart = startPosition || createDefaultPositionState();
  const defaultEnd = endPosition || createDefaultPositionState();
  
  return {
    targetId: targetId || '',
    startPosition: defaultStart,
    endPosition: defaultEnd,
    hasChanged: false,
    avsVisibilityChanged: false,
    coverStateChanged: false,
    impactOnDC: 0,
    stealthBonusChange: 0,
    transitionType: 'unchanged',
    avsTransition: {
      from: defaultStart.avsVisibility,
      to: defaultEnd.avsVisibility,
      changed: false
    },
    coverTransition: {
      from: defaultStart.coverState,
      to: defaultEnd.coverState,
      bonusChange: 0,
      changed: false
    },
    
    // Apply any overrides
    ...overrides
  };
}

/**
 * Validates a PositionState object for data integrity
 * @param {any} positionState - Object to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validatePositionState(positionState) {
  const errors = [];
  
  // Check if object exists and is an object
  if (!positionState || typeof positionState !== 'object') {
    return {
      isValid: false,
      errors: ['Position state must be a non-null object']
    };
  }
  
  // Validate AVS visibility state
  if (!AVS_VISIBILITY_STATES.includes(positionState.avsVisibility)) {
    errors.push(`Invalid avsVisibility: ${positionState.avsVisibility}. Must be one of: ${AVS_VISIBILITY_STATES.join(', ')}`);
  }
  
  // Validate AVS calculated flag
  if (typeof positionState.avsCalculated !== 'boolean') {
    errors.push('avsCalculated must be a boolean');
  }
  
  
  // Validate cover state
  if (!AUTO_COVER_STATES.includes(positionState.coverState)) {
    errors.push(`Invalid coverState: ${positionState.coverState}. Must be one of: ${AUTO_COVER_STATES.join(', ')}`);
  }
  
  // Validate cover calculated flag
  if (typeof positionState.coverCalculated !== 'boolean') {
    errors.push('coverCalculated must be a boolean');
  }
  
  // Validate cover override (can be null or string)
  if (positionState.coverOverride !== null && typeof positionState.coverOverride !== 'string') {
    errors.push('coverOverride must be null or a string');
  }
  
  // Validate stealth bonus (must be a number)
  if (typeof positionState.stealthBonus !== 'number' || !Number.isFinite(positionState.stealthBonus)) {
    errors.push('stealthBonus must be a finite number');
  }
  
  // Validate effective visibility
  if (!AVS_VISIBILITY_STATES.includes(positionState.effectiveVisibility)) {
    errors.push(`Invalid effectiveVisibility: ${positionState.effectiveVisibility}. Must be one of: ${AVS_VISIBILITY_STATES.join(', ')}`);
  }
  
  // Validate distance (must be non-negative number)
  if (typeof positionState.distance !== 'number' || !Number.isFinite(positionState.distance) || positionState.distance < 0) {
    errors.push('distance must be a non-negative finite number');
  }
  
  // Validate line of sight flag
  if (typeof positionState.hasLineOfSight !== 'boolean') {
    errors.push('hasLineOfSight must be a boolean');
  }
  
  // Validate lighting conditions
  if (!LIGHTING_CONDITIONS.includes(positionState.lightingConditions)) {
    errors.push(`Invalid lightingConditions: ${positionState.lightingConditions}. Must be one of: ${LIGHTING_CONDITIONS.join(', ')}`);
  }
  
  // Validate timestamp (must be positive number)
  if (typeof positionState.timestamp !== 'number' || !Number.isFinite(positionState.timestamp) || positionState.timestamp <= 0) {
    errors.push('timestamp must be a positive finite number');
  }
  
  // Validate system enabled flags
  if (typeof positionState.avsEnabled !== 'boolean') {
    errors.push('avsEnabled must be a boolean');
  }
  
  if (typeof positionState.autoCoverEnabled !== 'boolean') {
    errors.push('autoCoverEnabled must be a boolean');
  }
  
  // Validate system errors array
  if (!Array.isArray(positionState.systemErrors)) {
    errors.push('systemErrors must be an array');
  } else {
    // Check that all errors are strings
    for (let i = 0; i < positionState.systemErrors.length; i++) {
      if (typeof positionState.systemErrors[i] !== 'string') {
        errors.push(`systemErrors[${i}] must be a string`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates a PositionTransition object for data integrity
 * @param {any} positionTransition - Object to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validatePositionTransition(positionTransition) {
  const errors = [];
  
  // Check if object exists and is an object
  if (!positionTransition || typeof positionTransition !== 'object') {
    return {
      isValid: false,
      errors: ['Position transition must be a non-null object']
    };
  }
  
  // Validate target ID
  if (typeof positionTransition.targetId !== 'string') {
    errors.push('targetId must be a string');
  }
  
  // Validate start position
  if (!positionTransition.startPosition) {
    errors.push('startPosition is required');
  } else {
    const startValidation = validatePositionState(positionTransition.startPosition);
    if (!startValidation.isValid) {
      errors.push(`startPosition validation failed: ${startValidation.errors.join(', ')}`);
    }
  }
  
  // Validate end position
  if (!positionTransition.endPosition) {
    errors.push('endPosition is required');
  } else {
    const endValidation = validatePositionState(positionTransition.endPosition);
    if (!endValidation.isValid) {
      errors.push(`endPosition validation failed: ${endValidation.errors.join(', ')}`);
    }
  }
  
  // Validate boolean flags
  if (typeof positionTransition.hasChanged !== 'boolean') {
    errors.push('hasChanged must be a boolean');
  }
  
  if (typeof positionTransition.avsVisibilityChanged !== 'boolean') {
    errors.push('avsVisibilityChanged must be a boolean');
  }
  
  if (typeof positionTransition.coverStateChanged !== 'boolean') {
    errors.push('coverStateChanged must be a boolean');
  }
  
  // Validate numeric fields
  if (typeof positionTransition.impactOnDC !== 'number' || !Number.isFinite(positionTransition.impactOnDC)) {
    errors.push('impactOnDC must be a finite number');
  }
  
  if (typeof positionTransition.stealthBonusChange !== 'number' || !Number.isFinite(positionTransition.stealthBonusChange)) {
    errors.push('stealthBonusChange must be a finite number');
  }
  
  // Validate transition type
  if (!TRANSITION_TYPES.includes(positionTransition.transitionType)) {
    errors.push(`Invalid transitionType: ${positionTransition.transitionType}. Must be one of: ${TRANSITION_TYPES.join(', ')}`);
  }
  
  // Validate AVS transition
  if (!positionTransition.avsTransition || typeof positionTransition.avsTransition !== 'object') {
    errors.push('avsTransition must be an object');
  } else {
    const avsTransition = positionTransition.avsTransition;
    
    if (!AVS_VISIBILITY_STATES.includes(avsTransition.from)) {
      errors.push(`Invalid avsTransition.from: ${avsTransition.from}`);
    }
    
    if (!AVS_VISIBILITY_STATES.includes(avsTransition.to)) {
      errors.push(`Invalid avsTransition.to: ${avsTransition.to}`);
    }
    
    if (typeof avsTransition.changed !== 'boolean') {
      errors.push('avsTransition.changed must be a boolean');
    }
  }
  
  // Validate cover transition
  if (!positionTransition.coverTransition || typeof positionTransition.coverTransition !== 'object') {
    errors.push('coverTransition must be an object');
  } else {
    const coverTransition = positionTransition.coverTransition;
    
    if (!AUTO_COVER_STATES.includes(coverTransition.from)) {
      errors.push(`Invalid coverTransition.from: ${coverTransition.from}`);
    }
    
    if (!AUTO_COVER_STATES.includes(coverTransition.to)) {
      errors.push(`Invalid coverTransition.to: ${coverTransition.to}`);
    }
    
    if (typeof coverTransition.bonusChange !== 'number' || !Number.isFinite(coverTransition.bonusChange)) {
      errors.push('coverTransition.bonusChange must be a finite number');
    }
    
    if (typeof coverTransition.changed !== 'boolean') {
      errors.push('coverTransition.changed must be a boolean');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}