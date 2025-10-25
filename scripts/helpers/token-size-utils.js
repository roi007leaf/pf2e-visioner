/**
 * Token Size Utilities
 *
 * Centralized functions for calculating correct token sizes based on PF2e creature size
 * instead of relying on potentially incorrect document.width/height values.
 */

// Size to grid squares mapping (PF2e rules)
const CREATURE_SIZE_TO_SQUARES = {
  tiny: 0.5, // Takes up less than 1 square
  sm: 1, // Small = 1 square
  small: 1, // Small = 1 square
  med: 1, // Medium = 1 square
  medium: 1, // Medium = 1 square
  lg: 2, // Large = 2x2 squares
  large: 2, // Large = 2x2 squares
  huge: 3, // Huge = 3x3 squares
  grg: 4, // Gargantuan = 4x4 squares
  gargantuan: 4, // Gargantuan = 4x4 squares
};

/**
 * Get the correct grid size for a token based on its creature size
 * @param {Token} token - The token to get size for
 * @returns {Object} - {width: number, height: number} in grid squares
 */
export function getCorrectTokenGridSize(token) {
  try {
    // Get the creature size from the actor data (PF2e system)
    const creatureSize = token?.actor?.system?.traits?.size?.value ?? 'med';

    // Get the number of grid squares this size should occupy
    const squares = CREATURE_SIZE_TO_SQUARES[creatureSize] ?? 1;

    return { width: squares, height: squares };
  } catch (error) {
    console.warn('PF2E Visioner: Error getting creature size, defaulting to medium', error);
    return { width: 1, height: 1 };
  }
}

/**
 * Get token rectangle using correct size calculation
 * @param {Token} token - The token
 * @returns {Object} - Rectangle with x1, y1, x2, y2 in pixels
 */
export function getCorrectTokenRect(token) {
  const x1 = token.document.x;
  const y1 = token.document.y;

  // Use correct size calculation instead of document.width/height
  const gridSize = canvas.grid.size;
  const correctSize = getCorrectTokenGridSize(token);

  const width = correctSize.width * gridSize;
  const height = correctSize.height * gridSize;

  return { x1, y1, x2: x1 + width, y2: y1 + height };
}

/**
 * Get the correct pixel width for a token
 * @param {Token} token - The token
 * @returns {number} - Width in pixels
 */
export function getCorrectTokenWidth(token) {
  const correctSize = getCorrectTokenGridSize(token);
  return correctSize.width * canvas.grid.size;
}

/**
 * Get the correct pixel height for a token
 * @param {Token} token - The token
 * @returns {number} - Height in pixels
 */
export function getCorrectTokenHeight(token) {
  const correctSize = getCorrectTokenGridSize(token);
  return correctSize.height * canvas.grid.size;
}

/**
 * Get the correct center point for a token
 * @param {Token} token - The token
 * @returns {Object} - {x: number, y: number} center point
 */
export function getCorrectTokenCenter(token) {
  // Use native Foundry method for center point calculation with fallback
  if (token.getCenterPoint && typeof token.getCenterPoint === 'function') {
    return token.getCenterPoint();
  }
  
  // Fallback to manual calculation when native method isn't available
  const rect = getCorrectTokenRect(token);
  return {
    x: (rect.x1 + rect.x2) / 2,
    y: (rect.y1 + rect.y2) / 2,
  };
}
