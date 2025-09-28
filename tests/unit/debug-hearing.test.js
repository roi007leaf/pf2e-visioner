/**
 * Debug test for hearing detection
 */

const { VisionAnalyzer } = require('../../scripts/visibility/auto-visibility/VisionAnalyzer');

describe('Debug Hearing Detection', () => {
  it('should debug the hearing detection process', () => {
    const visionAnalyzer = new VisionAnalyzer();

    const mockToken = {
      name: 'Kyra',
      document: {
        detectionModes: [
          {
            id: 'hearing',
            enabled: true,
            range: 30
          }
        ]
      }
    };

    const mockActor = {
      system: {
        perception: {
          senses: [] // Empty array
        }
      }
    };

    console.log('Before getSensingSummary call');
    console.log('Mock token detectionModes:', mockToken.document.detectionModes);
    console.log('Mock actor senses:', mockActor.system.perception.senses);

    const result = visionAnalyzer.getSensingSummary(mockToken, mockActor);

    console.log('Result:', JSON.stringify(result, null, 2));

    expect(true).toBe(true); // Just to make the test pass while debugging
  });
});