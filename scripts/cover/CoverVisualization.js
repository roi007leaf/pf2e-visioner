import { MODULE_ID } from '../constants.js';
import { HoverTooltips } from '../services/HoverTooltips.js';
import { getVisibilityBetween } from '../utils.js';
import autoCoverSystem from './auto-cover/AutoCoverSystem.js';
/**
 * Cover field visualization system
 * Shows cover levels from cursor position to hovered token when hotkey is held
 * Each client sees only their own visualization (client-specific, not shared)
 */
class CoverVisualization {
  constructor() {
    this.isActive = false;
    this.currentTarget = null;
    this.overlayGraphics = null;
    this.keyPressed = false;
    this.visualizationTimeout = null;
    this.lastTargetId = null;

    this.init();
  }

  /**
   * Get the current viewport rectangle in world coordinates
   * @param {Canvas} canvas
   * @param {number} padding - extra padding in pixels (world units) around the viewport
   * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
   */
  getViewportWorldRect(canvas, padding = 0) {
    try {
      const app = canvas.app;
      const screen = app?.renderer?.screen;
      if (!screen) return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

      // Use the global transform matrix; this is the most reliable way across PIXI versions
      const m = canvas.stage.worldTransform;
      const tlScreen = new PIXI.Point(0 - padding, 0 - padding);
      const brScreen = new PIXI.Point(screen.width + padding, screen.height + padding);

      const tlWorld = new PIXI.Point();
      const brWorld = new PIXI.Point();
      m.applyInverse(tlScreen, tlWorld);
      m.applyInverse(brScreen, brWorld);

      let minX = Math.min(tlWorld.x, brWorld.x);
      let maxX = Math.max(tlWorld.x, brWorld.x);
      let minY = Math.min(tlWorld.y, brWorld.y);
      let maxY = Math.max(tlWorld.y, brWorld.y);

      // Ensure ordering
      if (minX > maxX) [minX, maxX] = [maxX, minX];
      if (minY > maxY) [minY, maxY] = [maxY, minY];

      // Sanity fallback to scene rect if something went wrong
      const invalid = [minX, maxX, minY, maxY].some((v) => !isFinite(v));
      if (invalid) {
        const rect = canvas.dimensions?.sceneRect;
        if (rect)
          return {
            minX: rect.x,
            minY: rect.y,
            maxX: rect.x + rect.width,
            maxY: rect.y + rect.height,
          };
        return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
      }
      return { minX, minY, maxX, maxY };
    } catch (e) {
      return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
    }
  }

  init() {
    // Store bound method references for proper cleanup
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnTokenHover = this.onTokenHover.bind(this);
    this.boundOnCanvasRender = this.onCanvasRender.bind(this);

    // Bind event listeners - use capture phase to ensure we get events before Foundry
    document.addEventListener('keydown', this.boundOnKeyDown, true);
    document.addEventListener('keyup', this.boundOnKeyUp, true);

    // Hook into token hover events
    Hooks.on('hoverToken', this.boundOnTokenHover);
    Hooks.on('renderCanvas', this.boundOnCanvasRender);

    // Set up periodic validation of hover state
    this.hoverValidationInterval = setInterval(() => {
      this.validateHoverState();
    }, 100); // Check every 100ms
  }

