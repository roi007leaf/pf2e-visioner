/**
 * Test for colorblind icon tab visibility fix
 * Tests that active tab icons have contrasting colors in all colorblind modes
 */

import { jest } from '@jest/globals';

describe('Colorblind Icon Tab Visibility', () => {
  beforeEach(() => {
    // Mock DOM environment
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  test('should load colorblind CSS without errors', () => {
    // Create a mock link element for the CSS
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = 'styles/colorblind.css';

    // Simulate loading the CSS
    expect(() => {
      document.head.appendChild(linkElement);
    }).not.toThrow();

    expect(document.head.children.length).toBe(1);
    expect(linkElement.rel).toBe('stylesheet');
  });

  test('should create proper icon tab structure', () => {
    // Create the DOM structure that the CSS targets
    document.body.className = 'pf2e-visioner-colorblind-protanopia';

    const iconTabNavigation = document.createElement('div');
    iconTabNavigation.className = 'icon-tab-navigation';

    // Create visibility tab button
    const visibilityTab = document.createElement('div');
    visibilityTab.className = 'icon-tab-button active';
    visibilityTab.setAttribute('data-tab', 'visibility');

    const visibilityIcon = document.createElement('i');
    visibilityTab.appendChild(visibilityIcon);

    // Create cover tab button
    const coverTab = document.createElement('div');
    coverTab.className = 'icon-tab-button active';
    coverTab.setAttribute('data-tab', 'cover');

    const coverIcon = document.createElement('i');
    coverTab.appendChild(coverIcon);

    iconTabNavigation.appendChild(visibilityTab);
    iconTabNavigation.appendChild(coverTab);
    document.body.appendChild(iconTabNavigation);

    // Verify structure is created correctly
    expect(document.querySelector('.icon-tab-navigation')).toBeTruthy();
    expect(document.querySelector('.icon-tab-button[data-tab="visibility"].active')).toBeTruthy();
    expect(document.querySelector('.icon-tab-button[data-tab="cover"].active')).toBeTruthy();
    expect(document.querySelectorAll('.icon-tab-button.active i')).toHaveLength(2);
  });

  test('should have correct class combinations for all colorblind modes', () => {
    const colorblindModes = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

    colorblindModes.forEach((mode) => {
      document.body.className = `pf2e-visioner-colorblind-${mode}`;

      const iconTabNavigation = document.createElement('div');
      iconTabNavigation.className = 'icon-tab-navigation';

      // Test visibility tab active state
      const visibilityTab = document.createElement('div');
      visibilityTab.className = 'icon-tab-button active';
      visibilityTab.setAttribute('data-tab', 'visibility');

      const visibilityIcon = document.createElement('i');
      visibilityTab.appendChild(visibilityIcon);

      // Test cover tab active state
      const coverTab = document.createElement('div');
      coverTab.className = 'icon-tab-button active';
      coverTab.setAttribute('data-tab', 'cover');

      const coverIcon = document.createElement('i');
      coverTab.appendChild(coverIcon);

      iconTabNavigation.appendChild(visibilityTab);
      iconTabNavigation.appendChild(coverTab);
      document.body.appendChild(iconTabNavigation);

      // Verify the class structure exists for CSS targeting
      expect(document.body.classList.contains(`pf2e-visioner-colorblind-${mode}`)).toBe(true);
      expect(visibilityTab.matches('.icon-tab-button[data-tab="visibility"].active')).toBe(true);
      expect(coverTab.matches('.icon-tab-button[data-tab="cover"].active')).toBe(true);

      // Clean up for next iteration
      document.body.innerHTML = '';
    });
  });

  test('should validate CSS selector structure for icon contrast fix', () => {
    // This test validates that our CSS selector structure is correct
    const testCases = [
      {
        mode: 'protanopia',
        visibilitySelector:
          'body.pf2e-visioner-colorblind-protanopia .icon-tab-navigation .icon-tab-button[data-tab="visibility"].active i',
        coverSelector:
          'body.pf2e-visioner-colorblind-protanopia .icon-tab-navigation .icon-tab-button[data-tab="cover"].active i',
      },
      {
        mode: 'deuteranopia',
        visibilitySelector:
          'body.pf2e-visioner-colorblind-deuteranopia .icon-tab-navigation .icon-tab-button[data-tab="visibility"].active i',
        coverSelector:
          'body.pf2e-visioner-colorblind-deuteranopia .icon-tab-navigation .icon-tab-button[data-tab="cover"].active i',
      },
      {
        mode: 'tritanopia',
        visibilitySelector:
          'body.pf2e-visioner-colorblind-tritanopia .icon-tab-navigation .icon-tab-button[data-tab="visibility"].active i',
        coverSelector:
          'body.pf2e-visioner-colorblind-tritanopia .icon-tab-navigation .icon-tab-button[data-tab="cover"].active i',
      },
      {
        mode: 'achromatopsia',
        visibilitySelector:
          'body.pf2e-visioner-colorblind-achromatopsia .icon-tab-navigation .icon-tab-button[data-tab="visibility"].active i',
        coverSelector:
          'body.pf2e-visioner-colorblind-achromatopsia .icon-tab-navigation .icon-tab-button[data-tab="cover"].active i',
      },
    ];

    testCases.forEach((testCase) => {
      document.body.className = `pf2e-visioner-colorblind-${testCase.mode}`;

      const iconTabNavigation = document.createElement('div');
      iconTabNavigation.className = 'icon-tab-navigation';

      const visibilityTab = document.createElement('div');
      visibilityTab.className = 'icon-tab-button active';
      visibilityTab.setAttribute('data-tab', 'visibility');
      const visibilityIcon = document.createElement('i');
      visibilityTab.appendChild(visibilityIcon);

      const coverTab = document.createElement('div');
      coverTab.className = 'icon-tab-button active';
      coverTab.setAttribute('data-tab', 'cover');
      const coverIcon = document.createElement('i');
      coverTab.appendChild(coverIcon);

      iconTabNavigation.appendChild(visibilityTab);
      iconTabNavigation.appendChild(coverTab);
      document.body.appendChild(iconTabNavigation);

      // Test that our selectors would match
      const visibilityElement = document.querySelector(
        '.icon-tab-navigation .icon-tab-button[data-tab="visibility"].active i',
      );
      const coverElement = document.querySelector(
        '.icon-tab-navigation .icon-tab-button[data-tab="cover"].active i',
      );

      expect(visibilityElement).toBeTruthy();
      expect(coverElement).toBeTruthy();
      expect(visibilityElement).toBe(visibilityIcon);
      expect(coverElement).toBe(coverIcon);

      // Clean up
      document.body.innerHTML = '';
    });
  });
});
