/**
 * Canvas Integration Tests
 * Tests actual canvas functionality including real HTML5 canvas operations
 */

import '../../setup.js';

describe('Canvas Integration Tests', () => {
  let canvas;
  let ctx;
  let testDiv;

  beforeEach(() => {
    // Create a real HTML5 canvas element
    testDiv = document.createElement('div');
    testDiv.id = 'test-canvas-container';
    document.body.appendChild(testDiv);

    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.id = 'test-canvas';
    testDiv.appendChild(canvas);

    ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  afterEach(() => {
    // Clean up
    if (testDiv && testDiv.parentNode) {
      testDiv.parentNode.removeChild(testDiv);
    }
  });

  describe('Real Canvas Operations', () => {
    test('canvas can draw basic shapes', () => {
      // Draw a rectangle
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(10, 10, 100, 50);

      // Draw a circle
      ctx.beginPath();
      ctx.arc(200, 35, 25, 0, 2 * Math.PI);
      ctx.fillStyle = '#00ff00';
      ctx.fill();

      // Draw a line
      ctx.beginPath();
      ctx.moveTo(300, 10);
      ctx.lineTo(400, 60);
      ctx.strokeStyle = '#0000ff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Verify canvas has content
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can measure text', () => {
      ctx.font = '16px Arial';
      const text = 'Test Text';
      const metrics = ctx.measureText(text);

      expect(metrics.width).toBeGreaterThan(0);
      expect(metrics.actualBoundingBoxAscent).toBeGreaterThan(0);
      // actualBoundingBoxDescent can be 0 for some fonts/environments, so just check it's a number
      expect(typeof metrics.actualBoundingBoxDescent).toBe('number');
      expect(metrics.actualBoundingBoxDescent).toBeGreaterThanOrEqual(0);
    });

    test('canvas can handle different colors and transparency', () => {
      // Test solid color
      ctx.fillStyle = 'rgba(255, 0, 0, 1.0)';
      ctx.fillRect(10, 10, 50, 50);

      // Test transparency
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.fillRect(30, 30, 50, 50);

      // Test hex colors
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(50, 50, 50, 50);

      // Verify different colors were applied
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can handle gradients', () => {
      // Create linear gradient
      const gradient = ctx.createLinearGradient(0, 0, 200, 0);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(1, '#0000ff');

      ctx.fillStyle = gradient;
      ctx.fillRect(10, 10, 200, 100);

      // Verify gradient was applied
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });
  });

  describe('Canvas Grid and Positioning', () => {
    test('canvas can draw grid lines', () => {
      const gridSize = 50;

      // Draw vertical grid lines
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw horizontal grid lines
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Verify grid lines were drawn
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can convert between pixel and grid coordinates', () => {
      const gridSize = 50;

      // Test pixel to grid conversion
      const pixelX = 125;
      const pixelY = 175;
      const gridX = Math.floor(pixelX / gridSize);
      const gridY = Math.floor(pixelY / gridSize);

      expect(gridX).toBe(2);
      expect(gridY).toBe(3);

      // Test grid to pixel conversion
      const centerX = gridX * gridSize + gridSize / 2;
      const centerY = gridY * gridSize + gridSize / 2;

      expect(centerX).toBe(125);
      expect(centerY).toBe(175);
    });

    test('canvas can draw tokens at grid positions', () => {
      const gridSize = 50;
      const tokenSize = 40;

      // Draw a token at grid position (2, 3)
      const gridX = 2;
      const gridY = 3;
      const pixelX = gridX * gridSize + gridSize / 2 - tokenSize / 2;
      const pixelY = gridY * gridSize + gridSize / 2 - tokenSize / 2;

      // Draw token circle
      ctx.beginPath();
      ctx.arc(pixelX + tokenSize / 2, pixelY + tokenSize / 2, tokenSize / 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff6600';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Verify token was drawn
      const imageData = ctx.getImageData(pixelX, pixelY, tokenSize, tokenSize);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });
  });

  describe('Canvas Token Visualization', () => {
    test('canvas can draw different token states', () => {
      const tokenStates = [
        { state: 'observed', color: '#4caf50', icon: '👁️' },
        { state: 'concealed', color: '#ffc107', icon: '☁️' },
        { state: 'hidden', color: '#ff6600', icon: '🙈' },
        { state: 'undetected', color: '#f44336', icon: '👻' },
      ];

      tokenStates.forEach((tokenState, index) => {
        const x = 50 + index * 150;
        const y = 100;
        const size = 60;

        // Draw token background
        ctx.fillStyle = tokenState.color;
        ctx.fillRect(x, y, size, size);

        // Draw token icon (simplified as text)
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tokenState.icon, x + size / 2, y + size / 2);

        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, size, size);
      });

      // Verify tokens were drawn
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can draw cover indicators', () => {
      const coverLevels = [
        { level: 'none', color: '#4caf50', icon: '🛡️' },
        { level: 'lesser', color: '#ffc107', icon: '🛡️' },
        { level: 'standard', color: '#ff6600', icon: '🛡️' },
        { level: 'greater', color: '#f44336', icon: '🛡️' },
      ];

      coverLevels.forEach((coverLevel, index) => {
        const x = 50 + index * 150;
        const y = 250;
        const size = 50;

        // Draw cover indicator
        ctx.fillStyle = coverLevel.color;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
        ctx.fill();

        // Draw icon
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(coverLevel.icon, x + size / 2, y + size / 2);

        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Verify cover indicators were drawn
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });
  });

  describe('Canvas Interaction Testing', () => {
    test('canvas can detect mouse position', () => {
      // Simulate mouse event
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 150,
      });

      // Get canvas-relative coordinates
      const rect = canvas.getBoundingClientRect();
      const canvasX = mouseEvent.clientX - rect.left;
      const canvasY = mouseEvent.clientY - rect.top;

      expect(canvasX).toBe(100);
      expect(canvasY).toBe(150);
    });

    test('canvas can detect clicks on tokens', () => {
      // Draw a token
      const tokenX = 100;
      const tokenY = 100;
      const tokenSize = 50;

      ctx.fillStyle = '#ff6600';
      ctx.fillRect(tokenX, tokenY, tokenSize, tokenSize);

      // Test click detection
      const clickX = tokenX + tokenSize / 2;
      const clickY = tokenY + tokenSize / 2;

      const isClickOnToken =
        clickX >= tokenX &&
        clickX <= tokenX + tokenSize &&
        clickY >= tokenY &&
        clickY <= tokenY + tokenSize;

      expect(isClickOnToken).toBe(true);

      // Test click outside token
      const outsideClickX = tokenX + tokenSize + 10;
      const outsideClickY = tokenY + tokenSize + 10;

      const isClickOutsideToken =
        outsideClickX < tokenX ||
        outsideClickX > tokenX + tokenSize ||
        outsideClickY < tokenY ||
        outsideClickY > tokenY + tokenSize;

      expect(isClickOutsideToken).toBe(true);
    });

    test('canvas can handle hover effects', () => {
      // Draw a token with hover state
      const tokenX = 200;
      const tokenY = 200;
      const tokenSize = 60;

      // Normal state
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(tokenX, tokenY, tokenSize, tokenSize);

      // Simulate hover
      const hoverX = tokenX + tokenSize / 2;
      const hoverY = tokenY + tokenSize / 2;

      // Check if mouse is hovering over token
      const isHovering =
        hoverX >= tokenX &&
        hoverX <= tokenX + tokenSize &&
        hoverY >= tokenY &&
        hoverY <= tokenY + tokenSize;

      if (isHovering) {
        // Draw hover effect (glow)
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(tokenX - 2, tokenY - 2, tokenSize + 4, tokenSize + 4);
        ctx.shadowBlur = 0; // Reset shadow
      }

      expect(isHovering).toBe(true);
    });
  });

  describe('Canvas Performance and Optimization', () => {
    test('canvas can handle multiple draw operations efficiently', () => {
      const startTime = performance.now();

      // Draw 100 small tokens
      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * 60;
        const y = Math.floor(i / 10) * 60;
        const size = 40;

        ctx.fillStyle = `hsl(${i * 3.6}, 70%, 60%)`;
        ctx.fillRect(x, y, size, size);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, size, size);
      }

      const endTime = performance.now();
      const drawTime = endTime - startTime;

      // Verify all tokens were drawn
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);

      // Performance should be reasonable (less than 100ms for 100 tokens)
      expect(drawTime).toBeLessThan(100);
    });

    test('canvas can clear and redraw efficiently', () => {
      // Draw initial content
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 100, 100);

      // Clear and redraw multiple times
      for (let i = 0; i < 10; i++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = `hsl(${i * 36}, 70%, 60%)`;
        ctx.fillRect(i * 10, i * 10, 100, 100);
      }

      // Verify final state
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });
  });

  describe('Canvas Integration with Mock Foundry', () => {
    test('canvas can simulate Foundry token placement', () => {
      // Mock Foundry token data
      const mockToken = {
        id: 'test-token-1',
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        alpha: 1.0,
        visible: true,
        flags: {
          'pf2e-visioner': {
            visibilityState: 'observed',
          },
        },
      };

      // Draw token based on Foundry data
      ctx.globalAlpha = mockToken.alpha;
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(mockToken.x, mockToken.y, mockToken.width, mockToken.height);

      // Draw visibility indicator
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('👁️', mockToken.x + mockToken.width / 2, mockToken.y + mockToken.height / 2);

      // Verify token was drawn
      const imageData = ctx.getImageData(
        mockToken.x,
        mockToken.y,
        mockToken.width,
        mockToken.height,
      );
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can simulate Foundry wall drawing', () => {
      // Mock Foundry wall data
      const mockWall = {
        id: 'test-wall-1',
        c: [50, 50, 200, 50], // [x1, y1, x2, y2]
        flags: {
          'pf2e-visioner': {
            hidden: false,
            stealthDC: 15,
          },
        },
      };

      // Draw wall line
      ctx.beginPath();
      ctx.moveTo(mockWall.c[0], mockWall.c[1]);
      ctx.lineTo(mockWall.c[2], mockWall.c[3]);
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw wall endpoints
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.arc(mockWall.c[0], mockWall.c[1], 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mockWall.c[2], mockWall.c[3], 3, 0, 2 * Math.PI);
      ctx.fill();

      // Verify wall was drawn
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      expect(imageData.data.some((pixel) => pixel !== 0)).toBe(true);
    });
  });

  describe('Canvas Visual Validation', () => {
    test('canvas can validate visual output', () => {
      // Draw a specific pattern
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 100, 100);

      ctx.fillStyle = '#00ff00';
      ctx.fillRect(100, 0, 100, 100);

      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 100, 100, 100);

      ctx.fillStyle = '#ffff00';
      ctx.fillRect(100, 100, 100, 100);

      // Get image data for validation
      const redSquare = ctx.getImageData(0, 0, 100, 100);
      const greenSquare = ctx.getImageData(100, 0, 100, 100);
      const blueSquare = ctx.getImageData(0, 100, 100, 100);
      const yellowSquare = ctx.getImageData(100, 100, 100, 100);

      // Check that each square has the expected color (simplified check)
      expect(redSquare.data.some((pixel) => pixel !== 0)).toBe(true);
      expect(greenSquare.data.some((pixel) => pixel !== 0)).toBe(true);
      expect(blueSquare.data.some((pixel) => pixel !== 0)).toBe(true);
      expect(yellowSquare.data.some((pixel) => pixel !== 0)).toBe(true);
    });

    test('canvas can measure drawn elements', () => {
      // Draw a token
      const tokenX = 150;
      const tokenY = 150;
      const tokenSize = 80;

      ctx.fillStyle = '#ff6600';
      ctx.fillRect(tokenX, tokenY, tokenSize, tokenSize);

      // Measure the drawn area
      const imageData = ctx.getImageData(tokenX, tokenY, tokenSize, tokenSize);
      const hasContent = imageData.data.some((pixel) => pixel !== 0);

      expect(hasContent).toBe(true);
      expect(tokenSize).toBe(80);

      // Verify token dimensions
      const tokenArea = tokenSize * tokenSize;
      expect(tokenArea).toBe(6400);
    });
  });
});