  onKeyDown(event) {
    // Check if this key matches the configured keybinding
    const keybindings = game.keybindings?.get?.(MODULE_ID, 'holdCoverVisualization') || [];

    // If no keybinding configured, don't do anything
    if (keybindings.length === 0) {
      return;
    }

    const keybinding = keybindings[0]; // Use first keybinding

    // Check if the key matches (using both code and key for better compatibility)
    // This helps with different keyboard layouts like AZERTY
    const keyMatches =
      event.code === keybinding.key ||
      event.key === keybinding.key ||
      // Additional fallback for physical key position matching
      (keybinding.key.startsWith('Key') && event.code === keybinding.key) ||
      (keybinding.key.startsWith('Digit') && event.code === keybinding.key) ||
      // Handle left/right modifier keys
      (keybinding.key === 'ShiftLeft' && (event.code === 'ShiftLeft' || event.key === 'Shift')) ||
      (keybinding.key === 'ShiftRight' && (event.code === 'ShiftRight' || event.key === 'Shift')) ||
      (keybinding.key === 'AltLeft' && (event.code === 'AltLeft' || event.key === 'Alt')) ||
      (keybinding.key === 'AltRight' && (event.code === 'AltRight' || event.key === 'Alt')) ||
      (keybinding.key === 'ControlLeft' &&
        (event.code === 'ControlLeft' || event.key === 'Control')) ||
      (keybinding.key === 'ControlRight' &&
        (event.code === 'ControlRight' || event.key === 'Control')) ||
      (keybinding.key === 'MetaLeft' && (event.code === 'MetaLeft' || event.key === 'Meta')) ||
      (keybinding.key === 'MetaRight' && (event.code === 'MetaRight' || event.key === 'Meta'));

    // Check modifiers - a modifier should be pressed if it's in the keybinding
    const requiredModifiers = keybinding.modifiers || [];
    const ctrlMatches = requiredModifiers.includes('Control') ? event.ctrlKey : !event.ctrlKey;
    const shiftMatches = requiredModifiers.includes('Shift') ? event.shiftKey : !event.shiftKey;
    const altMatches = requiredModifiers.includes('Alt') ? event.altKey : !event.altKey;
    const metaMatches = requiredModifiers.includes('Meta') ? event.metaKey : !event.metaKey;

    const isCorrectKey = keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;

    if (isCorrectKey && !this.keyPressed) {
      this.keyPressed = true;
      // Force refresh of hover state to ensure we have the most up-to-date information
      this.refreshCurrentHoverState();
      // Check if we're already hovering over a token and activate visualization for it
      if (this.currentTarget) {
        this.tryActivateVisualizationDebounced();
      }
    }
  }

  onKeyUp(event) {
    // Check if this key matches the configured keybinding
    const keybindings = game.keybindings?.get?.(MODULE_ID, 'holdCoverVisualization') || [];

    // If no keybinding configured, don't do anything
    if (keybindings.length === 0) {
      return;
    }

    const keybinding = keybindings[0]; // Use first keybinding

    // Check if the key matches (using both code and key for better compatibility)
    // This helps with different keyboard layouts like AZERTY
    const keyMatches =
      event.code === keybinding.key ||
      event.key === keybinding.key ||
      // Additional fallback for physical key position matching
      (keybinding.key.startsWith('Key') && event.code === keybinding.key) ||
      (keybinding.key.startsWith('Digit') && event.code === keybinding.key) ||
      // Handle left/right modifier keys
      (keybinding.key === 'ShiftLeft' && (event.code === 'ShiftLeft' || event.key === 'Shift')) ||
      (keybinding.key === 'ShiftRight' && (event.code === 'ShiftRight' || event.key === 'Shift')) ||
      (keybinding.key === 'AltLeft' && (event.code === 'AltLeft' || event.key === 'Alt')) ||
      (keybinding.key === 'AltRight' && (event.code === 'AltRight' || event.key === 'Alt')) ||
      (keybinding.key === 'ControlLeft' &&
        (event.code === 'ControlLeft' || event.key === 'Control')) ||
      (keybinding.key === 'ControlRight' &&
        (event.code === 'ControlRight' || event.key === 'Control')) ||
      (keybinding.key === 'MetaLeft' && (event.code === 'MetaLeft' || event.key === 'Meta')) ||
      (keybinding.key === 'MetaRight' && (event.code === 'MetaRight' || event.key === 'Meta'));

    // Check modifiers - a modifier should be pressed if it's in the keybinding
    const requiredModifiers = keybinding.modifiers || [];
    const ctrlMatches = requiredModifiers.includes('Control') ? event.ctrlKey : !event.ctrlKey;
    const shiftMatches = requiredModifiers.includes('Shift') ? event.shiftKey : !event.shiftKey;
    const altMatches = requiredModifiers.includes('Alt') ? event.altKey : !event.altKey;
    const metaMatches = requiredModifiers.includes('Meta') ? event.metaKey : !event.metaKey;

    const wasCorrectKey = keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;

    if (wasCorrectKey) {
      this.keyPressed = false;
      this.deactivateVisualization();
    }
  }

