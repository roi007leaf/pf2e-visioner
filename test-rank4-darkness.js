#!/usr/bin/env node

// Test script to verify rank 4 darkness behavior with darkvision
const { VisibilityCalculator } = await import('./scripts/visibility/auto-visibility/VisibilityCalculator.js');

// Mock token creation helper
function createMockToken(id, name, visionType, position = { x: 0, y: 0 }) {
  const token = {
    id,
    name,
    document: {
      id,
      x: position.x,
      y: position.y,
      width: 1,
      height: 1,
      elevation: 0,
      flags: {}
    },
    actor: {
      name,
      system: {
        perception: {
          senses: visionType === 'greater-darkvision' ? 
            [{ type: 'darkvision', range: Infinity, greater: true }] :
            visionType === 'darkvision' ? 
            [{ type: 'darkvision', range: 60 }] : []
        }
      }
    },
    x: position.x + 50, // Center of token
    y: position.y + 50
  };
  return token;
}

// Mock components
const mockLightingCalculator = {
  getLightLevelAt: (_position, _token) => ({
    darknessRank: 4, // Always rank 4 darkness
    lightingType: 'darkness',
    darkness: 1
  })
};

const mockVisionAnalyzer = {
  getVisionCapabilities: (token) => {
    const senses = token.actor.system.perception.senses;
    const hasGreaterDarkvision = senses.some(s => s.type === 'darkvision' && s.greater);
    const hasDarkvision = senses.some(s => s.type === 'darkvision');
    
    return {
      hasVision: true,
      hasDarkvision,
      hasGreaterDarkvision,
      hasLowLightVision: false,
      visionRange: Infinity,
      darkvisionRange: hasDarkvision ? (hasGreaterDarkvision ? Infinity : 60) : 0
    };
  },
  
  hasLineOfSight: () => true,
  hasPreciseNonVisualInRange: () => false,
  canSenseImprecisely: () => false,
  getSensingSummary: () => ({ imprecise: [], precise: [] }),
  canDetectElevatedTarget: () => true
};

const mockConditionManager = {
  isBlinded: () => false,
  isInvisibleTo: () => false,
  isDazzled: () => false
};

async function testRank4DarknessScenarios() {
  console.log('🧪 Testing Rank 4 Darkness Scenarios...\n');

  // Initialize calculator
  const calculator = new VisibilityCalculator();
  calculator.initialize(mockLightingCalculator, mockVisionAnalyzer, mockConditionManager);

  const scenarios = [
    {
      name: 'Normal Vision in Rank 4 Darkness',
      observer: createMockToken('obs1', 'Normal Observer', 'normal', { x: 0, y: 0 }),
      target: createMockToken('tgt1', 'Target', 'normal', { x: 100, y: 0 }),
      expectedResult: 'hidden', // No darkvision in rank 4
    },
    {
      name: 'Darkvision in Rank 4 Darkness',
      observer: createMockToken('obs2', 'Darkvision Observer', 'darkvision', { x: 0, y: 0 }),
      target: createMockToken('tgt2', 'Target', 'normal', { x: 100, y: 0 }),
      expectedResult: 'concealed', // Darkvision sees concealed in rank 4
    },
    {
      name: 'Greater Darkvision in Rank 4 Darkness',
      observer: createMockToken('obs3', 'Greater Darkvision Observer', 'greater-darkvision', { x: 0, y: 0 }),
      target: createMockToken('tgt3', 'Target', 'normal', { x: 100, y: 0 }),
      expectedResult: 'observed', // Greater darkvision sees observed even in rank 4
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n🔍 Testing: ${scenario.name}`);
    console.log(`  Observer: ${scenario.observer.name} (${scenario.observer.actor.system.perception.senses.map(s => s.type + (s.greater ? ' (greater)' : '')).join(', ') || 'normal vision'})`);
    console.log(`  Target: ${scenario.target.name}`);
    console.log(`  Expected: ${scenario.expectedResult}`);

    try {
      const result = await calculator.calculateVisibility(scenario.observer, scenario.target);
      console.log(`  Actual: ${result}`);
      
      if (result === scenario.expectedResult) {
        console.log('  ✅ PASS');
      } else {
        console.log('  ❌ FAIL');
      }
    } catch (error) {
      console.log(`  💥 ERROR: ${error.message}`);
    }
  }

  console.log('\n🏁 Test completed');
}

// Run the test
testRank4DarknessScenarios().catch(console.error);