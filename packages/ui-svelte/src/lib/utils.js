/**
 * Utility functions for Svelte integration
 */

import { friggUICore } from '@friggframework/ui-core';
import { installSveltePlugin } from '../plugins/SveltePlugin.js';
import { initializeCore } from '../stores/core.js';

/**
 * Initialize Frigg UI for Svelte applications
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Initialized core instance
 */
export async function initializeSvelteFrigg(config = {}) {
  // Initialize core with Svelte plugin
  return await initializeCore(config);
}

/**
 * Get the current Svelte-enabled core instance
 * @returns {Object} - Core instance
 */
export function getSvelteCore() {
  return friggUICore;
}