  onTokenHover(token, hovered) {
    if (hovered) {
      this.currentTarget = token;
      // Only show visualization when key is pressed (keybinding-based behavior)
      if (this.keyPressed) {
        this.tryActivateVisualizationDebounced();
      }
    } else if (!hovered && this.currentTarget === token) {
      this.currentTarget = null;
      this.deactivateVisualization();
    }
  }

  /**
   * Get the currently hovered token from the canvas
   * This is a fallback method in case HoverTooltips.currentHoveredToken is not available
   */
  getCurrentHoveredToken() {
    // First try to get from HoverTooltips service
    if (HoverTooltips.currentHoveredToken) {
      return HoverTooltips.currentHoveredToken;
    }

    // Fallback: check if any token is currently being hovered
    // This is a bit of a hack since Foundry doesn't expose hover state directly
    // We'll use the currentTarget if it exists and the key is pressed
    if (this.keyPressed && this.currentTarget) {
      return this.currentTarget;
    }

    return null;
  }

  /**
   * Force refresh of the current hover state
   * This is called when a key is pressed to ensure we have the most up-to-date hover information
   */
  refreshCurrentHoverState() {
    // If we don't have a currentTarget but there's a hovered token in HoverTooltips, use that
    if (!this.currentTarget && HoverTooltips.currentHoveredToken) {
      this.currentTarget = HoverTooltips.currentHoveredToken;
    }

    // If we still don't have a currentTarget, try to find any token under the cursor
    // This is a fallback for cases where the hover state might not be properly tracked
    if (!this.currentTarget && this.keyPressed) {
      try {
        const mousePosition = canvas.app?.renderer?.plugins?.interaction?.mouse?.global;
        if (mousePosition && mousePosition.x !== undefined && mousePosition.y !== undefined) {
          const tokens = canvas.tokens.placeables.filter(
            (token) =>
              token.isVisible &&
              token.bounds &&
              token.bounds.contains(mousePosition.x, mousePosition.y),
          );
          if (tokens.length > 0) {
            this.currentTarget = tokens[0];
          }
        }
      } catch (error) {
        // Silently fail if mouse position detection fails
        console.error('PF2E Visioner: Could not detect mouse position for token detection');
      }
    }

    // Validate that the currentTarget is still valid (mouse is still over it)
    if (this.currentTarget && this.keyPressed) {
      try {
        const mousePosition = canvas.app?.renderer?.plugins?.interaction?.mouse?.global;
        if (mousePosition && mousePosition.x !== undefined && mousePosition.y !== undefined) {
          if (
            !this.currentTarget.bounds ||
            !this.currentTarget.bounds.contains(mousePosition.x, mousePosition.y)
          ) {
            // Mouse is no longer over the currentTarget, clear it
            this.currentTarget = null;
          }
        }
      } catch (error) {
        // Silently fail if mouse position detection fails
        console.error('PF2E Visioner: Could not validate mouse position for token detection');
      }
    }
  }

  onCanvasRender() {
    // Clean up graphics when canvas re-renders
    this.deactivateVisualization();
  }

  tryActivateVisualizationDebounced() {
    // Clear any pending visualization
    if (this.visualizationTimeout) {
      clearTimeout(this.visualizationTimeout);
    }

    // Don't recreate if it's the same target and already active
    if (this.isActive && this.currentTarget && this.lastTargetId === this.currentTarget.id) {
      return;
    }

    // Debounce the visualization creation
    this.visualizationTimeout = setTimeout(() => {
      this.tryActivateVisualization();
    }, 100); // 100ms delay to prevent flickering
  }

