/**
 * Quick test to see if new workflow would work
 * This simulates what should happen with the new baseline-first approach
 */

console.log('🧪 Testing new baseline-first workflow logic...');

// Simulated inputs based on our debug session
const mockScenario = {
  // From our debug: Adept (observer) looking at invisible Poltergeist (target)
  observer: { name: 'Adept' },
  target: { name: 'Poltergeist' },
  
  // From debug: Lighting calculation is correct
  lightLevel: { level: 'darkness', darknessRank: 4, isDarknessSource: true },
  
  // From debug: Vision capabilities are correct  
  observerVision: { hasVision: true, hasDarkvision: false, hasGreaterDarkvision: false },
  
  // From debug: Conditions
  targetIsInvisible: true,
  observerCanSenseImprecisely: false,
  observerHasPreciseNonVisual: false,
};

// Step 1: Calculate baseline visibility (NEW APPROACH)
console.log('\n📐 Step 1: Calculate baseline visibility');

// Simulate baseline calculation
function calculateBaseline(observerVision, lightLevel) {
  // Check if vision is effective in current lighting
  const darknessRank = lightLevel.darknessRank || 0;
  const canSeeNormally = (() => {
    if (!observerVision.hasVision) return false;
    if (darknessRank === 0) return true;
    if (darknessRank >= 1 && darknessRank <= 3 && observerVision.hasDarkvision) return true;
    if (darknessRank >= 4 && observerVision.hasGreaterDarkvision) return true;
    return false;
  })();
  
  console.log(`  Observer can see normally: ${canSeeNormally}`);
  
  // If can't see normally in darkness, baseline is 'hidden'
  if (!canSeeNormally && lightLevel.level === 'darkness') {
    return 'hidden';
  }
  
  // Otherwise assume baseline is 'observed' (simplified)
  return 'observed';
}

const baselineState = calculateBaseline(mockScenario.observerVision, mockScenario.lightLevel);
console.log(`  Baseline visibility: ${baselineState}`);

// Step 2: Apply invisibility condition to baseline (NEW APPROACH)
console.log('\n👻 Step 2: Apply invisibility condition');

function applyInvisibility(baselineState, targetIsInvisible, canSenseImprecisely, hasPreciseNonVisual) {
  if (!targetIsInvisible) {
    console.log('  Target not invisible, returning baseline');
    return baselineState;
  }
  
  console.log('  Target is invisible, checking senses...');
  
  if (hasPreciseNonVisual) {
    console.log('  Has precise non-visual sense → observed');
    return 'observed';
  }
  
  if (canSenseImprecisely) {
    console.log('  Can sense imprecisely → hidden');
    return 'hidden';
  }
  
  // Apply PF2e invisibility rules based on baseline
  console.log(`  Baseline: ${baselineState}`);
  if (baselineState === 'observed') {
    console.log('  observed + invisible → hidden');
    return 'hidden';
  } else if (baselineState === 'concealed') {
    console.log('  concealed + invisible → hidden');
    return 'hidden';
  } else if (baselineState === 'hidden') {
    console.log('  hidden + invisible → undetected');
    return 'undetected';
  }
  
  return 'undetected';
}

const finalResult = applyInvisibility(
  baselineState, 
  mockScenario.targetIsInvisible, 
  mockScenario.observerCanSenseImprecisely, 
  mockScenario.observerHasPreciseNonVisual
);

console.log(`\n🎯 Final result: ${finalResult}`);

// Compare with expected
console.log('\n📊 Analysis:');
console.log('Expected: undetected (invisible creature in rank 4 darkness, observer has no greater darkvision)');
console.log(`Actual: ${finalResult}`);

if (finalResult === 'undetected') {
  console.log('✅ SUCCESS: New baseline-first workflow produces correct result!');
} else {
  console.log('❌ FAILURE: New workflow still has issues');
}

console.log('\n🔧 The key insight:');
console.log('- OLD workflow: Check invisibility BEFORE establishing baseline → always returns "hidden"');  
console.log('- NEW workflow: Establish baseline FIRST → "hidden", then apply invisibility → "undetected"');
console.log('- This matches PF2e rules: hidden + invisible = undetected when observer can\'t see normally');