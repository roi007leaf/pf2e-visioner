# Clickable Tooltip Badges - Implementation Summary

## Overview
This implementation adds clickable functionality to hover tooltip badges (visibility and cover indicators) that appear above tokens. When clicked, these badges now open the Token Manager with the appropriate mode and highlight the relevant row.

## Changes Made

### 1. Modified `scripts/services/HoverTooltips.js`

#### Badge Elements Made Clickable
- Changed `pointerEvents` from `'none'` to `'auto'` on all badge elements
- Added `cursor: 'pointer'` style to indicate clickability
- Updated the following functions:
  - `placeBadge()` - Creates visibility badges
  - `placeSenseBadge()` - Creates sense detection badges  
  - `addCoverIndicator()` - Creates cover badges

#### New Click Handler Function
Added `addBadgeClickHandler(badgeElement, observerToken, targetToken, mode)` which:
- Attaches click event listeners to badge elements
- Opens the Token Manager with the correct mode based on context:
  - **Observer mode**: Shows how the observer token sees others
  - **Target mode**: Shows how others see the target token
- Highlights and scrolls to the relevant row in the Token Manager
- Uses a 100ms delay to ensure the Token Manager is fully rendered before highlighting

#### Integration Points
The click handler is attached to:
- Visibility badges (when state is not 'observed')
- Sense badges (for all visibility states)
- Cover badges (both manual and auto-computed)

## How It Works

### Mode Selection Logic
- **Observer mode badges**: When you hover over a token to see how it sees others
  - Clicking opens Token Manager in observer mode for that token
  - Highlights the row of the target being viewed
  
- **Target mode badges**: When you hover to see how others see a token
  - Clicking opens Token Manager in target mode for that token
  - Highlights the row of the observer viewing it

### Row Highlighting
After opening the Token Manager:
1. Waits 100ms for rendering to complete
2. Finds all rows matching the relevant token ID using `data-token-id` attribute
3. Adds `row-hover` class to highlight the rows
4. Scrolls the first matching row into view with smooth animation

## Testing

### Manual Testing Steps

1. **Setup**
   - Open a Foundry VTT game with PF2E system
   - Place multiple tokens on a scene
   - Ensure hover tooltips are enabled in module settings

2. **Test Observer Mode Tooltips**
   - Select a token (Token A)
   - Hold Alt/Option key to show tooltips
   - Observer mode badges should appear on other tokens showing how Token A sees them
   - Click a visibility/cover badge on Token B
   - **Expected**: Token Manager opens in observer mode for Token A
   - **Expected**: Row for Token B is highlighted and scrolled into view

3. **Test Target Mode Tooltips**
   - Hover over a token (Token C) without selecting it
   - Alt+hover should show target mode badges (how others see Token C)
   - Click a visibility/cover badge
   - **Expected**: Token Manager opens in target mode for Token C
   - **Expected**: Row for the observer token is highlighted and scrolled into view

4. **Test Cover Badges**
   - Use Ctrl+Alt (GM only) to show cover overlay
   - Click a cover badge on a token
   - **Expected**: Token Manager opens in target mode
   - **Expected**: Relevant row is highlighted

### Automated Testing
- New test file: `tests/unit/services/hover-tooltips-clickable.test.js`
- Tests verify badge structure supports clickability
- All 154 test suites pass (1789 tests total)

## Technical Details

### Click Handler Implementation
```javascript
function addBadgeClickHandler(badgeElement, observerToken, targetToken, mode) {
  if (!badgeElement) return;
  
  badgeElement.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      const { openTokenManagerWithMode } = await import('../api.js');
      
      // Open Token Manager with appropriate mode and token
      if (mode === 'observer') {
        await openTokenManagerWithMode(observerToken, 'observer');
      } else {
        await openTokenManagerWithMode(targetToken, 'target');
      }
      
      // Highlight and scroll to relevant row after a brief delay
      setTimeout(async () => {
        const manager = await import('../managers/token-manager/TokenManager.js');
        const app = manager.VisionerTokenManager.currentInstance;
        if (app && app.element) {
          const rowToHighlight = mode === 'observer' ? targetToken.id : observerToken.id;
          const rows = app.element.querySelectorAll(`tr[data-token-id="${rowToHighlight}"]`);
          if (rows && rows.length > 0) {
            rows.forEach((r) => r.classList.add('row-hover'));
            rows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
    } catch (error) {
      console.error('PF2E Visioner | Error opening token manager from tooltip:', error);
    }
  });
}
```

### Badge Element Updates
```javascript
// Before
el.style.pointerEvents = 'none';

// After  
el.style.pointerEvents = 'auto';
el.style.cursor = 'pointer';
```

## Benefits

1. **Improved User Experience**: Quick access to Token Manager from tooltips
2. **Context-Aware**: Opens in the correct mode automatically
3. **Visual Feedback**: Highlights and scrolls to relevant row
4. **No Breaking Changes**: Existing functionality remains intact
5. **Accessibility**: Clear cursor indication that badges are clickable

## Considerations

- Click handlers use dynamic imports to avoid circular dependencies
- 100ms delay ensures Token Manager is rendered before row highlighting
- Click events use `preventDefault()` and `stopPropagation()` to avoid conflicts
- Error handling ensures graceful degradation if Token Manager fails to open
