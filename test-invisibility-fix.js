/**
 * Test script to verify that invisibility condition changes trigger AVS calculations
 */

// Test function to verify invisibility condition handling
async function testInvisibilityConditionHandling() {
  console.log('🧪 Testing invisibility condition handling...');
  
  try {
    // Get the first token on the scene
    const token = canvas.tokens.placeables[0];
    if (!token) {
      console.log('❌ No tokens found on canvas');
      return false;
    }
    
    console.log(`📍 Using token: ${token.name}`);
    
    // Get the condition manager
    const { ConditionManager } = await import('./scripts/visibility/auto-visibility/ConditionManager.js');
    const conditionManager = ConditionManager.getInstance();
    
    // Test the handleInvisibilityChange method directly
    console.log('🔧 Testing ConditionManager.handleInvisibilityChange()...');
    await conditionManager.handleInvisibilityChange(token.actor);
    console.log('✅ ConditionManager.handleInvisibilityChange() executed without errors');
    
    // Check if the visibility map exists (basic functionality test)
    const { getVisibilityMap } = game.modules.get('pf2e-visioner').api;
    const visibilityMap = getVisibilityMap(token);
    console.log('📊 Visibility map:', visibilityMap);
    
    // Test the event system integration
    console.log('🔗 Testing event system integration...');
    
    // Check if AVS is initialized and running
    const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
    console.log(`🎯 AVS Enabled: ${avsEnabled}`);
    
    if (avsEnabled) {
      // Import and check the auto-visibility system
      const { autoVisibilitySystem } = await import('./scripts/visibility/auto-visibility/index.js');
      const status = autoVisibilitySystem.getStatus?.();
      console.log('📈 AVS Status:', status);
      
      // Test condition detection
      const isInvisible = conditionManager.isInvisibleTo(token, token); // Self-check
      console.log(`👻 Token ${token.name} is invisible to self: ${isInvisible}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test
testInvisibilityConditionHandling().then(success => {
  if (success) {
    console.log('🎉 Invisibility condition handling test completed successfully!');
    console.log('💡 To test the full flow:');
    console.log('   1. Select a token');
    console.log('   2. Apply invisible condition via PF2e system');
    console.log('   3. Check if visibility states update automatically');
  } else {
    console.log('💥 Test failed - check console for errors');
  }
});