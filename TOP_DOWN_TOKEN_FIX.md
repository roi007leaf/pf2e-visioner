# Fix for Top-Down Token Cover Detection Issue

## Summary
Fixed cover-auto detection for tokens using top-down (overhead) images by ensuring token rectangles are calculated based on creature size from PF2e actor data rather than potentially incorrect document dimensions.

## Problem
When tokens use top-down/overhead artwork:
- The token's `document.width` and `document.height` may not match the creature's mechanical size
- For example, a Medium creature might have a 2×2 document size due to image proportions
- This caused `getTokenRect()` to calculate incorrect boundaries for cover detection
- Result: top-down tokens didn't generate proper cover areas

## Root Cause
The `getTokenRect()` function in `scripts/helpers/size-elevation-utils.js` was using:
```javascript
const width = token.document.width * canvas.grid.size;
const height = token.document.height * canvas.grid.size;
```

This relied on document dimensions which can be incorrect for top-down tokens.

## Solution
Updated `getTokenRect()` to calculate dimensions based on creature size:
```javascript
const creatureSize = token?.actor?.system?.traits?.size?.value ?? 'med';
const sizeToSquares = {
  tiny: 0.5,
  sm: 1, small: 1,
  med: 1, medium: 1,
  lg: 2, large: 2,
  huge: 3,
  grg: 4, gargantuan: 4,
};
const squares = sizeToSquares[creatureSize] ?? 1;
const width = squares * canvas.grid.size;
const height = squares * canvas.grid.size;
```

This matches the approach already used in `token-size-utils.js`.

## Files Changed
1. **scripts/helpers/size-elevation-utils.js**
   - Modified `getTokenRect()` to use creature size instead of document dimensions
   
2. **tests/unit/helpers/size-elevation-utils.test.js**
   - Added 4 tests for `getTokenRect()` with various creature sizes
   - Tests specifically validate top-down tokens with mismatched document dimensions
   
3. **tests/unit/cover/top-down-token-cover.test.js** (NEW)
   - 7 comprehensive end-to-end tests
   - Validates cover detection works for various scenarios:
     - Medium creatures with top-down images
     - Large creatures with wrong document dimensions
     - Tiny creatures
     - Mixed sizes
     - Regression tests for portrait-style tokens

## Test Results
- **Before**: 1824 tests passing
- **After**: 1835 tests passing (11 new tests)
- All existing tests still pass (no regressions)
- Linter passes

## Technical Impact
The fix ensures that:
1. Cover detection uses actual PF2e creature size for calculations
2. Top-down tokens work identically to portrait-style tokens
3. Document dimensions are ignored in favor of mechanical size
4. Falls back to medium (1 square) if creature size is missing

## Verification
To verify the fix works:
1. Create a Medium creature with a top-down token image (document width/height may be 2×2)
2. Place it between an attacker and target
3. Cover detection should now properly detect the cover based on 1×1 square (medium size)

## Related Code
This fix aligns with existing logic in:
- `scripts/helpers/token-size-utils.js` - `getCorrectTokenRect()` and related functions
- Cover detection system uses `getTokenRect()` extensively for calculating blocker positions