  tryActivateVisualization() {
    if (!this.keyPressed || !this.currentTarget) {
      return;
    }

    // Check if user has any controlled tokens
    const selectedTokens = canvas?.tokens?.controlled || [];
    if (selectedTokens.length === 0) {
      return;
    }

    // Check if visualization should only work in encounters
    const visualizationOnlyInEncounter = game.settings?.get?.(
      MODULE_ID,
      'autoCoverVisualizationOnlyInEncounter',
    );
    if (visualizationOnlyInEncounter) {
      // Check if we're in an active encounter
      const isInEncounter = game.combat?.started || false;
      if (!isInEncounter) {
        this.deactivateVisualization();
        return;
      }
    }

    this.activateVisualization(this.currentTarget);
  }

  activateVisualization(target) {
    if (this.isActive && this.lastTargetId === target.id) {
      // Already showing visualization for this target
      return;
    }

    if (this.isActive) {
      this.deactivateVisualization();
    }

    this.isActive = true;
    this.lastTargetId = target.id;
    this.createCoverOverlay(target);
  }

  deactivateVisualization() {
    if (!this.isActive) return;

    this.isActive = false;
    this.lastTargetId = null;

    // Clear any pending timeout
    if (this.visualizationTimeout) {
      clearTimeout(this.visualizationTimeout);
      this.visualizationTimeout = null;
    }

    if (this.overlayGraphics) {
      this.overlayGraphics.destroy();
      this.overlayGraphics = null;
    }
  }

  /**
   * Validate that the current hover state is still valid
   * This is called periodically to ensure the visualization is properly managed
   */
  validateHoverState() {
    // Only validate if we have an active visualization and a currentTarget
    if (!this.isActive || !this.currentTarget || !this.keyPressed) {
      return;
    }

    try {
      const mousePosition = canvas.app?.renderer?.plugins?.interaction?.mouse?.global;
      if (mousePosition && mousePosition.x !== undefined && mousePosition.y !== undefined) {
        // Check if mouse is still over the currentTarget
        if (
          !this.currentTarget.bounds ||
          !this.currentTarget.bounds.contains(mousePosition.x, mousePosition.y)
        ) {
          // Mouse is no longer over the currentTarget, deactivate visualization
          this.deactivateVisualization();
          this.currentTarget = null;
        }
      }
    } catch (error) {
      // Silently fail if mouse position detection fails
      console.error('PF2E Visioner: Could not validate hover state');
    }
  }

  /**
   * Clean up resources when the visualization is destroyed
   */
  cleanup() {
    // Clear the validation interval
    if (this.hoverValidationInterval) {
      clearInterval(this.hoverValidationInterval);
      this.hoverValidationInterval = null;
    }

    // Deactivate visualization
    this.deactivateVisualization();

    // Remove event listeners
    document.removeEventListener('keydown', this.boundOnKeyDown);
    document.removeEventListener('keyup', this.boundOnKeyUp);

    // Remove hooks
    Hooks.off('hoverToken', this.boundOnTokenHover);
    Hooks.off('renderCanvas', this.boundOnCanvasRender);
  }

  /**
   * Check if a grid position is currently visible to the player (considering fog of war)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {Canvas} canvas - Foundry canvas object
   * @returns {boolean} True if position is visible
   */
  isGridPositionVisible(worldX, worldY, canvas) {
    try {
      // For GMs, everything is visible
      const respectFogForGM = game.settings?.get?.(
        MODULE_ID,
        'autoCoverVisualizationRespectFogForGM',
      );
      if (game.user.isGM && !respectFogForGM) {
        return true;
      }

      // Check if the position is in explored (but not necessarily currently visible) area
      // by checking if the canvas fog layer has revealed this position
      if (canvas.fog && canvas.fog.exploration) {
        // Get the pixel position in the exploration texture
        const fogTexture = canvas.fog.exploration;
        if (fogTexture && fogTexture.getPixel) {
          try {
            const pixel = fogTexture.getPixel(worldX, worldY);
            // If pixel alpha is 0, the area is unexplored/fogged
            if (pixel && pixel.a === 0) {
              return false;
            }
          } catch (e) {
            // Fallback if getPixel fails
          }
        }
      }

      // Alternative approach: check visibility through canvas layers
      if (canvas.visibility && canvas.visibility.testVisibility) {
        const point = { x: worldX, y: worldY };
        return canvas.visibility.testVisibility(point);
      }

      // Try the sight layer approach
      if (canvas.sight && canvas.sight.testVisibility) {
        const point = { x: worldX, y: worldY };
        return canvas.sight.testVisibility(point, { tolerance: 0 });
      }

      // Check against token vision polygons
      const controlledTokens = canvas.tokens.controlled;
      if (controlledTokens.length > 0) {
        for (const token of controlledTokens) {
          if (token.vision && token.vision.fov) {
            // Check if point is in field of view
            if (token.vision.fov.contains(worldX, worldY)) {
              return true;
            }
          }
        }
        // If no controlled token can see it, it's not visible
        return false;
      }

      // If no controlled tokens, default to not visible for players
      return false;
    } catch (error) {
      console.warn('PF2E Visioner: Error checking grid position visibility:', error);
      // More conservative - if we can't determine visibility, hide it
      return false;
    }
  }

