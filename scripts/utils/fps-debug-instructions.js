/**
 * FPS Drop Debugging Instructions
 * 
 * To identify why FPS drops are still happening with ephemeral effects:
 * 
 * 1. Enable Debug Mode:
 *    await game.pf2eVisioner.enableFPSDropDebugging(true);
 * 
 * 2. Reproduce the FPS drop by triggering ephemeral effects
 * 
 * 3. Get Debug Report:
 *    const report = await game.pf2eVisioner.getFPSDropDebugReport();
 *    console.log('FPS Drop Debug Report:', report);
 * 
 * 4. Check Console for Warnings:
 *    - Look for "SLOW OPERATION" warnings
 *    - Look for "FPS DROP DETECTED" warnings
 *    - Look for "SLOW CANVAS OPERATION" warnings
 *    - Look for "SLOW EFFECT" warnings
 * 
 * 5. Analyze the Report:
 *    - Check recentCanvasOperations for slow canvas updates
 *    - Check recentEffectOperations for slow effect operations
 *    - Check performanceStats for FPS history
 *    - Check recommendations for suggested fixes
 * 
 * 6. Disable Debug Mode when done:
 *    await game.pf2eVisioner.enableFPSDropDebugging(false);
 * 
 * Common Issues to Look For:
 * 
 * 1. Canvas Perception Updates:
 *    - If canvas.perception.update takes >16ms, it's causing FPS drops
 *    - Look for excessive refreshVision/refreshLighting calls
 *    - Check if refreshOcclusion is being called unnecessarily
 * 
 * 2. Effect Operations:
 *    - If createEmbeddedDocuments/updateEmbeddedDocuments takes >16ms
 *    - Look for large batches of effects being created/updated
 *    - Check if effects are being created individually instead of in batches
 * 
 * 3. Token Refreshes:
 *    - If token.refresh takes >8ms, it's causing individual token lag
 *    - Look for excessive token refresh calls
 *    - Check if tokens are being refreshed individually instead of in batches
 * 
 * 4. Stack Traces:
 *    - Check the stack traces in warnings to see what's calling slow operations
 *    - Look for recursive calls or loops that might be causing issues
 * 
 * 5. Timing Patterns:
 *    - Check if operations are happening too frequently
 *    - Look for operations that should be batched but aren't
 *    - Check if throttling is working properly
 * 
 * Solutions Based on Findings:
 * 
 * 1. If canvas updates are slow:
 *    - Reduce refresh frequency
 *    - Skip unnecessary refresh types
 *    - Batch canvas operations
 * 
 * 2. If effect operations are slow:
 *    - Increase batch sizes
 *    - Reduce individual effect complexity
 *    - Defer non-critical effect updates
 * 
 * 3. If token refreshes are slow:
 *    - Batch token refresh operations
 *    - Skip visual updates during bulk operations
 *    - Use token.update() instead of token.refresh() when possible
 * 
 * 4. If operations are too frequent:
 *    - Increase throttling intervals
 *    - Add more aggressive debouncing
 *    - Implement operation queuing
 */

export const DEBUG_INSTRUCTIONS = {
  enable: 'await game.pf2eVisioner.enableFPSDropDebugging(true);',
  getReport: 'const report = await game.pf2eVisioner.getFPSDropDebugReport();',
  disable: 'await game.pf2eVisioner.enableFPSDropDebugging(false);',
  clear: 'await game.pf2eVisioner.clearFPSDropDebugData();'
};

