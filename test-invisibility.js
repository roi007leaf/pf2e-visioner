/**
 * Test specific invisibility calculation
 */

async function testInvisibilityCalculation() {
  console.log('🔍 Testing invisibility calculation...');
  
  const tokens = canvas.tokens.controlled.length >= 2 
    ? canvas.tokens.controlled 
    : canvas.tokens.placeables.slice(0, 2);
    
  const observer = tokens[0]; // Adept
  const target = tokens[1];   // Poltergeist (invisible)
  
  console.log(`👁️ Observer: ${observer.name}`);
  console.log(`🎯 Target: ${target.name} (should be invisible)`);
  
  try {
    // Import the ConditionManager and test the exact method
    const { ConditionManager } = await import('/modules/pf2e-visioner/scripts/visibility/auto-visibility/ConditionManager.js');
    const conditionManager = ConditionManager.getInstance();
    
    // Check if target is invisible to observer
    const isInvisible = conditionManager.isInvisibleTo(observer, target);
    console.log(`👻 Target invisible to observer: ${isInvisible}`);
    
    if (!isInvisible) {
      console.log('❌ Target is not invisible - apply invisible condition to target first');
      return;
    }
    
    // Test the canSeeNormally calculation manually
    const hasVision = !!(observer.vision?.enabled || observer.document?.sight?.enabled);
    const hasDarkvision = observer.actor?.system?.traits?.senses?.some(s => 
      s.type === 'darkvision' || s.type === 'greater-darkvision'
    );
    
    console.log(`👁️ Observer has vision: ${hasVision}`);
    console.log(`🔮 Observer has darkvision: ${hasDarkvision}`);
    
    // Simulate the light level check
    const globalDarkness = canvas.scene?.darkness || 0;
    const hasGlobalLight = canvas.lighting?.globalLight;
    
    console.log(`🌙 Global darkness: ${globalDarkness}`);
    console.log(`💡 Global light: ${hasGlobalLight}`);
    
    // Determine canSeeNormally - this is the key calculation
    let canSeeNormally;
    if (!hasVision) {
      canSeeNormally = false;
    } else if (globalDarkness === 0 || hasGlobalLight) {
      canSeeNormally = true; // Normal lighting
    } else if (globalDarkness >= 1 && hasDarkvision) {
      canSeeNormally = true; // Has darkvision in darkness
    } else {
      canSeeNormally = false; // No darkvision in darkness
    }
    
    console.log(`✨ Can see normally (calculated): ${canSeeNormally}`);
    
    // Check invisibility flags
    const invisibilityFlags = target.document.flags?.['pf2e-visioner']?.invisibility || {};
    const wasVisible = invisibilityFlags[observer.document.id]?.wasVisible;
    console.log(`🏷️ Was visible when became invisible: ${wasVisible}`);
    
    // Mock the hasSneakOverride function
    const mockHasSneakOverride = async () => {
      const targetFlags = target?.document?.flags?.['pf2e-visioner'] || {};
      const sneakOverrideKey = `sneak-override-from-${observer?.document?.id}`;
      return !!(targetFlags[sneakOverrideKey]?.success);
    };
    
    // Call getInvisibilityState with our calculated values
    const expectedState = await conditionManager.getInvisibilityState(
      observer, 
      target, 
      mockHasSneakOverride, 
      canSeeNormally
    );
    
    console.log(`\n🎯 getInvisibilityState returned: ${expectedState}`);
    
    // Manual rule check
    console.log('\n📜 Manual Rule Application:');
    if (canSeeNormally) {
      console.log('- Observer can see normally → should be HIDDEN');
    } else if (wasVisible) {
      console.log('- Observer cannot see normally but target was visible when became invisible → should be HIDDEN'); 
    } else {
      console.log('- Observer cannot see normally and no wasVisible flag → should be UNDETECTED');
    }
    
    console.log(`\n🔧 Expected based on manual rules: ${canSeeNormally || wasVisible ? 'hidden' : 'undetected'}`);
    console.log(`📋 Actual from getInvisibilityState: ${expectedState}`);
    
    if (expectedState !== (canSeeNormally || wasVisible ? 'hidden' : 'undetected')) {
      console.log('❌ MISMATCH in getInvisibilityState logic!');
    } else {
      console.log('✅ getInvisibilityState working correctly');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testInvisibilityCalculation();