  /**
   * Check if two line segments intersect using a more robust algorithm
   * @param {Object} p1 - First point of first line {x, y}
   * @param {Object} p2 - Second point of first line {x, y}
   * @param {Object} p3 - First point of second line {x, y}
   * @param {Object} p4 - Second point of second line {x, y}
   * @returns {boolean} True if segments intersect
   */
  segmentsIntersect(p1, p2, p3, p4) {
    const EPSILON = 1e-6; // Larger tolerance for more robust intersection detection

    // Use parametric line intersection for more robust results
    const x1 = p1.x,
      y1 = p1.y;
    const x2 = p2.x,
      y2 = p2.y;
    const x3 = p3.x,
      y3 = p3.y;
    const x4 = p4.x,
      y4 = p4.y;

    // Calculate direction vectors
    const dx1 = x2 - x1;
    const dy1 = y2 - y1;
    const dx2 = x4 - x3;
    const dy2 = y4 - y3;

    // Calculate denominator for parametric equations
    const denominator = dx1 * dy2 - dy1 * dx2;

    // If denominator is 0, lines are parallel
    if (Math.abs(denominator) < EPSILON) {
      // Check if lines are collinear
      const dx13 = x3 - x1;
      const dy13 = y3 - y1;
      const cross = dx13 * dy1 - dy13 * dx1;

      if (Math.abs(cross) < EPSILON) {
        // Lines are collinear, check if they overlap
        // Project points onto the longer axis
        const useX = Math.abs(dx1) > Math.abs(dy1);

        let seg1_start, seg1_end, seg2_start, seg2_end;
        if (useX) {
          seg1_start = Math.min(x1, x2);
          seg1_end = Math.max(x1, x2);
          seg2_start = Math.min(x3, x4);
          seg2_end = Math.max(x3, x4);
        } else {
          seg1_start = Math.min(y1, y2);
          seg1_end = Math.max(y1, y2);
          seg2_start = Math.min(y3, y4);
          seg2_end = Math.max(y3, y4);
        }

        // Check for overlap
        const overlap = seg1_end >= seg2_start - EPSILON && seg2_end >= seg1_start - EPSILON;
        if (overlap) {
          return true;
        }
      }

      return false;
    }

    // Calculate parameters for intersection point
    const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / denominator;
    const u = ((x3 - x1) * dy1 - (y3 - y1) * dx1) / denominator;

    // Check if intersection occurs within both line segments
    const intersects = t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON;

    if (intersects) {
      return true;
    }

    return false;
  }

