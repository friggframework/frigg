/**
 * Core store for managing @friggframework/ui-core instance
 */

import { writable, get } from 'svelte/store';
import { friggUICore } from '@friggframework/ui-core';
import { installSveltePlugin } from '../plugins/SveltePlugin.js';

// Create the core store
function createCoreStore() {
  const { subscribe, set, update } = writable({
    initialized: false,
    core: null,
    config: {},
    error: null
  });
  
  // Initialize ui-core with Svelte plugin
  const initialize = async (config = {}) => {
    try {
      // Install Svelte plugin
      installSveltePlugin(friggUICore);
      
      // Initialize ui-core with config
      await friggUICore.initialize(config);
      
      // Update store
      set({
        initialized: true,
        core: friggUICore,
        config,
        error: null
      });
      
      return friggUICore;
    } catch (error) {
      console.error('Failed to initialize ui-core:', error);
      set({
        initialized: false,
        core: null,
        config,
        error
      });
      throw error;
    }
  };
  
  // Get the core instance
  const getCore = () => {
    const state = get({ subscribe });
    if (!state.initialized || !state.core) {
      throw new Error('UI Core not initialized. Call initializeCore() first.');
    }
    return state.core;
  };
  
  // Update configuration
  const updateConfig = async (updates) => {
    const core = getCore();
    try {
      await core.updateConfig(updates);
      update(state => ({
        ...state,
        config: { ...state.config, ...updates }
      }));
    } catch (error) {
      console.error('Failed to update config:', error);
      throw error;
    }
  };
  
  // Reset the core instance
  const reset = () => {
    set({
      initialized: false,
      core: null,
      config: {},
      error: null
    });
  };
  
  return {
    subscribe,
    initialize,
    getCore,
    updateConfig,
    reset
  };
}

// Export the core store instance
export const coreStore = createCoreStore();

// Export initialization helper
export async function initializeCore(config = {}) {
  return coreStore.initialize(config);
}

// Export helper to get core instance
export function getCore() {
  return coreStore.getCore();
}