  isPositionOccupied(worldX, worldY, selectedToken, canvas) {
    const gridSize = canvas.grid.size;

    // Check all tokens on the scene
    for (const token of canvas.tokens.placeables) {
      if (!token?.actor) continue;
      if (token.id === selectedToken.id) continue; // Skip the selected token itself

      // Skip loot tokens and hazards - they don't block movement for cover visualization
      const actorType = token.actor.type;
      if (actorType === 'loot' || actorType === 'hazard') {
        continue;
      }

      // Check if the token is hidden or undetected from the selected token's perspective
      try {
        // Check if the token is hidden using native Foundry method
        const token = canvas.tokens?.get(token.id);
        if (token?.isVisible === false || token.document.hidden) {
          continue;
        }

        // Check PF2e visibility state using the imported utility
        const visibility = getVisibilityBetween(selectedToken, token);

        // If the token is undetected, it doesn't block movement
        if (visibility === 'undetected') {
          continue;
        }
      } catch (error) {
        // If visibility check fails, proceed with normal blocking logic
        console.warn(
          'PF2e Visioner: Error checking token visibility for cover visualization:',
          error,
        );
      }

      // Get token's bounds using native Foundry method
      const tokenBounds = token.bounds;
      const tokenRect = {
        x1: tokenBounds.x,
        y1: tokenBounds.y,
        x2: tokenBounds.x + tokenBounds.width,
        y2: tokenBounds.y + tokenBounds.height,
      };

      // Check if the world position overlaps with this token's area
      const positionRect = {
        x1: worldX - gridSize / 2,
        y1: worldY - gridSize / 2,
        x2: worldX + gridSize / 2,
        y2: worldY + gridSize / 2,
      };

      // Check for overlap
      const overlaps = !(
        positionRect.x2 <= tokenRect.x1 ||
        positionRect.x1 >= tokenRect.x2 ||
        positionRect.y2 <= tokenRect.y1 ||
        positionRect.y1 >= tokenRect.y2
      );

      if (overlaps) {
        // Check if tiny creatures can share - both must be tiny
        const selectedSize = selectedToken?.actor?.system?.traits?.size?.value ?? 'med';
        const blockerSize = token?.actor?.system?.traits?.size?.value ?? 'med';

        if (selectedSize === 'tiny' && blockerSize === 'tiny') {
          // Tiny creatures can share the same square
          continue;
        }

        // Position is occupied and can't be shared
        return true;
      }
    }

    return false; // Position is free
  }

  createCoverOverlay(hoveredToken) {
    const canvas = game.canvas;
    if (!canvas?.stage) return;

    // Get the selected token as the potential attacker
    const selectedTokens = canvas.tokens.controlled;
    if (selectedTokens.length === 0) {
      return;
    }

    const selectedToken = selectedTokens[0]; // Use first selected token
    const selectedCenter = selectedToken.center ?? selectedToken.getCenterPoint();
    const respectFogForGM = game.settings?.get?.(
      MODULE_ID,
      'autoCoverVisualizationRespectFogForGM',
    );

    // For players: Only show cover overlay for tokens that are currently visible (respects fog of war)
    // GMs can see cover overlay for all tokens regardless of vision
    if (
      (!game.user.isGM && !hoveredToken.isVisible) ||
      (game.user.isGM && respectFogForGM && !hoveredToken.isVisible)
    ) {
      // Player cannot see this token due to current vision/fog of war, don't show cover overlay
      return;
    }

    // Allow visualization for all users

    // Create graphics container on the interface layer to be client-specific
    // This ensures each client only sees their own visualization
    this.overlayGraphics = new PIXI.Graphics();
    this.overlayGraphics.clear(); // Ensure clean slate
    canvas.interface.addChild(this.overlayGraphics);

    // Sample grid positions around the selected token's current position
    const gridSize = canvas.grid.size;
    // Also clamp evaluation to the scene's inner rectangle (no padding)
    const sceneRect = canvas.dimensions?.sceneRect;
    if (!sceneRect) return;
    const minCenterX = sceneRect.x + gridSize / 2;
    const maxCenterX = sceneRect.x + sceneRect.width - gridSize / 2;
    const minCenterY = sceneRect.y + gridSize / 2;
    const maxCenterY = sceneRect.y + sceneRect.height - gridSize / 2;

    // Calculate dynamic range based on furthest token from selected token
    let maxDistance = 8; // Minimum range
    for (const token of canvas.tokens.placeables) {
      if (!token?.actor || token.id === selectedToken.id) continue;

      const tokenCenter = token.center ?? token.getCenterPoint();
      const distance = Math.sqrt(
        Math.pow(tokenCenter.x - selectedCenter.x, 2) +
        Math.pow(tokenCenter.y - selectedCenter.y, 2),
      );
      const gridDistance = Math.ceil(distance / gridSize);
      maxDistance = Math.max(maxDistance, gridDistance);
    }

    // Add some padding around the furthest token
    // Increase padding to ensure we cover areas behind walls
    const range = maxDistance + 8;

    // Limit computations to the current viewport in world coordinates
    // Add a small padding so we compute slightly beyond the visible edge
    const viewportWorld = this.getViewportWorldRect(canvas, gridSize * 2);

    // Compute index bounds that intersect with the viewport to avoid iterating the whole range
    const minIndexX = Math.max(
      -range,
      Math.ceil((viewportWorld.minX - selectedCenter.x) / gridSize),
    );
    const maxIndexX = Math.min(
      range,
      Math.floor((viewportWorld.maxX - selectedCenter.x) / gridSize),
    );
    const minIndexY = Math.max(
      -range,
      Math.ceil((viewportWorld.minY - selectedCenter.y) / gridSize),
    );
    const maxIndexY = Math.min(
      range,
      Math.floor((viewportWorld.maxY - selectedCenter.y) / gridSize),
    );

    for (let x = minIndexX; x <= maxIndexX; x++) {
      for (let y = minIndexY; y <= maxIndexY; y++) {
        const worldX = selectedCenter.x + x * gridSize;
        const worldY = selectedCenter.y + y * gridSize;

        // Skip any point outside the scene's rectangle (grid centers only)
        if (
          worldX < minCenterX ||
          worldX > maxCenterX ||
          worldY < minCenterY ||
          worldY > maxCenterY
        ) {
          continue;
        }

        // Check if this position is occupied by any token (except tiny creatures can share)
        const isOccupied = this.isPositionOccupied(worldX, worldY, selectedToken, canvas);
        if (isOccupied) {
          // Skip coloring occupied squares - tokens can't move there
          continue;
        }

        // Viewport limiting replaces earlier GM-only wall-blocking filter

        // Create a temporary position for the selected token
        // Copy all properties from the real token but override position
        const tempAttacker = {
          ...selectedToken,
          center: { x: worldX, y: worldY },
          getCenterPoint: () => ({ x: worldX, y: worldY, elevation: selectedCenter.elevation }),
          id: selectedToken.id + '-temp-pos',
          document: {
            ...selectedToken.document,
            x: worldX - selectedToken.w / 2,
            y: worldY - selectedToken.h / 2,
          },
          w: selectedToken.w,
          h: selectedToken.h,
        };

        // Calculate what cover the hovered token would have when attacked from this grid position
        // This shows the cover level that would apply if an attacker were standing at this grid square
        // For visualization, always ignore undetected/hidden tokens regardless of settings
        // Use the selected token's perspective for visibility checks

        // Check if the grid position is currently visible to the player (respects fog of war)
        let shouldShowCover = true;
        const respectFogForGM = game.settings?.get?.(
          MODULE_ID,
          'autoCoverVisualizationRespectFogForGM',
        );
        if (!game.user.isGM || (game.user.isGM && respectFogForGM)) {
          // Check if this grid position is currently visible considering fog of war
          const isPositionVisible = this.isGridPositionVisible(worldX, worldY, canvas);

          if (!isPositionVisible) {
            // Player cannot see this grid position due to current vision/fog of war
            shouldShowCover = false;
          }
        }

        if (shouldShowCover) {
          // Calculate cover FROM this grid position TO the hovered token
          // (i.e., what cover does the target have when attacked from this position)
          const coverLevel = autoCoverSystem.detectCoverBetweenTokens(tempAttacker, hoveredToken, {
            filterOverrides: {
              ignoreUndetected: true,
              visibilityPerspective: selectedToken,
            },
          });

          // Draw colored square based on cover level
          this.drawCoverSquare(worldX, worldY, gridSize, coverLevel);
        }
        // If shouldShowCover is false (position not visible due to fog of war), draw nothing
      }
    }

    // Highlight the selected token's current position
    this.drawCurrentPosition(selectedToken);

    // Info panel removed - colors are self-explanatory
    // Note: Black squares indicate positions where walls block line of sight (players only)
    // GMs can see cover information for all positions regardless of wall blocking
  }

  drawCoverSquare(x, y, size, coverLevel) {
    if (!this.overlayGraphics) return;
    let colors;
    // Define colors for each cover level
    const colorblindMode = game.settings.get(MODULE_ID, 'colorblindMode');
    if (colorblindMode == 'protanopia') {
      colors = {
        none: 0x0072b2, // Blue - no cover
        lesser: 0xf0e442, // Yellow - lesser cover
        standard: 0xcc79a7, // Pink - standard cover
        greater: 0x9467bd, // Purple - greater cover
      };
    } else if (colorblindMode == 'deuteranopia') {
      colors = {
        none: 0x0072b2, // Blue - no cover
        lesser: 0xf0e442, // Yellow - lesser cover
        standard: 0xff8c00, // Orange - standard cover
        greater: 0xd946ef, // Magenta - greater cover
      };
    } else if (colorblindMode == 'tritanopia') {
      colors = {
        none: 0x00b050, // Green - no cover
        lesser: 0xffd700, // Gold - lesser cover
        standard: 0xff6600, // Orange - standard cover
        greater: 0xdc143c, // Crimson - greater cover
      };
    } else if (colorblindMode == 'achromatopsia') {
      colors = {
        none: 0x000000, // Black - no cover
        lesser: 0x333333, // Dark gray - lesser cover
        standard: 0x666666, // Medium gray - standard cover
        greater: 0x999999, // Light gray - greater cover
      };
    } else {
      colors = {
        none: 0x4caf50, // Green - no cover
        lesser: 0xffc107, // Yellow - lesser cover
        standard: 0xff6600, // Orange - standard cover
        greater: 0xff0000, // Red - greater cover
      };
    }

    const alpha = 0.4; // Semi-transparent
    const color = colors[coverLevel] || colors.none;

    this.overlayGraphics.beginFill(color, alpha);
    this.overlayGraphics.drawRect(x - size / 2, y - size / 2, size, size);
    this.overlayGraphics.endFill();

    // Add a subtle border
    this.overlayGraphics.lineStyle(1, color, 0.8);
    this.overlayGraphics.drawRect(x - size / 2, y - size / 2, size, size);
  }

  /**
   * Draw a square indicating that line of sight is blocked by walls
   * @param {number} x - X coordinate of the square center
   * @param {number} y - Y coordinate of the square center
   * @param {number} size - Size of the square
   */
  drawBlockedSquare(x, y, size) {
    if (!this.overlayGraphics) return;

    const color = 0x000000; // Black
    const alpha = 0.7; // More opaque to fully cover any underlying colors

    this.overlayGraphics.beginFill(color, alpha);
    this.overlayGraphics.drawRect(x - size / 2, y - size / 2, size, size);
    this.overlayGraphics.endFill();

    // Add a more visible border to indicate it's blocked
    this.overlayGraphics.lineStyle(2, 0x333333, 0.9);
    this.overlayGraphics.drawRect(x - size / 2, y - size / 2, size, size);
  }

  drawCurrentPosition(selectedToken) {
    if (!this.overlayGraphics) return;

    const center = selectedToken.center ?? selectedToken.getCenterPoint();
    const gridSize = game.canvas.grid.size;

    // Draw a bright white border to show current position
    this.overlayGraphics.lineStyle(4, 0xffffff, 1.0);
    this.overlayGraphics.drawRect(
      center.x - gridSize / 2,
      center.y - gridSize / 2,
      gridSize,
      gridSize,
    );

    // Add a subtle white fill
    this.overlayGraphics.beginFill(0xffffff, 0.2);
    this.overlayGraphics.drawRect(
      center.x - gridSize / 2,
      center.y - gridSize / 2,
      gridSize,
      gridSize,
    );
    this.overlayGraphics.endFill();
  }
}

// Initialize the visualization system for the current client
export let coverVisualization = null;

export function initCoverVisualization() {
  if (!coverVisualization) {
    coverVisualization = new CoverVisualization();
  }
}

export function destroyCoverVisualization() {
  if (coverVisualization) {
    coverVisualization.cleanup();
    coverVisualization = null;
  }
}
